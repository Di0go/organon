// http.ts: an app's server without its routes, served in process on a throwaway app. What it refuses matters as much
// as what it answers: another Host (DNS rebinding), another Origin (CSRF), a cross-site request, a body not JSON.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import type { App } from '../src/server/app.ts';
import { ApiError, json, readJson, type Serving, serve } from '../src/server/http.ts';
import { Warnings } from '../src/server/warnings.ts';
import { fixtureApp } from './fixture-app.ts';

let app: App;
let serving: Serving;
let base: string;
let head: string;
const warnings = new Warnings();

before(async () => {
  app = await fixtureApp();
  // A checkout, as an app's is: the health says its commit.
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
      cwd: app.root,
      encoding: 'utf8',
    }).trim();
  git('init', '--quiet');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'probe');
  head = git('rev-parse', 'HEAD');
  warnings.set('x', 'Something to know');
  serving = await serve(app, {
    signals: false,
    warnings,
    state: () => ({ hosts: 3 }),
    accent: () => 'red',
    images: ['https://upload.wikimedia.org'],
    api: async (req, res, route) => {
      if (req.method === 'GET' && route === '/api/hosts') return json(res, 200, [1, 2, 3]);
      if (req.method === 'POST' && route === '/api/echo') return json(res, 200, { got: await readJson(req) });
      if (route === '/api/teapot') throw new ApiError(418, 'I am a teapot');
      return false;
    },
  });
  base = `http://127.0.0.1:${serving.port}`;
});

after(() => serving.close());

const get = (p: string, headers: Record<string, string> = {}) => fetch(`${base}${p}`, { headers });

test('Health says which app, instance, checkout and commit; state carries the app’s, the warnings and no build in dev', async () => {
  const h = (await (await get('/api/health')).json()) as Record<string, unknown>;
  assert.deepEqual([h.ok, h.app, h.instance, h.root, h.commit], [true, 'probe', 'dev', app.root, head]);
  assert.deepEqual(await (await get('/api/state')).json(), { hosts: 3, warnings: ['Something to know'] });
  assert.ok(existsSync(app.pidFile), 'the pid file is written');
});

test('The app’s routes answer; an unknown one is the core’s 404; an ApiError is its status and message', async () => {
  assert.deepEqual(await (await get('/api/hosts')).json(), [1, 2, 3]);
  assert.equal((await get('/api/nope')).status, 404);
  const tea = await get('/api/teapot');
  assert.equal(tea.status, 418);
  assert.deepEqual(await tea.json(), { error: 'I am a teapot' });
});

test('Another Host, another Origin, or a cross-site request is refused', async () => {
  // fetch never sends a Host of its own choosing: a raw request does, as a rebound DNS name would.
  const withHost = (host: string) =>
    new Promise<number>((resolve, reject) =>
      http
        .get({ host: '127.0.0.1', port: serving.port, path: '/api/hosts', headers: { Host: host } }, (res) => resolve(res.statusCode ?? 0))
        .on('error', reject),
    );
  assert.equal(await withHost('evil.example'), 403);
  assert.equal(await withHost(`evil.example:${serving.port}`), 403);
  assert.equal(await withHost(`localhost:${serving.port}`), 200);
  assert.equal((await get('/api/hosts', { Origin: 'http://localhost:1234' })).status, 403);
  assert.equal((await get('/api/hosts', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await get('/api/hosts', { Origin: `http://localhost:${app.vitePort}` })).status, 200);
});

test('A body must say it is JSON, and be JSON', async () => {
  const post = (body: string, type: string) => fetch(`${base}/api/echo`, { method: 'POST', headers: { 'Content-Type': type }, body });
  assert.equal((await post('{"a":1}', 'text/plain')).status, 415);
  assert.equal((await post('{"a":', 'application/json')).status, 400);
  assert.deepEqual(await (await post('{"a":1}', 'application/json')).json(), { got: { a: 1 } });
});

test('The interface: index.html for any page with the install’s accent, assets cached, a missing asset a 404', async () => {
  const page = await get('/hosts/aa:bb');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html lang="en" data-accent="red">/);
  assert.match(page.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  // The app's own image hosts (Aristotle's Wikimedia), after the core's sources, and nothing else.
  assert.match(page.headers.get('content-security-policy') ?? '', /img-src 'self' data: blob: https:\/\/upload\.wikimedia\.org;/);
  const asset = await get('/assets/index-AbC123.js');
  assert.match(asset.headers.get('cache-control') ?? '', /immutable/);
  assert.equal((await get('/assets/index-gone.js')).status, 404);
  assert.equal((await get('/..%2f..%2fetc/passwd')).status, 200, 'a path out of dist/ui gets the app, never the file');
  assert.doesNotMatch(await (await get('/..%2f..%2fetc/passwd')).text(), /root:/);
});

test('No MCP handed in: /mcp is a 404, not the app', async () => {
  const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 404);
});

test('Closing removes the pid file', async () => {
  const other = await fixtureApp();
  const s = await serve(other, { signals: false });
  assert.ok(existsSync(other.pidFile));
  await s.close();
  assert.ok(!existsSync(other.pidFile));
});

test('A WebSocket upgrade reaches the app only from its own page: exact Host, an Origin of its own, same site', async () => {
  // An app of its own: the first one holds its port.
  const other = await fixtureApp();
  const sock = await serve(other, {
    signals: false,
    // The app's handler: takes /api/sock, answers 101 itself (as a WebSocket server would), and nothing else.
    upgrade: (_req, socket, _head, route) => {
      if (route !== '/api/sock') return false;
      socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: test\r\nConnection: Upgrade\r\n\r\n');
      return true;
    },
  });
  const ask = (path: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: sock.port,
        path,
        headers: { Connection: 'Upgrade', Upgrade: 'test', Host: `127.0.0.1:${sock.port}`, ...headers },
      });
      req.on('upgrade', (res, socket) => {
        socket.destroy();
        resolve(res.statusCode ?? 0);
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
  const self = `http://127.0.0.1:${sock.port}`;
  try {
    assert.equal(await ask('/api/sock', { Origin: self }), 101, 'its own page');
    assert.equal(await ask('/api/sock', {}), 403, 'no Origin: not a page of its own');
    assert.equal(await ask('/api/sock', { Origin: 'http://evil.test' }), 403, 'another page');
    assert.equal(await ask('/api/sock', { Origin: self, Host: 'evil.test' }), 403, 'another name');
    assert.equal(await ask('/api/sock', { Origin: self, 'Sec-Fetch-Site': 'cross-site' }), 403, 'cross-site');
    assert.equal(await ask('/api/other', { Origin: self }), 403, 'a path the app does not take');
  } finally {
    await sock.close();
  }
});

test('An image host must be an https origin and nothing more: anything else stops the server before it starts', async () => {
  for (const bad of ['http://upload.wikimedia.org', "https://a.org; script-src 'unsafe-inline'", 'https://a.org/path', '*'])
    await assert.rejects(serve(app, { signals: false, images: [bad] }), /image host/);
});
