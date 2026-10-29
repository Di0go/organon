// The chat beside a page: the person talks with the app (a second Claude Code on their own login, beside the agent in
// the drawer, or the model API when Settings say so) about what they are looking at. Each message carries the page
// and what the app puts with it (the context), so it always knows where they are. On Claude Code it may have the
// app's own tools (when the app asks), so what they say there is filed at once. One conversation per place, kept in
// <data>/chats/<thread>.jsonl (appended to, never rewritten) and continued as one Claude Code session, or sent with
// its recent messages to the API.
//
//   const chats = await Chats.load({ app, store, oneshot, system: SYSTEM, tools: { writes: WRITES, talkOnly, remove } });
//   chats.onEvent((e) => events.send(e));            // the live feed: ChatEvent (shared/chat.ts)
//   await serve(app, { api: chatRoutes(chats, { context: (thread, body) => … }) });
//
// From Galen's server/chat.ts (f1d2435: the app's tools in the chat, and the paragraph after a tool call), the same
// mechanism as Aristotle's, which has no tools. The app's: the system prompt, what is said with the tools and without
// them, which tools the chat must not have, the words for the person ("His message", "Him"), the context of a page.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ChatEvent, ChatMessage, ChatThread } from '../shared/chat.ts';
import type { App } from './app.ts';
import { json, type Route, readJson } from './http.ts';
import { complete, type LlmMessage } from './llm.ts';
import { claudeEnv, type Oneshot } from './oneshot.ts';
import { slugCandidates, slugify } from './slug.ts';
import { endLastLine, isObject, readLog, type Store } from './store.ts';

const TIMEOUT_MS = 180_000;
/** Marks, between the runner and send(), an answer that was stopped. */
const STOPPED = '\u0000stopped';
const MAX_MESSAGE = 8000;
const MAX_CONTEXT = 12_000;
/** Messages of the chat so far sent with each new one to the model API (Claude Code keeps its own session). */
const API_HISTORY = 20;

export interface ChatsOptions {
  app: App;
  /** The app's store: the chats' logs are written through it. */
  store: Store;
  /** The one-shot runner (oneshot.ts): the command, the model, the private folder, the limit on how many at once. */
  oneshot: Oneshot;
  /** Where the chats are kept; default chats/ in the data folder. */
  dir?: string;
  /** What the chat is told it is, and how to answer. */
  system: string;
  /**
   * The app's own tools in the chat, on Claude Code: its MCP server through the app's bridge, run unasked. `writes` is
   * said to Claude Code with them (what to file, what to read first); `talkOnly` to the model API, which has none;
   * `remove` names the tools the chat must not have (Galen's remove_lab, remove_entity). Without this, the chat only
   * talks, on either.
   */
  tools?: { writes: string; talkOnly?: string; remove?: string[]; bridge?: string };
  /** Who answers, in the errors the person reads ("Galen is still answering…"); default the app's title. */
  name?: string;
  /** How the person's message is put to the model ("His message"), and the person in a recap ("Him"). */
  person?: { message: string; label: string };
}

export class ChatError extends Error {}

/** One line of a chat's log: a message, the Claude Code session it continues, or the chat started over. */
type ChatOp = { op: 'message'; message: ChatMessage } | { op: 'session'; session?: string } | { op: 'clear' };

/** A message as it streams: the thread, the answer's id, and the text added since the last delta. */
export interface ChatDelta {
  thread: string;
  id: string;
  delta: string;
}

export class Chats {
  private threads = new Map<string, ChatThread>();
  private busy = new Set<string>();
  /** The Claude Code answering in each thread right now, so it can be stopped. */
  private running = new Map<string, { kill: () => void; stopped: boolean }>();
  private log: InstanceType<Store['AppendLog']>;
  private readonly options: ChatsOptions;
  private readonly dir: string;
  private readonly name: string;
  private readonly person: { message: string; label: string };
  readonly events = new EventEmitter<{ message: [string, ChatMessage]; delta: [ChatDelta]; cleared: [string] }>();

  private constructor(options: ChatsOptions) {
    this.options = options;
    this.dir = options.dir ?? path.join(options.app.dataDir, 'chats');
    this.name = options.name ?? options.app.title;
    this.person = options.person ?? { message: 'Their message', label: 'Them' };
    this.log = new options.store.AppendLog('A chat');
  }

  /** Each chat: its log replayed, on top of the whole-file <thread>.json chats were kept in before (never rewritten). */
  static async load(options: ChatsOptions): Promise<Chats> {
    const store = new Chats(options);
    const dir = store.dir;
    for (const t of await options.store.loadJsonDir(dir, isThread)) store.threads.set(t.thread, t);
    for (const name of (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))) {
      const file = path.join(dir, name);
      await endLastLine(file);
      const id = name.slice(0, -'.jsonl'.length);
      const t = store.threads.get(id) ?? { thread: id, messages: [] };
      for (const op of (await readLog(file)) as ChatOp[]) {
        if (op.op === 'message') t.messages.push(op.message);
        else if (op.op === 'session') t.session = op.session;
        else if (op.op === 'clear') {
          t.messages = [];
          t.session = undefined;
        }
      }
      store.threads.set(id, t);
    }
    return store;
  }

  /** Every change, as the live feed carries it (shared/chat.ts ChatEvent). */
  onEvent(listener: (event: ChatEvent) => void) {
    this.events.on('message', (thread, message) => listener({ type: 'chat', thread, message }));
    this.events.on('delta', (d) => listener({ type: 'chat-delta', ...d }));
    this.events.on('cleared', (thread) => listener({ type: 'chat-cleared', thread }));
  }

  /** A thread's messages, oldest first. */
  get(thread: string): ChatMessage[] {
    return this.threads.get(this.idOf(thread))?.messages ?? [];
  }

  /** Resolves once every write queued so far has finished. */
  idle(): Promise<void> {
    return this.log.idle();
  }

  /** The id a thread is kept under: its slug now, or before Unicode slugs if it was started then. */
  private idOf(thread: string): string {
    const id = threadId(thread);
    if (this.threads.has(id) || !thread.trim()) return id;
    return slugCandidates(thread).find((s) => this.threads.has(s)) ?? id;
  }

  /** Stops the answer being written in a thread; what was written so far is kept, marked stopped. */
  cancel(thread: string): boolean {
    const run = this.running.get(this.idOf(thread));
    if (!run) return false;
    run.stopped = true;
    run.kill();
    return true;
  }

  /** Starts a thread over: its messages and its Claude Code session are forgotten. */
  async clear(thread: string) {
    const id = this.idOf(thread);
    this.cancel(id);
    const t: ChatThread = { thread: id, messages: [] };
    this.threads.set(id, t);
    await this.write(id, { op: 'clear' });
    this.events.emit('cleared', id);
  }

  /** The person's message, then the answer, streamed as it is written (`delta` events) and kept. */
  async send(thread: string, text: string, context: string, mentions: string[] = []): Promise<ChatMessage> {
    const id = this.idOf(thread);
    const body = text.trim().slice(0, MAX_MESSAGE);
    if (!body) throw new ChatError('Write something first');
    if (this.busy.has(id)) throw new ChatError(`${this.name} is still answering your last message`);
    this.busy.add(id);
    try {
      const t = this.threads.get(id) ?? { thread: id, messages: [] };
      this.threads.set(id, t);
      const tagged = mentions.filter((m) => body.includes(m)).slice(0, 20);
      const mine: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        text: body,
        at: new Date().toISOString(),
        ...(tagged.length ? { mentions: tagged } : {}),
      };
      t.messages.push(mine);
      this.events.emit('message', id, mine);
      await this.write(id, { op: 'message', message: mine });
      const sessionBefore = t.session;

      const answerId = randomUUID();
      const request = `${context.slice(0, MAX_CONTEXT)}\n\n${this.person.message}: ${body}`;
      let answer: string;
      const onDelta = (delta: string) => this.events.emit('delta', { thread: id, id: answerId, delta });
      try {
        answer = await this.ask(t, request, onDelta);
      } catch (err) {
        if (!(err instanceof ChatError) || !t.session || this.running.get(id)?.stopped) throw err;
        // The saved session is gone (Claude Code's own store was cleared, or it ran in another folder): start a new
        // one, with the recent talk.
        t.session = undefined;
        answer = await this.ask(t, `${recap(t.messages.slice(0, -1), this.person.label)}${request}`, onDelta);
      }
      const stopped = answer.endsWith(STOPPED);
      const theirs: ChatMessage = {
        id: answerId,
        role: 'assistant',
        text: stopped ? answer.slice(0, -STOPPED.length).trim() : answer,
        at: new Date().toISOString(),
        ...(stopped ? { stopped: true } : {}),
      };
      // Started over while the answer was being written: it belongs to the chat that was cleared, so it is not kept.
      if (this.threads.get(id) !== t) return theirs;
      t.messages.push(theirs);
      this.events.emit('message', id, theirs);
      if (t.session !== sessionBefore) await this.write(id, { op: 'session', session: t.session });
      await this.write(id, { op: 'message', message: theirs });
      return theirs;
    } finally {
      this.busy.delete(id);
    }
  }

  /** Asks the model API, with the thread's recent messages, streaming each new piece of text to `onDelta`. */
  private askApi(t: ChatThread, request: string, onDelta: (delta: string) => void): Promise<string> {
    const { oneshot, system, tools } = this.options;
    return oneshot.limited(async () => {
      const abort = new AbortController();
      const run = { kill: () => abort.abort(), stopped: false };
      this.running.set(t.thread, run);
      let text = '';
      try {
        // The messages before the new one (already in the thread), without the context each was sent with.
        const history: LlmMessage[] = t.messages
          .slice(0, -1)
          .slice(-API_HISTORY)
          .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
        const answer = await complete(
          oneshot.settings.helperEndpoint(),
          tools?.talkOnly ? `${system} ${tools.talkOnly}` : system,
          request,
          {
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(TIMEOUT_MS)]),
            history,
            identity: oneshot.identity,
            onText: (piece) => {
              text += piece;
              onDelta(piece);
            },
          },
        );
        if (!answer) throw new ChatError(`${this.name} gave an empty answer`);
        return answer;
      } catch (err) {
        if (run.stopped) return `${text.trim()}${STOPPED}`;
        if (err instanceof ChatError) throw err;
        throw new ChatError(
          `${this.name} could not answer: ${(err as Error).name === 'TimeoutError' ? 'it took too long' : (err as Error).message}`,
        );
      } finally {
        if (this.running.get(t.thread) === run) this.running.delete(t.thread);
      }
    });
  }

  /** Runs Claude Code on the thread's session (resumed, or a new one), streaming each new piece of text to `onDelta`. */
  private ask(t: ChatThread, request: string, onDelta: (delta: string) => void): Promise<string> {
    const { oneshot, system, tools } = this.options;
    if (oneshot.useApi()) return this.askApi(t, request, onDelta);
    const resume = Boolean(t.session);
    const session = t.session ?? randomUUID();
    // Always the same private folder (oneshot.ts cwd), so a session can be resumed.
    const [file = oneshot.claude, ...rest] = oneshot.command
      ? oneshot.command.split(' ')
      : [
          oneshot.claude,
          ...oneshot.headlessArgs(tools ? `${system} ${tools.writes}` : system, [
            resume ? '--resume' : '--session-id',
            session,
            ...this.appTools(),
            '--output-format',
            'stream-json',
            '--verbose',
            '--include-partial-messages',
          ]),
        ];
    return oneshot.limited(async () => {
      const cwd = await oneshot.cwd();
      return new Promise<string>((resolve, reject) => {
        const child = spawn(file, rest, { cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS, env: claudeEnv() });
        const run = { kill: () => child.kill('SIGTERM'), stopped: false };
        this.running.set(t.thread, run);
        let buffer = '';
        let text = '';
        let plain = '';
        let err = '';
        child.stdout.on('data', (d) => {
          buffer += d;
          let nl = buffer.indexOf('\n');
          while (nl !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf('\n');
            let ev: { type?: string; event?: { type?: string; delta?: { type?: string; text?: string } } };
            try {
              ev = JSON.parse(line);
            } catch {
              // Not Claude Code's stream (a stand-in command in the tests): its plain output is the answer.
              plain += `${line}\n`;
              continue;
            }
            // A new turn after a tool call: its text starts a paragraph of its own.
            if (ev.type === 'stream_event' && ev.event?.type === 'message_start' && text.trim() && !text.endsWith('\n\n')) {
              text += '\n\n';
              onDelta('\n\n');
            }
            const delta = ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' ? ev.event.delta : undefined;
            if (delta?.type === 'text_delta' && delta.text) {
              text += delta.text;
              onDelta(delta.text);
            }
          }
        });
        child.stderr.on('data', (d) => (err += d));
        child.on('error', (e) => reject(new ChatError(`Could not start Claude Code: ${e.message}`)));
        child.on('close', (code, signal) => {
          if (this.running.get(t.thread) === run) this.running.delete(t.thread);
          const answer = (text || plain + buffer).trim();
          // Stopped: keep what was written (the session may not have it, so it is started over next time).
          if (run.stopped) {
            t.session = code === 0 ? session : undefined;
            return resolve(`${answer}${STOPPED}`);
          }
          if (code === 0 && answer) {
            t.session = session;
            return resolve(answer);
          }
          if (signal) return reject(new ChatError(`${this.name} took too long to answer`));
          reject(new ChatError(`${this.name} could not answer${err.trim() ? `: ${err.trim().split('\n').at(-1)}` : ''}`));
        });
        // A child that exits before reading all of a long request must not take the server down with EPIPE.
        child.stdin.on('error', () => {});
        child.stdin.end(request);
      });
    });
  }

  /** Appends one change to the thread's log (store.ts AppendLog). */
  private write(thread: string, op: ChatOp): Promise<void> {
    return this.log.append(path.join(this.dir, `${thread}.jsonl`), op);
  }

  /**
   * The app's MCP server, through the same bridge its own Claude Code uses (.mcp.json), with its tools allowed to run
   * unasked; the ones the app names stay out (Galen's two that delete a record, so a slip in the chat can't lose one).
   */
  private appTools(): string[] {
    const { app, tools } = this.options;
    if (!tools) return [];
    const bridge = tools.bridge ?? path.join(app.root, 'server', 'bridge.ts');
    const config = { mcpServers: { [app.name]: { command: process.execPath, args: [bridge] } } };
    return [
      `--mcp-config=${JSON.stringify(config)}`,
      `--allowedTools=mcp__${app.name}`,
      ...(tools.remove?.length ? [`--disallowedTools=${tools.remove.map((t) => `mcp__${app.name}__${t}`).join(',')}`] : []),
    ];
  }
}

/** A place in the app ("today", "training", "lab-2026-10-20"), or "home" for anywhere else. */
export function threadId(thread: string): string {
  return thread.trim() ? slugify(thread) : 'home';
}

/** The shape a chat file must have to be loaded. */
function isThread(v: unknown): v is ChatThread {
  return isObject(v) && typeof v.thread === 'string' && Array.isArray(v.messages);
}

/** The last few exchanges, for a session started over. */
function recap(messages: ChatMessage[], person: string): string {
  const last = messages.slice(-10);
  if (!last.length) return '';
  return `Our conversation so far:\n${last.map((m) => `${m.role === 'user' ? person : 'You'}: ${m.text}`).join('\n')}\n\n`;
}

/** What the chat's POST carries besides the text: where the person is, the page as text, what they tagged. */
export interface ChatBody {
  text: string;
  /** Where they are, in words ("The day 2026-10-18"). */
  where?: string;
  /** The page as text. */
  page?: string;
  /** Where they are within it (Aristotle's step). */
  step?: string;
  /** What they tagged with @, each with what it stands for. */
  mentions?: string;
  /** The tags as they read in the text ("@2026-10-18"), to show as chips. */
  tags: string[];
}

export interface ChatRoutesOptions {
  /** What the chat is told with each message, fresh every time: where they are, what is on screen, the app's records. */
  context: (thread: string, body: ChatBody) => string;
  /** Where the routes are; default /api/chats/. */
  prefix?: string;
  /** How many of a chat's newest messages the interface loads; default 300. */
  page?: number;
}

/**
 * The chat's routes, for serve()'s `api`: GET <prefix><thread> (its newest messages), POST <prefix><thread> (a message,
 * answered; the answer also streams over the live feed), DELETE <prefix><thread> (start over), and DELETE
 * <prefix><thread>/answer (stop the answer being written). From Galen's index.ts.
 */
export function chatRoutes(chats: Chats, { context, prefix = '/api/chats/', page = 300 }: ChatRoutesOptions): Route {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return async (req, res, route) => {
    if (!route.startsWith(prefix)) return false;
    const rest = decodeURIComponent(route.slice(prefix.length));
    // A chat's newest messages: years of one chat would be megabytes the panel never scrolls back through.
    if (req.method === 'GET') return json(res, 200, chats.get(rest).slice(-page));
    if (req.method === 'DELETE') {
      if (rest.endsWith('/answer')) return json(res, 200, { stopped: chats.cancel(rest.slice(0, -'/answer'.length)) });
      await chats.clear(rest);
      return json(res, 200, { ok: true });
    }
    if (req.method !== 'POST') return false;
    const raw = (await readJson(req)) as Record<string, unknown> | null;
    if (typeof raw?.text !== 'string') return json(res, 400, { error: 'Missing text' });
    const body: ChatBody = {
      text: raw.text,
      where: str(raw.where),
      page: str(raw.page),
      step: str(raw.step),
      mentions: str(raw.mentions),
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    };
    try {
      return json(res, 200, await chats.send(rest, body.text, context(rest, body), body.tags));
    } catch (err) {
      if (err instanceof ChatError) return json(res, 400, { error: err.message });
      throw err;
    }
  };
}
