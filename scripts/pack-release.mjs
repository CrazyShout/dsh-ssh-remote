import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadHelperAsset } from '../lib/helper/installer.js';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const expectedHelperSha256 = '8bb08ba35d929bcc964eb9bc3af7dc390501e55e984f6e1e06b6220e453816d8';

function exportPaths(value) {
  if (typeof value === 'string') return [value.replace(/^\.\//u, '')];
  return value && typeof value === 'object' ? Object.values(value).flatMap(exportPaths) : [];
}

export function validatePackage(manifest, files, expectedVersion = manifest.version) {
  assert.equal(manifest.name, 'dsh-ssh-remote');
  assert.match(expectedVersion, /^\d+\.\d+\.\d+$/u, 'Use a complete stable release version');
  assert.equal(manifest.version, expectedVersion, 'Release and package versions differ');
  const shipped = new Set(files);
  for (const path of [manifest.main, manifest.types, ...exportPaths(manifest.exports),
    manifest.dsh.bundle.patch.replace(/^\.\//u, ''), 'README.md', 'README.en.md', 'CHANGELOG.md',
    'docs/TROUBLESHOOTING.md', 'docs/TECHNICAL.md', 'docs/RELEASING.md',
    'helper/dsh_remote_helper.py', 'helper/dsh_transfer.py', 'helper/dsh_terminal_state.py', 'helper/PROTOCOL.md']) {
    assert(shipped.has(path), `Missing release asset: ${path}`);
  }
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) {
    assert.equal(manifest.scripts?.[name], undefined, `Unexpected install lifecycle: ${name}`);
  }
  assert(!files.some(path => path.startsWith('node_modules/') || path.startsWith('src/') || path.startsWith('test/')));
  assert(!manifest.dependencies?.ssh2 && !manifest.dependencies?.['cpu-features'], 'Legacy native SSH dependencies must not return');
  assert(!shipped.has('lib/connection.js') && !shipped.has('lib/fs.js'), 'Legacy SFTP runtime must not ship');
}

export function packRelease({ output = join(repositoryRoot, 'dist'), version } = {}) {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
  const target = resolve(output);
  mkdirSync(target, { recursive: true });
  const archiveName = `${manifest.name}-${manifest.version}.tgz`;
  assert(!existsSync(join(target, archiveName)), `Refusing to replace ${archiveName}; use a new output directory`);
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', target], {
    cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000,
  }));
  validatePackage(manifest, packed.files.map(file => file.path), version);
  const helper = loadHelperAsset();
  assert.equal(helper.sha256, expectedHelperSha256, 'Helper asset differs from the reviewed 0.13.1 build');
  const archive = join(target, packed.filename);
  const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
  const report = { name: manifest.name, version: manifest.version, filename: packed.filename,
    sha256, size: packed.size, unpackedSize: packed.unpackedSize, entryCount: packed.entryCount,
    dshVersion: '0.2.0-rc.2', dshVersions: ['0.2.0-rc.2', '0.2.1-rc.2'], helperVersion: '0.13.1', helperSha256: helper.sha256,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim() };
  writeFileSync(join(target, 'SHA256SUMS'), `${sha256}  ${packed.filename}\n`);
  writeFileSync(join(target, 'release-manifest.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { out: { type: 'string' }, version: { type: 'string' } } });
  console.log(JSON.stringify(packRelease({ output: values.out, version: values.version }), null, 2));
}
