// What an app tells the core about itself, said once in app.json at its root and read by the server (defineApp), the
// bridge, control and release, and the shell scripts (tls.sh, setup-hostname.sh, install-service.sh):
//
//   { "name": "argus", "title": "Argus", "hostname": "argus.test", "loopback": "127.0.0.84",
//     "ports": { "live": 4930, "dev": 4940, "tls": 4931, "vite": 5203 }, "defaultAccent": "blue" }
//
// From Aristotle's and Galen's server/config.ts, which were the same file with other names, ports and loopback
// addresses. Every value an instance needs to differ in comes from <PREFIX>_* in the environment (ARGUS_PORT,
// ARGUS_DATA_DIR…), as there: the tests and the release copy point an instance at other ports and folders that way.
// What an app adds of its own (the paths of its records in data/) stays in its config.ts, built on this.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type Accent, isAccent } from '../shared/accents.ts';

/** app.json, as an app writes it. */
export interface AppJson {
  /** Lower case, one word: the service (argus.service), the state folder (.argus), the env prefix (ARGUS_). */
  name: string;
  /** As people read it: "Argus". */
  title: string;
  /** The clean name, under .test: "argus.test". */
  hostname: string;
  /** The app's own loopback address, which setup-hostname.sh maps the clean name to (127.0.0.80 and up). */
  loopback: string;
  ports: { live: number; dev: number; tls: number; vite: number };
  defaultAccent?: Accent;
}

export interface App {
  readonly name: string;
  readonly title: string;
  /** The env prefix: ARGUS for argus. */
  readonly prefix: string;
  /** The checkout this instance runs from. */
  readonly root: string;
  /** `live` is the one he uses; `dev` the one changed (pnpm dev, the tests): its own port and folders, no TLS. */
  readonly instance: 'live' | 'dev';
  readonly dev: boolean;
  /** The only addresses the server listens on: loopback, and ::1 held so no other user answers "localhost". */
  readonly host: '127.0.0.1';
  readonly host6: '::1';
  readonly port: number;
  readonly tlsPort: number;
  /** The Vite dev server's port, which proxies /api and /mcp to the dev server. */
  readonly vitePort: number;
  readonly hostname: string;
  readonly loopback: string;
  /** The records: data/ (live) or .dev/data. Never in the app's Git; an app may keep its own repository there. */
  readonly dataDir: string;
  /** What isn't a record: settings.json, the certificate, pid files, the log. .<name>/ (live) or .dev/state. */
  readonly stateDir: string;
  readonly settingsFile: string;
  readonly uiDir: string;
  readonly tlsDir: string;
  /** HTTPS on its own port when tls.sh made a certificate; never in dev. */
  readonly tlsEnabled: boolean;
  /** setup-hostname.sh put the authority in the trust store: only then does http:// move to https://. */
  readonly tlsTrusted: boolean;
  /** The clean name leads here (/etc/hosts lists it, or there is a certificate); until then it is not trusted. */
  readonly hostnameReady: boolean;
  /** The address to give him: the clean name when it is set up, else localhost and the port. */
  readonly url: string;
  /** The exact Host headers this server answers (DNS rebinding: a page on another name gets nothing). */
  readonly allowedHosts: ReadonlySet<string>;
  /** The exact origins of the app's own pages; every other page is refused (CSRF). */
  readonly allowedOrigins: ReadonlySet<string>;
  /** One pid file per port, so a test server never touches the real one's. */
  readonly pidFile: string;
  readonly logFile: string;
  /** The systemd user unit install-service.sh writes, only ever the live instance's. */
  readonly service: string;
  /** Where the release copy lives: a Git worktree of the app that the live service runs. */
  readonly releaseDir: string;
  readonly defaultAccent: Accent;
  /** The key from <PREFIX>_API_KEY, for the model API (settings.ts). */
  readonly apiKey: string | undefined;
  /** <PREFIX>_<key> from the environment the app was defined with. */
  env(key: string): string | undefined;
}

export class AppJsonError extends Error {}

/** app.json at `root`, checked: a wrong one stops the app at start, with what is wrong. */
export function readAppJson(root: string): AppJson {
  const file = path.join(root, 'app.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new AppJsonError(`${file} could not be read: ${(err as Error).message}`);
  }
  const j = raw as Partial<AppJson>;
  const wrong = (what: string) => new AppJsonError(`${file}: ${what}`);
  if (typeof j.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(j.name)) throw wrong('"name" is one lower-case word');
  if (typeof j.title !== 'string' || !j.title.trim()) throw wrong('"title" is the name as people read it');
  if (typeof j.hostname !== 'string' || !/^[a-z0-9-]+\.test$/.test(j.hostname)) throw wrong('"hostname" is a name under .test');
  if (typeof j.loopback !== 'string' || !/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(j.loopback) || j.loopback === '127.0.0.1')
    throw wrong('"loopback" is a 127.x.y.z address of its own, not 127.0.0.1');
  const ports = j.ports as Partial<AppJson['ports']> | undefined;
  for (const k of ['live', 'dev', 'tls', 'vite'] as const) {
    const p = ports?.[k];
    if (!Number.isInteger(p) || (p as number) < 1024 || (p as number) > 65535) throw wrong(`"ports.${k}" is a port from 1024 to 65535`);
  }
  if (j.defaultAccent !== undefined && !isAccent(j.defaultAccent)) throw wrong('"defaultAccent" is one of the core\'s accents');
  return j as AppJson;
}

/** The app at `root` (its app.json), as this instance runs it: `env` decides the instance, ports and folders. */
export function defineApp(root: string, env: NodeJS.ProcessEnv = process.env): App {
  const json = readAppJson(root);
  const prefix = json.name.toUpperCase().replace(/-/g, '_');
  const get = (key: string) => env[`${prefix}_${key}`] || undefined;
  const dev = get('INSTANCE') === 'dev';
  const port = Number(get('PORT') ?? (dev ? json.ports.dev : json.ports.live));
  const vitePort = Number(get('VITE_PORT') ?? json.ports.vite);
  const tlsPort = Number(get('TLS_PORT') ?? json.ports.tls);
  const hostname = get('HOSTNAME') ?? json.hostname;
  const stateDir = get('STATE_DIR') ?? path.join(root, dev ? '.dev/state' : `.${json.name}`);
  const tlsDir = get('TLS_DIR') ?? path.join(stateDir, 'tls');
  const tlsEnabled = !dev && existsSync(path.join(tlsDir, 'server.crt'));
  const tlsTrusted = tlsEnabled && existsSync(path.join(tlsDir, 'installed'));
  const hostnameReady = !dev && (tlsEnabled || hostsLists(hostname));
  const local = (scheme: string, p: number) => [`${scheme}localhost:${p}`, `${scheme}127.0.0.1:${p}`];
  return {
    name: json.name,
    title: json.title,
    prefix,
    root,
    instance: dev ? 'dev' : 'live',
    dev,
    host: '127.0.0.1',
    host6: '::1',
    port,
    tlsPort,
    vitePort,
    hostname,
    loopback: json.loopback,
    dataDir: get('DATA_DIR') ?? path.join(root, dev ? '.dev/data' : 'data'),
    stateDir,
    settingsFile: get('SETTINGS') ?? path.join(stateDir, 'settings.json'),
    uiDir: path.join(root, 'dist', 'ui'),
    tlsDir,
    tlsEnabled,
    tlsTrusted,
    hostnameReady,
    url: dev ? `http://localhost:${port}` : hostnameReady ? `${tlsTrusted ? 'https' : 'http'}://${hostname}` : `http://localhost:${port}`,
    allowedHosts: new Set([
      ...local('', port),
      ...(dev ? local('', vitePort) : []),
      ...(hostnameReady ? [hostname, `${hostname}:80`] : []),
      ...(hostnameReady && tlsEnabled ? [`${hostname}:443`] : []),
    ]),
    allowedOrigins: new Set([
      ...local('http://', port),
      ...(dev ? local('http://', vitePort) : []),
      ...(hostnameReady ? [`http://${hostname}`] : []),
      ...(hostnameReady && tlsEnabled ? [`https://${hostname}`] : []),
    ]),
    pidFile: path.join(stateDir, `server-${port}.pid`),
    logFile: path.join(stateDir, 'server.log'),
    service: `${json.name}.service`,
    releaseDir: path.resolve(get('RELEASE_DIR') ?? path.join(env.HOME ?? '/', '.local/share', json.name, 'app')),
    defaultAccent: json.defaultAccent ?? 'green',
    apiKey: get('API_KEY'),
    env: get,
  };
}

/** Whether /etc/hosts maps `name` (setup-hostname.sh). */
function hostsLists(name: string): boolean {
  try {
    return readFileSync('/etc/hosts', 'utf8')
      .split('\n')
      .some((line) => line.replace(/#.*/, '').trim().split(/\s+/).slice(1).includes(name));
  } catch {
    return false;
  }
}
