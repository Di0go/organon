// The notes, live: loaded from /api/state on every (re)connect of the core's stream, then kept current by its events.
// The chats beside a page ride on the same stream: the core's ChatStore takes their events and reloads.

import type { ChatEvent } from '@organon/core/shared/chat';
import { ChatStore } from '@organon/core/ui/chats';
import { LiveStream, getJson } from '@organon/core/ui/live';
import { createRouter, hashParts } from '@organon/core/ui/router';
import { createTabs } from '@organon/core/ui/tabs';

type Event = { type: 'notes'; notes: string[] } | ChatEvent;

class Notes {
  list = $state<string[]>([]);
  warnings = $state<string[]>([]);
  readonly chats = new ChatStore();
  readonly live = new LiveStream<Event>({
    reload: async () => {
      const [s] = await Promise.all([getJson<{ notes: string[]; warnings: string[]; build?: string }>('/api/state'), this.chats.reload()]);
      this.list = s.notes;
      this.warnings = s.warnings;
      return s.build;
    },
    apply: (e) => {
      if (this.chats.apply(e)) return;
      if (e.type === 'notes') this.list = e.notes;
    },
  });
}

export const notes = new Notes();

export type Route = { page: 'home' } | { page: 'notes' } | { page: 'note'; n: number } | { page: 'settings' };

export const router = createRouter((hash): Route => {
  const [first, second] = hashParts(hash);
  if (first === 'notes' && second && /^\d+$/.test(second)) return { page: 'note', n: Number(second) };
  if (first === 'notes') return { page: 'notes' };
  if (first === 'settings') return { page: 'settings' };
  return { page: 'home' };
});

// Every note shares one tab: opening another moves it along.
export const tabs = createTabs({ key: 'minimal.tabs', group: (key) => (router.parse(key).page === 'note' ? 'note' : undefined) });
