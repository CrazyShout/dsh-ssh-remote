import { describe, expect, it } from 'vitest';
import { formatSshUri, parseSshUri } from '../src/types.js';
import { parseSshConfig, resolveSshAlias } from '../src/ssh-config.js';

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
    });
  });

  it('returns undefined for an unknown alias', () => {
    expect(resolveSshAlias('nope', [])).toBeUndefined();
  });
});
