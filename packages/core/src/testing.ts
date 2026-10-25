// What an app's tests need from the core: its real server started on throwaway folders and a free port, as the apps'
// own tests start theirs, and the Chromium the browser tests run in, which in the canary must be there
// (ORGANON_REQUIRE_CHROMIUM). From examples/minimal/tests/helpers.ts and Aristotle's browser.test.ts.
//
//   const app = await startServer(ROOT);          // server/index.ts, dev instance, its own port and folders
//   const chromium = findChromium(playwright.chromium.executablePath());

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readAppJson } from './server/app.ts';

export interface Running {
  base: string;
  port: number;
  dataDir: string;
  stateDir: string;
  /** What the server wrote to stdout and stderr so far. */
  log(): string;
  stop(): Promise<void>;
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

export interface StartOptions {
  /** Folders made beforehand (a settings.json, a record); throwaway ones otherwise. */
  stateDir?: string;
  dataDir?: string;
  /** More of the app's own variables, by key without the prefix ({ CAPTURE_CMD: … }). */
  env?: Record<string, string>;
}

/** Starts the app's server/index.ts as its dev instance and waits until /api/health answers (up to 10 s). */
export async function startServer(root: string, options: StartOptions = {}): Promise<Running> {
  const prefix = readAppJson(root).name.toUpperCase().replace(/-/g, '_');
  const port = await freePort();
  const dataDir = options.dataDir ?? (await mkdtemp(path.join(tmpdir(), `${prefix.toLowerCase()}-data-`)));
  const stateDir = options.stateDir ?? (await mkdtemp(path.join(tmpdir(), `${prefix.toLowerCase()}-state-`)));
  // The shell's own variables for this app never reach a test server.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith(`${prefix}_`)));
  Object.assign(env, {
    [`${prefix}_INSTANCE`]: 'dev',
    [`${prefix}_PORT`]: String(port),
    [`${prefix}_DATA_DIR`]: dataDir,
    [`${prefix}_STATE_DIR`]: stateDir,
    ...Object.fromEntries(Object.entries(options.env ?? {}).map(([k, v]) => [`${prefix}_${k}`, v])),
  });
  const child: ChildProcess = spawn(process.execPath, ['server/index.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  for (const s of [child.stdout, child.stderr]) s?.on('data', (d: Buffer) => (out += d.toString()));
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 200 && child.exitCode === null; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        up = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!up) {
    child.kill();
    throw new Error(`The server did not start:\n${out}`);
  }
  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  return { base, port, dataDir, stateDir, log: () => out, stop };
}

/**
 * The Chromium to run browser tests in: `env` (an app's <PREFIX>_TEST_CHROMIUM), the system's, or Playwright's own
 * (pass `chromium.executablePath()`). Undefined when there is none, so the test is skipped; in the canary
 * (ORGANON_REQUIRE_CHROMIUM) a missing Chromium is a failure, not a skip.
 */
export function findChromium(...candidates: (string | undefined)[]): string | undefined {
  const found = [...candidates, '/usr/bin/chromium'].find((p): p is string => Boolean(p && existsSync(p)));
  if (!found && process.env.ORGANON_REQUIRE_CHROMIUM) throw new Error('No Chromium, and ORGANON_REQUIRE_CHROMIUM is set');
  return found;
}
