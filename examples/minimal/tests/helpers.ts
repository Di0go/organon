// A real server on throwaway folders and a free port, as the apps' own tests start theirs.

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface Running {
  base: string;
  dataDir: string;
  stateDir: string;
  stop(): void;
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

/** Starts server/index.ts; `stateDir` / `dataDir` to start it on folders made beforehand (a settings.json, a record). */
export async function start(stateDir?: string, dataDirGiven?: string): Promise<Running> {
  const port = await freePort();
  const dataDir = dataDirGiven ?? (await mkdtemp(path.join(tmpdir(), 'minimal-data-')));
  const state = stateDir ?? (await mkdtemp(path.join(tmpdir(), 'minimal-state-')));
  const child: ChildProcess = spawn(process.execPath, ['server/index.ts'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, MINIMAL_INSTANCE: 'dev', MINIMAL_PORT: String(port), MINIMAL_DATA_DIR: dataDir, MINIMAL_STATE_DIR: state },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  return { base, dataDir, stateDir: state, stop: () => child.kill() };
}

export async function put(base: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
