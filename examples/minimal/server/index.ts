// The example app's server: the core's (the interface, health and state, the checks in front, MCP at /mcp), the
// core's settings and store bound to this app's folders, and one thing of its own on each extension point it shows:
// a setting of its own (`motto`, kept beside the core's keys in settings.json), a record of its own
// (data/notes.json), routes of its own, a tool of its own (get_notes), and its own event on the core's live stream
// (a note added reaches every open page at once). The agent's drawer (an agent CLI in a pseudo-terminal, or the
// app's own agent on a model API, which reaches get_notes in process) and the chat beside a page are the core's,
// with the app's words for what it is and what a page is about.

import path from 'node:path';
import { chatRoutes, Chats } from '@organon/core/server/chat';
import { EventHub } from '@organon/core/server/events';
import { ApiError, json, readJson, serve } from '@organon/core/server/http';
import { createMcpHandler, defineTools, type McpOptions, json as toolJson, READ_ONLY } from '@organon/core/server/mcp';
import { createMethod } from '@organon/core/server/method';
import { createOneshot } from '@organon/core/server/oneshot';
import { createSettings, onPath, SettingsError } from '@organon/core/server/settings';
import { settingsRoutes } from '@organon/core/server/settings-routes';
import { createStore, isObject } from '@organon/core/server/store';
import { Tutor } from '@organon/core/server/tutor';
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

const mcp: McpOptions = { instructions: () => 'The example app: notes and a motto. get_notes reads them.', tools };
const method = createMethod({
  root: app.root,
  section: 'Working here',
  otherAgents: 'This was written for Claude Code.',
  tool: { title: 'Read the routines', description: 'How to work here.', name: 'a routine' },
});

// The drawer: Claude Code by default (MINIMAL_CLAUDE_CMD in its place in the tests), or the app's own agent.
const tutor = new Tutor({
  app,
  settings,
  api: {
    method,
    mcp,
    intro: 'You are the agent in the Organon example app: it keeps notes.',
    here: 'Replies are a line or two. Read the notes with get_notes before you talk about them.',
    dropped: '(Earlier parts of this conversation were dropped to fit: get_notes says where things stand.)',
  },
});

// The chat beside the Notes page, on its own Claude Code (MINIMAL_ONESHOT_CMD in its place in the tests), talk only.
const chats = await Chats.load({
  app,
  store,
  oneshot: createOneshot({ app, settings }),
  system: 'You are the Organon example app, talking beside one of its pages. Plain Markdown, short.',
});
chats.onEvent((e) => events.send(e));
const chatApi = chatRoutes(chats, {
  context: (thread, body) =>
    [`Where they are: ${body.where ?? thread}`, body.page && `On screen:\n${body.page}`, body.mentions && `Tagged:\n${body.mentions}`]
      .filter(Boolean)
      .join('\n\n'),
});

const settingsApi = settingsRoutes(settings, { view: () => ({ ...settings.view(onPath), motto: motto() }) });

await serve(app, {
  warnings,
  accent: () => settings.accent,
  state: () => ({ motto: motto(), notes: notes.notes }),
  mcp: createMcpHandler(app, mcp),
  upgrade: tutor.upgrade,
  stop: async () => {
    await chats.idle();
    events.close();
    tutor.stop();
  },
  api: async (req, res, route, params) => {
    if (await chatApi(req, res, route, params)) return true;
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
    // The rest of Settings (the models the API offers) through the core's routes; the two above carry the motto too.
    if (await settingsApi(req, res, route, params)) return true;
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
