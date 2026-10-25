// The page's end of the server's event stream (server/events.ts): opened at start, opened again whenever it dies, and
// on every (re)connect the whole state loaded again, so nothing said while disconnected is missed. Events that arrive
// while that load is in flight are held and applied after it, in order, so an older snapshot never overwrites them.
// When the server says another build of the interface is on disk (a release), the page loads it.
//
//   const live = new LiveStream<FeedEvent>({ reload: async () => { …fetch the state…; return state.build }, apply });
//   live.start();
//
// From Galen's feed.svelte.ts, the transport without the records it carries (docs/plano.md, «FeedState»).

export interface LiveOptions<E> {
  /** The stream (/api/events). */
  url?: string;
  /** Loads the whole state; returns the build /api/state gave, so a new release is noticed. */
  reload: () => Promise<string | undefined>;
  /** One event from the stream. */
  apply: (event: E) => void;
  /** Nothing heard for this long (the server pings every 20 s) and the stream is taken for dead (50 s). */
  stale?: number;
}

export class LiveStream<E> {
  /** The stream is open and the state loaded. */
  connected = $state(false);
  /** False until the first full load, so pages can tell "loading" from "none". */
  loaded = $state(false);

  private readonly options: LiveOptions<E>;
  private source: EventSource | null = null;
  private heard = 0;
  private reloading = false;
  private again = false;
  private held: E[] = [];
  private build: string | undefined;

  constructor(options: LiveOptions<E>) {
    this.options = options;
  }

  start() {
    this.open();
    // The browser gives up on a stream after some failures, and a connection can die without either end noticing
    // (the machine slept, the network changed): either way the page would sit on stale numbers.
    const check = () => {
      if (this.source?.readyState === EventSource.CLOSED || Date.now() - this.heard > (this.options.stale ?? 50_000)) this.open();
    };
    setInterval(check, 10_000);
    addEventListener('online', check);
    addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  }

  /** Loads everything again now (after a change the page made itself, say). */
  refresh(): Promise<void> {
    return this.reload();
  }

  private open() {
    this.source?.close();
    const source = new EventSource(this.options.url ?? '/api/events');
    this.source = source;
    this.heard = Date.now();
    source.onopen = () => {
      this.heard = Date.now();
      void this.reload();
    };
    source.onerror = () => (this.connected = false);
    source.addEventListener('ping', () => (this.heard = Date.now()));
    source.onmessage = (e) => {
      this.heard = Date.now();
      let event: E;
      try {
        event = JSON.parse(e.data) as E;
      } catch {
        return;
      }
      if (this.reloading) this.held.push(event);
      else this.options.apply(event);
    };
  }

  private async reload() {
    if (this.reloading) {
      this.again = true;
      return;
    }
    this.reloading = true;
    this.again = false;
    this.held = [];
    try {
      const build = await this.options.reload();
      if (build && this.build && build !== this.build) this.loadNewBuild();
      this.build ??= build;
      this.connected = true;
      this.loaded = true;
    } catch {
      // The server went away mid-load; the next connection loads again.
    } finally {
      this.reloading = false;
      const held = this.held;
      this.held = [];
      for (const event of held) this.options.apply(event);
      if (this.again) void this.reload();
    }
  }

  /** A release came in: load it, unless he is typing; then once he leaves the page. */
  private loadNewBuild() {
    const el = document.activeElement;
    const typing =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
    if (!typing || document.visibilityState === 'hidden') return location.reload();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && location.reload());
  }
}

/** GET a JSON answer; an Error with the server's own message when it is not 2xx. */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${url}: ${res.status}`);
  return body;
}

/** Sends JSON (POST by default) and reads the answer; an Error with the server's message when it is not 2xx. */
export function sendJson<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  return getJson<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
