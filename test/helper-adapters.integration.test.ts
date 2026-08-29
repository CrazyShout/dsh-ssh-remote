import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelperRemoteFileSystem, type RemoteHelperProvider } from '../src/helper-fs.js';
import { installRemoteShellRouter, RemoteShellProcessTracker } from '../src/helper-shell.js';
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
    const localRun = vi.fn(async () => ({ local: true }));
    const localStart = vi.fn(() => ({ local: true }));
    const shell = { run: localRun, start: localStart };
    const tracker = new RemoteShellProcessTracker();
    const restore = installRemoteShellRouter(shell as never, fixture.helper, fixture.resolveAnchor, tracker);
    try {
      const result = await shell.run({
        command: "printf 'shell-out'; printf 'shell-err' >&2",
        workdir: '/anchor',
        timeoutMs: 5_000,
        stdoutMaxBytes: 64 * 1024,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any;
      expect(result).toMatchObject({
        exitCode: 0,
        timedOut: false,
        aborted: false,
        stdout: { text: 'shell-out', truncated: false },
        stderr: { text: 'shell-err', truncated: false },
      });
      expect(localRun).not.toHaveBeenCalled();

      const stdin = 'stdin-chunk-'.repeat(100_000);
      const stdinResult = await shell.run({
        command: 'wc -c',
        workdir: '/anchor',
        timeoutMs: 10_000,
        stdoutMaxBytes: 64 * 1024,
        stdin,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any;
      expect(stdinResult.exitCode).toBe(0);
      expect(Number(stdinResult.stdout.text.trim())).toBe(Buffer.byteLength(stdin));

      const abortController = new AbortController();
      const abortedRun = shell.run({
        command: 'sleep 10',
        workdir: '/anchor',
        timeoutMs: 10_000,
        stdoutMaxBytes: 64 * 1024,
        stdin: 'blocked-stdin'.repeat(200_000),
        signal: abortController.signal,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as Promise<any>;
      setTimeout(() => abortController.abort(new Error('abort foreground')), 200);
      await expect(abortedRun).resolves.toMatchObject({ aborted: true, timedOut: false });

      await expect(shell.run({
        command: 'sleep 10',
        workdir: '/anchor',
        timeoutMs: 200,
        stdoutMaxBytes: 64 * 1024,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never)).resolves.toMatchObject({ timedOut: true, aborted: false });

      const process = shell.start({
        command: "printf 'background-out'",
        workdir: '/anchor',
        timeoutMs: 5_000,
        stdoutMaxBytes: 64 * 1024,
        sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/anchor' },
      } as never) as any;
      await process.done;
      expect(process.status).toBe('completed');
      expect(process.readOutput()).toMatchObject({ delta: 'background-out', lossy: false });
      expect(localStart).not.toHaveBeenCalled();

      const controller = new AbortController();
      const cancelled = shell.start({
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

      const owned = shell.start({
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
});
