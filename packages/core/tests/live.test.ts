// ui/live.svelte.ts, the page's end of the live stream, compiled as Svelte compiles it and run against a pretend
// EventSource: every (re)connect loads the whole state; events that arrive meanwhile are held and applied after it, in
// order, except those the state already includes; a new build reloads the page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { compileModule } from 'svelte/compiler';

class FakeSource {
  static last: FakeSource | undefined;
  static CLOSED = 2;
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSource.last = this;
  }
  addEventListener() {}
  close() {
    this.readyState = FakeSource.CLOSED;
  }
  send(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

const g = globalThis as Record<string, unknown>;
let reloads = 0;
g.EventSource = FakeSource;
g.addEventListener = () => {};
g.setInterval = () => 0;
g.document = { addEventListener() {}, visibilityState: 'visible', activeElement: null };
g.location = { reload: () => reloads++ };
g.HTMLInputElement = class {};
g.HTMLTextAreaElement = class {};
g.HTMLElement = class {};

async function load() {
  const src = await readFile(new URL('../src/ui/live.svelte.ts', import.meta.url), 'utf8');
  const js = compileModule(stripTypeScriptTypes(src), { generate: 'client', filename: 'live.svelte.js' }).js.code;
  const dir = path.join(import.meta.dirname, '.compiled');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `live-${Date.now()}.js`);
  await writeFile(file, js);
  try {
    return (await import(file)) as typeof import('../src/ui/live.svelte.ts');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const { LiveStream } = await load();
type Ev = { seq: number; v: string };

function stream(reload: () => Promise<{ build?: string; seq?: number } | string | undefined>) {
  const applied: string[] = [];
  const live = new LiveStream<Ev>({ reload, apply: (e) => applied.push(e.v), seq: (e) => e.seq });
  live.start();
  return { live, applied, source: FakeSource.last! };
}

test('Events held during a load are applied after it, in order, except those the state already includes', async () => {
  let finish: (v: { seq: number }) => void = () => {};
  const { live, applied, source } = stream(() => new Promise((r) => (finish = r)));
  source.onopen?.();
  source.send({ seq: 4, v: 'old, before the state' });
  source.send({ seq: 5, v: 'in the state' });
  source.send({ seq: 6, v: 'newer than the state' });
  finish({ seq: 5 });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(applied, ['newer than the state']);
  assert.equal(live.connected, true);
  assert.equal(live.loaded, true);
  // Once loaded, events go straight in.
  source.send({ seq: 7, v: 'live' });
  assert.deepEqual(applied, ['newer than the state', 'live']);
});

test('Without numbers, every held event is applied after the load, in order', async () => {
  let finish: (v: string | undefined) => void = () => {};
  const applied: string[] = [];
  const live = new LiveStream<Ev>({ reload: () => new Promise((r) => (finish = r)), apply: (e) => applied.push(e.v) });
  live.start();
  const source = FakeSource.last!;
  source.onopen?.();
  source.send({ seq: 1, v: 'a' });
  source.send({ seq: 2, v: 'b' });
  finish(undefined);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(applied, ['a', 'b']);
});

test('A new build on a later connect reloads the page; the first one is just noted', async () => {
  let build = 'one';
  const { live, source } = stream(async () => ({ build }));
  source.onopen?.();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reloads, 0);
  build = 'two';
  await live.refresh();
  assert.equal(reloads, 1);
});
