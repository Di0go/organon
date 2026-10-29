// The agent in the app's drawer, whichever it is (Settings, settings.ts): an agent CLI in a pseudo-terminal
// (terminal.ts: Claude Code by default, or Codex, Gemini CLI, opencode) or the app's own agent on a model API
// (tutor-api.ts). Drawers connect over one WebSocket (/api/terminal) and speak one protocol (shared/agents.ts
// TutorMessage, TutorClientMessage); when the choice changes, the old engine stops and every drawer is told.
//
//   const tutor = new Tutor({ app, settings, api: { method, mcp: mcpOptions, intro, here, dropped } });
//   await serve(app, { upgrade: tutor.upgrade, stop: async () => tutor.stop() });
//
// From Aristotle's and Galen's server/tutor.ts (the same but for the domain store each handed the API agent, which
// now reaches it through the app's MCP server) and the upgrade of /api/terminal in Galen's index.ts.

import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { type WebSocket, WebSocketServer } from 'ws';
import type { TutorClientMessage, TutorMessage } from '../shared/agents.ts';
import { type Agents, type AgentsOptions, createAgents } from './agents.ts';
import type { App } from './app.ts';
import type { Settings } from './settings.ts';
import { Terminal, type TerminalOptions } from './terminal.ts';
import { ApiTutor, type ApiTutorOptions } from './tutor-api.ts';

export interface TutorOptions {
  app: App;
  settings: Settings;
  /** The app's own agent on a model API: what it is told and what it connects to (tutor-api.ts). */
  api: Omit<ApiTutorOptions, 'app' | 'settings'>;
  /** The agent CLIs (agents.ts), when the app made them itself; otherwise made here with `agentOptions`. */
  agents?: Agents;
  agentOptions?: Omit<AgentsOptions, 'app' | 'settings'>;
  terminal?: Omit<TerminalOptions, 'app'>;
  /** Where drawers connect; default /api/terminal. */
  route?: string;
  /** How many drawers at once (a handful of tabs); default 8. More get a 503. */
  maxClients?: number;
}

/** A drawer's messages are keystrokes, resizes and messages to the agent: a megabyte is plenty. */
const MAX_PAYLOAD = 1024 * 1024;

export class Tutor {
  readonly agents: Agents;
  private clients = new Set<WebSocket>();
  private engine: Terminal | ApiTutor;
  /** Which engine runs: the API, or an agent with its command. A change of these replaces it. */
  private key: string;
  private readonly options: TutorOptions;
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  private readonly onChange = () => this.reconfigure();

  constructor(options: TutorOptions) {
    this.options = options;
    this.agents = options.agents ?? createAgents({ app: options.app, settings: options.settings, ...options.agentOptions });
    this.key = this.engineKey();
    this.engine = this.create();
    options.settings.events.on('change', this.onChange);
  }

  /** Whether an agent is running in the terminal (the API agent has nothing to run). */
  get running(): boolean {
    return this.engine instanceof Terminal ? this.engine.running : false;
  }

  /**
   * For serve()'s `upgrade`: takes the drawer's WebSocket on its route, after the core's checks (only the app's own
   * pages, since the drawer runs the agent). Returns false for any other route, so the core refuses it.
   */
  readonly upgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer, route: string): boolean => {
    if (route !== (this.options.route ?? '/api/terminal')) return false;
    if (this.sockets.clients.size >= (this.options.maxClients ?? 8)) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return true;
    }
    this.sockets.handleUpgrade(req, socket, head, (ws) => this.attach(ws));
    return true;
  };

  /** Connects a drawer: it gets the state and what there is to see, then its messages drive the agent. */
  attach(ws: WebSocket) {
    this.clients.add(ws);
    for (const msg of this.engine.replay()) sendTo(ws, msg);
    ws.on('message', (raw) => {
      let msg: TutorClientMessage;
      try {
        msg = JSON.parse(String(raw)) as TutorClientMessage;
      } catch {
        return;
      }
      if (typeof msg === 'object' && msg !== null) this.handle(msg);
    });
    ws.on('close', () => this.clients.delete(ws));
    // A malformed frame (invalid UTF-8, too large) closes this socket; unhandled, it would take the server down.
    ws.on('error', () => ws.terminate());
  }

  /** On shutdown: the agent's process goes with the server. */
  stop() {
    this.options.settings.events.off('change', this.onChange);
    this.engine.dispose();
    for (const ws of this.clients) ws.terminate();
  }

  private handle(msg: TutorClientMessage) {
    const e = this.engine;
    switch (msg.type) {
      case 'start':
        // An agent started by the dev instance would still write through the live app's MCP server (.mcp.json), so the
        // dev instance never starts one on its own.
        if (e instanceof Terminal && !(msg.auto && this.options.app.dev)) e.start(Boolean(msg.resume));
        return;
      case 'stop':
        return e.stop();
      case 'clear':
        return e.clear();
      case 'input':
        if (typeof msg.data === 'string' && e instanceof Terminal) e.input(msg.data);
        return;
      case 'send':
        if (typeof msg.text === 'string') e.send(msg.text);
        return;
      case 'run':
        if (typeof msg.text === 'string') e.run(msg.text, typeof msg.initial === 'string' ? msg.initial : undefined);
        return;
      case 'resize':
        if (e instanceof Terminal) e.resize(msg.cols, msg.rows);
        return;
    }
  }

  private create(): Terminal | ApiTutor {
    const { app, settings } = this.options;
    const emit = (msg: TutorMessage) => this.broadcast(msg);
    return settings.tutor === 'api'
      ? new ApiTutor({ ...this.options.api, app, settings }, emit)
      : new Terminal(this.agents.current(), emit, { app, ...this.options.terminal });
  }

  /** Settings changed: a different engine replaces this one; otherwise only its state may have changed (a new model). */
  private reconfigure() {
    const key = this.engineKey();
    if (key !== this.key) {
      this.key = key;
      this.engine.dispose();
      this.engine = this.create();
      for (const ws of this.clients) for (const msg of this.engine.replay()) sendTo(ws, msg);
      return;
    }
    this.broadcast(this.engine.state());
  }

  private broadcast(msg: TutorMessage) {
    for (const ws of this.clients) sendTo(ws, msg);
  }

  private engineKey(): string {
    const { settings } = this.options;
    if (settings.tutor === 'api') return 'api';
    const agent = this.agents.launch(settings.tutor);
    return `${agent.id} ${agent.file} ${agent.args({ resume: false }).join(' ')}`;
  }
}

function sendTo(ws: WebSocket, msg: TutorMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
