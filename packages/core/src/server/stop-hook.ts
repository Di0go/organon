// Claude Code's Stop hook (.claude/settings.json): before Claude finishes a turn in which it changed code, the app's
// generated docs are rewritten, and if a changed zone's prose docs were not touched, Claude is sent back to update them
// (or to say why nothing needs to change). So nobody has to ask for "update the docs". Only files changed since this
// session started count, and never in the app's drawer (<PREFIX>_DRAWER: the app in use, not development). The app's
// scripts/claude-stop-hook.ts hands in its zones (which docs describe which code) and its docs generator.
//
// From Aristotle's and Galen's scripts/claude-stop-hook.ts and the mechanism of their scripts/doc-zones.ts.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readAppJson } from './app.ts';

/** Which docs describe which code: a change to a zone should come with a change to at least one of its docs. */
export interface DocZone {
  name: string;
  code: RegExp;
  docs: string[];
}

/** The exception, written in a commit message: "Docs: none -- <why>". */
export const NO_DOCS = /^Docs: none\b/m;

/** Commits that need no docs whatever they touch: Dependabot's, which only move a pinned version. */
export const NO_DOCS_AUTHOR = /dependabot\[bot\]/;

/** The zones that changed without any of their docs changing. */
export function undocumented(zones: DocZone[], changed: string[]): { name: string; files: string[]; docs: string[] }[] {
  const out = [];
  for (const zone of zones) {
    const files = changed.filter((f) => zone.code.test(f));
    if (files.length && !zone.docs.some((d) => changed.includes(d))) out.push({ name: zone.name, files, docs: zone.docs });
  }
  return out;
}

export interface StopHookOptions {
  zones: DocZone[];
  /** Rewrites the generated docs; the files it changed. */
  generate: () => Promise<string[]>;
}

/** The hook, run in the app at `root` on what Claude Code sends on stdin. */
export async function runStopHook(root: string, { zones, generate }: StopHookOptions): Promise<void> {
  const prefix = readAppJson(root).name.toUpperCase().replace(/-/g, '_');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  if (process.env[`${prefix}_DRAWER`]) return;
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}') as { stop_hook_active?: boolean; transcript_path?: string };
  // Already sent back once this turn: let it stop, rather than loop.
  if (input.stop_hook_active) return;

  // 1. What this session changed: files touched since it started, and what it committed since.
  const since = sessionStart(input.transcript_path);
  const pending = porcelain(git('status', '--porcelain', '-z', '--untracked-files=all')).filter((f) => {
    try {
      return statSync(path.join(root, f)).mtimeMs >= since;
    } catch {
      return true; // deleted
    }
  });
  // Files of the commits made since, except those whose message says why no docs changed ("Docs: none -- <why>")
  // and Dependabot's (a pinned version moved).
  const committed = git('log', `--since=${new Date(since).toISOString()}`, '--name-only', '--format=%x00%ae%n%B%x01')
    .split('\0')
    .filter(Boolean)
    .flatMap((entry) => {
      const [message = '', files = ''] = entry.split('\x01');
      const exempt = NO_DOCS.test(message) || NO_DOCS_AUTHOR.test(message.split('\n')[0] ?? '');
      return exempt ? [] : files.split('\n').filter(Boolean);
    });
  const changed = [...new Set([...pending, ...committed])];
  // Only Markdown changed (or nothing): no code to keep the docs in step with.
  if (!changed.some((f) => !f.endsWith('.md'))) return;

  // 2. Rewrite the generated docs, then send Claude back if a zone's prose was left behind.
  const regenerated = await generate().catch(() => []);
  const missing = undocumented(zones, changed);
  if (missing.length) {
    const reason = [
      'Before finishing: this session changed code whose docs did not change.',
      ...missing.map(
        (m) => `- ${m.name}: ${m.files.slice(0, 6).join(', ')}${m.files.length > 6 ? ', …' : ''}. Docs: ${m.docs.join(' or ')}.`,
      ),
      'Update the prose in one of them so it still describes the code (docs/README.md says which doc covers what).',
      'If nothing there is affected, say so in one line and, when you commit, add "Docs: none -- <why>" to the message.',
    ];
    console.log(JSON.stringify({ decision: 'block', reason: reason.join('\n') }));
  } else if (regenerated.length) {
    console.error(`Generated docs updated: ${regenerated.join(', ')}`);
  }
}

/**
 * When this session started: the first entry of its transcript that carries a time (the first lines may not: a mode
 * line, a file-history snapshot), or three hours ago if none can be read.
 */
function sessionStart(transcript: string | undefined): number {
  try {
    for (const line of readFileSync(transcript ?? '', 'utf8').split('\n', 50)) {
      if (!line.trim()) continue;
      try {
        const at = Date.parse((JSON.parse(line) as { timestamp?: string }).timestamp ?? '');
        if (at) return at;
      } catch {}
    }
  } catch {}
  return Date.now() - 3 * 3600_000;
}

/** The paths in `git status --porcelain -z`, exactly as Git has them. A rename or copy counts under its new name. */
function porcelain(out: string): string[] {
  const entries = out.split('\0');
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    paths.push(entry.slice(3));
    // Renames and copies carry their source path as the next entry.
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') i++;
  }
  return paths;
}
