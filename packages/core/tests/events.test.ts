// events.ts: one stream every open page listens on. An event reaches every page, a ping keeps a quiet one alive, a
// page that goes is forgotten, and a page that stops reading is let go instead of buffered without end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventHub } from '../src/server/events.ts';

async function serveHub(hub: EventHub) {
  const server = http.createServer((req, res) => hub.stream(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
}

/** Reads a stream's text until `until` is in it. */
async function readUntil(res: Response, until: string): Promise<string> {
  const reader = res.body!.getReader();
  let text = '';
  while (!text.includes(until)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  await reader.cancel();
  return text;
}

test('Every open page gets each event, as one JSON data line; a quiet stream is pinged', async () => {
  const hub = new EventHub({ ping: 50 });
  const { server, url } = await serveHub(hub);
  const [a, b] = await Promise.all([fetch(url), fetch(url)]);
  assert.equal(a.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  for (let i = 0; i < 50 && hub.size < 2; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(hub.size, 2);
  hub.send({ type: 'hosts', n: 3 });
  const [ta, tb] = await Promise.all([readUntil(a, '"n":3'), readUntil(b, 'event: ping')]);
  assert.match(ta, /^retry: 2000\n\ndata: \{"type":"hosts","n":3\}\n\n/);
  assert.match(tb, /event: ping\ndata: \.\n\n/);
  hub.close();
  server.close();
});

test('A page that goes is forgotten', async () => {
  const hub = new EventHub();
  const { server, url } = await serveHub(hub);
  const ac = new AbortController();
  await fetch(url, { signal: ac.signal });
  for (let i = 0; i < 50 && hub.size < 1; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(hub.size, 1);
  ac.abort();
  for (let i = 0; i < 100 && hub.size > 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(hub.size, 0);
  server.close();
});

test('A page that stops reading is let go once its unread data passes the limit', async () => {
  const hub = new EventHub({ highWater: 64 * 1024 });
  const { server, url } = await serveHub(hub);
  // A client that never reads: a raw socket.
  const req = http.get(url);
  await new Promise<void>((r) =>
    req.on('response', (res) => {
      res.pause();
      r();
    }),
  );
  const big = 'x'.repeat(16 * 1024);
  for (let i = 0; i < 2000 && hub.size > 0; i++) {
    hub.send({ big });
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(hub.size, 0, 'the stuck page was dropped');
  req.destroy();
  server.close();
});
