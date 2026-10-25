// The accents every app offers, in one place. Before the core, each app named them four times (theme.svelte.ts,
// public/theme-boot.js, server/config.ts and base.css), and the two apps disagreed: Galen added green, Aristotle never
// had it. An app picks its default (Galen green, Aristotle blue); the list is the same for all, so a fix to an accent's
// contrast reaches every app. The colours themselves are in ui/tokens.css; theme-boot.js keeps its own copy of the ids
// (a classic script can't import), and a test holds the two together.

export const ACCENTS = [
  { id: 'green', label: 'Green', swatch: '#5cc488' },
  { id: 'blue', label: 'Blue', swatch: '#4f8cef' },
  { id: 'red', label: 'Red', swatch: '#dc3864' },
  { id: 'violet', label: 'Violet', swatch: '#8a6ff0' },
  { id: 'graphite', label: 'Graphite', swatch: '#8a8a8a' },
] as const;

export type Accent = (typeof ACCENTS)[number]['id'];

export const isAccent = (v: unknown): v is Accent => ACCENTS.some((a) => a.id === v);
