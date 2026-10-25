// Where this instance lives: its name, ports and folders, which is all an app tells the core about itself. Like
// Aristotle's and Galen's config.ts, with MINIMAL_ where they have ARISTOTLE_ and GALEN_.

import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
/** `dev` (pnpm dev, the tests) or `live`; each has its own port and folders, so one never touches the other. */
export const DEV = process.env.MINIMAL_INSTANCE === 'dev';
export const PORT = Number(process.env.MINIMAL_PORT ?? (DEV ? 4970 : 4960));
export const DATA_DIR = process.env.MINIMAL_DATA_DIR ?? path.join(ROOT, DEV ? '.dev/data' : 'data');
export const STATE_DIR = process.env.MINIMAL_STATE_DIR ?? path.join(ROOT, DEV ? '.dev/state' : '.minimal');
export const SETTINGS_FILE = path.join(STATE_DIR, 'settings.json');
export const UI_DIR = path.join(ROOT, 'dist/ui');
export const API_KEY = process.env.MINIMAL_API_KEY;
/** The app's default accent when the install and the browser chose none (Galen's is green, Aristotle's blue). */
export const DEFAULT_ACCENT = 'violet';
