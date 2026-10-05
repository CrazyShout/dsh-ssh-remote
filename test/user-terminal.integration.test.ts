import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createScope } from '@deepseek-ai/dsh-scope';
import { TerminalController, type Config as TerminalConfig, type TerminalFrame } from '@deepseek-ai/dsh-api-terminal-controller';
import { SubprocessRuntime, type SubprocessHandle, type SubprocessTerminalHandle, type SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteHelperRpcClient, type RemoteHelperClient } from '../src/helper/rpc-client.js';
import type { RemoteHelperProvider } from '../src/helper-fs.js';
import { installRemoteUserSubprocessRouter } from '../src/user-subprocess.js';
import { openRemoteUserTerminal, RemoteUserTerminalAllocationError } from '../src/user-pty.js';

const helperPath = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));
const disposers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); });

class DirectHelper implements RemoteHelperProvider {
  readonly child: ChildProcessWithoutNullStreams;
  readonly raw: RemoteHelperRpcClient;
  readonly calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  private stderr = '';
  constructor() {
    this.child = spawn('python3', [helperPath, 'connect', '--stdio', '--direct'], {
      stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, SHELL: '/bin/bash' },
    });
    this.child.stderr.on('data', data => { this.stderr += String(data); });
    this.raw = new RemoteHelperRpcClient({ readable: this.child.stdout, writable: this.child.stdin });
    this.child.on('exit', () => this.raw.transportClosed(new Error('fixture helper exited')));
    const call = this.raw.call.bind(this.raw);
    this.raw.call = (method, params = {}, options = {}) => {
      this.calls.push({ method, params });
      return call(method, params, options);
    };
  }
  async client() { return this.raw; }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise<void>(resolve => this.child.once('exit', () => resolve()));
    this.child.stdin.end();
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([exited, new Promise<void>((_, reject) => {
        timer = setTimeout(() => { this.child.kill('SIGKILL'); reject(new Error(`fixture helper cleanup timed out: ${this.stderr}`)); }, 5_000);
      })]);
    } finally { clearTimeout(timer!); }
  }
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-user-terminal-')));
  disposers.push(() => rm(root, { recursive: true, force: true }));
  const helper = new DirectHelper(); disposers.push(() => helper.close());
  await helper.raw.initialize({ clientId: `user-terminal-${randomUUID()}` });
  return { helper, root, uri: `ssh://fixture${root}` };
}

function specification(overrides: Partial<SubprocessTerminalSpawnSpec> = {}): SubprocessTerminalSpawnSpec {
  return { argv: ['/bin/bash', '--noprofile', '--norc', '-i'], cwd: '/anchor', cols: 80, rows: 24,
    terminalType: 'xterm-256color', graceMs: 50, ...overrides };
}

class LocalRuntime extends SubprocessRuntime {
  constructor(ctx: Context) { super(ctx); }
  async terminalEnvironment() { return { platform: 'posix' as const, defaultShell: '/definitely-local-shell' }; }
  async resolveExecutable() { throw new Error('remote shell lookup unexpectedly used local provider'); }
  spawn() { throw new Error('unexpected local spawn'); return {} as SubprocessHandle; }
  async spawnTerminal() { throw new Error('remote PTY unexpectedly used local provider'); return {} as SubprocessTerminalHandle; }
}

const config: TerminalConfig = {
  shell: { path: '/bin/bash', name: 'bash', args: ['--noprofile', '--norc', '-i'] },
  shellCandidates: ['/bin/sh', 'bash', 'dsh-nonexistent-shell-fixture'], maxTerminals: 4,
  maxCols: 240, maxRows: 120, scrollback: 200, maxBufferedBytes: 1024 * 1024,
  maxInputBytes: 64 * 1024, disposeGraceMs: 50, unattendedTimeoutMs: 0,
  activityPollIntervalMs: 100, cleanupRetryMs: 100,
};

describe('real helper user-terminal primitive', () => {
  it.each(['workspace/open', 'process/start', 'workspace/close'] as const)('pins allocation %s to the original session before its first dispatch', async replaceAt => {
    let sessionId = 'original-session';
    const sent: Array<{ method: string; sessionId: string }> = [];
    const pins: string[] = [];
    const client = {
      get sessionId() { return sessionId; },
      capabilities: { process: { sequencedWrite: true }, pty: { sequencedResize: true } },
      async call(method: string, params: Record<string, unknown> = {}) {
        if (method === replaceAt) sessionId = 'replacement-session';
        sent.push({ method, sessionId });
        if (method === 'process/start') return { processId: params.processId, pid: 321, running: true, exitCode: null, signal: null };
        return {};
      },
      async callInSession(expected: string, method: string, params: Record<string, unknown>) {
        pins.push(expected);
        if (method === replaceAt) sessionId = 'replacement-session';
        if (expected !== sessionId) throw new Error('remote helper session expired during allocation fixture');
        return this.call(method, params);
      },
    } as unknown as RemoteHelperClient;
    const helpers: RemoteHelperProvider = { client: async () => client };
    await expect(openRemoteUserTerminal('ssh://fixture/tmp', specification(), helpers))
      .rejects.toBeInstanceOf(RemoteUserTerminalAllocationError);
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.every(value => value === 'original-session')).toBe(true);
    expect(sent.every(call => call.sessionId === 'original-session')).toBe(true);
    expect(sent.find(call => call.method === replaceAt)).toBeUndefined();
  });

  it('keeps more than 4096 input and resize events outside the shared mutation journal', async () => {
    const f = await fixture();
    const events = 4105;
    const script = `import os,tty,time\ntty.setraw(0)\nos.write(1,b'INPUT_READY')\nreceived=0\nwhile received<${events}:received+=len(os.read(0,${events}-received))\nos.write(1,b'INPUT_TOTAL_${events}')\ntime.sleep(30)`;
    const terminal = await openRemoteUserTerminal(f.uri, specification({ argv: ['python3', '-c', script] }), f.helper);
    disposers.push(() => terminal.terminate());
    let output = ''; terminal.output.on('data', chunk => { output += Buffer.from(chunk).toString(); });
    await vi.waitFor(() => expect(output).toContain('INPUT_READY'));
    for (let i = 0; i < events; i += 1) await Promise.all([terminal.write('x'), terminal.resize(80 + i % 2, 24)]);
    await vi.waitFor(() => expect(output).toContain(`INPUT_TOTAL_${events}`));
    for (const method of ['process/write', 'process/resize']) {
      const calls = f.helper.calls.filter(call => call.method === method);
      expect(calls).toHaveLength(events);
      expect(calls.map(call => call.params.afterSeq)).toEqual(Array.from({ length: events }, (_, i) => String(i)));
    }
    await terminal.terminate();
    await expect(f.helper.raw.call('health/status')).resolves.toMatchObject({ processes: 0, workspaces: 0 });
  }, 30_000);

  it('does not reuse an unresolved input cursor with a different payload', async () => {
    const f = await fixture();
    const call = f.helper.raw.call.bind(f.helper.raw);
    let writes = 0;
    f.helper.raw.call = async (method, params = {}, options = {}) => {
      if (method === 'process/write') { writes += 1; throw new Error('fixture ambiguous input outcome'); }
      return call(method, params, options);
    };
    const terminal = await openRemoteUserTerminal(f.uri, specification(), f.helper);
    terminal.output.resume(); disposers.push(() => terminal.terminate());
    await expect(terminal.write('first')).rejects.toThrow('ambiguous input outcome');
    await expect(terminal.write('different')).rejects.toThrow('input outcome is unresolved');
    expect(writes).toBe(1);
    await terminal.terminate();
  });

  it('bounds pending resize promises, reports rejected geometry honestly, and cancels the queue on terminate', async () => {
    const f = await fixture();
    const call = f.helper.raw.call.bind(f.helper.raw);
    let release!: () => void;
    let gate = new Promise<void>(resolve => { release = resolve; });
    let entered = 0;
    f.helper.raw.call = async (method, params = {}, options = {}) => {
      if (method === 'process/resize') {
        entered += 1;
        await new Promise<void>((resolve, reject) => {
          const signal = options.signal;
          const abort = (): void => { signal?.removeEventListener('abort', abort); reject(signal?.reason); };
          if (signal?.aborted) { abort(); return; }
          signal?.addEventListener('abort', abort, { once: true });
          void gate.then(() => { signal?.removeEventListener('abort', abort); resolve(); });
        });
      }
      return call(method, params, options);
    };
    const terminal = await openRemoteUserTerminal(f.uri, specification(), f.helper);
    terminal.output.resume(); disposers.push(() => terminal.terminate());
    const accepted = Array.from({ length: 8 }, (_, i) => terminal.resize(90 + i, 30));
    const acceptedResults = Promise.allSettled(accepted);
    await vi.waitFor(() => expect(entered).toBe(1));
    const overflow = await Promise.allSettled(Array.from({ length: 1000 }, () => terminal.resize(150, 40)));
    expect(overflow.every(result => result.status === 'rejected'
      && String(result.reason).includes('resize queue exceeds 8'))).toBe(true);
    expect(entered).toBe(1);
    release();
    expect((await acceptedResults).every(result => result.status === 'fulfilled')).toBe(true);
    expect(f.helper.calls.filter(item => item.method === 'process/resize').map(item => item.params.cols))
      .toEqual(Array.from({ length: 8 }, (_, i) => 90 + i));
    await terminal.resize(150, 40); // Admission failure must not poison this lane.
    gate = new Promise<void>(() => {});
    const cancelled = Promise.allSettled(Array.from({ length: 8 }, () => terminal.resize(160, 50)));
    await vi.waitFor(() => expect(entered).toBe(10));
    const started = Date.now();
    await terminal.terminate();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((await cancelled).every(result => result.status === 'rejected')).toBe(true);
    expect(entered).toBe(10);
    expect(f.helper.calls.filter(item => item.method === 'process/resize')).toHaveLength(9);
    await expect(f.helper.raw.call('health/status')).resolves.toMatchObject({ processes: 0, workspaces: 0 });
  }, 15_000);

  it('bounds queued input by request count as well as bytes and treats empty writes as unqueued no-ops', async () => {
    const f = await fixture();
    const call = f.helper.raw.call.bind(f.helper.raw);
    let release!: () => void;
    let gate = new Promise<void>(resolve => { release = resolve; });
    let entered = 0;
    f.helper.raw.call = async (method, params = {}, options = {}) => {
      if (method === 'process/write') {
        entered += 1;
        await new Promise<void>((resolve, reject) => {
          const signal = options.signal;
          const abort = (): void => { signal?.removeEventListener('abort', abort); reject(signal?.reason); };
          if (signal?.aborted) { abort(); return; }
          signal?.addEventListener('abort', abort, { once: true });
          void gate.then(() => { signal?.removeEventListener('abort', abort); resolve(); });
        });
      }
      return call(method, params, options);
    };
    const terminal = await openRemoteUserTerminal(f.uri, specification(), f.helper);
    terminal.output.resume(); disposers.push(() => terminal.terminate());
    const accepted = Promise.allSettled(Array.from({ length: 128 }, () => terminal.write('x')));
    await vi.waitFor(() => expect(entered).toBe(1));
    await Promise.all(Array.from({ length: 2000 }, () => terminal.write('')));
    const overflow = await Promise.allSettled(Array.from({ length: 1000 }, () => terminal.write('y')));
    expect(overflow.every(result => result.status === 'rejected'
      && String(result.reason).includes('128 pending writes'))).toBe(true);
    expect(entered).toBe(1);
    release();
    expect((await accepted).every(result => result.status === 'fulfilled')).toBe(true);
    await terminal.write('z'); // Rejected unsent writes do not poison accepted input.
    expect(f.helper.calls.filter(item => item.method === 'process/write')).toHaveLength(129);
    gate = new Promise<void>(() => {});
    const cancelled = Promise.allSettled(Array.from({ length: 128 }, () => terminal.write('x')));
    await vi.waitFor(() => expect(entered).toBe(130));
    const started = Date.now();
    await terminal.terminate();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((await cancelled).every(result => result.status === 'rejected')).toBe(true);
    expect(entered).toBe(130);
    await expect(f.helper.raw.call('health/status')).resolves.toMatchObject({ processes: 0, workspaces: 0 });
  }, 15_000);

  it('provides raw PTY bytes, size, foreground facts and allocation-only cancellation', async () => {
    const f = await fixture();
    const allocation = new AbortController();
    const terminal = await openRemoteUserTerminal(f.uri, specification({ signal: allocation.signal }), f.helper);
    disposers.push(() => terminal.terminate());
    let output = ''; terminal.output.on('data', chunk => { output += Buffer.from(chunk).toString(); });
    allocation.abort(new Error('creation request transport ended after publication'));
    const raw = "printf '%s%s\\n' RAW_ 中文\r";
    await terminal.write(raw);
    await vi.waitFor(() => expect(output).toContain('RAW_中文'), { timeout: 3_000 });
    expect(f.helper.calls.filter(call => call.method === 'process/write').map(call => Buffer.from(String(call.params.data), 'base64').toString()).join(''))
      .toBe(raw);
    await terminal.resize(100, 30); await terminal.write('stty size\r');
    await vi.waitFor(() => expect(output).toContain('30 100'), { timeout: 3_000 });
    expect(await terminal.inspectForeground()).toMatchObject({ inputWaiting: false });
    expect(await terminal.inspectActivity()).toMatchObject({ state: 'unknown' });
    await expect(terminal.write('x'.repeat(1024 * 1024 + 1))).rejects.toThrow('queued input');
    await terminal.terminate(); await terminal.terminate();
    await expect(f.helper.raw.call('health/status')).resolves.toMatchObject({ processes: 0, workspaces: 0 });
  }, 15_000);

  it('drains quick exit output and closes a backpressured output stream without hanging', async () => {
    const f = await fixture();
    const quick = await openRemoteUserTerminal(f.uri, specification({ argv: ['/bin/sh', '-c', 'printf FINAL_USER_PTY; exit 7'] }), f.helper);
    let text = '';
    for await (const chunk of quick.output) text += Buffer.from(chunk).toString();
    await expect(quick.done).resolves.toEqual({ exitCode: 7, signal: null });
    expect(text).toContain('FINAL_USER_PTY'); await quick.terminate();
    const busy = await openRemoteUserTerminal(f.uri, specification({
      argv: ['python3', '-c', "import sys,time;sys.stdout.write('x'*1048576);sys.stdout.flush();time.sleep(20)"],
    }), f.helper);
    await vi.waitFor(() => expect(busy.output.readableLength).toBeGreaterThan(0));
    const started = Date.now(); await busy.terminate();
    expect(Date.now() - started).toBeLessThan(4_000);
    await expect(f.helper.raw.call('health/status')).resolves.toMatchObject({ processes: 0 });
  }, 15_000);

  it('checks foreground SIGKILL shell protection in the same remote signal operation', async () => {
    const f = await fixture();
    const terminal = await openRemoteUserTerminal(f.uri, specification(), f.helper);
    disposers.push(() => terminal.terminate());
    let output = ''; terminal.output.on('data', chunk => { output += Buffer.from(chunk).toString(); });
    const original = f.helper.raw.call.bind(f.helper.raw);
    let inspections = 0;
    f.helper.raw.call = async (method, params, options) => {
      // A separate preflight can be stale: a job was foreground then, while
      // the shell is foreground at signal delivery. It must not authorize KILL.
      if (method === 'process/inspectForeground') { inspections += 1; return { pgid: 2147483640, verified: true } as never; }
      return original(method, params, options);
    };
    await expect(terminal.signalForeground('SIGKILL')).rejects.toThrow('refusing to SIGKILL the terminal shell');
    expect(inspections).toBe(0);
    expect(f.helper.calls.find(call => call.method === 'process/signal')?.params).toMatchObject({ denyOwnShellKill: true });
    await terminal.write("printf '%s%s\\n' SHELL_ SURVIVED\r");
    await vi.waitFor(() => expect(output).toContain('SHELL_SURVIVED'), { timeout: 3_000 });
    await terminal.terminate();
  }, 10_000);

  it('reports process exit independently of a stalled output consumer', async () => {
    const f = await fixture();
    const terminal = await openRemoteUserTerminal(f.uri, specification({
      argv: ['python3', '-c', "import sys;sys.stdout.write('x'*1048576);sys.stdout.flush()"],
    }), f.helper);
    disposers.push(() => terminal.terminate());
    await expect(terminal.done).resolves.toEqual({ exitCode: 0, signal: null });
    expect(terminal.output.readableLength).toBeGreaterThan(0);
    expect(terminal.output.readableEnded).toBe(false);
    terminal.output.resume(); await terminal.terminate();
  }, 10_000);

  it('preserves a live descendant and the complete large PTY tail through real task EOF', async () => {
    const f = await fixture();
    const terminal = await openRemoteUserTerminal(f.uri, specification({
      argv: ['python3', '-c', "import os,sys,time\npid=os.fork()\nif pid==0:\n time.sleep(.05)\n sys.stdout.write('x'*1048576+'DESCENDANT_END');sys.stdout.flush();os._exit(0)\nos.waitpid(pid,0)\nsys.stdout.write('TASK_END');sys.stdout.flush();sys.exit(7)"],
    }), f.helper);
    disposers.push(() => terminal.terminate());
    const chunks: Buffer[] = [];
    for await (const chunk of terminal.output) chunks.push(Buffer.from(chunk));
    await expect(terminal.done).resolves.toEqual({ exitCode: 7, signal: null });
    expect(Buffer.concat(chunks).toString()).toBe('x'.repeat(1048576) + 'DESCENDANT_ENDTASK_END');
    await terminal.terminate();
  }, 10_000);

  it('does not add a hidden guardian child to the user task wait-all set', async () => {
    const f = await fixture();
    const terminal = await openRemoteUserTerminal(f.uri, specification({
      argv: ['python3', '-c', "import os\nchild=os.fork()\nif child==0:os._exit(0)\ncount=0\nwhile True:\n try:os.waitpid(-1,0);count+=1\n except ChildProcessError:break\nprint('WAITED_FOR_'+str(count),flush=True)"],
    }), f.helper);
    disposers.push(() => terminal.terminate());
    let output = '';
    for await (const chunk of terminal.output) output += Buffer.from(chunk).toString();
    await expect(terminal.done).resolves.toEqual({ exitCode: 0, signal: null });
    expect(output.trim()).toBe('WAITED_FOR_1');
    await terminal.terminate();
  }, 10_000);

  it('preserves output emitted by a TERM trap before closing the terminal', async () => {
    const f = await fixture();
    const script = "import signal,time,sys\ndef stop(*_):\n print('TERM_FINAL_OUTPUT',flush=True)\n sys.exit(0)\nsignal.signal(signal.SIGTERM,stop)\nprint('TRAP_READY',flush=True)\ntime.sleep(20)";
    const terminal = await openRemoteUserTerminal(f.uri, specification({ argv: ['python3', '-c', script], graceMs: 200 }), f.helper);
    disposers.push(() => terminal.terminate());
    let output = ''; terminal.output.on('data', chunk => { output += Buffer.from(chunk).toString(); });
    await vi.waitFor(() => expect(output).toContain('TRAP_READY'));
    await terminal.terminate();
    expect(output).toContain('TERM_FINAL_OUTPUT');
    await expect(terminal.done).resolves.toEqual({ exitCode: 0, signal: null });
  }, 10_000);

  it('rolls back the exact process when allocation is cancelled after start acceptance', async () => {
    const f = await fixture(); const controller = new AbortController();
    const original = f.helper.raw.call.bind(f.helper.raw);
    f.helper.raw.call = async (method, params = {}, options = {}) => {
      const result = await original(method, params, options);
      if (method === 'process/start') controller.abort(new Error('cancel fixture allocation'));
      return result;
    };
    await expect(openRemoteUserTerminal(f.uri, specification({ signal: controller.signal }), f.helper))
      .rejects.toThrow('cancel fixture allocation');
    await expect(original('health/status')).resolves.toMatchObject({ processes: 0, workspaces: 0 });
  }, 15_000);

  it('fails rather than silently recreating a PTY when the helper session changes', async () => {
    const f = await fixture(); let replaced = false;
    const provider: RemoteHelperProvider = { client: async () => replaced
      ? new Proxy(f.helper.raw, { get(target, key) {
        if (key === 'sessionId') return 'different-authenticated-session';
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } }) : f.helper.raw };
    const terminal = await openRemoteUserTerminal(f.uri, specification(), provider);
    terminal.output.resume(); replaced = true;
    await expect(terminal.done).rejects.toThrow('session expired');
    expect(f.helper.calls.filter(call => call.method === 'process/start')).toHaveLength(1);
    replaced = false; await terminal.terminate().catch(() => {});
    // A concurrent automatic cleanup may have observed the replaced session;
    // retry uses the same process identity and cannot start a second shell.
    await terminal.terminate();
  }, 15_000);

  it('reports a truncated remote output cursor as a provider failure rather than silent success', async () => {
    const f = await fixture(); const call = f.helper.raw.call.bind(f.helper.raw); let first = true;
    f.helper.raw.call = async (method, params = {}, options = {}) => {
      if (method === 'process/read' && first) {
        first = false;
        return { chunks: [], nextSeq: '2', truncated: true, exited: false, exitCode: null, signal: null } as never;
      }
      return call(method, params, options);
    };
    const terminal = await openRemoteUserTerminal(f.uri, specification(), f.helper);
    await expect(terminal.done).rejects.toThrow('output buffer overflowed');
    await terminal.terminate();
    await expect(call('health/status')).resolves.toMatchObject({ processes: 0 });
  }, 10_000);
});

describe('official DSH TerminalController over remote helper PTY', () => {
  it('keeps its existing create/follow/control/resize/reconnect/close contract', async () => {
    const f = await fixture(); await writeFile(join(f.root, 'completion-target-file'), 'fixture');
    const ctx = new Context(); new LocalRuntime(ctx);
    ctx.provide('sandboxPolicy', { workspaceRoot: '/fallback', defaultMode: 'read-only' } as never);
    const agent = { id: 'official-controller-session', session: { header: { cwd: '/anchor' } } } as unknown as Agent;
    const agentScope = createScope(ctx, agent); Object.defineProperty(agent, 'ctx', { value: agentScope.ctx });
    ctx.provide('agents', { list: () => [agent], get: id => id === agent.id ? agent : undefined } as never);
    const router = installRemoteUserSubprocessRouter(ctx, ctx.get('subprocess')!, f.helper, path => path === '/anchor' ? f.uri : undefined);
    disposers.push(() => router.dispose()); disposers.push(() => agentScope.dispose());
    const controller = new TerminalController(ctx, config);
    const requestSignal = new AbortController(); const id = 'official-terminal' as never;
    const shells = await controller.shells(agent, requestSignal.signal);
    expect(shells.some(shell => shell.name === 'bash')).toBe(true);
    expect(shells.some(shell => shell.path.includes('local'))).toBe(false);
    const created = await controller.create(agent, { id, cols: 80, rows: 24 }, requestSignal.signal);
    expect(created).toMatchObject({ state: 'running', cwd: '/anchor' });
    expect(await controller.create(agent, { id, cols: 80, rows: 24 }, requestSignal.signal)).toEqual(created);
    expect(f.helper.calls.filter(call => call.method === 'process/start')).toHaveLength(1);
    expect(f.helper.calls.find(call => call.method === 'workspace/open')?.params.access).toBe('danger-full-access');
    const a = 'attachment-a' as never; const aLifetime = new AbortController();
    const frames: TerminalFrame[] = []; let output = '';
    const followerA = controller.follow(agent, id, a, aLifetime.signal);
    const consumeA = (async () => {
      for await (const frame of followerA) {
        frames.push(frame); if (frame.type === 'output') output += frame.data;
      }
    })().catch(error => { if (!aLifetime.signal.aborted) throw error; });
    await vi.waitFor(() => expect(frames[0]?.type).toBe('snapshot'));
    await controller.write(agent, id, a, "printf '%s%s\\n' CONTROLLER_ READY\rpwd\r");
    await vi.waitFor(() => { expect(output).toContain('CONTROLLER_READY'); expect(output).toContain(f.root); }, { timeout: 3_000 });
    await controller.resize(agent, id, a, 100, 30);
    await controller.write(agent, id, a, 'stty size\r');
    await vi.waitFor(() => expect(output).toContain('30 100'));
    await controller.write(agent, id, a, "printf '%s\\n' completion-t\t\r");
    await vi.waitFor(() => expect(output).toContain('completion-target-file'));
    await controller.write(agent, id, a, "printf '%s%s\\n' ARROW_ OX\x1b[DK\x1b[3~\r");
    await vi.waitFor(() => expect(output).toContain('ARROW_OK'));
    await controller.write(agent, id, a, 'sleep 20\r');
    await new Promise(resolve => setTimeout(resolve, 100));
    await controller.write(agent, id, a, "\x03printf '%s%s\\n' INTERRUPT_ OK\r");
    await vi.waitFor(() => expect(output).toContain('INTERRUPT_OK'), { timeout: 3_000 });
    const b = 'attachment-b' as never; const bLifetime = new AbortController();
    const followerB = controller.follow(agent, id, b, bLifetime.signal)[Symbol.asyncIterator]();
    const baseline = await followerB.next();
    expect(baseline.value.type).toBe('snapshot');
    expect(baseline.value.screen).toContain('INTERRUPT_OK');
    await expect(controller.write(agent, id, a, 'old attachment')).rejects.toMatchObject({ code: 'terminal/control-unavailable' });
    aLifetime.abort(); await consumeA;
    expect(controller.list(agent.id)[0].state).toBe('running');
    await controller.close(agent, id); await controller.close(agent, id);
    bLifetime.abort(); await followerB.return?.();
    expect(controller.list(agent.id)).toEqual([]);
    await expect(controller.create(agent, { id, cols: 80, rows: 24 }, requestSignal.signal)).rejects.toMatchObject({ code: 'terminal/unavailable' });
    await expect(f.helper.raw.call('health/status')).resolves.toMatchObject({ processes: 0, workspaces: 0 });
  }, 20_000);
});
