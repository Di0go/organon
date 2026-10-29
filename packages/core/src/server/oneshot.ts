// One question, answered in a few seconds and forgotten: by Claude Code (`claude -p` on the person's own login,
// headless and locked down: no tools, no MCP servers, no settings or hooks, no saved session, run from a private folder
// outside any project), or by the model API when Settings say so (settings.ts helpers; llm.ts). The chat beside a page
// (chat.ts) runs the same locked-down command (with the app's own tools added, when the app asks) or API, through the
// same limit. For Claude Code the request goes on stdin and whatever it prints is the answer. At most a few run at
// once, however many are asked for.
//
//   const oneshot = createOneshot({ app, settings });
//   const answer = await oneshot.ask('You write one-line glosses.', 'Gloss: ἀρετή');
//
// From Aristotle's and Galen's server/oneshot.ts, the same but for comments. What came from their config.ts comes
// from the app here: <PREFIX>_ONESHOT_CMD (a command that reads the request on stdin and prints the answer, in place
// of Claude Code: tests put `cat` there), <PREFIX>_ONESHOT_MODEL and <PREFIX>_CLAUDE_CWD, or the options.

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { App } from './app.ts';
import { complete, type LlmIdentity } from './llm.ts';
import type { Settings } from './settings.ts';

/** Claude Code usually answers in five to fifteen seconds; past this, something is wrong. */
const TIMEOUT_MS = 90_000;
/** How many headless Claude Codes may run at once (one-shot answers and chat answers together). */
const MAX_RUNNING = 3;

export class OneshotError extends Error {}

export interface OneshotOptions {
  app: App;
  settings: Settings;
  /** The command in place of Claude Code, split at spaces; default <PREFIX>_ONESHOT_CMD. */
  command?: string;
  /** Claude Code's own command, when there is no stand-in; default "claude" (on the PATH, ~/.local/bin first). */
  claude?: string;
  /** The model Claude Code is run on: an alias it knows; default <PREFIX>_ONESHOT_MODEL, else "sonnet". */
  model?: string;
  /**
   * The folder Claude Code runs in: private to this user (not /tmp, where anyone could leave a CLAUDE.md) and outside
   * any project, so no project's CLAUDE.md is read into it. Default <PREFIX>_CLAUDE_CWD, else
   * ~/.cache/<name>/<instance> (XDG_CACHE_HOME when set).
   */
  cwd?: string;
  /** Who is calling, for OpenRouter; default the app's title. */
  identity?: LlmIdentity;
}

export interface Oneshot {
  /** The answer to `request`, under the instructions in `system`: from the model API, or from Claude Code. */
  ask(system: string, request: string): Promise<string>;
  /** Whether the helpers go to the model API (Settings) rather than Claude Code (or a test's stand-in for it). */
  useApi(): boolean;
  /** `claude -p` locked down: the model, no tools, no MCP servers, no settings or hooks, then `extra`, then the instructions. */
  headlessArgs(system: string, extra?: string[]): string[];
  /** The command in place of Claude Code, when one is set (split at spaces by the caller). */
  readonly command: string | undefined;
  /** Claude Code's own command. */
  readonly claude: string;
  /** The private folder headless Claude Codes run in, made on first use. */
  cwd(): Promise<string>;
  /** Runs `job` once fewer than three are running, in the order they were asked for. */
  limited<T>(job: () => Promise<T>): Promise<T>;
  readonly settings: Settings;
  readonly identity: LlmIdentity;
}

export function createOneshot(options: OneshotOptions): Oneshot {
  const { app, settings } = options;
  const command = options.command ?? app.env('ONESHOT_CMD');
  const model = options.model ?? app.env('ONESHOT_MODEL') ?? 'sonnet';
  const folder =
    options.cwd ??
    app.env('CLAUDE_CWD') ??
    path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), app.name, app.instance);
  const identity = options.identity ?? { title: app.title };
  const claude = options.claude ?? 'claude';

  let running = 0;
  const waiting: (() => void)[] = [];

  async function limited<T>(job: () => Promise<T>): Promise<T> {
    if (running >= MAX_RUNNING) await new Promise<void>((go) => waiting.push(go));
    else running++;
    try {
      return await job();
    } finally {
      // The slot passes straight to the next in line, so nobody can slip in between.
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  }

  const useApi = () => settings.helpers === 'api';

  function headlessArgs(system: string, extra: string[] = []): string[] {
    return ['-p', '--model', model, '--tools', '', '--strict-mcp-config', '--setting-sources', '', ...extra, '--system-prompt', system];
  }

  async function cwd(): Promise<string> {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    return folder;
  }

  function ask(system: string, request: string): Promise<string> {
    if (useApi()) {
      return limited(async () => {
        try {
          const answer = await complete(settings.helperEndpoint(), system, request, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            identity,
          });
          if (!answer) throw new OneshotError('The model gave an empty answer');
          return answer;
        } catch (err) {
          if (err instanceof OneshotError) throw err;
          throw new OneshotError((err as Error).name === 'TimeoutError' ? 'The model took too long to answer' : (err as Error).message);
        }
      });
    }
    const [file = claude, ...rest] = command ? command.split(' ') : [claude, ...headlessArgs(system, ['--no-session-persistence'])];
    return limited(async () => {
      const dir = await cwd();
      return new Promise<string>((resolve, reject) => {
        const child = spawn(file, rest, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS, env: claudeEnv() });
        let out = '';
        let err = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('error', (e) => reject(new OneshotError(`Could not start Claude Code: ${e.message}`)));
        child.on('close', (code, signal) => {
          const text = out.trim();
          if (code === 0 && text) return resolve(text);
          if (signal) return reject(new OneshotError('Claude Code took too long to answer'));
          reject(new OneshotError(`Claude Code could not answer${err.trim() ? `: ${err.trim().split('\n').at(-1)}` : ''}`));
        });
        // A child that exits before reading all of a long request must not take the server down with EPIPE.
        child.stdin.on('error', () => {});
        child.stdin.end(request);
      });
    });
  }

  return { ask, useApi, headlessArgs, command, claude, cwd, limited, settings, identity };
}

/** The environment Claude Code runs in: a service started at login may not have the person's PATH, and it lives in ~/.local/bin. */
export function claudeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: [path.join(os.homedir(), '.local/bin'), process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'].join(':') };
}
