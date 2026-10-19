/** Private E2E fixture: candidate code under a prerelease version so a real public stable release can be offered. Never publish this archive. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { package: { type: 'string' }, base: { type: 'string' }, out: { type: 'string' } } });
assert(values.package && values.base && /^\d+\.\d+\.\d+$/u.test(values.base), 'Use --package <candidate.tgz> --base <existing-stable-version> [--out <new-directory>]');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-update-probe-')));
const output = values.out ? resolve(values.out) : join(root, 'archive');
mkdirSync(output, { recursive: true, mode: 0o700 });
execFileSync('tar', ['-xzf', resolve(values.package), '-C', root]);
const source = join(root, 'package');
const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'dsh-ssh-remote');
const candidateVersion = manifest.version;
manifest.version = `${values.base}-update-probe.0`;
for (const name of ['install', 'postinstall', 'prepare']) assert(!manifest.scripts?.[name]);
writeFileSync(join(source, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], { cwd: source, encoding: 'utf8' }));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const report = { privateProbe: true, candidateVersion, probeVersion: manifest.version, targetPublicVersion: values.base,
  archive: join(output, packed.filename), clientSha256: hash(join(source, 'lib/client.js')),
  explanation: 'Only package.json version differs from the candidate. This tests the new updater, not a claim that older public versions had it.' };
writeFileSync(join(output, 'probe-manifest.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
