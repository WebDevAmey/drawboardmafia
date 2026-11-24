import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { ROOM_RE, type ClientMsg, type Entry, type ServerMsg } from './protocol';

export interface RelayOptions {
  port?: number;
  host?: string;
  /** Max bytes of one message (default 16 MB, enough for an encrypted image). */
  maxMessage?: number;
  /** Max bytes held per room (default 128 MB). */
  maxRoomBytes?: number;
  /** Ask for a snapshot after this many ops (default 300). */
  compactAfter?: number;
  /** Forget a room this long after its last peer leaves (default 24h). */
  roomTtlMs?: number;
}

interface Peer {
  id: string;
  ws: WebSocket;
  budget: number;
}

interface Room {
  peers: Map<string, Peer>;
  log: Entry[];
  seq: number;
  bytes: number;
  opsSinceSnapshot: number;
  askedSnapshot: boolean;
  expiry?: NodeJS.Timeout;
}

export interface Relay {
  port: number;
  close(): Promise<void>;
  rooms(): number;
}

export function createRelay(opts: RelayOptions = {}): Promise<Relay> {
  const maxMessage = opts.maxMessage ?? 16 * 1024 * 1024;
  const maxRoomBytes = opts.maxRoomBytes ?? 128 * 1024 * 1024;
  const compactAfter = opts.compactAfter ?? 300;
  const ttl = opts.roomTtlMs ?? 24 * 60 * 60 * 1000;
  const rooms = new Map<string, Room>();

  const http: Server = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server: http, maxPayload: maxMessage });

  const send = (ws: WebSocket, m: ServerMsg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  };
  const broadcast = (room: Room, m: ServerMsg, except?: string) => {
    for (const p of room.peers.values()) if (p.id !== except) send(p.ws, m);
  };

  wss.on('connection', (ws, req) => {
    const roomId = (req.url ?? '').match(/^\/r\/([^/?#]+)/)?.[1] ?? '';
    if (!ROOM_RE.test(roomId)) {
      send(ws, { type: 'error', message: 'invalid room' });
      ws.close(1008, 'invalid room');
      return;
    }
    let room = rooms.get(roomId);
    if (!room) {
      room = { peers: new Map(), log: [], seq: 0, bytes: 0, opsSinceSnapshot: 0, askedSnapshot: false };
      rooms.set(roomId, room);
    }
    clearTimeout(room.expiry);
    const r = room;
    const peer: Peer = { id: randomBytes(6).toString('base64url'), ws, budget: 400 };
    send(ws, { type: 'welcome', id: peer.id, peers: [...r.peers.keys()], log: r.log });
    r.peers.set(peer.id, peer);
    broadcast(r, { type: 'join', id: peer.id }, peer.id);
    const refill = setInterval(() => (peer.budget = Math.min(400, peer.budget + 100)), 1000);

    ws.on('message', (raw, isBinary) => {
      if (isBinary || --peer.budget < 0) return; // rate limit: drop bursts
      let m: ClientMsg;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!m || typeof m !== 'object' || typeof (m as { data?: unknown }).data !== 'string') return;
      const size = (m as { data: string }).data.length;
      if (m.type === 'presence') {
        broadcast(r, { type: 'presence', from: peer.id, data: m.data }, peer.id);
        return;
      }
      if (m.type === 'snapshot') {
        if (!Number.isInteger(m.seq) || m.seq > r.seq) return;
        // drop ops (and older snapshots) the snapshot covers; chat and assets stay
        r.log = r.log.filter((e) => e.seq > m.seq || e.type === 'chat' || e.type === 'asset');
        const entry: Entry = { type: 'snapshot', seq: m.seq, from: peer.id, data: m.data };
        const at = r.log.findIndex((e) => e.seq > m.seq);
        r.log.splice(at < 0 ? r.log.length : at, 0, entry);
        r.bytes = r.log.reduce((n, e) => n + e.data.length, 0);
        r.opsSinceSnapshot = r.log.filter((e) => e.type === 'op').length;
        r.askedSnapshot = false;
        return;
      }
      if (m.type !== 'op' && m.type !== 'chat' && m.type !== 'asset') return;
      if (r.bytes + size > maxRoomBytes) {
        send(ws, { type: 'error', message: 'room is full' });
        return;
      }
      const entry: Entry = { type: m.type, seq: ++r.seq, from: peer.id, data: m.data };
      r.log.push(entry);
      r.bytes += size;
      // everyone, including the sender, gets the seq (the sender uses it to know what a snapshot covers)
      broadcast(r, { ...entry, type: m.type });
      if (m.type === 'op' && ++r.opsSinceSnapshot >= compactAfter && !r.askedSnapshot) {
        const oldest = r.peers.values().next().value as Peer | undefined;
        if (oldest) {
          r.askedSnapshot = true;
          send(oldest.ws, { type: 'need-snapshot', seq: r.seq });
        }
      }
    });

    ws.on('close', () => {
      clearInterval(refill);
      r.peers.delete(peer.id);
      broadcast(r, { type: 'leave', id: peer.id });
      if (r.peers.size === 0) {
        r.askedSnapshot = false;
        r.expiry = setTimeout(() => rooms.delete(roomId), ttl);
        r.expiry.unref();
      } else if (r.askedSnapshot) {
        // the peer we asked left; ask the next one
        const next = r.peers.values().next().value as Peer;
        send(next.ws, { type: 'need-snapshot', seq: r.seq });
      }
    });
  });

  return new Promise((resolve) => {
    http.listen(opts.port ?? 0, opts.host ?? '0.0.0.0', () => {
      const addr = http.address();
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : 0,
        rooms: () => rooms.size,
        close: () =>
          new Promise<void>((done) => {
            for (const c of wss.clients) c.terminate();
            for (const r of rooms.values()) clearTimeout(r.expiry);
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}
