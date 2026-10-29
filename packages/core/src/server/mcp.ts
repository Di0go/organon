// An app's MCP server, without its tools: one McpServer per request (stateless, so a restart never strands a client's
// connection), over Streamable HTTP at /mcp, with the app's tools defined once and handed in. Any MCP client uses it:
// Claude Code through the bridge (bridge.ts, .mcp.json), another agent, or the app's own agent in process.
//
//   const tools = defineTools((mcp) => { mcp.registerTool('get_hosts', { … }, async () => json(hosts)) });
//   await serve(app, { mcp: createMcpHandler(app, { instructions, tools }) });
//
// From Galen's server/mcp.ts and the /mcp handler in its index.ts. The descriptions are all a client knows of each
// tool, so they carry the rules too; Claude Code cuts one at 2048 characters, and checkTools says which are longer.
// zod comes from here (`z`), so the schemas an app writes are of the same zod the SDK reads.

import type http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { App } from './app.ts';

export { z } from 'zod';

export type ToolDef = { name: string; config: Parameters<McpServer['registerTool']>[1]; handler: Parameters<McpServer['registerTool']>[2] };

export const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] });
export const error = (t: string): CallToolResult => ({ ...text(t), isError: true });
export const json = (v: unknown): CallToolResult => text(JSON.stringify(v, null, 1));
/** Tools that only read: Claude Code may run several of them at once. */
export const READ_ONLY = { readOnlyHint: true } as const;
/** Where Claude Code cuts a tool's description. */
export const DESCRIPTION_LIMIT = 2048;

/** Every tool, with its schemas built once: `mcp` here only collects the definitions, with the SDK's own types. */
export function defineTools(define: (mcp: Pick<McpServer, 'registerTool'>) => void): ToolDef[] {
  const tools: ToolDef[] = [];
  const mcp = {
    registerTool: (name: string, config: ToolDef['config'], handler: ToolDef['handler']) => {
      tools.push({ name, config, handler });
    },
  } as unknown as Pick<McpServer, 'registerTool'>;
  define(mcp);
  return tools;
}

/** What is wrong with a set of tools as a client sees them: a repeated name, a description missing or too long. */
export function checkTools(tools: ToolDef[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { name, config } of tools) {
    if (seen.has(name)) out.push(`${name}: defined twice`);
    seen.add(name);
    const d = (config as { description?: string }).description ?? '';
    if (!d.trim()) out.push(`${name}: no description`);
    if (d.length > DESCRIPTION_LIMIT) out.push(`${name}: description is ${d.length} characters, over ${DESCRIPTION_LIMIT}`);
  }
  return out;
}

export interface McpOptions {
  /** The server's version as clients see it (the app's package.json version). */
  version?: string;
  /** What every client is told on connecting. `client` is its own name ("claude-code"…), when known. */
  instructions: (client: string) => string;
  /** The app's tools (defineTools). A function to have them built on first use. */
  tools: ToolDef[] | (() => ToolDef[]);
  /** Tools the agent in the app's own drawer always has loaded, never deferred. */
  core?: string[];
  /**
   * More for one request's server, by who asks: `client` is its own name ("claude-code", "codex-mcp-client"…, or the
   * app's name for its own agent in process), `drawer` whether it is the app's drawer. The app's `method` and prompts
   * (method.ts) go here, for the clients that don't load skills themselves.
   */
  extend?: (mcp: McpServer, context: { client: string; drawer: boolean }) => void;
}

/** Shared by every per-request server: building a validator is most of what creating one costs. */
const VALIDATOR = new AjvJsonSchemaValidator();

/** The McpServer for one request, with every tool. `drawer`: the client is the app's own drawer. */
export function createMcpServer(app: App, options: McpOptions, { drawer = false, client = '' } = {}): McpServer {
  const tools = typeof options.tools === 'function' ? options.tools() : options.tools;
  const core = new Set(options.core ?? []);
  const mcp = new McpServer(
    { name: app.name, version: options.version ?? '0.0.0' },
    { instructions: options.instructions(client), jsonSchemaValidator: VALIDATOR },
  );
  for (const { name, config, handler } of tools) {
    const always = drawer && core.has(name) ? { _meta: { 'anthropic/alwaysLoad': true } } : {};
    mcp.registerTool(name, { ...(config as object), ...always } as never, handler as never);
  }
  options.extend?.(mcp, { client, drawer });
  return mcp;
}

/**
 * The handler for POST /mcp. The bridge says when it serves the agent in the app's drawer (X-Organon-Client: drawer)
 * and which client it relays for (X-Organon-Agent). The SDK's transport is loaded on first use, not at start.
 */
export function createMcpHandler(app: App, options: McpOptions): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  let built: ToolDef[] | undefined;
  const once: McpOptions = { ...options, tools: () => (built ??= typeof options.tools === 'function' ? options.tools() : options.tools) };
  let transportModule: Promise<typeof import('@modelcontextprotocol/sdk/server/streamableHttp.js')> | undefined;
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end();
      return;
    }
    transportModule ??= import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const { StreamableHTTPServerTransport } = await transportModule;
    const agent = req.headers['x-organon-agent'];
    const mcp = createMcpServer(app, once, {
      drawer: req.headers['x-organon-client'] === 'drawer',
      // The app's own name is its agent in process (which has the rules already): never a client over HTTP.
      client: typeof agent === 'string' && agent !== app.name ? agent : '',
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  };
}
