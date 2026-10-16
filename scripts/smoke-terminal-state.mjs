// Opt-in, small controlled terminal commands only. No model call or user rc edits.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { Context } from '@deepseek-ai/cordis';
import { createScope } from '@deepseek-ai/dsh-scope';
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import { TerminalController } from '@deepseek-ai/dsh-api-terminal-controller';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { installRemoteUserSubprocessRouter } from '../lib/user-subprocess.js';
import { TerminalStateManager } from '../lib/terminal-state.js';
const alias = process.argv[2];
if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(alias)) throw new Error('Usage: node scripts/smoke-terminal-state.mjs <explicit-ssh-alias>');
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30000 });
const root = ssh('mktemp -d /tmp/dsh-terminal-state-smoke.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-terminal-state-smoke\.[A-Za-z0-9]{8}$/u);
console.error('Controlled terminal fixture:', root);
const resolve = path => path === '/state-anchor' ? `ssh://${alias}${root}` : undefined;
let connector, remainingFailures = 0;
const helpers = new RemoteHelperManager({ aliasValidator: candidate => candidate === alias, healthIntervalMs: 0, reconnectBaseMs: 400,
  spawnProcess: (command, args, options) => {
    if (remainingFailures-- > 0) return spawn(process.execPath, ['-e', 'process.stdin.resume(); process.stderr.write("ssh: connect to host fixture: Connection refused\\n"); setTimeout(() => process.exit(255), 200);'], options);
    connector = spawn(command, args, options); return connector;
  } });
const provider = { async client(...args) {
  const client = await helpers.client(...args);
  // Only this synthetic fixture redirects HOME/history; production retains user startup files.
  return new Proxy(client, { get(target, name) {
    const value = Reflect.get(target, name);
    if (name === 'call' || name === 'callInSession') return (...input) => {
      const index = name === 'call' ? 0 : 1;
      if (input[index] === 'process/start') input[index + 1] = { ...input[index + 1], env: { ...input[index + 1].env, HOME: root, HISTFILE: '/dev/null' } };
      return value.apply(target, input);
    };
    return typeof value === 'function' ? value.bind(target) : value;
  } });
} };
const ctx = new Context();
class LocalMustNotRun extends SubprocessRuntime {
  constructor(context) { super(context); }
  async terminalEnvironment() { throw new Error('local environment leak'); }
  async resolveExecutable() { throw new Error('local executable leak'); }
  spawn() { throw new Error('local spawn leak'); }
  async spawnTerminal() { throw new Error('local terminal leak'); }
}
new LocalMustNotRun(ctx); ctx.provide('sandboxPolicy', { workspaceRoot: '/fallback', defaultMode: 'read-only' });
const agent = { id: 'terminal-state-smoke-session', session: { header: { cwd: '/state-anchor' } } };
const agentScope = createScope(ctx, agent); agent.ctx = agentScope.ctx;
ctx.provide('agents', { list: () => [agent], get: id => id === agent.id ? agent : undefined });
const states = new TerminalStateManager(resolve);
const router = installRemoteUserSubprocessRouter(ctx, ctx.get('subprocess'), provider, resolve, states);
const controller = new TerminalController(ctx, { shell: { path: '/bin/bash', name: 'bash', args: ['-i'] }, shellCandidates: ['bash'], maxTerminals: 4,
  maxCols: 240, maxRows: 120, scrollback: 200, maxBufferedBytes: 1024 * 1024, maxInputBytes: 65536, disposeGraceMs: 100,
  unattendedTimeoutMs: 0, activityPollIntervalMs: 1000, cleanupRetryMs: 1000 });
const unmount = states.mount(controller), lifetime = new AbortController(), scope = { sessionId: agent.id, workspaceRoot: '/state-anchor' };
const id = 'state-smoke-one', attachment = 'state-smoke-input'; let output = '', pump;
const until = async predicate => {
  const end = Date.now() + 20000; let rows;
  do { rows = await states.list(scope, lifetime.signal); if (predicate(rows[0])) return rows[0]; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < end);
  throw new Error('terminal state timeout: ' + JSON.stringify(rows));
};
const write = text => controller.write(agent, id, attachment, text);
try {
  await controller.create(agent, { id, cols: 80, rows: 24 }, lifetime.signal);
  pump = (async () => { for await (const frame of controller.follow(agent, id, attachment, lifetime.signal)) if (frame.type === 'output') output += frame.data; })().catch(error => { if (!lifetime.signal.aborted) throw error; });
  await until(row => row?.state === 'prompt');
  console.error('Bash prompt initialized');
  await write('false\r'); let view = await until(row => row.recent.length === 1);
  assert.equal(view.recent[0].exitCode, 1); assert.match(view.recent[0].command, /false/u);
  await write('true | false\r'); view = await until(row => row.recent.length === 2); assert.equal(view.recent[1].exitCode, 1); assert.equal(view.recent[1].command, 'true | false');
  await write('cd /tmp\r'); view = await until(row => row.cwd === '/tmp');
  await write('sleep 20\r'); await until(row => row.state === 'running'); await write('\x03');
  view = await until(row => row.state === 'prompt' && row.recent.length === 4); assert.equal(view.recent[3].exitCode, 130);
  await write('sleep 1 &\r'); view = await until(row => row.recent.length === 5); assert.equal(view.state, 'prompt');
  await write('printf "STATE_%s\\n" REMOTE_MARKER\r'); view = await until(row => row.recent.length === 6);
  assert.equal(view.recent[2].command, 'cd /tmp'); assert.equal(view.recent[3].command, 'sleep 20'); assert.equal(view.recent[4].command, 'sleep 1 &');
  const instance = view.instance;
  console.error('Bash command status and cwd passed');
  const context = await states.context(scope, id, lifetime.signal); assert.match(context.text, /STATE_REMOTE_MARKER/u); assert.ok(Buffer.byteLength(context.text) <= 65536);
  // Kill only the connector process created above, not a shared SSH master.
  assert.ok(connector); remainingFailures = 20; connector.kill('SIGTERM');
  await until(row => row.stale);
  remainingFailures = 0;
  view = await until(row => !row.stale); assert.equal(view.instance, instance);
  await write('printf "RESUMED_%s\\n" SAME_TERMINAL\r'); view = await until(row => row.recent.length === 7);
  assert.equal(view.instance, instance);
  assert.match((await states.context(scope, id, lifetime.signal)).text, /RESUMED_SAME_TERMINAL/u);
  console.log(JSON.stringify({ alias, helperVersion: (await helpers.client(alias)).hello.helperVersion, checks: {
    publicControllerAssociation: true, bashPromptCommandExitCwd: true, pipeline: true, ctrlC: true, backgroundReturn: true,
    contextRemoteMarker: true, sameInstanceAcrossDisconnect: true, noModelRequest: true, controlledHomeOnly: true,
  } }, null, 2));
} catch (error) { console.error(error); console.error(helpers.diagnostics(alias)); throw error; } finally {
  await controller.close(agent, id); lifetime.abort(); await pump; unmount(); states.dispose(); await router.dispose(); await helpers.dispose();
  await agentScope.dispose(); ssh(`rm -rf -- '${root}'`);
}
