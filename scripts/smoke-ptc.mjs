// Explicit opt-in; only a new private fixture and its own daemon are touched.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { NodePtcRuntime } from '@deepseek-ai/dsh-ptc-runtime-node';
import { RemoteHelperRpcClient } from '../lib/helper/rpc-client.js';
import { installRemotePtcRouter } from '../lib/ptc-router.js';

const [alias, requestedNode = 'auto'] = process.argv.slice(2);
// 'auto' uses the same login-shell discovery as a normal DSH run_code call.
// An explicit path remains useful for testing an alternate installed runtime.
const remoteNode = requestedNode === 'auto' ? 'node' : requestedNode;
const persistent = process.argv[4] === 'persistent';
if (persistent) assert.equal(typeof NodePtcRuntime.prototype.release, 'function');
assert.match(alias ?? '', /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
assert.ok(remoteNode === 'node' || (remoteNode.startsWith('/') && !remoteNode.includes('\0')), 'Pass auto or an existing remote Node executable');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const ssh = command => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', alias, command], { encoding: 'utf8', timeout: 30000 });
// Keep helper code outside /tmp, which workspace-write intentionally replaces.
const root = ssh('mktemp -d "$HOME/.dsh-ptc-smoke.XXXXXXXX"').trim();
assert.match(root, /^\/(?:[^/\0]+\/)*\.dsh-ptc-smoke\.[a-zA-Z0-9]{8}$/);
ssh(`mkdir -m 700 ${quote(root + '/code')} ${quote(root + '/runtime')} ${quote(root + '/work')}`);
execFileSync('scp', ['-q', ...['dsh_remote_helper.py', 'dsh_transfer.py', 'dsh_terminal_state.py'].map(name =>
  fileURLToPath(new URL(`../helper/${name}`, import.meta.url))), `${alias}:${root}/code/`], { timeout: 30000 });
const socket = root + '/runtime/daemon.sock';
const command = `DSH_REMOTE_HELPER_ALLOW_SHUTDOWN=1 python3 ${quote(root + '/code/dsh_remote_helper.py')} connect --stdio --socket ${quote(socket)}`;
const connections = [];
let client;
let router;
let success = false;
const report = { alias, discovery: requestedNode === 'auto' ? 'login-PATH' : 'explicit',
  node: ssh(`bash -lc ${quote(`${quote(remoteNode)} --version`)}`).trim(), checks: {} };
async function connect(resumeToken) {
  const child = spawn('ssh', ['-o', 'BatchMode=yes', alias, command], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit'); child.stderr.on('data', data => process.stderr.write(data));
  const rpc = new RemoteHelperRpcClient({ readable: child.stdout, writable: child.stdin });
  connections.push({ child, exited, rpc });
  await rpc.initialize({ clientId: 'isolated-issue-35-36', resumeToken });
  return rpc;
}
try {
  client = await connect();
  await client.call('workspace/open', { path: root + '/work', access: 'danger-full-access', workspaceId: 'fixture', operationId: 'fixture' });
  await client.call('fs/write', { workspaceId: 'fixture', path: '中文 file.txt', data: Buffer.from('SSH_PTC_MARKER').toString('base64'), operationId: 'fixture-write' });
  const ctx = new Context();
  ctx.provide('fs', { processPathFromHostPath: path => path });
  ctx.provide('subprocess', { spawn() { throw new Error('local spawn forbidden'); }, resolveExecutable() { throw new Error('local Node discovery forbidden'); } });
  ctx.provide('sandbox', { confine() { throw new Error('local sandbox forbidden'); } });
  ctx.provide('sandboxPolicy', { defaultMode: 'workspace-write' });
  const config = { timeoutMs: 15000, maxTimeoutMs: 30000, maxOutputBytes: 400000, maxMessageBytes: 500000,
    maxPendingCalls: 16, maxOldGenerationSizeMb: 128, graceMs: 1500, nodeExecutable: remoteNode,
    executionMode: persistent ? 'persistent-in-memory' : 'per-call',
    launch: { kind: 'node-script', executable: remoteNode } };
  const runtime = new NodePtcRuntime(ctx, config);
  router = installRemotePtcRouter(ctx.ptcRuntime, ctx.fs, ctx.subprocess, ctx.sandbox, { client: async () => client },
    path => path === '/isolated-anchor' ? `ssh://${alias}${root}/work` : undefined);
  const run = (program, mode, bindings = [], extra = {}) => ctx.ptcRuntime.run(ctx.ptcRuntime.resolve({
    program: persistent ? `await (async () => { ${program} })()` : program, cwd: '/isolated-anchor', bindings,
    sandboxPolicy: { mode, workspaceRoot: '/isolated-anchor' }, ...extra,
  }));
  for (const mode of ['read-only', 'workspace-write', 'danger-full-access']) {
    const result = await run(`
      const fs = await import('node:fs/promises');
      const marker = await fs.readFile('中文 file.txt', 'utf8');
      const payload = await tools.echo('x'.repeat(180000));
      let write = 'allowed'; try { await fs.writeFile('written-${mode}', marker); } catch(e) { write = e.code; }
      let privateVisible = false; try { await fs.stat(${JSON.stringify(socket + '.auth')}); privateVisible = true; } catch {}
      return { marker, size: payload.length, cwd: process.cwd(), write, privateVisible };
    `, mode, [{ global: 'tools', functions: { echo: async value => value } }]);
    assert.equal(result.error, undefined, JSON.stringify(result));
    assert.equal(result.value.marker, 'SSH_PTC_MARKER'); assert.equal(result.value.size, 180000);
    assert.equal(result.value.cwd, root + '/work');
    assert.equal(result.value.write === 'allowed', mode !== 'read-only');
    if (mode !== 'danger-full-access') assert.equal(result.value.privateVisible, false);
    report.checks[mode] = true;
  }
  const interrupted = await run('while(true) {}', 'workspace-write', [], { timeoutMs: 500 });
  assert.equal(interrupted.error?.kind, 'timeout'); report.checks.cancellation = true;
  if (persistent) {
    const owner = {};
    const evaluate = program => runtime.run(runtime.resolve({ program, cwd: '/isolated-anchor', stateOwner: owner,
      bindings: [], sandboxPolicy: { mode: 'workspace-write', workspaceRoot: '/isolated-anchor' } }));
    const first = await evaluate('var retained = 40; retained'); assert.equal(first.value, 40, JSON.stringify(first));
    const second = await evaluate('retained += 2; retained'); assert.equal(second.value, 42, JSON.stringify(second));
    await runtime.release(owner); report.checks.persistentState = true;
  }
  await router.dispose(); router = undefined;
  const old = client; const token = old.session.resumeToken; const sessionId = old.sessionId;
  old.close(); connections.at(-1).child.stdin.end(); await connections.at(-1).exited;
  client = await connect(token);
  assert.equal(client.sessionId, sessionId); assert.equal(client.session.resumed, true);
  const read = await client.call('fs/read', { workspaceId: 'fixture', path: '中文 file.txt' });
  assert.equal(Buffer.from(read.data, 'base64').toString(), 'SSH_PTC_MARKER');
  report.checks.authenticatedResume = true;
  const rejected = ssh(`python3 -c ${quote("import socket; s=socket.socket(socket.AF_UNIX);s.settimeout(3);s.connect(" + JSON.stringify(socket) + ");r=s.makefile('rb');assert r.readline().startswith(b'DSH-AUTH-1 ');s.sendall(b'{\"method\":\"initialize\"}\\n');assert r.readline()==b'';print('rejected')")}`);
  assert.equal(rejected.trim(), 'rejected'); report.checks.unauthenticatedRejected = true;
  success = true;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await router?.dispose();
  try { await client?.call('admin/shutdown'); } catch {}
  for (const { child, exited, rpc } of connections) { rpc.close(); child.stdin.end(); await exited; }
  if (success) ssh(`rm -r -- ${quote(root)}`);
  else console.error(`Isolated diagnostic fixture retained: ${alias}:${root}`);
}
