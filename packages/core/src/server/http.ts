// An app's server without its routes: the built interface, /api/health and /api/state, the MCP endpoint, and every
// check in front of them. Listens on loopback only (127.0.0.1, and ::1 so nobody else can), HTTP, and HTTPS for the
// clean name once tls.sh has made its certificate. Only this user's connections (peer.ts), to the app's own names,
// from the app's own pages: other sites in the browser get nothing (DNS rebinding, CSRF).
//
//   const app = defineApp(ROOT);
//   await serve(app, { api: async (req, res, route) => { … return true when it answered }, mcp, state });
//
// From Galen's server/index.ts (206713f: the build in /api/state, so a page reloads on a new release), with the
// routes, the feed and the terminal left in the app. What an app hands it is in ServeOptions.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import type { Socket } from 'node:net';
import path from 'node:path';
import type { App } from './app.ts';
import { socketOwner } from './peer.ts';
import type { Warnings } from './warnings.ts';

/** Thrown by a route: the request gets `status` and `{ error: message }`. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Route = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  route: string,
  params: URLSearchParams,
) => Promise<boolean | undefined>;

export interface ServeOptions {
  /** The app's own routes under /api/. Answers and returns true, or returns false for the core's 404. */
  api?: Route;
  /** The MCP endpoint at /mcp (mcp.ts createMcpHandler). */
  mcp?: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
  /** What /api/state carries besides the build and the warnings. */
  state?: () => Record<string, unknown>;
  warnings?: Warnings;
  /** The install's accent, written on <html> until the browser picks its own (settings.accent). */
  accent?: () => string | undefined;
  /** Before the process exits on SIGTERM or SIGINT: let the stores finish writing (bounded to 3 s). */
  stop?: () => Promise<void>;
  /** Exit the process on SIGTERM and SIGINT (the default). Off in tests that serve in process. */
  signals?: boolean;
}

export interface Serving {
  /** The HTTP port it listens on (the app's, or the one the system gave for port 0). */
  port: number;
  close(): Promise<void>;
}

/** Content types of the files an interface build is made of. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};

export async function serve(app: App, options: ServeOptions = {}): Promise<Serving> {
  const UID = process.getuid?.();

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      if (!localHost(req.headers.host) || (req.headers.origin && !localOrigin(req.headers.origin))) return send(res, 403, 'Forbidden');
      const url = new URL(req.url ?? '/', 'http://localhost');
      // The API and MCP are for the app's own pages and local programs only, never another site's request, even one
      // a browser sends without an Origin (a GET from an <img>, a link): browsers mark those cross-site.
      const api = url.pathname.startsWith('/api/') || url.pathname === '/mcp';
      if (api && !sameSite(req)) return send(res, 403, 'Forbidden');
      protect(req, res);
      // Once the browsers trust the certificate, pages on http://<name> move to https. Not /api/ or /mcp: a page
      // still open over http keeps working, which a redirect to another origin would break.
      if (app.tlsTrusted && !('encrypted' in req.socket) && req.headers.host === app.hostname && !api) {
        res.writeHead(307, { Location: `https://${app.hostname}${req.url ?? '/'}` }).end();
        return;
      }
      if (url.pathname === '/mcp') {
        if (!options.mcp) return json(res, 404, { error: 'No MCP here' });
        return await options.mcp(req, res);
      }
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname, url.searchParams);
      return await serveStatic(res, url.pathname);
    } catch (err) {
      if (err instanceof ApiError) return json(res, err.status, { error: err.message });
      // A malformed %-escape in a path is the request's fault.
      if (err instanceof URIError && !res.headersSent) return send(res, 400, 'Bad request');
      console.error(err);
      if (!res.headersSent) send(res, 500, 'Server error');
      else res.end();
    }
  }

  async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, route: string, params: URLSearchParams) {
    // Every body is JSON, and saying so is required: a form or a no-cors fetch from another page can only send
    // text/plain or form types, so this stands behind the Origin check.
    if ((req.method === 'POST' || req.method === 'PUT') && !/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
      return json(res, 415, { error: 'Send JSON (Content-Type: application/json)' });
    }
    if (req.method === 'GET' && route === '/api/health')
      return json(res, 200, { ok: true, app: app.name, instance: app.instance, root: app.root, pid: process.pid });
    if (req.method === 'GET' && route === '/api/state')
      return json(res, 200, { ...options.state?.(), warnings: options.warnings?.list() ?? [], build: uiBuild() });
    if (options.api && (await options.api(req, res, route, params))) return;
    if (!res.headersSent) json(res, 404, { error: 'Not found' });
  }

  /**
   * Which build of the interface is on disk: the name of the script index.html loads, which changes with every build.
   * Read each time (it is small), so a release seen by a server that kept running is still noticed.
   */
  function uiBuild(): string | undefined {
    // The dev instance's interface comes from Vite, which reloads on its own.
    if (app.dev) return undefined;
    try {
      return /assets\/index-([\w-]+)\.js/.exec(readFileSync(path.join(app.uiDir, 'index.html'), 'utf8'))?.[1];
    } catch {
      return undefined;
    }
  }

  /** The built interface from dist/ui; unknown paths get index.html so the app can route them. */
  async function serveStatic(res: http.ServerResponse, pathname: string) {
    const rel = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = path.join(app.uiDir, rel);
    if (!file.startsWith(app.uiDir)) return send(res, 403, 'Forbidden');
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      // A missing build file is a real 404 (a tab from before a rebuild asking for an old chunk): answering it with
      // the app would hand a script import an HTML page. Every other unknown path gets the app (single-page routing).
      if (rel.startsWith(`${path.sep}assets${path.sep}`)) return send(res, 404, 'Not found');
      file = path.join(app.uiDir, 'index.html');
      try {
        body = await readFile(file);
      } catch {
        return send(res, 503, 'The interface is not built yet. Run: pnpm build');
      }
    }
    const accent = options.accent?.();
    if (accent && /^[a-z]+$/.test(accent) && file.endsWith(`${path.sep}index.html`))
      body = Buffer.from(body.toString('utf8').replace('<html lang="en">', `<html lang="en" data-accent="${accent}">`));
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache }).end(body);
  }

  const localHost = (host: string | undefined) => host !== undefined && app.allowedHosts.has(host.toLowerCase());
  const localOrigin = (origin: string) => app.allowedOrigins.has(origin.toLowerCase());

  /** Drops a connection from another account on this machine before it is read (peer.ts); undecidable ones go on. */
  function refuseOtherUsers(socket: Socket) {
    if (UID === undefined) return;
    const owner = socketOwner(socket.remoteAddress, socket.remotePort);
    if (owner !== undefined && owner !== UID) socket.destroy();
  }

  // HTTP always (on 127.0.0.1, and on ::1 when the machine has it), HTTPS too when there is a certificate.
  const server = http.createServer(handle).on('connection', refuseOtherUsers);
  const server6 = http.createServer(handle).on('connection', refuseOtherUsers);
  const tls = app.tlsEnabled
    ? https
        .createServer(
          { key: readFileSync(path.join(app.tlsDir, 'server.key')), cert: readFileSync(path.join(app.tlsDir, 'server.crt')) },
          handle,
        )
        .on('connection', refuseOtherUsers)
    : undefined;

  const portInUse = (port: number) => (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use: ${app.title} is probably already running.`);
      process.exit(1);
    }
    throw err;
  };
  server.on('error', portInUse(app.port));
  tls?.on('error', portInUse(app.tlsPort));
  server6.on('error', (err: NodeJS.ErrnoException) => {
    // No IPv6 here: nothing to hold. Taken: say so, since that program answers "localhost" before we do.
    if (err.code === 'EADDRINUSE') console.error(`Another program listens on [::1]:${app.port}; open http://127.0.0.1:${app.port}.`);
    else if (err.code !== 'EADDRNOTAVAIL' && err.code !== 'EAFNOSUPPORT') console.error(err);
  });

  await new Promise<void>((resolve) => server.listen(app.port, app.host, resolve));
  const port = (server.address() as { port: number }).port;
  mkdirSync(path.dirname(app.pidFile), { recursive: true });
  writeFileSync(app.pidFile, String(process.pid));
  tls?.listen(app.tlsPort, app.host);
  if (app.port) server6.listen(port, app.host6);
  console.log(`${new Date().toISOString()} ${app.title} (${app.instance}) running at ${app.url} (http://localhost:${port})`);

  let closing: Promise<void> | undefined;
  /** Stops taking requests, lets the app finish writing, then removes the pid file. */
  function close(): Promise<void> {
    closing ??= (async () => {
      for (const s of [server, server6, tls]) {
        s?.close();
        s?.closeAllConnections();
      }
      if (options.stop) await Promise.race([options.stop(), new Promise((r) => setTimeout(r, 3000))]);
      rmSync(app.pidFile, { force: true });
    })();
    return closing;
  }
  if (options.signals !== false) {
    const exit = () => void close().then(() => process.exit(0));
    process.on('SIGTERM', exit);
    process.on('SIGINT', exit);
  }
  return { port, close };
}

/** Not sent by another site: browsers say where a request comes from in Sec-Fetch-Site; other programs send none. */
function sameSite(req: http.IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
}

/**
 * Headers on every answer. The policy lets the interface run only its own scripts, talk only to this server and show
 * only its own images, and no other page may frame it.
 */
function protect(req: http.IncomingMessage, res: http.ServerResponse) {
  const host = req.headers.host ?? '';
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; font-src 'self' data:; " +
      `connect-src 'self' ws://${host} wss://${host}; object-src 'none'; base-uri 'none'; form-action 'none'; ` +
      "frame-ancestors 'none'; frame-src 'none'",
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

/** The request body as JSON; an ApiError (400, 413) when it is malformed or over `limit` bytes. */
export async function readJson(req: http.IncomingMessage, limit = 1_000_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new ApiError(413, 'Body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Not JSON');
  }
}

export function json(res: http.ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
  return true;
}

export function send(res: http.ServerResponse, status: number, message: string): true {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
  return true;
}
