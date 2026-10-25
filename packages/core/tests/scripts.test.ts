// The shell scripts read app.json: tls.sh makes an authority that can sign only the app's name, and setup-hostname.sh
// --print says what root would write, from the same file. Neither needs root here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPTS = path.resolve(import.meta.dirname, '../scripts');

async function root(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'organon-scripts-'));
  await writeFile(
    path.join(dir, 'app.json'),
    JSON.stringify({
      name: 'argus',
      title: 'Argus',
      hostname: 'argus.test',
      loopback: '127.0.0.84',
      ports: { live: 4930, dev: 4940, tls: 4931, vite: 5203 },
    }),
  );
  return dir;
}

test('tls.sh: an authority limited to the app’s name, and a server certificate for it that verifies', async () => {
  const dir = await root();
  execFileSync('bash', [path.join(SCRIPTS, 'tls.sh'), dir], { stdio: 'pipe' });
  const tls = path.join(dir, '.argus/tls');
  assert.ok(existsSync(path.join(tls, 'server.crt')));
  const constraints = execFileSync('openssl', ['x509', '-in', path.join(tls, 'ca.crt'), '-noout', '-ext', 'nameConstraints'], {
    encoding: 'utf8',
  });
  assert.match(constraints, /critical/);
  assert.match(constraints, /DNS:argus\.test/);
  const san = execFileSync('openssl', ['x509', '-in', path.join(tls, 'server.crt'), '-noout', '-ext', 'subjectAltName'], {
    encoding: 'utf8',
  });
  assert.match(san, /DNS:argus\.test/);
});

test('setup-hostname.sh --print: the hosts line, the nft redirects and the unit, from app.json', async () => {
  const dir = await root();
  const out = execFileSync('bash', [path.join(SCRIPTS, 'setup-hostname.sh'), dir, '--print'], { encoding: 'utf8' });
  assert.match(out, /^127\.0\.0\.84 argus\.test$/m);
  assert.match(out, /ip daddr 127\.0\.0\.84 tcp dport 80 redirect to :4930/);
  assert.match(out, /ip daddr 127\.0\.0\.84 tcp dport 443 redirect to :4931/);
  assert.match(out, /ExecStart=\/usr\/bin\/nft -f \/etc\/argus\.nft/);
});

test('A bad app.json stops the scripts before anything is written', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'organon-scripts-'));
  await writeFile(
    path.join(dir, 'app.json'),
    JSON.stringify({ name: 'x; rm -rf ~', title: 'X', hostname: 'x.test', loopback: '127.0.0.9', ports: {} }),
  );
  assert.throws(() => execFileSync('bash', [path.join(SCRIPTS, 'setup-hostname.sh'), dir, '--print'], { stdio: 'pipe' }));
});
