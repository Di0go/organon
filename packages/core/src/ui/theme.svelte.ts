// Look settings: light or dark, and one accent. Remembered in this browser only.
//
// From Aristotle's and Galen's ui/src/lib/theme.svelte.ts, which differed in the storage key, the default accent and
// Aristotle's move from the old "mind-gym.look" key. Those are the app's to say now (createTheme), and so is the tab
// icon, drawn from the app's own logo. theme-boot.js must be given the same key and default, or the first paint and
// the app disagree.

import { ACCENTS, type Accent, isAccent } from '../shared/accents.ts';

export { ACCENTS, type Accent };
export type Mode = 'dark' | 'light';

export interface ThemeOptions {
  /** The localStorage key ("galen.look"); theme-boot.js reads the same one. */
  key: string;
  /** The accent when neither this browser nor the install chose one (Galen green, Aristotle blue). */
  defaultAccent: Accent;
  /** Keys the look was kept under before, moved over on first read (Aristotle's "mind-gym.look"). */
  legacyKeys?: string[];
  /** The tab icon for a look, from the app's logo; left alone when not given. */
  favicon?: (dark: boolean, accent: string) => string;
}

export class Look {
  /** Dark or light. */
  value = $state<Mode>('dark');
  accent = $state<Accent>('blue');
  private readonly options: ThemeOptions;

  constructor(options: ThemeOptions) {
    this.options = options;
    const { mode, accent } = this.read();
    this.value = mode;
    this.accent = accent;
    this.apply();
  }

  get dark(): boolean {
    return this.value === 'dark';
  }

  set(mode: Mode, accent: Accent) {
    this.value = mode;
    this.accent = accent;
    try {
      localStorage.setItem(this.options.key, JSON.stringify({ mode, accent }));
    } catch {
      // Not essential.
    }
    this.apply();
  }

  private apply() {
    const root = document.documentElement;
    root.dataset.theme = this.value;
    root.dataset.accent = this.accent;
    const { favicon } = this.options;
    if (!favicon) return;
    // The tab icon follows the look too.
    const accent = getComputedStyle(root).getPropertyValue('--acc').trim();
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', favicon(this.dark, accent));
  }

  /** The install's accent, which the server wrote on <html>, else the app's default. */
  private installAccent(): Accent {
    const written = document.documentElement.dataset.accent;
    return isAccent(written) ? written : this.options.defaultAccent;
  }

  private read(): { mode: Mode; accent: Accent } {
    const { key, legacyKeys = [] } = this.options;
    try {
      for (const old of legacyKeys) {
        const kept = localStorage.getItem(old);
        if (kept !== null && localStorage.getItem(key) === null) localStorage.setItem(key, kept);
        if (kept !== null) localStorage.removeItem(old);
      }
      const v = JSON.parse(localStorage.getItem(key) ?? '{}') as { mode?: string; accent?: string };
      return { mode: v.mode === 'light' ? 'light' : 'dark', accent: isAccent(v.accent) ? v.accent : this.installAccent() };
    } catch {
      return { mode: 'dark', accent: this.installAccent() };
    }
  }
}

/** The app's one look; call it once, at startup (ui/src/lib/theme.svelte.ts in the app). */
export function createTheme(options: ThemeOptions): Look {
  return new Look(options);
}
