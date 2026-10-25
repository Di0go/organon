// Who runs an app's agent, as this install chose: Claude Code (the default), another agent CLI in the terminal drawer,
// or the app's own agent on a model behind an OpenAI-compatible API (OpenAI, OpenRouter, Ollama, LM Studio,
// llama.cpp…), and what writes the helpers' answers (the chat). Kept with the accent in settings.json in the app's state
// folder (never in git, readable by this user only), changed from the interface (GET/PUT /api/settings) and applied
// at once. The API key never leaves the server whole.
//
// From Aristotle's and Galen's server/settings.ts. What changed on the way in:
// - The file, the key from the environment and the warnings come in through createSettings, not from the app's
//   config.ts, so the module knows no app's name.
// - An app's own keys (Galen's watch door, `health`) are kept untouched by the core and read and written through
//   `extra` / `setExtra`; the core's keys can't be written that way.
// - The accent is read here too, so config.ts no longer reads settings.json a second time.
// - A settings.json that doesn't parse is set aside and said, not overwritten by the next change (it was, in both
//   apps: a stray comma lost a hand-set agentCommand or the watch's token).

import { EventEmitter } from 'node:events';
import { accessSync, constants, readFileSync, renameSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type Accent, isAccent } from '../shared/accents.ts';
import {
  AGENTS,
  type AgentId,
  type ApiSettingsView,
  type Endpoint,
  type HelperEngine,
  maskKey,
  type ModelInfo,
  PROVIDERS,
  type ProviderId,
  type SettingsBody,
  type SettingsView,
  type TutorEngine,
} from '../shared/agents.ts';
import { writeFileAtomic } from './store.ts';
import type { Warnings } from './warnings.ts';

export interface ApiSettings {
  provider: ProviderId;
  baseUrl: string;
  apiKey?: string;
  model: string;
  helperModel?: string;
  vision?: boolean;
}

/** settings.json as kept on disk; keys the core doesn't know (an app's own) are kept as they are. */
interface File {
  tutor?: TutorEngine;
  helpers?: HelperEngine;
  api?: Partial<ApiSettings>;
  accent?: string;
  /** Set by hand only: the command the drawer runs in place of the agent's own (never from the interface). */
  agentCommand?: string;
  [other: string]: unknown;
}

/** The keys the core owns: an app keeps its own beside them, under any other name. */
const CORE_KEYS = new Set(['tutor', 'helpers', 'api', 'accent', 'agentCommand']);

export class SettingsError extends Error {}

const ENGINES: TutorEngine[] = [...AGENTS.map((a) => a.id), 'api'];
const MAX_FIELD = 500;

export interface SettingsOptions {
  /** The app's settings.json (in its state folder). */
  file: string;
  /** Where problems are said. */
  warnings: Warnings;
  /** The key from the app's environment (ARISTOTLE_API_KEY, GALEN_API_KEY…), used when the file has none. */
  apiKey?: string;
}

export class Settings {
  readonly events = new EventEmitter<{ change: [] }>();
  private readonly path: string;
  private readonly warnings: Warnings;
  private readonly envKey: string | undefined;
  private file: File;

  constructor({ file, warnings, apiKey }: SettingsOptions) {
    this.path = file;
    this.warnings = warnings;
    this.envKey = apiKey || undefined;
    this.file = this.read();
  }

  get tutor(): TutorEngine {
    return ENGINES.includes(this.file.tutor as TutorEngine) ? (this.file.tutor as TutorEngine) : 'claude-code';
  }

  /** The helpers follow the agent onto an API; otherwise Claude Code writes them, unless told otherwise. */
  get helpers(): HelperEngine {
    const h = this.file.helpers;
    if (h === 'api' || h === 'claude-code') return h;
    return this.tutor === 'api' ? 'api' : 'claude-code';
  }

  /** The accent this install chose (the server writes it on <html>), or undefined for the app's own default. */
  get accent(): Accent | undefined {
    return isAccent(this.file.accent) ? this.file.accent : undefined;
  }

  /** The model API as set up, with the key from the file or else from the app's environment. */
  get api(): ApiSettings {
    const a = this.file.api ?? {};
    const provider = PROVIDERS.some((p) => p.id === a.provider) ? (a.provider as ProviderId) : 'openrouter';
    const preset = PROVIDERS.find((p) => p.id === provider);
    return {
      provider,
      baseUrl: (a.baseUrl || preset?.baseUrl || '').replace(/\/+$/, ''),
      apiKey: a.apiKey || this.envKey,
      model: a.model ?? '',
      helperModel: a.helperModel || undefined,
      // Unknown models are taken not to see: a refused image costs a retry, an unseen one a wrong figure.
      vision: a.vision ?? (provider === 'openai' || provider === 'openrouter'),
    };
  }

  /** What the drawer runs instead of the agent's own command, when set by hand. */
  get agentCommand(): string | undefined {
    return typeof this.file.agentCommand === 'string' && this.file.agentCommand.trim() ? this.file.agentCommand.trim() : undefined;
  }

  /** An app's own key, as it is on disk (the app checks its shape). */
  extra(key: string): unknown {
    return CORE_KEYS.has(key) ? undefined : this.file[key];
  }

  /** Sets an app's own key (`undefined` removes it), written like any change and announced the same way. */
  async setExtra(key: string, value: unknown): Promise<void> {
    if (CORE_KEYS.has(key)) throw new SettingsError(`"${key}" belongs to the core's settings: change it with update()`);
    const next: File = { ...this.file };
    if (value === undefined) delete next[key];
    else next[key] = value;
    await this.save(next);
  }

  /** Whether the model API runs on this machine or the local network (a smaller context is assumed for it). */
  isLocal(): boolean {
    const a = this.api;
    if (PROVIDERS.find((p) => p.id === a.provider)?.local) return true;
    try {
      const host = new URL(a.baseUrl).hostname.replace(/^\[|\]$/g, '');
      return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|.*\.local$)/.test(host);
    } catch {
      return false;
    }
  }

  /** Each model's context window, as the API last said when its models were listed (GET /api/settings/models). */
  private contexts = new Map<string, number>();

  rememberModels(models: ModelInfo[]) {
    for (const m of models) if (m.context) this.contexts.set(m.id, m.context);
  }

  knownContext(model: string): number | undefined {
    return this.contexts.get(model);
  }

  /** The API and model the agent uses; OpenAI's own through its Responses API. */
  endpoint(): Endpoint {
    const problem = this.apiProblem();
    if (problem) throw new SettingsError(problem);
    const { baseUrl, apiKey, model, provider } = this.api;
    return { baseUrl, apiKey, model, protocol: provider === 'openai' ? 'responses' : 'chat' };
  }

  /** The API and model the helpers use: the helper model when one is set, else the agent's. */
  helperEndpoint(): Endpoint {
    const endpoint = this.endpoint();
    return { ...endpoint, model: this.api.helperModel || endpoint.model };
  }

  /** Why the model API can't be used yet, or undefined when it can. */
  apiProblem(): string | undefined {
    const a = this.api;
    if (!a.baseUrl) return 'No address for the model API yet: set it up in Settings.';
    if (!a.model) return 'No model chosen yet: pick one in Settings.';
    const preset = PROVIDERS.find((p) => p.id === a.provider);
    if (preset?.key && !preset.local && !a.apiKey && a.provider !== 'custom')
      return `No API key for ${preset.name} yet: add it in Settings.`;
    return undefined;
  }

  /** What the interface sees; an app adds its own parts beside it (Galen's watch door). */
  view(installed: (agent: AgentId) => boolean): SettingsView {
    const a = this.api;
    const api: ApiSettingsView = {
      provider: a.provider,
      baseUrl: a.baseUrl,
      model: a.model,
      helperModel: a.helperModel ?? '',
      vision: a.vision ?? false,
      key: a.apiKey ? maskKey(a.apiKey) : null,
      keyFromEnv: !this.file.api?.apiKey && Boolean(this.envKey),
    };
    return {
      tutor: this.tutor,
      helpers: this.helpers,
      api,
      agents: AGENTS.map((g) => ({ id: g.id, name: g.name, installed: installed(g.id) })),
      ...(this.agentCommand ? { agentCommand: this.agentCommand } : {}),
    };
  }

  /** Applies what the interface sent, after checking every field; the file is rewritten, readable by this user only. */
  async update(body: SettingsBody): Promise<void> {
    const next: File = { ...this.file, api: { ...(this.file.api ?? {}) } };
    if (body.tutor !== undefined) {
      if (!ENGINES.includes(body.tutor)) throw new SettingsError(`Unknown tutor "${String(body.tutor)}"`);
      next.tutor = body.tutor;
    }
    if (body.helpers !== undefined) {
      if (body.helpers !== 'api' && body.helpers !== 'claude-code') throw new SettingsError(`Unknown helper "${String(body.helpers)}"`);
      next.helpers = body.helpers;
    }
    const a = body.api;
    if (a !== undefined) {
      if (typeof a !== 'object' || a === null) throw new SettingsError('api must be an object');
      const api = next.api as Partial<ApiSettings>;
      if (a.provider !== undefined) {
        if (!PROVIDERS.some((p) => p.id === a.provider)) throw new SettingsError(`Unknown provider "${String(a.provider)}"`);
        api.provider = a.provider;
      }
      if (a.baseUrl !== undefined) api.baseUrl = checkUrl(a.baseUrl);
      if (a.apiKey !== undefined) {
        const key = field(a.apiKey, 'apiKey').trim();
        if (/\s/.test(key)) throw new SettingsError('An API key has no spaces in it');
        api.apiKey = key || undefined;
      }
      if (a.model !== undefined) api.model = field(a.model, 'model').trim();
      if (a.helperModel !== undefined) api.helperModel = field(a.helperModel, 'helperModel').trim() || undefined;
      if (a.vision !== undefined) {
        if (typeof a.vision !== 'boolean') throw new SettingsError('vision must be true or false');
        api.vision = a.vision;
      }
    }
    await this.save(next);
  }

  /** Written whole (temp file, then rename) and readable by this user only: it can hold an API key. */
  private async save(next: File) {
    const clean = JSON.parse(JSON.stringify(next)) as File;
    if (clean.api && Object.keys(clean.api).length === 0) delete clean.api;
    await writeFileAtomic(this.path, `${JSON.stringify(clean, null, 2)}\n`, 0o600);
    // The mode a new file is given passes through the umask, and a file renamed over keeps none of the old one's.
    await chmod(this.path, 0o600);
    this.file = next;
    this.events.emit('change');
  }

  /** settings.json; nothing when it is missing; set aside (renamed, kept) and said when it doesn't parse. */
  private read(): File {
    let text: string;
    try {
      text = readFileSync(this.path, 'utf8');
    } catch {
      return {};
    }
    try {
      const value = JSON.parse(text) as unknown;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as File;
    } catch {}
    const aside = `${this.path}.unreadable-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      renameSync(this.path, aside);
      this.warnings.set(
        `settings:${aside}`,
        `${path.basename(this.path)} could not be read and was set aside as ${path.basename(aside)}: the defaults apply until it is fixed and renamed back.`,
      );
    } catch (err) {
      this.warnings.set(`settings:${this.path}`, `${path.basename(this.path)} could not be read (${(err as Error).message}).`);
    }
    return {};
  }
}

export function createSettings(options: SettingsOptions): Settings {
  return new Settings(options);
}

function field(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new SettingsError(`${name} must be text`);
  if (v.length > MAX_FIELD) throw new SettingsError(`${name} is too long`);
  return v;
}

/** An http(s) address with nothing after the path (no credentials, query or fragment), without its trailing slash. */
function checkUrl(v: unknown): string {
  const text = field(v, 'baseUrl').trim();
  if (!text) return '';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SettingsError('The address must be a full URL, like https://openrouter.ai/api/v1');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SettingsError('The address must start with http:// or https://');
  if (url.username || url.password || url.search || url.hash) throw new SettingsError('Put the key in its own field, not in the address');
  return text.replace(/\/+$/, '');
}

/** Whether `command` is on the PATH a service started at login has (plus ~/.local/bin, where CLIs install themselves). */
export function onPath(command: string): boolean {
  if (command.includes('/')) return executable(command);
  const dirs = [path.join(os.homedir(), '.local/bin'), ...(process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin').split(':')];
  return dirs.some((dir) => dir && executable(path.join(dir, command)));
}

function executable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
