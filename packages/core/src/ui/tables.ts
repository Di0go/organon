// Pipes inside a table row that aren't cell borders: {{term|definition}}, $|x|$ and `a|b` all hold a "|", and a GFM
// table splits its rows on every unescaped one, cutting the term in half ("{{non-polar covalent" in one cell, the
// rest of the row shifted). GFM's answer is to escape them (\|), which the table then turns back into "|" inside the
// cell, so the term or formula reaches its own parser whole. An app with inline syntax of its own that may hold a "|"
// (Aristotle's [[concept|label]]) hands in its pattern.
//
// From Aristotle's ui/src/lib/tables.ts (3516991), with the [[concept]] links left to Aristotle.

/** The row under a table's header: | --- | :-: | ---: | (with a "|", so a setext heading's --- is not one). */
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** The core's pieces of a row that may hold a "|" of their own: terms, then (after the app's) code and inline maths. */
const TERM = /\{\{[^{}\n]*\}\}/.source;
const CODE_AND_MATHS = /`[^`\n]*`|\$(?!\s)(?:\\.|[^\\$\n])+?(?<!\s)\$(?!\d)/.source;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * The source with every "|" inside a table cell's terms, maths and code (and the app's own `pieces`, patterns for one
 * inline construct each) escaped; the rest as it was.
 */
export function escapeTablePipes(source: string, pieces: readonly RegExp[] = []): string {
  if (!source.includes('|')) return source;
  const held = new RegExp([TERM, ...pieces.map((p) => p.source), CODE_AND_MATHS].join('|'), 'g');
  const lines = source.split('\n');
  let fence = '';
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const opened = FENCE.exec(line)?.[1];
    if (fence) {
      if (opened && opened[0] === fence[0] && opened.length >= fence.length) fence = '';
      continue;
    }
    if (opened) {
      fence = opened;
      inTable = false;
      continue;
    }
    const next = lines[i + 1] ?? '';
    if (!line.trim()) inTable = false;
    else if (!inTable && line.includes('|') && DELIMITER.test(next) && next.includes('|')) inTable = true;
    if (inTable) lines[i] = line.replace(held, (piece) => piece.replace(/(?<!\\)\|/g, '\\|'));
  }
  return lines.join('\n');
}
