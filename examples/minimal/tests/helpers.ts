// The app's real server on throwaway folders and a free port, through the core's test helpers, as Argus's tests do.

import path from 'node:path';
import { freePort, startServer } from '@organon/core/testing';

export { freePort };

export interface Running {
  base: string;
  dataDir: string;
  stateDir: string;
  stop(): Promise<void>;
}

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Starts server/index.ts; `stateDir` / `dataDir` to start it on folders made beforehand (a settings.json, a record),
 * `env` for more of its MINIMAL_* variables. Never a real Claude Code: a plain shell runs in the drawer, and `cat` answers the chat with what it was sent.
 */
export async function start(stateDir?: string, dataDir?: string, env: Record<string, string> = {}): Promise<Running> {
  return startServer(ROOT, {
    stateDir,
    dataDir,
    env: { CLAUDE_CMD: 'bash --norc --noprofile', ONESHOT_CMD: 'cat', TERMINAL_QUIET_MS: '300', ...env },
  });
}

export async function put(base: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
