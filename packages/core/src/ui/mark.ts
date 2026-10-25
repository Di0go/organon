// The words typed in a search, marked in a piece of text, as HTML. The text comes from an app's data (or, in Argus,
// from the network): it is split on the words first and each piece escaped after, so nothing in it runs, and a word
// never lands inside an escape ("lt" in &lt;).

export function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function markWords(text: string, query: string): string {
  const found = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!found.length) return escapeHtml(text);
  return text
    .split(new RegExp(`(${found.join('|')})`, 'gi'))
    .map((part, i) => (i % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('');
}
