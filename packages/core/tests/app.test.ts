// app.ts: app.json is the one place an app's name, ports and loopback are said; the environment moves an instance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppJsonError, defineApp } from '../src/server/app.ts';

async function root(json: unknown): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'organon-appjson-'));
  await writeFile(path.join(dir, 'app.json'), JSON.stringify(json));
  return dir;
}
const ARGUS = {
  name: 'argus',
  title: 'Argus',
  hostname: 'argus.test',
  loopback: '127.0.0.84',
  ports: { live: 4930, dev: 4940, tls: 4931, vite: 5203 },
};

test('The live instance: its port, its state folder named after the app, its service and release copy', async () => {
  const dir = await root(ARGUS);
  const app = defineApp(dir, { HOME: '/home/x' });
  assert.equal(app.instance, 'live');
  assert.equal(app.port, 4930);
  assert.equal(app.prefix, 'ARGUS');
  assert.equal(app.stateDir, path.join(dir, '.argus'));
  assert.equal(app.dataDir, path.join(dir, 'data'));
  assert.equal(app.service, 'argus.service');
  assert.equal(app.releaseDir, '/home/x/.local/share/argus/app');
  assert.equal(app.pidFile, path.join(dir, '.argus', 'server-4930.pid'));
  assert.equal(app.defaultAccent, 'green');
  // No certificate and (in a test folder) whatever /etc/hosts says: localhost is always allowed, other ports never.
  assert.ok(app.allowedHosts.has('127.0.0.1:4930'));
  assert.ok(!app.allowedHosts.has('localhost:5203'));
  assert.ok(!app.allowedOrigins.has('http://localhost:4940'));
});

test('The dev instance: its own port and .dev folders, Vite allowed, never the clean name', async () => {
  const dir = await root(ARGUS);
  const app = defineApp(dir, { ARGUS_INSTANCE: 'dev' });
  assert.equal(app.port, 4940);
  assert.equal(app.stateDir, path.join(dir, '.dev/state'));
  assert.equal(app.dataDir, path.join(dir, '.dev/data'));
  assert.equal(app.url, 'http://localhost:4940');
  assert.ok(app.allowedOrigins.has('http://localhost:5203'));
  assert.ok(!app.allowedHosts.has('argus.test'));
  assert.equal(app.tlsEnabled, false);
});

test('<PREFIX>_* moves an instance, and env() reads the app’s own variables', async () => {
  const dir = await root(ARGUS);
  const app = defineApp(dir, { ARGUS_INSTANCE: 'dev', ARGUS_PORT: '5999', ARGUS_DATA_DIR: '/tmp/d', ARGUS_CAPTURE: 'x', GALEN_PORT: '1' });
  assert.equal(app.port, 5999);
  assert.equal(app.dataDir, '/tmp/d');
  assert.equal(app.env('CAPTURE'), 'x');
  assert.equal(app.env('NOPE'), undefined);
});

test('A wrong app.json, or none, stops the app at start and says what is wrong', async () => {
  assert.throws(() => defineApp('/nonexistent'), AppJsonError);
  for (const [bad, said] of [
    [{ ...ARGUS, name: 'Argus' }, /name/],
    [{ ...ARGUS, hostname: 'argus.com' }, /hostname/],
    [{ ...ARGUS, loopback: '127.0.0.1' }, /loopback/],
    [{ ...ARGUS, ports: { ...ARGUS.ports, tls: 80 } }, /ports\.tls/],
    [{ ...ARGUS, defaultAccent: 'pink' }, /defaultAccent/],
  ] as const) {
    const dir = await root(bad);
    assert.throws(
      () => defineApp(dir),
      (err: Error) => err instanceof AppJsonError && said.test(err.message),
    );
  }
});
