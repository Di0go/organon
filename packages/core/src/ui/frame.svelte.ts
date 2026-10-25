// What the frame's pieces share: whether the search palette is open, and focus mode (everything but the page hidden:
// F toggles it, Escape leaves it, remembered per browser under the app's key, which Frame.svelte gives).
//
// From Galen's ui/src/lib/search.svelte.ts and focus.svelte.ts.

class SearchBox {
  open = $state(false);
  /** Text to search for on opening (the context menu's "Search"), taken by the palette once. */
  seed = $state<string | null>(null);

  toggle(value = !this.open, query?: string) {
    if (query) this.seed = query;
    this.open = value;
  }
}

export const searchBox = new SearchBox();

class Focus {
  on = $state(false);
  private key = '';

  /** Reads what this browser remembers, and starts listening for F and Escape. Once, from Frame.svelte. */
  init(key: string) {
    if (this.key) return;
    this.key = key;
    try {
      this.on = localStorage.getItem(key) === '1';
    } catch {
      // Not essential.
    }
    this.apply();
    // Capture phase, so Escape is seen before a panel or card closes on it: it leaves focus only when nothing else
    // was open to close.
    addEventListener(
      'keydown',
      (e) => {
        const typing = (e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable], .xterm');
        if (e.key === 'Escape' && this.on && !searchBox.open) this.toggle(false);
        else if ((e.key === 'f' || e.key === 'F') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) this.toggle();
      },
      { capture: true },
    );
  }

  toggle(value = !this.on) {
    this.on = value;
    this.apply();
  }

  private apply() {
    document.documentElement.classList.toggle('focus', this.on);
    try {
      if (this.key) localStorage.setItem(this.key, this.on ? '1' : '0');
    } catch {
      // Not essential.
    }
  }
}

export const focus = new Focus();
