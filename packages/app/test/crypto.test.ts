import { expect, test } from 'vitest';
import { importKey, newRoom, open, parseHash, seal } from '../src/collab/crypto';

test('seal/open round-trips and uses a fresh IV each time', async () => {
  const { key } = newRoom();
  const k = await importKey(key);
  const msg = { hello: 'world', n: [1, 2, 3], emoji: '👋' };
  const a = await seal(k, msg);
  const b = await seal(k, msg);
  expect(a).not.toBe(b);
  expect(await open(k, a)).toEqual(msg);
});

test('a different key cannot open the message', async () => {
  const k1 = await importKey(newRoom().key);
  const k2 = await importKey(newRoom().key);
  await expect(open(k2, await seal(k1, 'secret'))).rejects.toThrow();
});

test('share links parse back to room and key', () => {
  const { room, key } = newRoom();
  expect(parseHash(`#live=${room}.${key}`)).toEqual({ room, key });
  expect(parseHash('#live=short.key')).toBeUndefined();
  expect(parseHash('')).toBeUndefined();
});
