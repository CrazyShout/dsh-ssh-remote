import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess, spawn } from 'node:child_process';
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

  it('omits OpenSSH 9.9-only options on older clients so install does not abort', async () => {
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
    // These three keywords are OpenSSH >= 9.9 only; older clients reject them
    // with "Bad configuration option" before the helper can install.
    expect(args).not.toContain('RemoteCommand=none');
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

  it('redacts credentials and home-directory identities from stderr', () => {
    expect(redactHelperDiagnostic('password=hunter2 token:abc /Users/atlas/.ssh/id SSH_AUTH_SOCK=/tmp/s'))
      .toBe('password=[REDACTED] token=[REDACTED] ~/.ssh/id SSH_AUTH_SOCK=[REDACTED]');
  });
});

describe('buildSystemSshArgs capability gating', () => {
  it('emits the 9.9-only transport options for a modern client', () => {
    const args = buildSystemSshArgs('host', 'echo hi', { sessionTypeSupported: true });
    expect(args).toContain('SessionType=default');
    expect(args).toContain('RemoteCommand=none');
    expect(args).toContain('StdinNull=no');
    expect(args).toContain('BatchMode=yes');
  });

  it('withholds the 9.9-only options for an older client', () => {
    const args = buildSystemSshArgs('host', 'echo hi', { sessionTypeSupported: false });
    expect(args).not.toContain('SessionType=default');
    expect(args).not.toContain('RemoteCommand=none');
    expect(args).not.toContain('StdinNull=no');
    expect(args).toContain('BatchMode=yes');
    expect(args).toContain('-T');
  });
});

describe('detectSshCapabilities', () => {
  it('gates SessionType support on OpenSSH >= 9.9 from the -V banner', async () => {
    resetSshCapabilityCache();
    const probe = vi.fn(async () => 'OpenSSH_8.2p1 Ubuntu-4kylin3k1.4update5, OpenSSL 1.1.1f 31 Mar 2020');
    await expect(detectSshCapabilities('ssh', probe)).resolves.toEqual({ sessionTypeSupported: false });
    expect(probe).toHaveBeenCalledTimes(1);
    // Cached: a second probe does not re-run ssh -V.
    await detectSshCapabilities('ssh', probe);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('recognizes OpenSSH 9.9 and newer as SessionType-capable', async () => {
    resetSshCapabilityCache();
    await expect(detectSshCapabilities('ssh', async () => 'OpenSSH_9.9p1, OpenSSL 3.0.13'))
      .resolves.toEqual({ sessionTypeSupported: true });
    resetSshCapabilityCache();
    await expect(detectSshCapabilities('ssh', async () => 'OpenSSH_10.0p1, OpenSSL 3.5.0'))
      .resolves.toEqual({ sessionTypeSupported: true });
  });

  it('falls back to the modern default when the banner is unreadable', async () => {
    resetSshCapabilityCache();
    await expect(detectSshCapabilities('ssh', async () => 'some other ssh client v1.2'))
      .resolves.toEqual({ sessionTypeSupported: true });
  });

  it('falls back to the modern default when ssh -V fails', async () => {
    resetSshCapabilityCache();
    await expect(detectSshCapabilities('ssh', async () => { throw new Error('not found'); }))
      .resolves.toEqual({ sessionTypeSupported: true });
  });
});
