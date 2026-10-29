// settings-routes.ts: the routes Settings reads and changes who runs in the drawer through, as Aristotle and Galen had
// them in their server/index.ts. On a plain HTTP server, with a fake model API listing two models.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSettings } from '../src/server/settings.ts';
import { settingsRoutes } from '../src/server/settings-routes.ts';
import { Warnings } from '../src/server/warnings.ts';

let server: http.Server;
let api: http.Server;
let base = '';
let apiBase = '';
let file = '';
const asked: { auth?: string }[] = [];

before(async () => {
  api = http.createServer((req, res) => {
    asked.push({ auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'small' }, { id: 'large' }] }));
  });
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  apiBase = `http://127.0.0.1:${(api.address() as { port: number }).port}/v1`;

  file = path.join(await mkdtemp(path.join(tmpdir(), 'organon-settings-routes-')), 'settings.json');
  const settings = createSettings({ file, warnings: new Warnings() });
  const routes = settingsRoutes(settings, {
    view: () => ({ ...settings.view(() => false), door: 'the app’s own key' }),
    identity: { title: 'Minimal', site: 'https://example.org' },
  });
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!(await routes(req, res, url.pathname, url.searchParams))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  server.close();
  api.close();
});

const put = (body: unknown) =>
  fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test("GET answers with the app's view: the core's settings and the app's own keys", async () => {
  const view = (await (await fetch(`${base}/api/settings`)).json()) as Record<string, unknown>;
  assert.equal(view.tutor, 'claude-code');
  assert.equal(view.door, 'the app’s own key');
});

test('PUT changes who runs, answers with the new view, and the API key goes in but never comes out', async () => {
  const res = await put({ tutor: 'api', api: { provider: 'custom', baseUrl: apiBase, apiKey: 'sk-secret-123456', model: 'small' } });
  assert.equal(res.status, 200);
  const view = (await res.json()) as { tutor: string; api: { key: string } };
  assert.equal(view.tutor, 'api');
  assert.doesNotMatch(JSON.stringify(view), /sk-secret-123456/);
  assert.equal((JSON.parse(await readFile(file, 'utf8')) as { tutor: string }).tutor, 'api');
});

test('A bad body is a 400 and changes nothing', async () => {
  for (const body of [[1], 'text', { tutor: 'nobody' }]) {
    const res = await put(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(((await res.json()) as { error: string }).error);
  }
  assert.equal((JSON.parse(await readFile(file, 'utf8')) as { tutor: string }).tutor, 'api');
});

test('The models are asked of the saved API, with its key and as the app; a dead API is a 502 with why', async () => {
  const res = await fetch(`${base}/api/settings/models`);
  assert.equal(res.status, 200);
  assert.deepEqual(
    ((await res.json()) as { id: string }[]).map((m) => m.id),
    ['large', 'small'],
  ); // sorted by the core's listModels
  assert.equal(asked.at(-1)?.auth, 'Bearer sk-secret-123456');
  await put({ api: { baseUrl: 'http://127.0.0.1:9/v1' } });
  const dead = await fetch(`${base}/api/settings/models`);
  assert.equal(dead.status, 502);
  assert.ok(((await dead.json()) as { error: string }).error);
});

test('Anything else is left to the app', async () => {
  assert.equal((await fetch(`${base}/api/settings/else`)).status, 404);
  assert.equal((await fetch(`${base}/api/settings`, { method: 'DELETE' })).status, 404);
});
