// Who runs an app's agent, as the server and the interface both see it: the engines an agent runs on (Claude Code or
// another agent CLI in the terminal drawer, or a model behind an OpenAI-compatible API), the API providers with their
// usual addresses, and the settings the interface reads and changes (GET/PUT /api/settings).
//
// From shared/tutor.ts, the same in Aristotle and Galen but for comments and Galen's watch door, which is Galen's own
// and now rides on SettingsView as an app extension (`SettingsView & { health: … }`). The bridge's WebSocket messages
// (TutorMessage) come here with the bridge itself, not in this slice. The names on disk stay "tutor" and "helpers":
// they are settings.json's format, and renaming them would be a data migration for no gain.

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
