// Server-Sent Events: one stream every open page listens on, so what changes on the server reaches the page without
// it asking. The transport only; what the events say is the app's.
//
//   const events = new EventHub();
//   api: (req, res, route) => { if (route === '/api/events') return events.stream(req, res); … }
//   events.send({ type: 'hosts', … });          // to every open page
//
// From Galen's server/index.ts (streamEvents): retry in 2 s, a ping every 20 s so a page can tell a dead stream from
// a quiet one (ui/live.svelte.ts), the listener dropped when the page goes. Added: a page that cannot keep up (its
// socket buffer past `highWater`) is closed rather than buffered without end; it reconnects and reloads.

import type http from 'node:http';

export interface EventHubOptions {
  /** Milliseconds between pings (20 s). */
  ping?: number;
  /** Bytes a page may have waiting unread before it is closed (4 MB). */
  highWater?: number;
}

export class EventHub {
  private readonly clients = new Set<http.ServerResponse>();
  private readonly ping: number;
  private readonly highWater: number;

  constructor(options: EventHubOptions = {}) {
    this.ping = options.ping ?? 20_000;
    this.highWater = options.highWater ?? 4_000_000;
  }

  /** How many pages are listening. */
  get size(): number {
    return this.clients.size;
  }

  /** Answers GET /api/events: the stream stays open until the page goes. Returns true, as a route does. */
  stream(req: http.IncomingMessage, res: http.ServerResponse): true {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    this.clients.add(res);
    const ping = setInterval(() => this.write(res, 'event: ping\ndata: .\n\n'), this.ping);
    const drop = () => {
      clearInterval(ping);
      this.clients.delete(res);
    };
    req.on('close', drop);
    res.on('close', drop);
    return true;
  }

  /** Sends one event (any JSON) to every open page. */
  send(event: unknown): void {
    if (!this.clients.size) return;
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients) this.write(res, frame);
  }

  /** Closes every stream (the server stopping); the pages reconnect to whatever comes next. */
  close(): void {
    for (const res of this.clients) res.end();
    this.clients.clear();
  }

  private write(res: http.ServerResponse, frame: string) {
    if (res.writableLength > this.highWater) {
      // A page that stopped reading (a laptop asleep with the tab open): let it go, it reloads on reconnect.
      this.clients.delete(res);
      res.destroy();
      return;
    }
    res.write(frame);
  }
}
