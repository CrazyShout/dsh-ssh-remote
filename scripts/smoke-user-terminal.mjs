// Opt-in: exercise the OFFICIAL user TerminalController against one SSH host.
// Test data is confined to a fresh remote /tmp fixture; never opens a user project.
// The normal user-local versioned helper may also be installed and started.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Context } from '@deepseek-ai/cordis';
import { createScope } from '@deepseek-ai/dsh-scope';
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import { TerminalController } from '@deepseek-ai/dsh-api-terminal-controller';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { HelperRemoteFileSystem } from '../lib/helper-fs.js';
import { installRemoteUserSubprocessRouter } from '../lib/user-subprocess.js';

const alias = process.argv[2];
if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(alias)) throw new Error('Usage: node scripts/smoke-user-terminal.mjs <explicit-ssh-alias>');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30_000 });
const root = ssh('mktemp -d /tmp/dsh-user-terminal-smoke.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-user-terminal-smoke\.[a-zA-Z0-9]{8}$/);
const uri = `ssh://${alias}${root}`;
const anchor = '/dsh-user-terminal-smoke-anchor';
const resolve = path => path === anchor ? uri : undefined;
const manager = new RemoteHelperManager({ aliasValidator: candidate => candidate === alias, healthIntervalMs: 0 });
const report = { alias, startedAt: new Date().toISOString(), checks: {} };
const ctx = new Context();
class MustRouteRemotely extends SubprocessRuntime {
  constructor(context) { super(context); }
  async terminalEnvironment() { throw new Error('incorrect local terminal environment'); }
  async resolveExecutable() { throw new Error('incorrect local executable lookup'); }
  spawn() { throw new Error('unexpected local process spawn'); }
  async spawnTerminal() { throw new Error('incorrect local PTY allocation'); }
}
new MustRouteRemotely(ctx);
ctx.provide('sandboxPolicy', { workspaceRoot: '/fallback', defaultMode: 'read-only' });
// In-process contract fixture only: no live app Session or history is created.
const agent = { id: 'dsh-human-terminal-smoke', session: { header: { cwd: anchor } } };
const agentScope = createScope(ctx, agent); agent.ctx = agentScope.ctx;
ctx.provide('agents', { list: () => [agent], get: id => id === agent.id ? agent : undefined });
const router = installRemoteUserSubprocessRouter(ctx, ctx.get('subprocess'), manager, resolve);
const controller = new TerminalController(ctx, {
  shell: { path: '/bin/bash', name: 'bash', args: ['--noprofile', '--norc', '-i'] },
  shellCandidates: ['/bin/sh', 'bash', 'dsh-nonexistent-shell-smoke'],
  maxTerminals: 4, maxCols: 240, maxRows: 120, scrollback: 200,
  maxBufferedBytes: 2 * 1024 * 1024, maxInputBytes: 64 * 1024, disposeGraceMs: 200,
  unattendedTimeoutMs: 0, activityPollIntervalMs: 1_000, cleanupRetryMs: 1_000,
});
const id = 'smoke-terminal'; const a = 'smoke-attachment-a'; const b = 'smoke-attachment-b';
const firstLifetime = new AbortController(); const secondLifetime = new AbortController();
let firstFollower; let firstPump; let secondFollower; let output = ''; const frames = [];
const waitFor = async (condition, message, timeout = 15_000) => {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
};
try {
  const client = await manager.client(alias);
  const fs = new HelperRemoteFileSystem(manager, resolve);
  await fs.writeText(await fs.resolve(`${uri}/completion-target-file`), 'smoke', { kind: 'createIfAbsent' }, undefined,
    { mode: 'workspace-write', workspaceRoot: anchor });
  const shells = await controller.shells(agent, firstLifetime.signal);
  assert.ok(shells.some(shell => shell.name === 'bash'));
  report.checks.remoteShellDiscovery = true;
  console.error('Checking official human terminal raw interaction');
  const created = await controller.create(agent, { id, cols: 80, rows: 24 }, firstLifetime.signal);
  assert.equal(created.state, 'running');
  assert.deepEqual(await controller.create(agent, { id, cols: 80, rows: 24 }, firstLifetime.signal), created);
  firstFollower = controller.follow(agent, id, a, firstLifetime.signal);
  firstPump = (async () => {
    for await (const frame of firstFollower) {
      frames.push(frame);
      if (frame.type === 'output') output += frame.data;
    }
  })().catch(error => { if (!firstLifetime.signal.aborted) throw error; });
  await waitFor(() => frames[0]?.type === 'snapshot', 'initial terminal snapshot missing');
  await controller.write(agent, id, a, "printf '%s%s\\n' HUMAN_ 中文\rpwd\r");
  await waitFor(() => output.includes('HUMAN_中文') && output.includes(root), 'raw Unicode input or remote cwd failed');
  await controller.resize(agent, id, a, 100, 30);
  await controller.write(agent, id, a, 'stty size\r');
  await waitFor(() => output.includes('30 100'), 'remote terminal resize failed');
  await controller.write(agent, id, a, "printf '%s\\n' completion-t\t\r");
  await waitFor(() => output.includes('completion-target-file'), 'Tab completion failed');
  await controller.write(agent, id, a, "printf '%s%s\\n' ARROW_ OX\x1b[DK\x1b[3~\r");
  await waitFor(() => output.includes('ARROW_OK'), 'arrow/delete raw input failed');
  await controller.write(agent, id, a, 'sleep 20\r');
  await new Promise(resolveWait => setTimeout(resolveWait, 150));
  await controller.write(agent, id, a, "\x03printf '%s%s\\n' INTERRUPT_ OK\r");
  await waitFor(() => output.includes('INTERRUPT_OK'), 'Ctrl-C failed');
  report.checks.rawInputTabArrowsCtrlCResize = true;

  console.error('Checking real SSH connector loss and same-session PTY resume');
  const entry = manager.entries.get(alias); const old = entry.client; const sessionId = client.sessionId;
  const originalPid = (await client.call('health/status')).processes;
  assert.equal(originalPid, 1);
  // Only this test manager's connector is terminated; no user SSH process.
  entry.child.kill('SIGTERM'); await old.closed;
  await controller.write(agent, id, a, "printf '%s%s\\n' SSH_RESUME_ OK\r");
  await waitFor(() => output.includes('SSH_RESUME_OK'), 'PTY did not resume after SSH transport loss', 30_000);
  assert.equal(client.sessionId, sessionId); assert.equal(client.session.resumed, true);
  assert.equal((await client.call('health/status')).processes, 1);
  report.checks.sshTransportResumeWithoutRespawn = true;

  secondFollower = controller.follow(agent, id, b, secondLifetime.signal)[Symbol.asyncIterator]();
  const baseline = await secondFollower.next();
  assert.equal(baseline.value.type, 'snapshot'); assert.match(baseline.value.screen, /SSH_RESUME_OK/);
  await assert.rejects(controller.write(agent, id, a, 'obsolete attachment'), error => error.code === 'terminal/control-unavailable');
  firstLifetime.abort(); await firstPump;
  assert.equal(controller.list(agent.id)[0].state, 'running');
  report.checks.screenRecoveryAndExclusiveInput = true;
  await controller.close(agent, id); await controller.close(agent, id);
  assert.equal(controller.list(agent.id).length, 0);
  assert.equal((await client.call('health/status')).processes, 0);
  report.checks.closeAndCleanup = true;
  report.helperVersion = manager.status(alias).helperVersion;
  report.helperSha256 = manager.status(alias).helperSha256;
} finally {
  firstLifetime.abort(); secondLifetime.abort();
  const errors = [];
  for (const close of [() => controller.close(agent, id), () => firstPump, () => secondFollower?.return?.(),
    () => agentScope.dispose(), () => router.dispose(), () => manager.dispose()]) {
    try { await close(); } catch (error) { errors.push(error); }
  }
  ssh(`rm -rf -- ${quote(root)}`);
  if (errors.length) throw new AggregateError(errors, 'human terminal smoke cleanup failed');
}
report.completedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
