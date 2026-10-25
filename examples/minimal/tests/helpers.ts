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

/** Starts server/index.ts; `stateDir` / `dataDir` to start it on folders made beforehand (a settings.json, a record). */
export async function start(stateDir?: string, dataDir?: string): Promise<Running> {
  return startServer(ROOT, { stateDir, dataDir });
}

export async function put(base: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
