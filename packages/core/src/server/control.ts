// Start, stop and check an app's server: for the bridge, and for `pnpm app <command>` through the app's
// server/control.ts (two lines: defineApp, then controlCli). Never writes to stdout: the bridge's stdout is the MCP
// channel.
//
// The live instance goes through systemd when <name>.service is installed (install-service.sh). That service may run
// another checkout of the code (the release copy, release.ts), so `start --build` refuses to build here for it. A dev
// instance (<PREFIX>_INSTANCE=dev) never touches systemd. From Galen's server/control.ts.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { App } from './app.ts';
import { listenerOwner } from './peer.ts';

export interface Health {
  ok: boolean;
  app?: string;
  instance?: string;
  root?: string;
  /** The commit it runs (since 0.7.1). */
  commit?: string;
  pid?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createControl(app: App) {
  const systemctl = (...args: string[]) => spawnSync('systemctl', ['--user', ...args, app.service], { stdio: 'ignore' }).status === 0;
  const serviceEnabled = () => app.instance === 'live' && systemctl('is-enabled', '--quiet');

  /** The checkout the service runs, from its WorkingDirectory. */
  function serviceRoot(): string | undefined {
    const out = spawnSync('systemctl', ['--user', 'show', '--property=WorkingDirectory', '--value', app.service], { encoding: 'utf8' });
    return out.status === 0 && out.stdout.trim() ? out.stdout.trim() : undefined;
  }

  /** What the running server says about itself, or null when nothing answers on the port (or someone else does). */
  async function health(): Promise<Health | null> {
    // 127.0.0.1, not localhost: localhost resolves to ::1 first, where another user could be listening.
    // And only a server this user runs: another account listening on the port first is not the app (peer.ts).
    const owner = listenerOwner(app.port);
    if (owner !== undefined && owner !== process.getuid?.()) {
      console.error(`${app.title}: port ${app.port} is held by another user (uid ${owner}); not talking to it.`);
      return null;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${app.port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (!res.ok) return null;
      const h = (await res.json()) as Health;
      // Another app of the saga on this port is not this one.
      return h.app === undefined || h.app === app.name ? h : null;
    } catch {
      return null;
    }
  }

  const isRunning = async () => Boolean(await health());

  /** Builds the interface into dist/ui of this checkout. */
  function build(stdio: 'inherit' | number = 'inherit') {
    return (
      spawnSync(process.execPath, [path.join(app.root, 'node_modules/vite/bin/vite.js'), 'build'], {
        cwd: app.root,
        stdio: ['ignore', stdio, stdio],
      }).status === 0
    );
  }

  /** Starts the server (through systemd when the service is installed) and waits up to 5 seconds for it to answer. */
  async function start(): Promise<boolean> {
    if (await isRunning()) return true;
    mkdirSync(app.stateDir, { recursive: true });
    const log = openSync(app.logFile, 'a');
    if (serviceEnabled()) systemctl('start');
    else {
      if (!existsSync(path.join(app.uiDir, 'index.html'))) build(log);
      spawn(process.execPath, [path.join(app.root, 'server/index.ts')], {
        cwd: app.root,
        detached: true,
        stdio: ['ignore', log, log],
        // Node keeps the compiled server in the state folder: a restart starts about a third faster.
        env: { ...process.env, NODE_COMPILE_CACHE: path.join(app.stateDir, 'compile-cache') },
      }).unref();
    }
    for (let i = 0; i < 50; i++) {
      if (await isRunning()) return true;
      await sleep(100);
    }
    return false;
  }

  /** Stops the server, through systemd or by the pid it wrote, and waits for it to go quiet. */
  async function stop(): Promise<void> {
    if (serviceEnabled()) {
      systemctl('stop');
      return;
    }
    let pid: number;
    try {
      pid = Number(readFileSync(app.pidFile, 'utf8'));
    } catch {
      return;
    }
    // A pid file left by a crash may name some other process by now: only ever signal this app's server.
    if (!isServer(pid)) return;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }
    for (let i = 0; i < 50 && (await isRunning()); i++) await sleep(100);
  }

  /** Whether `pid` runs this checkout's server/index.ts; true where that can't be read. */
  function isServer(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('server/index.ts');
    } catch (err) {
      return (err as NodeJS.ErrnoException).code !== 'ENOENT';
    }
  }

  return { health, build, start, stop, serviceEnabled, serviceRoot };
}

/** `pnpm app [status|start|restart|stop] [--build]`. */
export async function controlCli(app: App, argv = process.argv.slice(2)) {
  const control = createControl(app);
  const [command = 'status', flag] = argv;
  const say = (m: string) => console.error(m);
  const where = `${app.url} (http://127.0.0.1:${app.port})`;
  const runs = control.serviceEnabled() ? control.serviceRoot() : undefined;

  if (command === 'start' || command === 'restart') {
    if (flag === '--build') {
      // Building here only changes what runs when this checkout is the one being served.
      if (runs && path.resolve(runs) !== app.root) {
        say(`The live app runs the release copy in ${runs}, not this checkout.`);
        say('To ship what is committed here: pnpm release. To try changes first: pnpm dev.');
        process.exit(1);
      }
      if (!control.build()) process.exit(1);
    }
    if (command === 'restart') await control.stop();
    say((await control.start()) ? `Running at ${where}` : `Failed to start; see ${app.logFile}`);
  } else if (command === 'stop') {
    await control.stop();
    say('Stopped');
  } else {
    const h = await control.health();
    if (!h) say('Not running');
    else say(`Running at ${where}: ${h.instance ?? 'live'} instance, code in ${h.root ?? '?'}${runs ? ' (systemd)' : ''}`);
  }
}
