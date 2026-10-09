import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function exportTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value.replace(/^\.\//, '')];
  if (value && typeof value === 'object') return Object.values(value).flatMap(exportTargets);
  return [];
}

describe('Git installation package contract', () => {
  let cache: string;
  let packed: Set<string>;

  beforeAll(() => {
    cache = mkdtempSync(join(tmpdir(), 'dsh-package-contract-'));
    // No network, lifecycle execution, tarball, or writes to the checkout.
    const result = execFileSync('npm', [
      'pack', '--dry-run', '--ignore-scripts', '--json', '--offline', '--cache', cache,
    ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    const [pack] = JSON.parse(result) as { files: { path: string }[] }[];
    packed = new Set(pack.files.map(file => file.path));
  }, 25_000);

  afterAll(() => {
    if (cache) rmSync(cache, { recursive: true, force: true });
  });

  it('ships every public entry point, the bundle patch, and the helper without a build', () => {
    const required = [
      manifest.main, manifest.types,
      ...exportTargets(manifest.exports),
      manifest.dsh.bundle.patch.replace(/^\.\//, ''),
      'helper/dsh_remote_helper.py', 'helper/PROTOCOL.md',
    ];
    for (const path of required) {
      expect(packed.has(path), `Missing packed runtime asset: ${path}`).toBe(true);
    }
  });

  it('requires no lifecycle build or implicit node-gyp install', () => {
    for (const script of [
      'preinstall', 'install', 'postinstall', 'prepare',
      'prepublish', 'prepublishOnly', 'prepack', 'postpack',
    ]) {
      expect(manifest.scripts?.[script], `Install-time lifecycle: ${script}`).toBeUndefined();
    }
    expect(packed.has('binding.gyp')).toBe(false);
    expect([...packed].some(path => path.startsWith('node_modules/'))).toBe(false);
  });

  it('keeps the tested DSH SDK floor explicit instead of accepting old engines', () => {
    const peers = Object.entries(manifest.peerDependencies)
      .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'));
    expect(peers.length).toBeGreaterThan(0);
    for (const [name, range] of peers) {
      expect(range, name).toBe('>=0.2.0-rc.2 <0.3.0');
      expect(manifest.devDependencies[name], name).toBe('0.2.0-rc.2');
    }
  });
});
