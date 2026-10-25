// Entities and the links between them, the mechanism without the kinds: Galen's people, gyms and events, Argus's
// devices, domains, services, interfaces and conversations. An entity has a kind, an id unique within its kind, a
// name and the other names it goes by; a link joins two of them with a relation ("talks-to", "seen-on") and an
// optional weight (bytes, meetings). The graph finds an entity by key, id, name or alias (case and accents aside),
// walks its neighbours, and searches every entity's text. Shared by server and interface.
//
// From Galen's server/entities.ts (find by id, name or alias; the names folded) and server/search.ts (every word
// must appear; a snippet around the first), with the kinds left to the app.

export interface EntityRef {
  kind: string;
  /** Unique within its kind: a slug, a MAC address, a domain. */
  id: string;
  name: string;
  /** Other names it goes by, which find it too. */
  aka?: string[];
  /** Who or what it is, in a line. */
  summary?: string;
}

export interface Link {
  /** Entity keys (keyOf). */
  from: string;
  to: string;
  rel: string;
  weight?: number;
}

export interface Neighbour<E extends EntityRef> {
  entity: E;
  rel: string;
  /** Whether the link points from the entity asked about to this one. */
  out: boolean;
  weight?: number;
}

export interface SearchHit<E extends EntityRef> {
  entity: E;
  snippet: string;
}

/** "kind:id": an entity's key, unique across kinds. */
export const keyOf = (e: Pick<EntityRef, 'kind' | 'id'>) => `${e.kind}:${e.id}`;

/** Lower case without accents, for matching what people type against names. */
export function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export class EntityGraph<E extends EntityRef> {
  private byKey = new Map<string, E>();
  private edges = new Map<string, Link[]>();
  private readonly links: Link[];
  private readonly text: (e: E) => string;

  /** `text`: what search reads of an entity besides its names and summary. */
  constructor(entities: Iterable<E>, links: Iterable<Link> = [], text: (e: E) => string = () => '') {
    this.text = text;
    for (const e of entities) this.byKey.set(keyOf(e), e);
    // A link to an entity that isn't there is left out, so a walk never lands on nothing.
    this.links = [...links].filter((l) => this.byKey.has(l.from) && this.byKey.has(l.to));
    for (const l of this.links) {
      for (const k of [l.from, l.to]) {
        const list = this.edges.get(k) ?? [];
        list.push(l);
        this.edges.set(k, list);
      }
    }
  }

  get size(): number {
    return this.byKey.size;
  }

  all(kind?: string): E[] {
    const all = [...this.byKey.values()];
    return kind ? all.filter((e) => e.kind === kind) : all;
  }

  allLinks(): Link[] {
    return this.links;
  }

  get(key: string): E | undefined {
    return this.byKey.get(key);
  }

  /** By key, by id, by name, or by one of its other names; within `kind` when given. Exact before folded. */
  find(text: string, kind?: string): E | undefined {
    const direct = this.byKey.get(text) ?? (kind ? this.byKey.get(`${kind}:${text}`) : undefined);
    if (direct && (!kind || direct.kind === kind)) return direct;
    const want = fold(text.trim());
    const pool = this.all(kind);
    return (
      pool.find((e) => fold(e.id) === want) ??
      pool.find((e) => fold(e.name) === want) ??
      pool.find((e) => (e.aka ?? []).some((a) => fold(a) === want))
    );
  }

  /** Who `key` is linked to, either way; only `rel` when given. Heaviest first, then by name. */
  neighbours(key: string, rel?: string): Neighbour<E>[] {
    const out: Neighbour<E>[] = [];
    for (const l of this.edges.get(key) ?? []) {
      if (rel && l.rel !== rel) continue;
      const other = l.from === key ? l.to : l.from;
      const entity = this.byKey.get(other);
      if (entity) out.push({ entity, rel: l.rel, out: l.from === key, weight: l.weight });
    }
    return out.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.entity.name.localeCompare(b.entity.name));
  }

  /**
   * Who `key` is linked to, each once: the links either way joined, their weights added (A talks to B and B to A is
   * one neighbour that moved both). Heaviest first.
   */
  linked(key: string, rel?: string): { entity: E; rels: string[]; weight: number; out: boolean; in: boolean }[] {
    const by = new Map<string, { entity: E; rels: string[]; weight: number; out: boolean; in: boolean }>();
    for (const n of this.neighbours(key, rel)) {
      const k = keyOf(n.entity);
      const entry = by.get(k) ?? { entity: n.entity, rels: [], weight: 0, out: false, in: false };
      if (!entry.rels.includes(n.rel)) entry.rels.push(n.rel);
      entry.weight += n.weight ?? 0;
      if (n.out) entry.out = true;
      else entry.in = true;
      by.set(k, entry);
    }
    return [...by.values()].sort((a, b) => b.weight - a.weight || a.entity.name.localeCompare(b.entity.name));
  }

  /**
   * Two steps out: the entities linked to the ones `key` is linked to, without `key` itself and its direct ones
   * (a device → the domains it talks to → the other devices that talk to them). Each once, with what led there.
   */
  twoSteps(key: string, first?: string, second?: string): { entity: E; via: E[] }[] {
    const direct = new Set(this.neighbours(key, first).map((n) => keyOf(n.entity)));
    const found = new Map<string, { entity: E; via: E[] }>();
    for (const n of this.linked(key, first)) {
      for (const m of this.linked(keyOf(n.entity), second)) {
        const k = keyOf(m.entity);
        if (k === key || direct.has(k)) continue;
        const entry = found.get(k) ?? { entity: m.entity, via: [] };
        entry.via.push(n.entity);
        found.set(k, entry);
      }
    }
    return [...found.values()].sort((a, b) => b.via.length - a.via.length || a.entity.name.localeCompare(b.entity.name));
  }

  /** Every word of `q` appears in the entity's names, summary or text; with a line around the first. */
  search(q: string, limit = 40): SearchHit<E>[] {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits: SearchHit<E>[] = [];
    for (const e of this.byKey.values()) {
      const original = [e.name, e.id, ...(e.aka ?? []), e.summary, this.text(e)].filter(Boolean).join('\n');
      const folded = fold(original);
      if (!words.every((w) => folded.includes(w))) continue;
      hits.push({ entity: e, snippet: snippet(original, folded, words[0] ?? '') });
      if (hits.length >= limit) break;
    }
    return hits;
  }
}

/** A line of text around the first match. */
export function snippet(original: string, folded: string, word: string): string {
  const at = folded.indexOf(word);
  if (at === -1) return '';
  const start = Math.max(0, at - 60);
  const end = Math.min(original.length, at + word.length + 80);
  return `${start > 0 ? '…' : ''}${original.slice(start, end).replace(/\s+/g, ' ').trim()}${end < original.length ? '…' : ''}`;
}
