import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildRemoteSshInvocation } from '../src/runtime-router.js';
import { decodeRemoteScript } from './fixtures/remote-script.js';

// Required in the positive Linux sandbox lane; never count an unavailable bwrap
// as success. Only files under this test's mkdtemp root are read or changed.
it.skipIf(process.env.DSH_REQUIRE_BWRAP !== '1')('runs Windows-routed commands with real remote confinement and private control roots', () => {
  expect(process.platform).toBe('linux');
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-routed-sandbox-')));
  // workspace-write deliberately permits its private /tmp. Use an owned,
  // normally writable directory outside /tmp to test the read-only boundary.
  const outsideBase = realpathSync(mkdtempSync(join(homedir(), '.dsh-routed-outside-')));
  const workspace = join(base, 'workspace with space'), runtimeBase = join(workspace, 'runtime');
  const runtime = join(runtimeBase, 'dsh-remote-helper'), auth = join(runtime, 'fixture.sock.auth');
  const anchor = 'C:\\DSH\\anchors\\project';
  mkdirSync(runtime, { recursive: true });
  writeFileSync(auth, 'PRIVATE_CONTROL_FIXTURE', { mode: 0o600 });
  // An importable workspace module must never run in the trusted launcher.
  const escaped = join(base, 'escaped');
  writeFileSync(join(workspace, 'hashlib.py'), `open(${JSON.stringify(escaped)}, 'w').write('escaped')\nraise RuntimeError('workspace import')\n`);
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const run = (mode: string, root: string, command: readonly string[], env: NodeJS.ProcessEnv = {}) => {
    const args = buildRemoteSshInvocation(`ssh://fixture${workspace}`, [
      'C:\\DSH\\DeepSeek Harness.exe', 'C:\\DSH\\node_modules\\@deepseek-ai\\dsh-sandbox-windows-acl\\lib\\runner.js',
      '--workspace', anchor, '--temp', 'C:\\temp', '--mode', mode, '--', ...command,
    ], { DSH_CALLER_NOTE: 'inside-only', ...env }, false, path => path === anchor ? `ssh://fixture${root}` : undefined);
    return spawnSync('/bin/sh', ['-c', decodeRemoteScript(args.at(-1))], {
      encoding: 'utf8', timeout: 10000, cwd: base,
      env: { ...process.env, DSH_REMOTE_HELPER_RUNTIME_DIR: runtimeBase, DSH_AMBIENT_SECRET: 'not-forwarded', PYTHONPATH: workspace },
    });
  };
  try {
    const privateChecks = `set -eu; test ! -e ${quote(auth)}; test "$DSH_CALLER_NOTE" = inside-only; test -z "\${DSH_AMBIENT_SECRET-}"; `;
    for (const mode of ['read-only', 'workspace-write']) {
      const output = run(mode, workspace, ['/bin/sh', '-c', privateChecks + 'printf PRIVATE_HIDDEN']);
      expect(output.status, output.stderr).toBe(0);
      expect(output.stdout).toBe('PRIVATE_HIDDEN');
      expect(existsSync(escaped)).toBe(false);
    }
    const exactTmp = run('workspace-write', '/tmp', ['/bin/sh', '-c', privateChecks + 'printf TMP_HIDDEN']);
    expect(exactTmp.status, exactTmp.stderr).toBe(0);
    expect(exactTmp.stdout).toBe('TMP_HIDDEN');
    const write = run('workspace-write', workspace, ['/bin/sh', '-c', `printf allowed > ${quote(join(workspace, 'written'))}; printf WRITE_OK`]);
    expect(write.status, write.stderr).toBe(0);
    expect(readFileSync(join(workspace, 'written'), 'utf8')).toBe('allowed');
    const forbidden = run('read-only', workspace, ['/bin/sh', '-c', `if printf forbidden > ${quote(join(workspace, 'forbidden'))}; then exit 99; fi`]);
    expect(forbidden.status).toBe(0);
    expect(existsSync(join(workspace, 'forbidden'))).toBe(false);
    const outside = run('workspace-write', workspace, ['/bin/sh', '-c', `if printf forbidden > ${quote(join(outsideBase, 'outside'))}; then exit 99; fi`]);
    expect(outside.status).toBe(0);
    expect(existsSync(join(outsideBase, 'outside'))).toBe(false);
    const env = run('read-only', workspace, ['/bin/sh', '-c', 'printf "%s" "$PATH"'], { PATH: '/payload/only' });
    expect(env.status, env.stderr).toBe(0);
    expect(env.stdout).toBe('/payload/only');
    const missing = run('read-only', workspace, ['/definitely/missing/program']);
    expect(missing.status).not.toBe(0);
    // The extension is a valid POSIX filename, not a Windows host path.
    const executable = join(workspace, 'remote.exe');
    writeFileSync(executable, '#!/bin/sh\nprintf POSIX_EXE\n'); chmodSync(executable, 0o755);
    const posix = run('read-only', workspace, [executable]);
    expect(posix.status, posix.stderr).toBe(0);
    expect(posix.stdout).toBe('POSIX_EXE');
    expect(readFileSync(auth, 'utf8')).toBe('PRIVATE_CONTROL_FIXTURE');
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(outsideBase, { recursive: true, force: true });
  }
}, 30000);
