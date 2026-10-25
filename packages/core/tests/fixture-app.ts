// A throwaway app root for the server tests: an app.json, a built interface of one page and one asset, ports free.

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type App, defineApp } from '../src/server/app.ts';
import { freePort } from '../src/testing.ts';

export async function fixtureApp(extra: NodeJS.ProcessEnv = {}): Promise<App> {
  const root = await mkdtemp(path.join(tmpdir(), 'organon-app-'));
  const [port, vite] = [await freePort(), await freePort()];
  await writeFile(
    path.join(root, 'app.json'),
    JSON.stringify({
      name: 'probe',
      title: 'Probe',
      hostname: 'probe.test',
      loopback: '127.0.0.99',
      ports: { live: 4999, dev: port, tls: 4998, vite },
      defaultAccent: 'blue',
    }),
  );
  await mkdir(path.join(root, 'dist/ui/assets'), { recursive: true });
  await writeFile(
    path.join(root, 'dist/ui/index.html'),
    '<!doctype html><html lang="en"><head><script type="module" src="/assets/index-AbC123.js"></script></head></html>',
  );
  await writeFile(path.join(root, 'dist/ui/assets/index-AbC123.js'), 'console.log(1)');
  return defineApp(root, { PROBE_INSTANCE: 'dev', HOME: root, ...extra });
}
