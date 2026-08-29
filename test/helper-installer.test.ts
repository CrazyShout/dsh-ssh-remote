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
  helperRemotePath,
  redactHelperDiagnostic,
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
    const installer = new RemoteHelperInstaller({ assetPath: path, spawnProcess: spawnProcess as never });

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

  it('rejects option-like aliases before spawning SSH', async () => {
    const path = await asset();
    const spawnProcess = vi.fn();
    const installer = new RemoteHelperInstaller({ assetPath: path, spawnProcess: spawnProcess as never });
    await expect(installer.install('-oProxyCommand=bad')).rejects.toThrow(/invalid SSH alias/u);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('redacts credentials and home-directory identities from stderr', () => {
    expect(redactHelperDiagnostic('password=hunter2 token:abc /Users/atlas/.ssh/id SSH_AUTH_SOCK=/tmp/s'))
      .toBe('password=[REDACTED] token=[REDACTED] ~/.ssh/id SSH_AUTH_SOCK=[REDACTED]');
  });
});
