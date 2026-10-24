import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildRemoteSshInvocation } from '../src/runtime-router.js';

it('keeps native recursive and explicit grep from reading control credentials, including symlink targets', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-search-private-')));
  const binary = '/app/node_modules/@vscode/ripgrep/bin/rg';
  try {
    const credential = join(root, 'daemon-fixture.sock.auth');
    await writeFile(credential, 'CONTROL_CREDENTIAL\n');
    await writeFile(join(root, '中文 user file.txt'), 'PUBLIC_MARKER\n');
    await symlink(credential, join(root, 'innocent-name'));
    const search = (pattern: string, path = '.', extra: string[] = []) => {
      const invocation = buildRemoteSshInvocation(`ssh://fixture${root}`, [binary, '--no-config', '--json',
        `--regexp=${pattern}`, ...extra, '--', path], undefined, false);
      return spawnSync('/bin/sh', ['-c', invocation.at(-1)!], { encoding: 'utf8', timeout: 5000 });
    };
    const ordinary = search('PUBLIC_MARKER');
    expect(ordinary.status, ordinary.stderr).toBe(0);
    expect(ordinary.stdout).toContain('PUBLIC_MARKER');
    for (const extra of [[], ['--glob=*.sock.auth']]) {
      const hidden = search('CONTROL_CREDENTIAL', '.', extra);
      expect(hidden.status, hidden.stderr).toBe(1);
      expect(hidden.stdout).not.toContain('CONTROL_CREDENTIAL');
    }
    for (const path of [credential, 'innocent-name']) {
      const denied = search('.', path);
      expect(denied.status).toBe(1);
      expect(denied.stderr).toContain('control credentials are private');
      expect(denied.stdout).toBe('');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
