// Sets the look (dark or light, and the accent) on <html> before the first paint, exactly as theme.svelte.ts will, so a
// dark page never flashes white while the app loads. A classic script of its own, loaded synchronously from
// index.html (the apps' Content-Security-Policy allows no inline scripts), told the app's key and default accent by
// its own attributes:
//
//   <script src="/theme-boot.js" data-key="galen.look" data-accent="green"></script>
//
// data-legacy names keys the look was kept under before, comma separated (Aristotle: "mind-gym.look"), read when the
// key itself is empty, as theme.svelte.ts's legacyKeys are; theme.svelte.ts then moves them over.
//
// The plugin in vite.ts serves it in dev and puts it in the build. The accent ids are copied from shared/accents.ts
// (a classic script can't import); tests/ui.test.ts fails if the two lists part.
(() => {
  const root = document.documentElement;
  const me = document.currentScript;
  const accents = ['green', 'blue', 'red', 'violet', 'graphite'];
  let look = {};
  try {
    const keys = [me?.dataset.key ?? 'organon.look', ...(me?.dataset.legacy ?? '').split(',').filter(Boolean)];
    const kept = keys.map((k) => localStorage.getItem(k)).find((v) => v !== null);
    look = JSON.parse(kept ?? '{}') ?? {};
  } catch {
    // No storage (private window, blocked site data): the defaults.
  }
  root.dataset.theme = look.mode === 'light' ? 'light' : 'dark';
  // The accent chosen in this browser, else the one the server wrote on <html> (this install's setting), else the app's.
  if (accents.includes(look.accent)) root.dataset.accent = look.accent;
  else if (!accents.includes(root.dataset.accent)) root.dataset.accent = me?.dataset.accent ?? 'blue';
})();
