import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validatePackage } from '../scripts/pack-release.mjs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const targets = (value: unknown): string[] => typeof value === 'string' ? [value.replace(/^\.\//u, '')]
  : value && typeof value === 'object' ? Object.values(value).flatMap(targets) : [];
const files = [manifest.main, manifest.types, ...targets(manifest.exports), 'cordis.patch.yml',
  'README.md', 'README.en.md', 'CHANGELOG.md', 'docs/TROUBLESHOOTING.md', 'docs/TECHNICAL.md', 'docs/RELEASING.md',
  'helper/dsh_remote_helper.py', 'helper/dsh_transfer.py', 'helper/dsh_terminal_state.py', 'helper/PROTOCOL.md'];

describe('release archive validation', () => {
  it('rejects mismatched release versions and missing bundled helper extensions', () => {
    expect(() => validatePackage(manifest, files, '0.10.1')).toThrow('versions differ');
    for (const missing of ['helper/dsh_transfer.py', 'helper/dsh_terminal_state.py', 'lib/client.js']) {
      expect(() => validatePackage(manifest, files.filter(path => path !== missing))).toThrow('Missing release asset');
    }
    expect(() => validatePackage(manifest, files)).not.toThrow();
  });

  it('rejects a package requiring install-time compilation or containing a linked dependency tree', () => {
    expect(() => validatePackage({ ...manifest, scripts: { ...manifest.scripts, prepare: 'npm run build' } }, files)).toThrow('install lifecycle');
    expect(() => validatePackage(manifest, [...files, 'node_modules/private-package/index.js'])).toThrow();
  });
});
