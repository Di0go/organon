// Open pages, as tabs. Every page visited gets a tab (one per page, whatever its query says); the oldest falls off
// past `max`. Remembered in this browser only.
//
//   export const tabs = createTabs({ key: 'argus.tabs' });
//
// From Galen's ui/src/lib/tabs.svelte.ts, with the storage key and the home page the app's.

export interface TabsOptions {
  /** The localStorage key ("galen.tabs"). */
  key: string;
  /** How many tabs stay open (8). */
  max?: number;
  /** Where closing the last tab goes ("#/"). */
  home?: string;
}

/** One tab per page, whatever its query says. */
export function pageKey(hash: string): string {
  return (hash || '#/').split('?')[0] || '#/';
}

export class Tabs {
  list = $state<string[]>([]);
  /** The open page's tab. */
  active = $state(pageKey(location.hash));
  private readonly options: Required<TabsOptions>;

  constructor(options: TabsOptions) {
    this.options = { max: 8, home: '#/', ...options };
    this.list = this.read();
    this.visit(location.hash);
    addEventListener('hashchange', () => this.visit(location.hash));
  }

  /** Closes a tab. Closing the open one moves to its left neighbour (the right one if it was first, home if none is left). */
  close(key: string) {
    const i = this.list.indexOf(key);
    if (i === -1) return;
    const wasActive = key === pageKey(location.hash);
    this.list = this.list.filter((k) => k !== key);
    this.save();
    if (wasActive) location.hash = this.list[Math.max(0, i - 1)] ?? this.options.home;
  }

  private visit(hash: string) {
    const key = pageKey(hash);
    this.active = key;
    if (this.list.includes(key)) return;
    this.list = [...this.list, key].slice(-this.options.max);
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(this.options.key, JSON.stringify(this.list));
    } catch {
      // Not essential.
    }
  }

  private read(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(this.options.key) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, this.options.max) : [];
    } catch {
      return [];
    }
  }
}

export function createTabs(options: TabsOptions): Tabs {
  return new Tabs(options);
}
