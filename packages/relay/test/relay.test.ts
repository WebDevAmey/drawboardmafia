import { afterEach, beforeEach, expect, test } from 'vitest';
import WebSocket from 'ws';
import { createRelay, type Relay, type ServerMsg } from '../src';

let relay: Relay;
const ROOM = 'testroom-abcdefgh1234';
beforeEach(async () => {
  relay = await createRelay({ port: 0, host: '127.0.0.1', compactAfter: 3 });
});
afterEach(() => relay.close());

/** Connects and collects messages; resolves after the welcome. */
async function client(room = ROOM) {
  const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/r/${room}`);
  const inbox: ServerMsg[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (raw) => {
    inbox.push(JSON.parse(raw.toString()));
    waiters.splice(0).forEach((w) => w());
  });
  const next = async (type: ServerMsg['type']): Promise<ServerMsg> => {
    for (;;) {
      const i = inbox.findIndex((m) => m.type === type);
      if (i >= 0) return inbox.splice(i, 1)[0]!;
      await new Promise<void>((r) => waiters.push(r));
    }
  };
  const welcome = (await next('welcome')) as Extract<ServerMsg, { type: 'welcome' }>;
  return { ws, inbox, next, welcome, send: (m: object) => ws.send(JSON.stringify(m)) };
}

test('ops are sequenced, broadcast to everyone, and replayed to late joiners', async () => {
  const a = await client();
  const b = await client();
  expect(b.welcome.peers).toEqual([a.welcome.id]);
  expect((await a.next('join')) as { id: string }).toMatchObject({ id: b.welcome.id });
  a.send({ type: 'op', data: 'cipher-1' });
  expect(await b.next('op')).toMatchObject({ seq: 1, from: a.welcome.id, data: 'cipher-1' });
  expect(await a.next('op')).toMatchObject({ seq: 1 });
  a.send({ type: 'chat', data: 'hello' });
  await b.next('chat');
  const c = await client();
  expect(c.welcome.log.map((e) => [e.type, e.data])).toEqual([['op', 'cipher-1'], ['chat', 'hello']]);
});

test('presence is relayed but never logged', async () => {
  const a = await client();
  const b = await client();
  a.send({ type: 'presence', data: 'cursor' });
  expect(await b.next('presence')).toMatchObject({ from: a.welcome.id, data: 'cursor' });
  const c = await client();
  expect(c.welcome.log).toEqual([]);
});

test('snapshot compaction keeps later ops, chat and assets', async () => {
  const a = await client();
  a.send({ type: 'op', data: 'o1' });
  a.send({ type: 'chat', data: 'c1' });
  a.send({ type: 'op', data: 'o2' });
  a.send({ type: 'op', data: 'o3' });
  const ask = (await a.next('need-snapshot')) as { seq: number };
  expect(ask.seq).toBe(4);
  a.send({ type: 'snapshot', seq: 3, data: 'snap' });
  a.send({ type: 'asset', data: 'img' });
  await a.next('asset');
  const b = await client();
  expect(b.welcome.log.map((e) => e.data)).toEqual(['c1', 'snap', 'o3', 'img']);
});

test('leave is announced and invalid rooms are refused', async () => {
  const a = await client();
  const b = await client();
  b.ws.close();
  expect(await a.next('leave')).toMatchObject({ id: b.welcome.id });
  const bad = new WebSocket(`ws://127.0.0.1:${relay.port}/r/x`);
  const code = await new Promise((r) => bad.on('close', (c) => r(c)));
  expect(code).toBe(1008);
});
