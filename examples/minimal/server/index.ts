// The example app's server: the core's (the interface, health and state, the checks in front, MCP at /mcp), the
// core's settings and store bound to this app's folders, and one thing of its own on each extension point it shows:
// a setting of its own (`motto`, kept beside the core's keys in settings.json), a record of its own
// (data/notes.json), routes of its own, a tool of its own (get_notes), and its own event on the core's live stream
// (a note added reaches every open page at once).

import path from 'node:path';
import { EventHub } from '@organon/core/server/events';
import { ApiError, json, readJson, serve } from '@organon/core/server/http';
import { createMcpHandler, defineTools, json as toolJson, READ_ONLY } from '@organon/core/server/mcp';
import { createSettings, onPath, SettingsError } from '@organon/core/server/settings';
import { createStore, isObject } from '@organon/core/server/store';
import { Warnings } from '@organon/core/server/warnings';
import { app } from './config.ts';

const warnings = new Warnings();
const settings = createSettings({ file: app.settingsFile, warnings, apiKey: app.apiKey });
const store = createStore({ dataDir: app.dataDir, warnings });

/** This app's own setting: a line it shows at the top. Its shape is the app's to check, not the core's. */
function motto(): string {
  const v = settings.extra('motto');
  return typeof v === 'string' ? v : '';
}

type Notes = { notes: string[] };
const NOTES_FILE = path.join(app.dataDir, 'notes.json');
const isNotes = (v: unknown): v is Notes => isObject(v) && Array.isArray(v.notes) && v.notes.every((n) => typeof n === 'string');
let notes = await store.loadJson(NOTES_FILE, isNotes, { notes: [] });
const events = new EventHub();

const tools = defineTools((mcp) => {
  mcp.registerTool('get_notes', { annotations: READ_ONLY, description: 'The notes, oldest first, and the motto.' }, async () =>
    toolJson({ motto: motto(), notes: notes.notes }),
  );
});

await serve(app, {
  warnings,
  accent: () => settings.accent,
  state: () => ({ motto: motto(), notes: notes.notes }),
  mcp: createMcpHandler(app, { instructions: () => 'The example app: notes and a motto. get_notes reads them.', tools }),
  stop: async () => events.close(),
  api: async (req, res, route) => {
    if (req.method === 'GET' && route === '/api/events') return events.stream(req, res);
    if (req.method === 'GET' && route === '/api/settings') return json(res, 200, { ...settings.view(onPath), motto: motto() });
    if (req.method === 'PUT' && route === '/api/settings') {
      const { motto: next, ...core } = ((await readJson(req)) ?? {}) as { motto?: unknown };
      try {
        // Every field checked before anything is written, so a request with one bad field changes nothing.
        if (next !== undefined && (typeof next !== 'string' || next.length > 200))
          throw new SettingsError('motto must be text, at most 200 characters');
        await settings.update(core);
        if (next !== undefined) await settings.setExtra('motto', next || undefined);
      } catch (err) {
        if (err instanceof SettingsError) throw new ApiError(400, err.message);
        throw err;
      }
      return json(res, 200, { ...settings.view(onPath), motto: motto() });
    }
    if (req.method === 'POST' && route === '/api/notes') {
      const { text } = ((await readJson(req)) ?? {}) as { text?: unknown };
      if (typeof text !== 'string' || !text.trim()) throw new ApiError(400, 'A note needs text');
      notes = { notes: [...notes.notes, text.trim()] };
      await store.writeJson(NOTES_FILE, notes);
      events.send({ type: 'notes', notes: notes.notes });
      return json(res, 200, notes);
    }
    return false;
  },
});
