import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatSshUri, parseSshUri } from '../src/types.js';
import { buildOpenSshJumpArgs } from '../src/connection.js';
import {
  collectSshAliases,
  discoverSshHosts,
  parseOpenSshResolvedConfig,
  parseSshConfig,
  resolveSshAlias,
} from '../src/ssh-config.js';

describe('parseSshUri', () => {
  it('parses a full uri', () => {
    expect(parseSshUri('ssh://bob@host:2222/a/b')).toEqual({
      host: 'host',
      port: 2222,
      user: 'bob',
      path: '/a/b',
    });
  });

  it('defaults port 22 and empty user', () => {
    expect(parseSshUri('ssh://host/')).toEqual({
      host: 'host',
      port: 22,
      user: '',
      path: '/',
    });
  });

  it('round-trips through formatSshUri', () => {
    const uri = 'ssh://bob@host:2222/a/b';
    expect(formatSshUri(parseSshUri(uri))).toBe(uri);
  });
});

describe('parseSshConfig', () => {
  it('resolves concrete aliases and ignores wildcards', () => {
    const hosts = parseSshConfig(`
Host devbox
  HostName dev.example.com
  User you
  Port 2222
  IdentityFile ~/.ssh/id_ed25519

Host *
  User nobody
`);
    expect(hosts).toHaveLength(1);
    expect(resolveSshAlias('devbox', hosts)).toEqual({
      host: 'devbox',
      hostName: 'dev.example.com',
      user: 'you',
      port: 2222,
      identityFile: expect.stringContaining('id_ed25519'),
      identityFiles: [expect.stringContaining('id_ed25519')],
    });
  });

  it('returns undefined for an unknown alias', () => {
    expect(resolveSshAlias('nope', [])).toBeUndefined();
  });

  it('collects concrete aliases recursively through Include files', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-ssh-config-'));
    try {
      mkdirSync(join(root, 'conf.d'));
      writeFileSync(join(root, 'config'), `
Include conf.d/*.conf
Host primary secondary
  HostName primary.example.com
Host *.internal
  User ignored
`);
      writeFileSync(join(root, 'conf.d', 'gpu.conf'), `
Host gpu
  HostName gpu.example.com
Include ../config
`);

      expect(collectSshAliases(join(root, 'config'))).toEqual(['gpu', 'primary', 'secondary']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses effective OpenSSH output including proxy settings', () => {
    expect(parseOpenSshResolvedConfig('devbox', `
host devbox
hostname dev.example.com
user atlas
port 2202
identityfile ~/.ssh/missing
identityfile ~/.ssh/id_ed25519
proxyjump jump-a,jump-b
`)).toEqual({
      host: 'devbox',
      hostName: 'dev.example.com',
      user: 'atlas',
      port: 2202,
      identityFile: expect.stringContaining('/.ssh/missing'),
      identityFiles: [
        expect.stringContaining('/.ssh/missing'),
        expect.stringContaining('/.ssh/id_ed25519'),
      ],
      proxyJump: 'jump-a,jump-b',
      proxyCommand: undefined,
    });
  });

  it('discovers aliases and delegates effective resolution to ssh -G', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-ssh-discovery-'));
    try {
      const configPath = join(root, 'config');
      writeFileSync(configPath, 'Host beta\nHost alpha\n');
      const hosts = await discoverSshHosts(configPath, async (receivedPath, alias) => ({
        code: 0,
        stdout: `hostname ${alias}.example.com\nuser you\nport 22\n`,
        stderr: '',
      }));
      expect(hosts.map((host) => host.host)).toEqual(['alpha', 'beta']);
      expect(hosts.map((host) => host.hostName)).toEqual(['alpha.example.com', 'beta.example.com']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ProxyJump delegation', () => {
  it('builds a multi-hop system OpenSSH forwarding command', () => {
    expect(buildOpenSshJumpArgs('jump-a,jump-b', 'target.internal', 2222)).toEqual([
      '-T',
      '-J',
      'jump-a',
      '-W',
      'target.internal:2222',
      'jump-b',
    ]);
  });
});
