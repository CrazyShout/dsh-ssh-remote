// Opt-in integration check: creates and removes ONLY a fresh /tmp test directory
// on the explicitly supplied SSH alias. No user workspaces or config are changed.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { HelperRemoteFileSystem } from '../lib/helper-fs.js';
import { installRemoteShellRouter } from '../lib/helper-shell.js';
import { buildRemoteSshInvocation } from '../lib/runtime-router.js';
import { RemoteTerminalBackend } from '../lib/terminal.js';

const alias = process.argv[2];
if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(alias)) throw new Error('Usage: node scripts/smoke-remote.mjs <explicit-ssh-alias>');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30_000 });
const root = ssh('mktemp -d /tmp/dsh-ssh-smoke.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-ssh-smoke\.[a-zA-Z0-9]{8}$/);
const uri = `ssh://${alias}${root}`;
const manager = new RemoteHelperManager({ aliasValidator: candidate => candidate === alias, healthIntervalMs: 0 });
const report = { alias, checks: {}, startedAt: new Date().toISOString() };
const terminals = [];
let restoreShell;
try {
  const client = await manager.client(alias);
  assert.equal(manager.status(alias).environment?.search.available, true, 'remote login PATH must provide rg');
  report.checks.environment = manager.status(alias).environment;
  report.helperVersion = manager.status(alias).helperVersion;
  report.helperSha256 = manager.status(alias).helperSha256;
  const fs = new HelperRemoteFileSystem(manager, path => path === '/smoke-anchor' ? uri : undefined);
  const target = await fs.resolve(`${uri}/中文 space.txt`);
  const policy = { mode: 'workspace-write', workspaceRoot: '/smoke-anchor' };
  const contents = 'remote-read-write-marker\n中文 text\n';
  await fs.writeText(target, contents, { kind: 'createIfAbsent' }, undefined, policy);
  assert.equal(await fs.readText(target), contents);
  assert.equal(Buffer.from(await fs.readByteRange(target, { offset: 0, length: 6 })).toString(), 'remote');
  const observed = await fs.stat(target);
  await fs.writeText(target, contents + 'updated\n', { kind: 'replaceIfVersion', version: observed.version }, undefined, policy);
  await assert.rejects(fs.writeText(target, 'stale', { version: observed.version }, undefined, policy), error => error.code === 'FS_STALE_VERSION');
  assert.equal((await fs.listDir(await fs.resolve(uri))).length, 1);
  report.checks.files = true;

  const localSentinel = { local: true };
  const shell = { execute: async () => localSentinel };
  restoreShell = installRemoteShellRouter(shell, manager, path => path === '/smoke-anchor' ? uri : undefined);
  assert.equal(await shell.execute({ workdir: '/local' }), localSentinel);
  for (const mode of ['danger-full-access', 'workspace-write', 'read-only']) {
    console.error(`Checking shell ${mode}`);
    const command = mode === 'workspace-write'
      ? "printf sandbox > sandbox-proof; printf 'DSH_SHELL_OK'; pwd"
      : "printf 'DSH_SHELL_OK'; pwd";
    const execution = await shell.execute({ command, workdir: uri, timeoutMs: 10_000, stdoutMaxBytes: 2 * 1024 * 1024,
      sandboxPolicy: { mode, workspaceRoot: '/smoke-anchor' } });
    const result = await execution.result();
    assert.equal(result.exitCode, 0, JSON.stringify(result));
    assert.match(result.stdout.text, /DSH_SHELL_OK/);
    report.checks[`shell:${mode}`] = true;
  }
  const large = await (await shell.execute({ command: "python3 -c \"import sys;sys.stdout.write('x'*1048576+'END_MARKER')\"",
    workdir: uri, timeoutMs: 10_000, stdoutMaxBytes: 2 * 1024 * 1024,
    sandboxPolicy: { mode: 'workspace-write', workspaceRoot: '/smoke-anchor' } })).result();
  assert.equal(large.stdout.text.length, 1048576 + 10);
  assert.ok(large.stdout.text.endsWith('END_MARKER'));
  assert.equal(large.stdout.truncated, false);
  const cancelled = await (await shell.execute({ command: 'sleep 20 & exit 0', workdir: uri, timeoutMs: 250,
    stdoutMaxBytes: 65536, sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/smoke-anchor' } })).result();
  assert.equal(cancelled.timedOut, true);
  report.checks.outputAndCancellation = true;

  // Exercise the exact argv seam used by DSH glob/grep, including exit 1/2.
  const rg = args => {
    const invocation = buildRemoteSshInvocation(uri, ['/test/node_modules/@vscode/ripgrep/bin/rg', ...args], undefined, false);
    return spawnSync(invocation[0], invocation.slice(1), { encoding: 'utf8', timeout: 20_000 });
  };
  const matching = rg(['--json', '--regexp=remote-read-write-marker']);
  assert.equal(matching.status, 0, matching.stderr);
  assert.match(matching.stdout, /match/);
  assert.equal(rg(['--json', '--regexp=NEVER_MATCH_DSH_MARKER']).status, 1);
  assert.equal(rg(['--json', '--regexp=[']).status, 2);
  report.checks.search = true;

  for (const mode of ['danger-full-access', 'workspace-write', 'read-only']) {
    console.error(`Checking PTY ${mode}`);
    const backend = new RemoteTerminalBackend(manager, path => path === '/smoke-anchor' ? uri : undefined,
      { resolve: () => ({ mode, workspaceRoot: '/smoke-anchor' }) });
    const session = await backend.spawn({ sessionId: randomUUID(), cwd: uri, owner: { session: {} } });
    terminals.push(session);
    const send = session.startSend({ text: "printf 'DSH_PTY_OK\\n'", submit: true });
    const result = await send.done;
    assert.match(result.viewport, /DSH_PTY_OK/);
    await session.resize(30, 100);
    await session.close('smoke complete');
    report.checks[`pty:${mode}`] = true;
  }

  const workspaceId = randomUUID();
  const processId = randomUUID();
  await client.call('workspace/open', { path: root, access: 'danger-full-access', workspaceId, operationId: randomUUID() }, { mutation: true });
  await client.call('process/start', { workspaceId, processId, argv: ['/bin/sh', '-c', "sleep 1; printf RESUME_OK"], operationId: randomUUID() }, { mutation: true });
  // Kill only the connector created by THIS manager; its private daemon retains
  // the task. The facade must resume the same authenticated helper session.
  const entry = manager.entries.get(alias);
  const oldClient = entry.client;
  entry.child.kill('SIGTERM');
  await oldClient.closed;
  let cursor = '0';
  let output = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const read = await client.call('process/read', { processId, afterSeq: cursor, waitMs: 500 });
    cursor = read.nextSeq;
    output += read.chunks.map(chunk => Buffer.from(chunk.data, 'base64').toString()).join('');
    if (read.exited) break;
  }
  assert.equal(output, 'RESUME_OK');
  assert.equal(client.session.resumed, true);
  report.checks.resume = true;
  await client.call('process/release', { processId, operationId: randomUUID() }, { mutation: true });
  await client.call('workspace/close', { workspaceId, operationId: randomUUID() }, { mutation: true });
} finally {
  await Promise.allSettled(terminals.map(session => session.close('smoke cleanup')));
  restoreShell?.();
  await manager.dispose();
  // The regex above and mktemp provenance are required before this cleanup.
  ssh(`rm -rf -- ${quote(root)}`);
}
report.completedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
