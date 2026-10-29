// Who runs an app's agent, as the server and the interface both see it: the engines an agent runs on (Claude Code or
// another agent CLI in the terminal drawer, or a model behind an OpenAI-compatible API), the API providers with their
// usual addresses, and the settings the interface reads and changes (GET/PUT /api/settings).
//
// From shared/tutor.ts, the same in Aristotle and Galen but for comments and Galen's watch door, which is Galen's own
// and now rides on SettingsView as an app extension (`SettingsView & { health: … }`). What the drawer's WebSocket
// carries (TutorMessage, TutorClientMessage, TutorEntry) came in with the drawer, from the same file. The names on
// disk stay "tutor" and "helpers": they are settings.json's format, and renaming them would be a data migration for
// no gain.

/** The agent CLIs the terminal drawer can run. Each connects to the app over MCP. */
export const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', short: 'Claude', site: 'https://claude.com/claude-code' },
  { id: 'codex', name: 'Codex CLI', short: 'Codex', site: 'https://github.com/openai/codex' },
  { id: 'gemini', name: 'Gemini CLI', short: 'Gemini', site: 'https://github.com/google-gemini/gemini-cli' },
  { id: 'opencode', name: 'opencode', short: 'opencode', site: 'https://opencode.ai' },
] as const;

export type AgentId = (typeof AGENTS)[number]['id'];
/** What runs in the drawer: one of the agents, or `api`, the app's own agent on a model API. */
export type TutorEngine = AgentId | 'api';
/** What answers in the chat beside a page (and, in Aristotle, writes glosses). */
export type HelperEngine = 'claude-code' | 'api';

/** OpenAI-compatible APIs with their usual address; any other works as `custom`. */
export const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', key: true, local: false },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', key: true, local: false },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1', key: false, local: true },
  { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', key: false, local: true },
  { id: 'llamacpp', name: 'llama.cpp server', baseUrl: 'http://localhost:8080/v1', key: false, local: true },
  { id: 'custom', name: 'Another OpenAI-compatible API', baseUrl: '', key: true, local: false },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]['id'];

/** Where a model API is reached (llm.ts speaks to it once that comes into the core). */
export interface Endpoint {
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Which API to speak: Chat Completions (the default), or OpenAI's Responses API. */
  protocol?: 'chat' | 'responses';
}

/** The model API as the interface sees it: the key only ever masked. */
export interface ApiSettingsView {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  /** The model for the helpers (chat, glosses), when not the agent's. */
  helperModel: string;
  /** Whether the model can look at images a tool returns. */
  vision: boolean;
  /** "sk-…a1b2", or null when there is none. */
  key: string | null;
  /** The key comes from the app's <PREFIX>_API_KEY, not from the settings file. */
  keyFromEnv: boolean;
}

export interface SettingsView {
  tutor: TutorEngine;
  helpers: HelperEngine;
  api: ApiSettingsView;
  /** Every agent, and whether its command is on this machine. */
  agents: { id: AgentId; name: string; installed: boolean }[];
  /** The command this install runs in the drawer instead of the agent's own, set by hand in settings.json. */
  agentCommand?: string;
}

/** What PUT /api/settings accepts; anything left out stays as it is. `apiKey: ""` removes the key. */
export interface SettingsBody {
  tutor?: TutorEngine;
  helpers?: HelperEngine;
  api?: Partial<{ provider: ProviderId; baseUrl: string; apiKey: string; model: string; helperModel: string; vision: boolean }>;
}

/** One model an API offers (GET /api/settings/models). */
export interface ModelInfo {
  id: string;
  name?: string;
  /** Context window in tokens, when the API says. */
  context?: number;
  /** Whether it takes tools and images, when the API says. */
  tools?: boolean;
  vision?: boolean;
}

/** The first characters and the last four of a key, enough to tell which it is. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, key.startsWith('sk-') ? 5 : 3)}…${key.slice(-4)}`;
}

/**
 * One line of the API agent's conversation as the drawer shows it: what was asked of it, what it said, each tool it
 * called (one line: the tool and what it was about), and anything that went wrong.
 */
export interface TutorEntry {
  id: string;
  kind: 'user' | 'text' | 'tool' | 'error' | 'notice';
  text: string;
  /** For a tool: its name, and whether it is running, done or failed. */
  tool?: string;
  state?: 'running' | 'done' | 'failed';
  at: string;
}

/** What the drawer's WebSocket sends: the engine's state, then a terminal's output or the API agent's conversation. */
export type TutorMessage =
  | {
      type: 'state';
      running: boolean;
      /** How the drawer shows it: a terminal, or the API agent's conversation. */
      mode: 'terminal' | 'api';
      engine: TutorEngine;
      /** What the interface calls it ("Claude", "Codex", or the API agent's name). */
      name: string;
      command?: string;
      /** Why it can't run (an agent not installed, an API not set up). */
      problem?: string;
    }
  /** `replay`: the recent screen, sent once on connect; the client redraws from it. */
  | { type: 'output'; data: string; replay?: boolean }
  | { type: 'exit'; code: number }
  /** The whole conversation (on connect, and when it starts over). */
  | { type: 'transcript'; entries: TutorEntry[] }
  /** A new line, or one that changed (a tool that finished). */
  | { type: 'entry'; entry: TutorEntry }
  /** Text added to a line as the model writes it. */
  | { type: 'delta'; id: string; text: string }
  /** Whether the API agent is working, on what ("thinking", "log day"), and since when (ms since the epoch). */
  | { type: 'activity'; busy: boolean; doing: string; since: number };

/** What the drawer sends; anything malformed is ignored. */
export type TutorClientMessage =
  /** `auto`: the interface opening, not a click; only the live app starts an agent that way. */
  | { type: 'start'; resume?: boolean; auto?: boolean }
  /** A request from the interface: `text` (a slash command) for an agent that has the skills, `initial` in words. */
  | { type: 'run'; text: string; initial?: string }
  /** A new conversation: the one so far is set aside. */
  | { type: 'clear' }
  | { type: 'stop' }
  | { type: 'input'; data: string }
  | { type: 'send'; text: string }
  | { type: 'resize'; cols: number; rows: number };
