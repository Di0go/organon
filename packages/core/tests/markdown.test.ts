// ui/tables.ts: the "|" inside a table cell's terms, maths and code is escaped before Marked splits the row, so
// none of them is cut in half. Aristotle's test of 3516991, with its [[concept|label]] links handed in as the app's
// own pieces, as Aristotle will hand them in. Rendering itself needs a DOM: the example's Chromium tests prove it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marked, type Tokens } from 'marked';
import { escapeTablePipes } from '../src/ui/tables.ts';

const CONCEPT = /\[\[[^[\]\n]*\]\]/;

const source = [
  'Before the table: {{bond|a shared pair}} and [[why-atoms-bond|bond]] stay as they are.',
  '',
  '| Gap in pull | Example | Name |',
  '|---|---|---|',
  '| none or tiny | H–H, [[why-atoms-bond|a bond]] | {{non-polar covalent|electrons shared about evenly; no charged ends}} |',
  '| huge | $|q|$ big, `a|b` | {{ionic|one atom has taken the electron outright}} |',
  '| $5 | $10 | \\| kept | plain |',
  '',
  '```',
  '| {{not|a table}} |',
  '```',
  '',
  'A heading with {{a|term}}',
  '---',
].join('\n');

function cells(markdown: string): string[][] {
  const table = new Marked({ gfm: true }).lexer(markdown).find((t): t is Tokens.Table => t.type === 'table');
  assert.ok(table);
  return [table.header, ...table.rows].map((row) => row.map((cell) => cell.text));
}

test('Hover terms, maths and code keep their "|" inside a table instead of splitting the row', () => {
  const rows = cells(escapeTablePipes(source, [CONCEPT]));
  assert.deepEqual(rows, [
    ['Gap in pull', 'Example', 'Name'],
    ['none or tiny', 'H–H, [[why-atoms-bond|a bond]]', '{{non-polar covalent|electrons shared about evenly; no charged ends}}'],
    ['huge', '$|q|$ big, `a|b`', '{{ionic|one atom has taken the electron outright}}'],
    ['$5', '$10', '| kept'],
  ]);
  // Outside tables nothing changes: the paragraph, the code block and the setext heading read as written.
  const escaped = escapeTablePipes(source, [CONCEPT]);
  assert.equal(escaped.split('\n')[0], source.split('\n')[0]);
  assert.ok(escaped.includes('```\n| {{not|a table}} |\n```'));
  assert.ok(escaped.endsWith('A heading with {{a|term}}\n---'));
});

test("An app's own syntax is kept whole only when the app hands it in", () => {
  // Without the [[concept]] pattern, the core knows nothing of it: that row splits as GFM says, the rest holds.
  const rows = cells(escapeTablePipes(source));
  assert.deepEqual(rows[1], ['none or tiny', 'H–H, [[why-atoms-bond', 'a bond]]']);
  assert.deepEqual(rows[2], ['huge', '$|q|$ big, `a|b`', '{{ionic|one atom has taken the electron outright}}']);
});

test('Text without a table comes back as it was', () => {
  for (const text of ['', 'plain', 'a | b on one line', '`a|b` and $|x|$ outside a table', '| a |\nno delimiter']) {
    assert.equal(escapeTablePipes(text), text);
  }
});
