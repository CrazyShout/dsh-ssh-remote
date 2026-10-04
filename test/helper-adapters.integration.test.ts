import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelperRemoteFileSystem, type RemoteHelperProvider } from '../src/helper-fs.js';
import { installRemoteShellRouter, RemoteShellProcessTracker } from '../src/helper-shell.js';
import type { ShellExecution } from '@deepseek-ai/dsh-shell';
import { RemoteHelperRpcClient } from '../src/helper/rpc-client.js';
import { formatSshUri } from '../src/types.js';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));

class DirectHelper implements RemoteHelperProvider {
  readonly child: ChildProcessWithoutNullStreams;
  readonly clientValue: RemoteHelperRpcClient;
  private stderr = '';

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    child.stderr.on('data', chunk => { this.stderr += String(chunk); });
    this.clientValue = new RemoteHelperRpcClient({
      readable: child.stdout,
      writable: child.stdin,
      closeTransport: () => child.kill('SIGTERM'),
    });
  }

  static async start(): Promise<DirectHelper> {
    const child = spawn('python3', [helper, 'connect', '--stdio', '--direct'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const fixture = new DirectHelper(child);
    await fixture.clientValue.initialize({ clientId: `adapter-${randomUUID()}` });
    return fixture;
  }

  async client(): Promise<RemoteHelperRpcClient> {
    return this.clientValue;
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise<void>(resolve => this.child.once('exit', () => resolve()));
    this.clientValue.close('test complete');
    await Promise.race([
      exited,
      new Promise<void>((_, reject) => setTimeout(
        () => reject(new Error(`helper did not exit: ${this.stderr}`)),
        2_000,
      )),
    ]);
  }
}

const fixtures: DirectHelper[] = [];
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.close()));
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function remoteFixture(): Promise<{
  helper: DirectHelper;
  root: string;
  uri: string;
  resolveAnchor(path: string): string | undefined;
}> {
  const rawRoot = await mkdtemp(join(tmpdir(), 'dsh-helper-adapter-'));
  temporary.push(rawRoot);
  const root = await realpath(rawRoot);
  const uri = formatSshUri({ host: 'fixture', port: 22, user: '', path: root });
  const fixture = await DirectHelper.start();
  fixtures.push(fixture);
  return {
    helper: fixture,
    root,
    uri,
    resolveAnchor: path => path === '/anchor' ? uri : undefined,
  };
}

describe('real TypeScript ↔ Python helper adapters', () => {
  it('supports versioned create/read/stream/edit/list and rejects a stale write', async () => {
    const fixture = await remoteFixture();
    const fs = new HelperRemoteFileSystem(fixture.helper, fixture.resolveAnchor);
    const policy = { mode: 'workspace-write' as const, workspaceRoot: '/anchor' };
    const target = await fs.resolve('note.txt', { cwd: fixture.uri });

    await expect(fs.writeText(target, 'first', { kind: 'createIfAbsent' }, undefined, policy))
      .resolves.toMatchObject({ operation: 'create', before: null, after: 'first' });
    await expect(fs.readText(target)).resolves.toBe('first');

    const observed = await fs.stat(target);
    expect(observed).toMatchObject({ type: 'file', size: 5 });
    expect(String(observed?.version)).toMatch(/^s1:/u);
    await expect(fs.editText(
      target,
      { oldString: 'first', newString: 'second', replaceAll: false },
      { version: observed!.version },
      undefined,
      policy,
    )).resolves.toMatchObject({ before: 'first', after: 'second' });

    const streamed = await fs.streamText(target);
    let text = '';
    for await (const chunk of streamed) text += chunk;
    expect(text).toBe('second');

    const rootTarget = await fs.resolve(fixture.uri);
    await expect(fs.listDir(rootTarget)).resolves.toEqual([
      expect.objectContaining({ name: 'note.txt', type: 'file', size: 6 }),
    ]);

    const current = await fs.stat(target);
    await fs.writeText(target, 'third', { kind: 'replaceIfVersion', version: current!.version }, undefined, policy);
    await expect(fs.writeText(
      target,
      'stale',
      { kind: 'replaceIfVersion', version: current!.version },
      undefined,
      policy,
    )).rejects.toMatchObject({ code: 'FS_STALE_VERSION' });

    const largeTarget = await fs.resolve('large.txt', { cwd: fixture.uri });
    const large = '0123456789abcdef'.repeat(140_000);
    expect(Buffer.byteLength(large, 'utf8')).toBeGreaterThan(2 * 1024 * 1024);
    await expect(fs.writeText(largeTarget, large, { kind: 'createIfAbsent' }, undefined, policy))
      .resolves.toMatchObject({ operation: 'create' });
    await expect(fs.readText(largeTarget)).resolves.toBe(large);

    const raw = fixture.helper.clientValue;
    const workspaceId = randomUUID();
    await raw.call('workspace/open', {
      path: fixture.root,
      access: 'workspace-write',
      workspaceId,
      operationId: `open:${workspaceId}`,
    }, { mutation: true });
    await raw.call('fs/write', {
      workspaceId,
      path: 'binary.dat',
      data: Buffer.from([0xff, 0xfe, 0x00]).toString('base64'),
      intent: { kind: 'overwrite' },
      operationId: `binary:${workspaceId}`,
    }, { mutation: true });
    await raw.call('workspace/close', {
      workspaceId,
      operationId: `close:${workspaceId}`,
    }, { mutation: true });
    const binaryTarget = await fs.resolve('binary.dat', { cwd: fixture.uri });
    await expect(fs.writeText(binaryTarget, 'now-text', undefined, undefined, policy))
      .resolves.toMatchObject({ before: null, after: 'now-text' });
  }, 15_000);

  it('routes foreground and background ShellExecutor calls over the helper wire', async () => {
    const fixture = await remoteFixture();
    const localExecute = vi.fn(async () => ({ local: true }));
    const shell = { execute: localExecute };
    const tracker = new RemoteShellProcessTracker();
    const restore = installRemoteShellRouter(shell as never, fixture.helper, fixture.resolveAnchor, tracker);
    try {
      const result = await (await shell.execute({
        command: "printf 'shell-out'; printf 'shell-err' >&2",
        workdir: '/anchor',
        timeoutMs: 5_000,
        stdoutMaxBytes: 64 * 1024,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any).result();
      expect(result).toMatchObject({
        exitCode: 0,
        timedOut: false,
        aborted: false,
        stdout: { text: 'shell-out', truncated: false },
        stderr: { text: 'shell-err', truncated: false },
      });
      expect(localExecute).not.toHaveBeenCalled();

      const stdin = 'stdin-chunk-'.repeat(100_000);
      const stdinResult = await (await shell.execute({
        command: 'wc -c',
        workdir: '/anchor',
        timeoutMs: 10_000,
        stdoutMaxBytes: 64 * 1024,
        stdin,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any).result();
      expect(stdinResult.exitCode).toBe(0);
      expect(Number(stdinResult.stdout.text.trim())).toBe(Buffer.byteLength(stdin));

      const abortController = new AbortController();
      const abortedExecution = (await shell.execute({
        command: 'sleep 10',
        workdir: '/anchor',
        timeoutMs: 10_000,
        stdoutMaxBytes: 64 * 1024,
        stdin: 'blocked-stdin'.repeat(200_000),
        signal: abortController.signal,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any);
      setTimeout(() => abortController.abort(new Error('abort foreground')), 200);
      await expect(abortedExecution.result()).resolves.toMatchObject({ aborted: true, timedOut: false });

      await expect((await shell.execute({
        command: 'sleep 10',
        workdir: '/anchor',
        timeoutMs: 200,
        stdoutMaxBytes: 64 * 1024,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any).result()).resolves.toMatchObject({ timedOut: true, aborted: false });

      const process = await shell.execute({
        command: "printf 'background-out'",
        workdir: '/anchor',
        timeoutMs: 5_000,
        stdoutMaxBytes: 64 * 1024,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any;
      await process.done;
      expect(process.status).toBe('completed');
      expect(process.readOutput()).toMatchObject({ delta: 'background-out', lossy: false });
      expect(localExecute).not.toHaveBeenCalled();

      const controller = new AbortController();
      const cancelled = await shell.execute({
        command: 'sleep 10',
        workdir: '/anchor',
        timeoutMs: 15_000,
        stdoutMaxBytes: 64 * 1024,
        signal: controller.signal,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any;
      await new Promise(resolve => setTimeout(resolve, 100));
      controller.abort(new Error('cancel background smoke'));
      await Promise.race([
        cancelled.done,
        new Promise((_, reject) => setTimeout(() => reject(new Error('background abort did not quiesce')), 5_000)),
      ]);
      expect(cancelled.status).toBe('killed');

      const owned = await shell.execute({
        command: 'sleep 10',
        workdir: '/anchor',
        timeoutMs: 15_000,
        stdoutMaxBytes: 64 * 1024,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any;
      await new Promise(resolve => setTimeout(resolve, 100));
      await tracker.dispose();
      expect(owned.status).toBe('killed');
    } finally {
      restore();
    }
  }, 15_000);

  it('reads exact byte windows across helper chunks and handles EOF and cancellation', async () => {
    const fixture = await remoteFixture();
    const fs = new HelperRemoteFileSystem(fixture.helper, fixture.resolveAnchor);
    const target = await fs.resolve('ranges.txt', { cwd: fixture.uri });
    const content = Buffer.from('0123456789abcdef'.repeat(30_000));
    await fs.writeText(target, content.toString(), { kind: 'createIfAbsent' }, undefined,
      { mode: 'workspace-write', workspaceRoot: '/anchor' });
    const ranges = [
      { offset: 3, length: 20 },
      { offset: 192 * 1024 - 3, length: 12 },
      { offset: 192 * 1024 + 7, length: 192 * 1024 + 11 },
      { offset: content.length - 5, length: 20 },
      { offset: content.length, length: 20 },
      { offset: content.length + 5, length: 20 },
      { offset: 0, length: 0 },
    ];
    for (const range of ranges) {
      expect(Buffer.from(await fs.readByteRange(target, range)))
        .toEqual(content.subarray(range.offset, range.offset + range.length));
    }
    const controller = new AbortController();
    controller.abort(new Error('cancel byte preview'));
    await expect(fs.readByteRange(target, { offset: 0, length: 10 }, controller.signal))
      .rejects.toMatchObject({ code: 'FS_ABORTED' });
  });

  it('keeps onExpiry:none jobs alive and exposes independent byte-based output cursors', async () => {
    const fixture = await remoteFixture();
    const shell = { execute: vi.fn(async () => null as unknown as ShellExecution) };
    const tracker = new RemoteShellProcessTracker();
    const restore = installRemoteShellRouter(shell as never, fixture.helper, fixture.resolveAnchor, tracker);
    try {
      const process = await shell.execute({
        command: "printf 'A🙂'; sleep 0.2; printf 'B'",
        workdir: '/anchor', timeoutMs: 50, onExpiry: 'none', stdoutMaxBytes: 1024,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never);
      expect(await process.result()).toMatchObject({
        exitCode: 0, timedOut: false, aborted: false,
        stdout: { text: 'A🙂B', truncated: false },
      });
      expect(process.observed.stdout.readFrom(0)).toEqual({ text: 'A🙂B', nextOffset: 6, lossy: false });
      expect(process.observed.stdout.readFrom(1)).toEqual({ text: '🙂B', nextOffset: 6, lossy: false });
      expect(process.observed.stdout.readFrom(6)).toEqual({ text: '', nextOffset: 6, lossy: false });
      expect(process.observed.stdout.readFrom(0)).toEqual({ text: 'A🙂B', nextOffset: 6, lossy: false });
      expect(process.readOutput()).toMatchObject({ delta: 'A🙂B', lossy: false });
      expect(process.readOutput()).toMatchObject({ delta: '', lossy: false });
    } finally {
      restore();
      await tracker.dispose();
    }
  });

  it('honors the stdout byte budget and preserves whole-stream offsets after truncation', async () => {
    const fixture = await remoteFixture();
    const shell = { execute: vi.fn(async () => null as unknown as ShellExecution) };
    const restore = installRemoteShellRouter(shell as never, fixture.helper, fixture.resolveAnchor);
    try {
      const process = await shell.execute({
        command: "printf '0123456789'", workdir: '/anchor', timeoutMs: 5000,
        onExpiry: 'kill', stdoutMaxBytes: 8,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never);
      expect(await process.result()).toMatchObject({ stdout: { text: '23456789', truncated: true } });
      expect(process.observed.stdout.readFrom(0)).toEqual({ text: '23456789', nextOffset: 10, lossy: true });
      expect(process.observed.stdout.readFrom(8)).toEqual({ text: '89', nextOffset: 10, lossy: false });
      expect(process.observed.stdout.readFrom(10)).toEqual({ text: '', nextOffset: 10, lossy: false });

      const full = await shell.execute({
        command: "python3 -c \"print('x' * 70000, end='')\"", workdir: '/anchor', timeoutMs: 5000,
        onExpiry: 'kill', stdoutMaxBytes: 80000,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never);
      expect((await full.result()).stdout).toEqual({ text: 'x'.repeat(70000), truncated: false });
    } finally {
      restore();
    }
  });

  it('retains the correct final output after a large command exits before the first read', async () => {
    const fixture = await remoteFixture();
    const shell = { execute: vi.fn(async () => null as unknown as ShellExecution) };
    const originalCall = fixture.helper.clientValue.call.bind(fixture.helper.clientValue);
    const firstReads = new Set<string>();
    fixture.helper.clientValue.call = async (method, params = {}, options = {}) => {
      if (method === 'process/read' && !firstReads.has(String(params.processId))) {
        firstReads.add(String(params.processId));
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const status = await originalCall<{ running: boolean }>('process/status', { processId: params.processId });
          if (!status.running) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return originalCall(method, params, options);
    };
    const restore = installRemoteShellRouter(shell as never, fixture.helper, fixture.resolveAnchor);
    try {
      for (const cap of [600_000, 64 * 1024]) {
        const execution = await shell.execute({
          command: "python3 -c \"import sys; sys.stdout.write('x'*524288+'FINAL_STDOUT'); sys.stderr.write('e'*70000+'FINAL_STDERR')\"",
          workdir: '/anchor', timeoutMs: 10_000, stdoutMaxBytes: cap,
          sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
        } as never);
        const result = await execution.result();
        expect(result.exitCode).toBe(0);
        expect(result.stdout.text.endsWith('FINAL_STDOUT')).toBe(true);
        expect(result.stdout.truncated).toBe(cap < 524288);
        if (cap > 524288) expect(result.stdout.text).toBe('x'.repeat(524288) + 'FINAL_STDOUT');
        else expect(Buffer.byteLength(result.stdout.text)).toBe(cap);
        expect(result.stderr.text.endsWith('FINAL_STDERR')).toBe(true);
        expect(result.stderr.truncated).toBe(true);
      }
    } finally { restore(); }
  }, 15_000);

  it('bounds cancellation when a deliberately detached child keeps stdout open', async () => {
    const fixture = await remoteFixture();
    const shell = { execute: vi.fn(async () => null as unknown as ShellExecution) };
    const restore = installRemoteShellRouter(shell as never, fixture.helper, fixture.resolveAnchor);
    let escaped: number | undefined;
    try {
      const script = 'import os,time; p=os.fork(); print(p,flush=True) if p else None; os._exit(0) if p else None; os.setsid(); time.sleep(20)';
      const started = Date.now();
      const execution = await shell.execute({
        command: `python3 -c ${JSON.stringify(script)}`, workdir: '/anchor', timeoutMs: 300,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never);
      // Capture the known test child PID early so cleanup also runs if the
      // bounded-completion assertion fails.
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const match = execution.observed.stdout.readFrom(0).text.match(/^\d+/u);
        if (match) { escaped = Number(match[0]); break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const result = await execution.result();
      expect(result.timedOut).toBe(true);
      expect(escaped).toBeGreaterThan(1);
      expect(Date.now() - started).toBeLessThan(9_000);
    } finally {
      if (escaped !== undefined) {
        try { process.kill(escaped, 'SIGKILL'); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      }
      restore();
    }
  }, 15_000);

  it('reports infrastructure failures instead of a successful empty command result', async () => {
    const failure = new Error('fixture helper unavailable');
    const shell = { execute: vi.fn(async () => null as unknown as ShellExecution) };
    const restore = installRemoteShellRouter(shell as never,
      { client: async () => { throw failure; } }, () => 'ssh://fixture/work');
    try {
      await expect((async () => {
        const process = await shell.execute({ command: 'true', workdir: '/anchor', timeoutMs: 5000,
          onExpiry: 'kill', stdoutMaxBytes: 1024 } as never);
        return process.result();
      })()).rejects.toThrow('fixture helper unavailable');
    } finally {
      restore();
    }
  });

  it('expires preparation without spawning and rejects cancellation before publication', async () => {
    const fixture = await remoteFixture();
    const calls = vi.spyOn(fixture.helper.clientValue, 'call');
    const shell = { execute: vi.fn(async () => null as unknown as ShellExecution) };
    const provider: RemoteHelperProvider = {
      async client(_uri, signal) {
        if (signal !== undefined) {
          await new Promise<void>((_resolve, reject) => {
            if (signal.aborted) reject(signal.reason);
            else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        }
        return fixture.helper.clientValue;
      },
    };
    const restore = installRemoteShellRouter(shell as never, provider, fixture.resolveAnchor);
    try {
      const expired = await shell.execute({ command: 'true', workdir: '/anchor', timeoutMs: 30,
        onExpiry: 'kill', stdoutMaxBytes: 1024 } as never);
      await expect(expired.result()).resolves.toMatchObject({
        exitCode: null, signal: null, timedOut: true, aborted: false,
        stdout: { text: '', truncated: false }, stderr: { text: '', truncated: false },
      });
      expect(expired.result()).toBe(expired.result());
      const controller = new AbortController();
      const reason = new Error('cancel before publication');
      controller.abort(reason);
      await expect(shell.execute({ command: 'true', workdir: '/anchor', timeoutMs: 5000,
        onExpiry: 'none', stdoutMaxBytes: 1024, signal: controller.signal } as never)).rejects.toBe(reason);
      expect(calls.mock.calls.some(([method]) => method === 'process/start')).toBe(false);
    } finally {
      restore();
    }
  });

  it('keeps done readable while result rejects a failure after process publication', async () => {
    const fixture = await remoteFixture();
    const originalCall = fixture.helper.clientValue.call.bind(fixture.helper.clientValue);
    const failure = new Error('fixture output transport lost');
    vi.spyOn(fixture.helper.clientValue, 'call').mockImplementation(async (method, params, options) => {
      if (method === 'process/read') throw failure;
      return originalCall(method, params, options);
    });
    const shell = { execute: vi.fn(async () => null as unknown as ShellExecution) };
    const restore = installRemoteShellRouter(shell as never, fixture.helper, fixture.resolveAnchor);
    try {
      const process = await shell.execute({ command: 'sleep 10', workdir: '/anchor', timeoutMs: 5000,
        onExpiry: 'kill', stdoutMaxBytes: 1024 } as never);
      await expect(process.done).resolves.toBeUndefined();
      await expect(process.result()).rejects.toBe(failure);
      expect(process.observed.stderr.readFrom(0).text).toContain('fixture output transport lost');
      expect(process.readOutput().delta).toContain('fixture output transport lost');
    } finally {
      restore();
    }
  });
});
