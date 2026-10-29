// The agent CLIs the terminal drawer can run, and how to drive each: its command, how to start it with a first message
// or carry on its last conversation, how it starts over, and how it reaches the app's tools. Claude Code reads the
// app's .mcp.json and has its skills (.claude/skills); the others get the MCP server from their own config in the app's
// folder (opencode.json, .gemini/settings.json, .codex/config.toml) or from flags here, and the method through the MCP
// tool `method` and AGENTS.md.
//
//   const agents = createAgents({ app, settings });
//   new Terminal(agents.current(), emit, { app });
//
// From Aristotle's and Galen's server/agents.ts, the same but for comments and the MCP server's name in Codex's flags,
// which is the app's name here. <PREFIX>_CLAUDE_CMD (tests put a shell there) and a command set by hand in
// settings.json (agentCommand) come before the preset, as there.

import path from 'node:path';
import { AGENTS, type AgentId } from '../shared/agents.ts';
import type { App } from './app.ts';
import type { Settings } from './settings.ts';

export interface AgentLaunch {
  id: AgentId;
  /** What the interface calls it: "Claude", "Codex"… */
  name: string;
  file: string;
  /** Arguments to start it: carrying on its last conversation, and with a first message. */
  args(options: { resume: boolean; prompt?: string }): string[];
  env: Record<string, string>;
  /** Typed in to start a new conversation, when it has such a command. */
  clear?: string;
  /** Whether it runs the skills as slash commands ("/journal …"); the others are asked in words. */
  slash: boolean;
  /** Its own words while it works, beside the generic signs (a spinner redrawing). */
  working?: string;
}

export interface AgentsOptions {
  app: App;
  settings: Settings;
  /** The app's MCP bridge, which Codex is told to start; default server/bridge.ts in the app's checkout. */
  bridge?: string;
  /**
   * How long an agent may wait on one tool call before giving up, in seconds (Codex's flag). Generous by default
   * (3 h 10 min), so a slow call (a long lab report, a quiz waiting for the learner) is never given up on.
   */
  toolTimeoutS?: number;
}

export interface Agents {
  /** The agent the drawer runs now: the one chosen in Settings (Claude Code unless another was), with its command. */
  current(): AgentLaunch;
  launch(id: AgentId): AgentLaunch;
}

type Preset = Omit<AgentLaunch, 'id' | 'name' | 'file'> & { command: string };

const COMMANDS: Record<AgentId, string> = { 'claude-code': 'claude', codex: 'codex', gemini: 'gemini', opencode: 'opencode' };

/** The command an agent runs as, for checking it is installed. */
export function agentCommand(id: AgentId): string {
  return COMMANDS[id];
}

export function createAgents({ app, settings, bridge, toolTimeoutS = 3 * 60 * 60 + 600 }: AgentsOptions): Agents {
  const server = app.name;
  const bridgeFile = bridge ?? path.join(app.root, 'server', 'bridge.ts');
  const presets: Record<AgentId, Preset> = {
    'claude-code': {
      command: COMMANDS['claude-code'],
      args: ({ resume, prompt }) => [...(resume ? ['--continue'] : []), ...(prompt ? [prompt] : [])],
      env: {
        // A tool call that takes longer than two minutes would be moved to the background by Claude Code (an extra
        // turn, and an answer lost if the session ends): the app's calls stay in front.
        CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0',
      },
      clear: '/clear',
      slash: true,
    },
    codex: {
      command: COMMANDS.codex,
      // The MCP server is given on the command line (before the `resume` subcommand), so it is there whatever
      // ~/.codex/config.toml says, with its tools approved and a timeout long enough for a slow call: Codex gives up
      // on a tool call after 300 s by default, and progress doesn't extend it.
      args: ({ resume, prompt }) => [
        '-c',
        `mcp_servers.${server}.command="node"`,
        '-c',
        `mcp_servers.${server}.args=[${JSON.stringify(bridgeFile)}]`,
        '-c',
        `mcp_servers.${server}.tool_timeout_sec=${toolTimeoutS}`,
        '-c',
        `mcp_servers.${server}.startup_timeout_sec=30`,
        '-c',
        `mcp_servers.${server}.default_tools_approval_mode="approve"`,
        ...(resume ? ['resume', '--last'] : []),
        ...(prompt ? [prompt] : []),
      ],
      env: {},
      clear: '/new',
      slash: false,
      working: 'esc to interrupt',
    },
    gemini: {
      command: COMMANDS.gemini,
      // .gemini/settings.json in the app's folder adds the MCP server (trusted, with a long timeout) and has it read AGENTS.md.
      args: ({ resume, prompt }) => [...(resume ? ['--resume', 'latest'] : []), ...(prompt ? ['--prompt-interactive', prompt] : [])],
      env: {},
      clear: '/clear',
      slash: false,
      working: 'esc to cancel',
    },
    opencode: {
      command: COMMANDS.opencode,
      // opencode.json in the app's folder adds the MCP server and allows its tools; opencode keeps a call alive while
      // progress comes, so a question can wait. It reads AGENTS.md and the skills in .claude/skills itself.
      args: ({ resume, prompt }) => [...(resume ? ['--continue'] : []), ...(prompt ? ['--prompt', prompt] : [])],
      env: {},
      clear: '/new',
      slash: false,
    },
  };

  function launch(id: AgentId): AgentLaunch {
    const { command, ...preset } = presets[id];
    const info = AGENTS.find((a) => a.id === id);
    // <PREFIX>_CLAUDE_CMD (tests put a shell there) and a command set by hand in settings.json come before the preset.
    const override = app.env('CLAUDE_CMD') ?? settings.agentCommand;
    const [file = command, ...extra] = (override ?? command).split(' ').filter(Boolean);
    return {
      ...preset,
      id,
      name: info?.short ?? id,
      file,
      args: (options) => [...extra, ...preset.args(options)],
    };
  }

  return {
    current: () => launch(settings.tutor === 'api' ? 'claude-code' : settings.tutor),
    launch,
  };
}
