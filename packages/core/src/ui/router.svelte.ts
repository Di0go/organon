// Hash routing: the page from the address after #, parsed by the app's own rules into its own routes. Moving to
// another page scrolls to the top. The app keeps its routes and its links; the core keeps the mechanism.
//
//   export const router = createRouter(parse);     // parse: (hash) => Route, the app's
//   router.route                                   // reactive
//
// From Galen's ui/src/lib/router.svelte.ts, with the routes left to the app.

export class HashRouter<R> {
  route = $state<R>() as R;
  /** The address after # as it is now (location.hash is not reactive; this is). */
  hash = $state('');
  readonly parse: (hash: string) => R;

  constructor(parse: (hash: string) => R) {
    this.parse = parse;
    this.hash = location.hash;
    this.route = parse(location.hash);
    addEventListener('hashchange', () => {
      this.hash = location.hash;
      this.route = parse(location.hash);
      scrollTo({ top: 0 });
    });
  }
}

export function createRouter<R>(parse: (hash: string) => R): HashRouter<R> {
  return new HashRouter(parse);
}

/** The path parts of a hash, decoded: "#/device/aa%3Abb?c=1" → ["device", "aa:bb"]. */
export function hashParts(hash: string): string[] {
  const [path = ''] = hash.replace(/^#/, '').split('?');
  return path
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
}

/** The query of a hash: "#/?c=1" → c=1. */
export function hashQuery(hash: string): URLSearchParams {
  return new URLSearchParams(hash.split('?')[1] ?? '');
}
