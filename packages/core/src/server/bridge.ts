// What an MCP client starts over stdio (the app's .mcp.json runs its server/bridge.ts, two lines: defineApp, then
// runBridge). It makes sure the app's server is running, then relays MCP messages to it: one HTTP POST to /mcp per
// message, the answer (JSON, or a stream of server-sent events) written back line by line. Plain Node and no MCP SDK,
// so it is ready in about a tenth of a second.
// It also does two things a generic relay can't: a call the client cancels (Esc while a tool runs) closes its
// request, so the server stops working on it; and a call whose stream ends without an answer (the server restarted
// meanwhile) gets an error back instead of hanging.
// stdout belongs to the MCP protocol: log to stderr only. From Galen's server/bridge.ts.

import http from 'node:http';
import { createInterface } from 'node:readline';
import type { App } from './app.ts';
import { createControl } from './control.ts';

type Id = string | number;
interface Message {
  jsonrpc: '2.0';
  id?: Id;
  method?: string;
  params?: { requestId?: Id; clientInfo?: unknown; _meta?: Record<string, unknown>; [key: string]: unknown };
  result?: { protocolVersion?: string; [key: string]: unknown };
  error?: unknown;
}

export interface BridgeOptions {
  /** Said to the client when a call got no answer: how to check whether it went through. */
  lost?: string;
  /** Streams to read and write (stdin and stdout); tests pass their own. */
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export function runBridge(app: App, options: BridgeOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const control = createControl(app);
  const agent = new http.Agent({ keepAlive: true });
  /** Requests waiting for their answer, by JSON-RPC id. */
  const open = new Map<Id, http.ClientRequest>();
  /** Calls the client gave up on: no answer is owed for them. */
  const cancelled = new Set<Id>();
  /** The protocol version agreed in `initialize`, sent with every later request as the spec asks. */
  let protocolVersion: string | undefined;
  /** Whether this bridge serves the agent in the app's own drawer (its terminal sets <PREFIX>_DRAWER). */
  const client = app.env('DRAWER') ? 'drawer' : 'terminal';
  /** The client's own name from `initialize` ("claude-code", "codex-mcp-client"…), passed on to the server. */
  let clientName = '';
  const lost =
    options.lost ??
    `${app.title} stopped before answering (it may have restarted). Check whether the call went through before repeating it.`;

  const ready = (async () => {
    if (await control.health()) return;
    if (!(await control.start())) {
      console.error(`${app.title}: the server did not start; see ${app.logFile}`);
      process.exit(1);
    }
  })();

  const write = (m: Message) => output.write(`${JSON.stringify(m)}\n`);

  /** One JSON-RPC message, or a batch of them, from the server. */
  function parse(body: string, reply: (m: Message) => void) {
    try {
      const value = JSON.parse(body) as Message | Message[];
      for (const m of Array.isArray(value) ? value : [value]) reply(m);
    } catch {
      console.error(`${app.title} bridge: unreadable answer:`, body.slice(0, 200));
    }
  }

  /** POSTs one message and writes back everything the server answers with. */
  function relay(message: Message) {
    const id = message.method !== undefined ? message.id : undefined;
    const info = (message.params?.clientInfo ?? message.params?._meta?.['io.modelcontextprotocol/clientInfo']) as
      | { name?: unknown }
      | undefined;
    if (typeof info?.name === 'string') clientName = info.name.replace(/[^\w.@/-]/g, '').slice(0, 80);
    let answered = false;
    const reply = (m: Message) => {
      if (id !== undefined && m.id === id && (m.result !== undefined || m.error !== undefined)) answered = true;
      if (m.result?.protocolVersion && message.method === 'initialize') protocolVersion = m.result.protocolVersion;
      write(m);
    };
    let finished = false;
    const finish = (reason?: string) => {
      if (id === undefined || finished) return;
      finished = true;
      open.delete(id);
      if (!answered && !cancelled.delete(id)) write({ jsonrpc: '2.0', id, error: { code: -32000, message: reason ?? lost } });
    };

    const body = JSON.stringify(message);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: app.port,
        path: '/mcp',
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(body),
          'X-Organon-Client': client,
          ...(clientName ? { 'X-Organon-Agent': clientName } : {}),
          ...(protocolVersion ? { 'Mcp-Protocol-Version': protocolVersion } : {}),
        },
      },
      (res) => {
        const type = res.headers['content-type'] ?? '';
        res.setEncoding('utf8');
        if (type.includes('text/event-stream')) {
          // Server-sent events: `data:` lines up to a blank line make one message.
          let buffer = '';
          let data: string[] = [];
          res.on('data', (chunk: string) => {
            buffer += chunk;
            let nl = buffer.indexOf('\n');
            while (nl !== -1) {
              const line = buffer.slice(0, nl).replace(/\r$/, '');
              buffer = buffer.slice(nl + 1);
              nl = buffer.indexOf('\n');
              if (line === '') {
                if (data.length) parse(data.join('\n'), reply);
                data = [];
              } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
            }
          });
        } else {
          let text = '';
          res.on('data', (chunk: string) => (text += chunk));
          res.on('end', () => {
            if (text.trim()) parse(text, reply);
            else if (res.statusCode && res.statusCode >= 400) finish(`${app.title} answered ${res.statusCode}`);
          });
        }
        res.on('end', () => finish());
        res.on('error', () => finish());
      },
    );
    if (id !== undefined) open.set(id, req);
    req.on('error', (err) => {
      if (id !== undefined && cancelled.has(id)) return finish();
      console.error(`${app.title} bridge:`, err.message);
      finish(`Could not reach ${app.title}: ${err.message}`);
    });
    req.end(body);
  }

  return new Promise((resolve) => {
    const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
    lines.on('line', (line) => {
      if (!line.trim()) return;
      let message: Message;
      try {
        message = JSON.parse(line) as Message;
      } catch {
        console.error(`${app.title} bridge: not JSON:`, line.slice(0, 200));
        return;
      }
      if (message.method === 'notifications/cancelled' && message.params?.requestId !== undefined) {
        const id = message.params.requestId;
        cancelled.add(id);
        open.get(id)?.destroy();
        return;
      }
      void ready.then(() => relay(message));
    });
    lines.on('close', () => {
      for (const req of open.values()) req.destroy();
      agent.destroy();
      resolve();
    });
  });
}
