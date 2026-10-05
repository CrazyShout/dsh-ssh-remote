import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  RemoteHelperInstaller,
  buildHelperConnectCommand,
  buildSystemSshArgs,
  detectSshCapabilities,
  helperRemotePath,
  redactHelperDiagnostic,
  resetSshCapabilityCache,
} from '../src/helper/installer.js';

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  pid: number | undefined = 42;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  readonly uploaded: Buffer[] = [];

  constructor(exitCode = 0) {
    super();
    this.stdin.on('data', (chunk) => this.uploaded.push(Buffer.from(chunk)));
    this.stdin.once('finish', () => {
      this.exitCode = exitCode;
      queueMicrotask(() => this.emit('close', exitCode, null));
    });
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killed = true;
    this.signalCode = signal;
    queueMicrotask(() => this.emit('close', null, signal));
    return true;
  }
}

let temporary: string | undefined;
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetSshCapabilityCache();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  temporary = undefined;
});

async function asset(content = '# helper\n'): Promise<string> {
  temporary = await mkdtemp(join(tmpdir(), 'dsh-helper-installer-'));
  const path = join(temporary, 'dsh_remote_helper.py');
  await writeFile(path, content, { mode: 0o600 });
  return path;
}

describe('RemoteHelperInstaller', () => {
  it('uploads the verified asset through hardened system SSH arguments', async () => {
    const path = await asset('#!/usr/bin/env python3\nprint("ok")\n');
    const child = new FakeChild();
    const spawnProcess = vi.fn(() => child as unknown as ReturnType<typeof spawn>);
    const installer = new RemoteHelperInstaller({
      assetPath: path,
      spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true },
    });

    const result = await installer.install('gpu-dev');

    expect(Buffer.concat(child.uploaded).toString('utf8')).toContain('print("ok")');
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    const args = spawnProcess.mock.calls[0][1] as string[];
    expect(args).toContain('BatchMode=yes');
    expect(args).toContain('RemoteCommand=none');
    expect(args).toContain('SessionType=default');
    expect(args).toContain('StdinNull=no');
    expect(args).toContain('gpu-dev');
    expect(args.at(-1)).toContain(result.sha256);
    expect(args.at(-1)).toContain('chmod 700');
    expect(args.at(-1)).toContain('chmod 600');
    expect(result.remotePath).toBe(helperRemotePath(result.sha256));
    expect(buildHelperConnectCommand(result.sha256)).toContain('connect --stdio');
  });

  it('omits unsupported transport options on older clients so install does not abort', async () => {
    const path = await asset('#!/usr/bin/env python3\nprint("ok")\n');
    const child = new FakeChild();
    const spawnProcess = vi.fn(() => child as unknown as ReturnType<typeof spawn>);
    const installer = new RemoteHelperInstaller({
      assetPath: path,
      spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: false },
    });

    await installer.install('openkylin-atom');

    const args = spawnProcess.mock.calls[0][1] as string[];
    expect(args).toContain('BatchMode=yes');
    // RemoteCommand works on OpenSSH 8.2 and must still override a Host entry.
    expect(args).toContain('RemoteCommand=none');
    expect(args).not.toContain('SessionType=default');
    expect(args).not.toContain('StdinNull=no');
    expect(args).toContain('openkylin-atom');
  });

  it('rejects option-like aliases before spawning SSH', async () => {
    const path = await asset();
    const spawnProcess = vi.fn();
    const installer = new RemoteHelperInstaller({ assetPath: path, spawnProcess: spawnProcess as never });
    await expect(installer.install('-oProxyCommand=bad')).rejects.toThrow(/invalid SSH alias/u);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('contains an asynchronous EPIPE when SSH exits during upload', async () => {
    const path = await asset(Buffer.alloc(1024 * 1024, 1).toString());
    const child = new FakeChild();
    child.stdin.removeAllListeners('finish');
    child.stdin.once('finish', () => {
      const error = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
      queueMicrotask(() => child.stdin.emit('error', error));
    });
    const spawnProcess = vi.fn(() => child as unknown as ReturnType<typeof spawn>);
    const installer = new RemoteHelperInstaller({ assetPath: path, spawnProcess: spawnProcess as never });

    await expect(installer.install('offline-host')).rejects.toThrow('failed to upload remote helper');
    expect(child.killed).toBe(true);
  });

  it('waits for close after TERM and never escalates after the child closes', async () => {
    const path = await asset();
    vi.useFakeTimers();
    const child = new FakeChild();
    child.stdin.removeAllListeners('finish');
    const kill = vi.spyOn(child, 'kill').mockImplementation(() => true);
    const controller = new AbortController();
    const reason = new Error('cancel requested');
    const installer = new RemoteHelperInstaller({ assetPath: path,
      spawnProcess: (() => child) as never, capabilities: { sessionTypeSupported: true }, timeoutMs: 10_000 });
    let settled = false;
    const result = installer.install('local-fixture', controller.signal).catch((error) => {
      settled = true;
      return error;
    });
    controller.abort(reason);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(kill.mock.calls).toEqual([['SIGTERM']]);
    child.signalCode = 'SIGTERM';
    child.emit('close', null, 'SIGTERM');
    expect(await result).toBe(reason);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(kill.mock.calls).toEqual([['SIGTERM']]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses confirmed shutdown when a spawned child is missing a required pipe', async () => {
    const path = await asset();
    const child = new FakeChild();
    Object.defineProperty(child, 'stdout', { value: null });
    let closed = false;
    child.once('close', () => { closed = true; });
    const kill = vi.spyOn(child, 'kill');
    const installer = new RemoteHelperInstaller({ assetPath: path,
      spawnProcess: (() => child) as never, capabilities: { sessionTypeSupported: true } });
    await expect(installer.install('local-fixture')).rejects.toThrow('did not expose piped stdio');
    expect(closed).toBe(true);
    expect(kill.mock.calls).toEqual([['SIGTERM']]);
  });

  it('preserves a spawn failure without signaling an unspawned child', async () => {
    const path = await asset();
    const child = new FakeChild();
    child.stdin.removeAllListeners('finish');
    child.pid = undefined;
    const kill = vi.spyOn(child, 'kill');
    const installer = new RemoteHelperInstaller({ assetPath: path,
      spawnProcess: (() => child) as never, capabilities: { sessionTypeSupported: true } });
    const result = installer.install('local-fixture').catch((error) => error);
    const cause = new Error('spawn ENOENT');
    child.emit('error', cause);
    child.emit('close', -2, null);
    expect(await result).toMatchObject({ message: 'failed to start system SSH: spawn ENOENT', cause });
    expect(kill).not.toHaveBeenCalled();
  });

  it('reports an unconfirmed cleanup while preserving the original timeout', async () => {
    const path = await asset();
    vi.useFakeTimers();
    const child = new FakeChild();
    child.stdin.removeAllListeners('finish');
    const kill = vi.spyOn(child, 'kill').mockImplementation((name) => {
      if (name === 'SIGTERM') throw new Error('operation not permitted');
      return false;
    });
    const installer = new RemoteHelperInstaller({ assetPath: path,
      spawnProcess: (() => child) as never, capabilities: { sessionTypeSupported: true }, timeoutMs: 10 });
    const result = installer.install('local-fixture').catch((error) => error);
    await vi.advanceTimersByTimeAsync(1_510);
    const error = await result;
    expect(error.message).toContain('timed out after 10ms');
    expect(error.message).toContain('cleanup failed: child close was not observed');
    expect(error.message).toContain('SIGTERM: Error: operation not permitted');
    expect(error.message).toContain('SIGKILL was not delivered');
    expect(error.cause.message).toBe('remote helper installation timed out after 10ms');
    expect(kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(kill).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    child.emit('close', null, 'SIGKILL');
  });

  it('does not signal an exited child whose inherited pipes have not closed', async () => {
    const path = await asset();
    vi.useFakeTimers();
    const child = new FakeChild();
    child.stdin.removeAllListeners('finish');
    const kill = vi.spyOn(child, 'kill');
    const installer = new RemoteHelperInstaller({ assetPath: path,
      spawnProcess: (() => child) as never, capabilities: { sessionTypeSupported: true }, timeoutMs: 10 });
    const result = installer.install('local-fixture').catch((error) => error);
    child.exitCode = 0;
    child.emit('exit', 0, null);
    await vi.advanceTimersByTimeAsync(1_510);
    expect((await result).message).toContain('child close was not observed');
    expect(kill).not.toHaveBeenCalled();
    child.emit('close', 0, null);
  });

  it('clears the upload timeout and abort listener after a successful upload', async () => {
    const path = await asset();
    vi.useFakeTimers();
    const child = new FakeChild();
    const kill = vi.spyOn(child, 'kill');
    const controller = new AbortController();
    const installer = new RemoteHelperInstaller({ assetPath: path,
      spawnProcess: (() => child) as never, capabilities: { sessionTypeSupported: true }, timeoutMs: 10 });
    await installer.install('local-fixture', controller.signal);
    controller.abort(new Error('late cancellation'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('completes a real local upload without signaling the child', async () => {
    const path = await asset();
    let child!: ChildProcess;
    let closed = false;
    const installer = new RemoteHelperInstaller({ assetPath: path,
      capabilities: { sessionTypeSupported: true }, timeoutMs: 1_000,
      spawnProcess: ((_binary, _args, options) => {
        child = spawn(process.execPath, ['-e', 'process.stdin.resume()'], options);
        child.once('close', () => { closed = true; });
        return child;
      }) as typeof spawn,
    });
    const result = installer.install('never-contacted.invalid');
    const kill = vi.spyOn(child, 'kill');
    await expect(result).resolves.toMatchObject({ alias: 'never-contacted.invalid' });
    expect(closed).toBe(true);
    expect(child.exitCode).toBe(0);
    expect(kill).not.toHaveBeenCalled();
  });

  it.each(['abort', 'timeout'] as const)('reaps a real TERM-resistant local upload child after %s', async (failure) => {
    const path = await asset();
    const controller = new AbortController();
    const reason = new Error('cancel local upload');
    let child!: ChildProcess;
    let closed = false;
    let output = '';
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
    const installer = new RemoteHelperInstaller({ assetPath: path,
      capabilities: { sessionTypeSupported: true }, timeoutMs: failure === 'timeout' ? 1_000 : 10_000,
      spawnProcess: ((_binary, _args, options) => {
        child = spawn(process.execPath, ['-e', `
          process.on('SIGTERM', () => process.stderr.write('TERM-ignored\\n'));
          process.stdin.resume();
          process.stdout.write('ready\\n');
          setInterval(() => {}, 1000);
        `], options);
        child.stdout!.on('data', () => resolveReady());
        child.stderr!.on('data', (chunk) => { output += String(chunk); });
        child.once('close', () => { closed = true; });
        return child;
      }) as typeof spawn,
    });
    const result = installer.install('never-contacted.invalid', controller.signal).catch((error) => error);
    const kill = vi.spyOn(child, 'kill');
    // Promise.race avoids hanging the suite if the fixture cannot start. The
    // finally block always cleans exactly this owned child, never a name/PID scan.
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([ready, new Promise<never>((_resolve, reject) => {
        readinessTimer = setTimeout(() => reject(new Error('local child did not become ready')), 3_000);
      })]);
      clearTimeout(readinessTimer);
      if (failure === 'abort') controller.abort(reason);
      const error = await result;
      expect(closed).toBe(true);
      expect(output).toContain('TERM-ignored');
      expect(child.signalCode).toBe('SIGKILL');
      expect(kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
      if (failure === 'abort') expect(error).toBe(reason);
      else expect(error.message).toBe('remote helper installation timed out after 1000ms');
      expect(() => process.kill(child.pid!, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(kill).toHaveBeenCalledTimes(2);
    } finally {
      clearTimeout(readinessTimer);
      if (!closed) {
        const close = new Promise<void>((resolve) => child.once('close', () => resolve()));
        child.kill('SIGKILL');
        await close;
      }
      await result;
    }
  }, 7_000);

  it('redacts credentials and home-directory identities from stderr', () => {
    expect(redactHelperDiagnostic('password=hunter2 token:abc /Users/atlas/.ssh/id SSH_AUTH_SOCK=/tmp/s'))
      .toBe('password=[REDACTED] token=[REDACTED] ~/.ssh/id SSH_AUTH_SOCK=[REDACTED]');
  });
});

describe('buildSystemSshArgs capability gating', () => {
  it('emits supported transport options for a modern client', () => {
    const args = buildSystemSshArgs('host', 'echo hi', { sessionTypeSupported: true });
    expect(args).toContain('SessionType=default');
    expect(args).toContain('RemoteCommand=none');
    expect(args).toContain('StdinNull=no');
    expect(args).toContain('BatchMode=yes');
  });

  it('withholds unsupported options but keeps RemoteCommand on an 8.2 client', () => {
    const args = buildSystemSshArgs('host', 'echo hi', { sessionTypeSupported: false });
    expect(args).not.toContain('SessionType=default');
    expect(args).toContain('RemoteCommand=none');
    expect(args).not.toContain('StdinNull=no');
    expect(args).toContain('BatchMode=yes');
    expect(args).toContain('-T');
  });
});

describe('detectSshCapabilities', () => {
  it('caches the result of an option probe for an older client', async () => {
    resetSshCapabilityCache();
    const probe = vi.fn(async () => false);
    await expect(detectSshCapabilities('ssh', probe)).resolves.toEqual({ sessionTypeSupported: false });
    expect(probe).toHaveBeenCalledTimes(1);
    // Cached: a second connection does not re-run ssh -G.
    await detectSshCapabilities('ssh', probe);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('enables options accepted by the actual binary, including OpenSSH 8.7', async () => {
    resetSshCapabilityCache();
    await expect(detectSshCapabilities('ssh', async () => true))
      .resolves.toEqual({ sessionTypeSupported: true });
  });

  it('fails closed when the option probe throws', async () => {
    resetSshCapabilityCache();
    await expect(detectSshCapabilities('ssh', async () => { throw new Error('not found'); }))
      .resolves.toEqual({ sessionTypeSupported: false });
  });

  it('probes the installed SSH client without contacting a host', async () => {
    resetSshCapabilityCache();
    await expect(detectSshCapabilities('/usr/bin/ssh'))
      .resolves.toEqual({ sessionTypeSupported: true });
  });
});
