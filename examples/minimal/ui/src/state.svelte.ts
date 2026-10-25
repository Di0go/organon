// The notes, live: loaded from /api/state on every (re)connect of the core's stream, then kept current by its events.

import { LiveStream, getJson } from '@organon/core/ui/live';
import { createRouter, hashParts } from '@organon/core/ui/router';
import { createTabs } from '@organon/core/ui/tabs';

type Event = { type: 'notes'; notes: string[] };

class Notes {
  list = $state<string[]>([]);
  warnings = $state<string[]>([]);
  readonly live = new LiveStream<Event>({
    reload: async () => {
      const s = await getJson<{ notes: string[]; warnings: string[]; build?: string }>('/api/state');
      this.list = s.notes;
      this.warnings = s.warnings;
      return s.build;
    },
    apply: (e) => {
      if (e.type === 'notes') this.list = e.notes;
    },
  });
}

export const notes = new Notes();

export type Route = { page: 'home' } | { page: 'notes' } | { page: 'note'; n: number };

export const router = createRouter((hash): Route => {
  const [first, second] = hashParts(hash);
  if (first === 'notes' && second && /^\d+$/.test(second)) return { page: 'note', n: Number(second) };
  if (first === 'notes') return { page: 'notes' };
  return { page: 'home' };
});

export const tabs = createTabs({ key: 'minimal.tabs' });
