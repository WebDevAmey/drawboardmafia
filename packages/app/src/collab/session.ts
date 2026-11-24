import { createSync, isNode, type Id, type Op, type Sync, type SyncSnapshot } from '@dbm/core';
import type { Entry, ServerMsg } from '@dbm/relay';
import { addAsset, assetUrl } from '../assets';
import type { Editor } from '../editor/editor';
import { importKey, open, seal } from './crypto';

export interface Peer {
  id: string;
  name: string;
  color: string;
  /** world cursor target and the smoothed position drawn */
  cursor?: { x: number; y: number };
  shown?: { x: number; y: number };
  selection: Id[];
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  color: string;
  text: string;
  ts: number;
}

export interface SessionState {
  status: 'connecting' | 'live' | 'offline';
  peers: Peer[];
  messages: ChatMessage[];
  unread: number;
}

const COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1c7ed6', '#0c8599', '#d6336c', '#5c940d', '#e8590c'];
const colorFor = (id: string) => COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length]!;

export const relayUrl = () =>
  (import.meta.env.VITE_RELAY_URL as string | undefined) ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:5192`;

/** One live room. The relay only ever sees ciphertext. */
export class Session {
  state: SessionState = { status: 'connecting', peers: [], messages: [], unread: 0 };
  chatOpen = false;
  private listeners = new Set<() => void>();
  private ws?: WebSocket;
  private key?: CryptoKey;
  private sync?: Sync;
  private me = '';
  private seq = 0;
  private outbox: Op[] = [];
  private flushQueued = false;
  private sentAssets = new Set<string>();
  private peers = new Map<string, Peer>();
  private retry = 0;
  private closed = false;
  private presenceTimer = 0;
  private offStore?: () => void;
  /** Serialises decryption so messages apply in relay order. */
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private editor: Editor,
    readonly room: string,
    readonly keyText: string,
    public name: string,
    private isCreator: boolean,
  ) {}

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  getState = () => this.state;
  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  async start() {
    this.key = await importKey(this.keyText);
    this.sync = createSync(this.editor.store, `${Math.random().toString(36).slice(2, 8)}`, (ops) => {
      this.outbox.push(...ops);
      this.queueFlush();
    });
    // ship images referenced by new local elements
    this.offStore = this.editor.store.subscribe((b) => {
      for (const el of b.elements) if (isNode(el) && el.type === 'image') this.sendAsset(el.asset);
    });
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    this.set({ status: 'connecting' });
    const ws = new WebSocket(`${relayUrl()}/r/${this.room}`);
    this.ws = ws;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data as string) as ServerMsg;
      this.chain = this.chain.then(() => this.handle(m)).catch((err) => console.warn('[dbm] message dropped', err));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.peers.clear();
      this.publishPeers();
      if (this.closed) return;
      this.set({ status: 'offline' });
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  private async handle(m: ServerMsg) {
    switch (m.type) {
      case 'welcome': {
        this.me = m.id;
        this.retry = 0;
        for (const p of m.peers) this.peers.set(p, { id: p, name: '…', color: colorFor(p), selection: [] });
        if (m.log.length === 0 && this.isCreator) {
          // first in the room: publish the current board
          for (const el of this.editor.board.elements) if (isNode(el) && el.type === 'image') this.sendAsset(el.asset, true);
          this.send({ type: 'snapshot', seq: 0, data: await seal(this.key!, { sync: this.sync!.snapshot() }) });
        } else {
          for (const e of m.log) await this.apply(e, true);
        }
        this.isCreator = false;
        this.set({ status: 'live' });
        this.publishPeers();
        this.flush();
        this.sendPresence();
        break;
      }
      case 'op': case 'chat': case 'asset':
        await this.apply(m, false);
        break;
      case 'presence': {
        const p = await open<{ name: string; cursor?: { x: number; y: number }; selection: Id[] }>(this.key!, m.data);
        const prev = this.peers.get(m.from);
        this.peers.set(m.from, {
          id: m.from, name: p.name, color: colorFor(m.from), selection: p.selection,
          cursor: p.cursor, shown: prev?.shown ?? p.cursor,
        });
        this.publishPeers();
        break;
      }
      case 'join':
        this.peers.set(m.id, { id: m.id, name: '…', color: colorFor(m.id), selection: [] });
        this.publishPeers();
        this.sendPresence();
        break;
      case 'leave':
        this.peers.delete(m.id);
        this.publishPeers();
        break;
      case 'need-snapshot':
        this.send({ type: 'snapshot', seq: this.seq, data: await seal(this.key!, { sync: this.sync!.snapshot() }) });
        break;
      case 'error':
        console.warn('[dbm] relay:', m.message);
        break;
    }
  }

  private async apply(e: Entry, replay: boolean) {
    this.seq = Math.max(this.seq, e.seq);
    if (e.type === 'snapshot') {
      const { sync } = await open<{ sync: SyncSnapshot }>(this.key!, e.data);
      this.sync!.load(sync);
      return;
    }
    if (e.type === 'asset') {
      const a = await open<{ name: string; url: string }>(this.key!, e.data);
      this.sentAssets.add(a.name);
      addAsset(a.name, a.url);
      return;
    }
    if (e.type === 'chat') {
      const msg = await open<ChatMessage>(this.key!, e.data);
      if (this.state.messages.some((x) => x.id === msg.id)) return;
      const messages = [...this.state.messages, msg].slice(-500);
      const unread = !this.chatOpen && !replay && e.from !== this.me ? this.state.unread + 1 : this.state.unread;
      this.set({ messages, unread });
      return;
    }
    if (e.from === this.me && !replay) return; // our own op, already applied
    this.sync!.receive(await open<Op[]>(this.key!, e.data));
  }

  private send(m: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Batches local ops per animation frame. */
  private queueFlush() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    requestAnimationFrame(() => {
      this.flushQueued = false;
      this.flush();
    });
  }

  private async flush() {
    if (!this.outbox.length || this.ws?.readyState !== WebSocket.OPEN || this.state.status !== 'live') return;
    // keep only the last value per property within the batch
    const last = new Map<string, Op>();
    for (const op of this.outbox.splice(0)) {
      const k = op.k === 'set' ? `s${op.id}\u0000${op.p}` : op.k === 'order' ? 'order' : op.k === 'board' ? `b${op.p}` : `${op.k}${op.id}${op.t}`;
      last.delete(k);
      last.set(k, op);
    }
    this.send({ type: 'op', data: await seal(this.key!, [...last.values()]) });
  }

  private async sendAsset(name: string, force = false) {
    if (this.sentAssets.has(name) && !force) return;
    const url = assetUrl(name);
    if (!url) return;
    this.sentAssets.add(name);
    this.send({ type: 'asset', data: await seal(this.key!, { name, url }) });
  }

  async sendChat(text: string) {
    const msg: ChatMessage = { id: crypto.randomUUID(), from: this.me, name: this.name, color: colorFor(this.me), text, ts: Date.now() };
    this.set({ messages: [...this.state.messages, msg] });
    this.send({ type: 'chat', data: await seal(this.key!, msg) });
  }

  setChatOpen(open: boolean) {
    this.chatOpen = open;
    if (open && this.state.unread) this.set({ unread: 0 });
  }

  /** Throttled cursor + selection broadcast (20 Hz). */
  sendPresence() {
    if (this.presenceTimer) return;
    this.presenceTimer = window.setTimeout(async () => {
      this.presenceTimer = 0;
      if (!this.key) return;
      const p = { name: this.name, cursor: this.editor.pointerOnCanvas ? this.editor.pointer : undefined, selection: this.editor.state.selection };
      this.send({ type: 'presence', data: await seal(this.key, p) });
    }, 50);
  }

  rename(name: string) {
    this.name = name;
    this.sendPresence();
  }

  get myColor() {
    return colorFor(this.me || 'me');
  }

  private publishPeers() {
    this.editor.peers = this.peers;
    this.editor.requestDraw();
    this.set({ peers: [...this.peers.values()] });
  }

  stop() {
    this.closed = true;
    this.sync?.stop();
    this.offStore?.();
    this.ws?.close();
    this.peers.clear();
    this.editor.peers = new Map();
    this.editor.requestDraw();
  }
}
