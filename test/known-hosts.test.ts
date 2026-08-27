import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertHostTrustReady,
  createHostVerifier,
  loadOpenSshHostTrust,
  normalizeStrictHostKeyChecking,
  parseSshKeygenOutput,
} from '../src/known-hosts.js';

describe('OpenSSH known_hosts verification', () => {
  it('parses ordinary, hashed, revoked, and CA rows from ssh-keygen -F', () => {
    const trusted = Buffer.from('trusted-key').toString('base64');
    const hashed = Buffer.from('hashed-key').toString('base64');
    const revoked = Buffer.from('revoked-key').toString('base64');
    const ca = Buffer.from('ca-key').toString('base64');
    const parsed = parseSshKeygenOutput(`
# Host dev found: line 1
dev ssh-ed25519 ${trusted}
|1|salt|hash ssh-rsa ${hashed}
@revoked dev ssh-ed25519 ${revoked}
@cert-authority *.example.com ssh-ed25519 ${ca}
`);
    expect([...parsed.trustedKeys]).toEqual([trusted, hashed]);
    expect([...parsed.revokedKeys]).toEqual([revoked]);
    expect(parsed.certificateAuthorities).toBe(1);
  });

  it('loads the effective non-default-port lookup through ssh-keygen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-known-hosts-'));
    try {
      const file = join(root, 'known_hosts');
      writeFileSync(file, 'fixture');
      const encoded = Buffer.from('server-key').toString('base64');
      const calls: Array<[string, string]> = [];
      const trust = await loadOpenSshHostTrust({
        hostName: '127.0.0.1',
        port: 2222,
        strictHostKeyChecking: 'ask',
        userKnownHostsFiles: [file],
        globalKnownHostsFiles: [],
      }, 'alias', 22, async (lookup, receivedFile) => {
        calls.push([lookup, receivedFile]);
        return { code: 0, stdout: `[127.0.0.1]:2222 ssh-ed25519 ${encoded}\n`, stderr: '' };
      });
      expect(calls).toEqual([["[127.0.0.1]:2222", file]]);
      expect(createHostVerifier(trust)(Buffer.from('server-key'))).toBe(true);
      expect(createHostVerifier(trust)(Buffer.from('attacker-key'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed for an unknown host unless OpenSSH explicitly disables checking', () => {
    const base = {
      lookup: 'dev.example.com',
      trustedKeys: new Set<string>(),
      revokedKeys: new Set<string>(),
      certificateAuthorities: 0,
      files: [] as string[],
    };
    expect(() => assertHostTrustReady({ ...base, policy: 'ask' }, 'dev')).toThrow(/ssh dev/u);
    expect(() => assertHostTrustReady({ ...base, policy: 'yes' }, 'dev')).toThrow(/not trusted/u);
    expect(() => assertHostTrustReady({ ...base, policy: 'no' }, 'dev')).not.toThrow();
    expect(createHostVerifier({ ...base, policy: 'no' })(Buffer.from('unknown'))).toBe(true);
  });

  it('normalizes OpenSSH boolean spellings', () => {
    expect(normalizeStrictHostKeyChecking(undefined)).toBe('ask');
    expect(normalizeStrictHostKeyChecking('true')).toBe('yes');
    expect(normalizeStrictHostKeyChecking('off')).toBe('no');
    expect(normalizeStrictHostKeyChecking('accept-new')).toBe('accept-new');
  });
});
