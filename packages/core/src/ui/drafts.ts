// What the person has typed and not sent yet (an entry, an answer, a message), kept in the browser so leaving a page
// and coming back finds it where they left it. Cleared once sent; drafts nobody came back to are dropped after a
// while. Kept under the app's name ("galen.draft.<key>"), which Frame.svelte gives once (`drafts.init`).
//
// From Aristotle's and Galen's ui/src/lib/drafts.ts, the same but for comments and the app's name in the key.

/** A draft untouched this long is forgotten. */
const KEEP_MS = 60 * 24 * 60 * 60 * 1000;

type Saved<T> = { value: T; at: number };

let prefix = 'organon.draft.';
let tidied = false;

export const drafts = {
  /** Keeps drafts under the app's name from now on, and drops the old ones. The first call wins. */
  init(app: string) {
    if (tidied) return;
    prefix = `${app}.draft.`;
    tidy();
  },

  /** The draft kept under this key, or the fallback when there is none (or storage can't be read). */
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(prefix + key);
      return raw === null ? fallback : (JSON.parse(raw) as Saved<T>).value;
    } catch {
      return fallback;
    }
  },

  /** Keeps a draft; an empty one is dropped instead. */
  set<T>(key: string, value: T, empty = false) {
    try {
      if (empty) localStorage.removeItem(prefix + key);
      else localStorage.setItem(prefix + key, JSON.stringify({ value, at: Date.now() } satisfies Saved<T>));
    } catch {
      // No storage (private window, full): the draft lives only as long as the page.
    }
  },

  /** Keeps a piece of text, dropping it when there is nothing but whitespace. */
  text(key: string, text: string) {
    this.set(key, text, !text.trim());
  },

  clear(key: string) {
    this.set(key, null, true);
  },
};

/** Drafts from long ago (an entry sent from elsewhere, a chat cleared) don't pile up. */
function tidy() {
  tidied = true;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      try {
        const { at } = JSON.parse(localStorage.getItem(key) ?? '') as Saved<unknown>;
        if (!(Date.now() - at < KEEP_MS)) localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // No storage: nothing to tidy.
  }
}
