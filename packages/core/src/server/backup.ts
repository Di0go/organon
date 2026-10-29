// Versions an app's data/ in its own Git repository, kept apart from the code so a person's history never lands in
// the app's repository. Once activity has been quiet for a while (or a session ends), commit whatever changed; if that
// repository has a remote (one they set up, private), push it too. When that keeps failing, it is said in the app's
// warnings, where they look.
// Off when data/ isn't a Git repository, in the dev instance, or with <PREFIX>_BACKUP=off.
//
//   const backup = new Backup({ app, warnings, describeChanges: (files) => `${files.length} records` });
//   store.events.on('changed', () => backup.schedule());
//
// From Aristotle's and Galen's server/backup.ts, which were the same but for the commit message's summary of what
// changed (topics and sessions there, days and labs here): that is the app's, `describeChanges(files)`.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { App } from './app.ts';
import type { Warnings } from './warnings.ts';

const run = promisify(execFile);

/** Quiet time after the last change before backing up. */
const QUIET_MS = 10 * 60_000;

export interface BackupOptions {
  /** The app: its data folder, whether this is the dev instance, and <PREFIX>_BACKUP. */
  app: App;
  /** Where a backup that keeps failing is said. */
  warnings: Warnings;
  /**
   * What the commit is about, after "Data: ", from the paths that changed (relative to the data folder, as Git names
   * them): "day 2026-10-18, 1 note". An empty answer, or none given, says how many files changed.
   */
  describeChanges?: (files: string[]) => string;
}

export interface BackupStatus {
  enabled: boolean;
  lastAt?: string;
  lastError?: string;
  /** When the current run of failures began; gone after a run that works. */
  failingSince?: string;
  pending: boolean;
}

export class Backup {
  readonly enabled: boolean;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  /** A run was asked for while one was going: run once more when it ends. */
  private again = false;
  private status: BackupStatus;
  private readonly options: BackupOptions;
  private readonly dir: string;

  constructor(options: BackupOptions) {
    this.options = options;
    this.dir = options.app.dataDir;
    this.enabled = !options.app.dev && options.app.env('BACKUP') !== 'off' && existsSync(path.join(this.dir, '.git'));
    this.status = { enabled: this.enabled, pending: false };
  }

  /** Back up after `delay` ms of quiet; each call restarts the wait. */
  schedule(delay = QUIET_MS) {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.status.pending = true;
    this.timer = setTimeout(() => void this.run(), delay);
    this.timer.unref();
  }

  /** A copy of the status, for the app's /api/backup. */
  state(): BackupStatus {
    return { ...this.status };
  }

  private git(...args: string[]) {
    return run('git', args, { cwd: this.dir, timeout: 60_000 });
  }

  /** Commits whatever changed and pushes it if there is a remote; never two runs at once. */
  private async run() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    const { warnings } = this.options;
    try {
      // Every untracked file by name (not just its folder), so the commit message can name what changed.
      const { stdout } = await this.git('status', '--porcelain', '--untracked-files=all');
      if (stdout.trim()) {
        await this.git('add', '--all');
        await this.git('commit', '--quiet', '-m', `Data: ${this.describe(stdout)}`);
      }
      // Pushed only when the data repository has been given a remote to track.
      const upstream = await this.git('rev-parse', '--abbrev-ref', '@{u}').catch(() => null);
      if (upstream) {
        const ahead = Number((await this.git('rev-list', '--count', '@{u}..HEAD')).stdout.trim());
        if (ahead > 0) await this.git('push', '--quiet');
      }
      this.status = { enabled: true, pending: false, lastAt: new Date().toISOString() };
      warnings.set('backup', undefined);
    } catch (err) {
      const message = (err as { stderr?: string; message: string }).stderr?.trim() || (err as Error).message;
      console.error(`${new Date().toISOString()} Backup failed: ${message}`);
      const since = this.status.failingSince ?? new Date().toISOString();
      this.status = { ...this.status, pending: false, lastError: message, failingSince: since };
      // Said where they look, not only in a log nobody reads: a backup that silently stops is worse than none.
      const when = new Date(since).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      warnings.set('backup', `Backup has failed since ${when}: ${message.split('\n').at(-1)}`);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.schedule(5_000);
      }
    }
  }

  /** The commit's summary from `git status --porcelain` output: the app's words, or a count of files. */
  private describe(porcelain: string): string {
    // Each line is a two-letter status and a space, then the path (quoted when it has unusual characters).
    const files = porcelain
      .split('\n')
      .map((line) => line.slice(3).trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    const said = this.options.describeChanges?.(files).trim();
    if (said) return said;
    return `${files.length} file${files.length === 1 ? '' : 's'}`;
  }
}
