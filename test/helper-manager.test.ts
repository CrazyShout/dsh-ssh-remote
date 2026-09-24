import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { spawn } from 'node:child_process';
import { DshRpcLineDecoder, encodeDshRpcFrame } from '../src/helper/framing.js';
import { RemoteHelperManager } from '../src/helper/manager.js';
import type { DshRpcFrame } from '../src/helper/protocol.js';

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  pid: number | undefined = 100;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (this.exitCode !== null || this.signalCode !== null) return false;
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

async function helperAsset(): Promise<string> {
  temporary = await mkdtemp(join(tmpdir(), 'dsh-helper-manager-'));
  const path = join(temporary, 'dsh_remote_helper.py');
  await writeFile(path, '# helper fixture\n');
  return path;
}

const completeCapabilities = {
  filesystem: { confinement: 'dirfd-no-follow' },
  process: { supported: true, sandbox: 'bwrap', restrictedFailClosed: true },
  pty: { supported: true, resize: true },
  session: { resume: true },
};

function hello(capabilities: Record<string, unknown> = completeCapabilities): DshRpcFrame {
  return {
    dshRpc: '1', method: 'server/hello', params: {
      protocol: { min: 1, max: 1 }, helperVersion: '0.3.0',
      serverInstanceId: 'server-1', serverEpoch: 1,
      platform: { system: 'Linux', release: '6.8', machine: 'x86_64', python: '3.12' },
      capabilities,
      limits: { maxFrameBytes: 1_048_576 },
    },
  };
}

function helperPeer(
  child: FakeChild,
  options: {
    resumed?: boolean;
    capabilities?: Record<string, unknown>;
    onRequest?: (frame: Extract<DshRpcFrame, { method: string }>, child: FakeChild) => boolean;
  } = {},
): void {
  const decoder = new DshRpcLineDecoder();
  child.stdin.on('data', (chunk) => {
    for (const frame of decoder.push(chunk)) {
      if (!('method' in frame) || !('id' in frame)) continue;
      if (options.onRequest?.(frame, child) === true) continue;
      if (frame.method === 'initialize') {
        const clientId = String(frame.params?.clientId);
        child.stdout.write(encodeDshRpcFrame({
          dshRpc: '1', id: frame.id, result: {
            protocol: 1,
            session: {
              sessionId: 'session-1', clientId, resumeToken: 'resume-1', resumed: options.resumed === true,
              retentionMs: 120_000, serverEpoch: 1,
            },
            capabilities: options.capabilities ?? completeCapabilities,
            limits: { maxFrameBytes: 1_048_576 },
          },
        }));
      } else if (frame.method === 'health/ping') {
        child.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id, result: { pong: true } }));
      } else if (frame.method === 'health/status') {
        child.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id, result: { healthy: true } }));
      } else if (frame.method === 'session/close') {
        child.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id, result: { closed: true } }));
      }
    }
  });
  queueMicrotask(() => child.stdout.write(encodeDshRpcFrame(hello(options.capabilities))));
}

describe('RemoteHelperManager', () => {
  it('fails closed before SSH when a configured alias was removed', async () => {
    const path = await helperAsset();
    const spawnProcess = vi.fn();
    const manager = new RemoteHelperManager({
      assetPath: path,
      spawnProcess: spawnProcess as never,
      aliasValidator: () => false,
    });
    await expect(manager.client('removed-host')).rejects.toThrow(/no longer present/u);
    expect(spawnProcess).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it('single-flights one raw SSH alias, initializes health, and exposes status', async () => {
    const path = await helperAsset();
    const children: FakeChild[] = [];
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      children.push(child);
      if (String(args.at(-1)).includes('connect --stdio')) {
        helperPeer(child);
      } else {
        child.stdin.once('finish', () => {
          child.exitCode = 0;
          queueMicrotask(() => child.emit('close', 0, null));
        });
      }
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({
      assetPath: path,
      spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true },
      healthIntervalMs: 0,
      reconnectBaseMs: 100,
      reconnectMaxMs: 100,
      random: () => 0.5,
      now: () => 1_000,
    });
    const statuses: string[] = [];
    manager.onStatus((status) => statuses.push(status.state));

    const [first, second] = await Promise.all([
      manager.client('gpu'),
      manager.client('ssh://gpu/home/atlas/project'),
    ]);

    expect(first).toBe(second);
    expect(spawnProcess).toHaveBeenCalledTimes(2); // one atomic upload + one persistent connect
    expect(manager.status('gpu')).toMatchObject({
      state: 'connected', helperVersion: '0.3.0', sessionId: 'session-1',
    });
    await expect(first.call('health/status')).resolves.toEqual({ healthy: true });
    expect(statuses).toEqual(expect.arrayContaining(['installing', 'connecting', 'connected']));

    children[1].stderr.write('token=secret /home/atlas/private\n');
    await vi.waitFor(() => {
      expect(manager.diagnostics('gpu').stderr).toContain('token=[REDACTED]');
    });
    expect(manager.diagnostics('gpu').stderr).not.toContain('/home/atlas');

    // An unexpected close schedules full-jitter reconnect. With a 100ms
    // ceiling and random=0.5 the next attempt is exactly 50ms later.
    children[1].exitCode = 255;
    children[1].emit('close', 255, null);
    await vi.waitFor(() => expect(manager.status('gpu').state).toBe('reconnecting'));
    expect(manager.status('gpu').nextRetryAt).toBe(1_050);
    await manager.close('gpu');
    expect(manager.status('gpu').state).toBe('disconnected');
    await manager.dispose();
  });

  it('keeps one facade and replays at most once only after verified session resume', async () => {
    const path = await helperAsset();
    let connectCount = 0;
    let readCalls = 0;
    let writeCalls = 0;
    const readNextCursors: string[] = [];
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      if (!String(args.at(-1)).includes('connect --stdio')) {
        child.stdin.once('finish', () => {
          child.exitCode = 0;
          queueMicrotask(() => child.emit('close', 0, null));
        });
        return child as unknown as ReturnType<typeof spawn>;
      }
      connectCount += 1;
      const ordinal = connectCount;
      helperPeer(child, {
        resumed: ordinal > 1,
        onRequest(frame, transport) {
          if (frame.method === 'process/read') {
            readCalls += 1;
            if (ordinal === 1) {
              transport.exitCode = 255;
              queueMicrotask(() => transport.emit('close', 255, null));
            } else {
              transport.stdout.write(encodeDshRpcFrame({
                dshRpc: '1', id: frame.id, result: { chunks: [], status: { kind: 'running' } },
              }));
            }
            return true;
          }
          if (frame.method === 'fs/write') {
            writeCalls += 1;
            if (ordinal === 2) {
              transport.exitCode = 255;
              queueMicrotask(() => transport.emit('close', 255, null));
            } else {
              transport.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id, result: { version: 'v2' } }));
            }
            return true;
          }
          if (frame.method === 'fs/stat') {
            transport.stdout.write(encodeDshRpcFrame({
              dshRpc: '1', id: frame.id,
              error: { code: 'E_NOT_FOUND', message: 'gone', retryable: false },
            }));
            return true;
          }
          if (frame.method === 'fs/readNext') {
            readNextCursors.push(String(frame.params?.afterSeq));
            if (ordinal === 3) {
              transport.exitCode = 255;
              queueMicrotask(() => transport.emit('close', 255, null));
            } else {
              transport.stdout.write(encodeDshRpcFrame({
                dshRpc: '1', id: frame.id,
                result: { seq: '1', data: Buffer.from('chunk').toString('base64'), eof: false },
              }));
            }
            return true;
          }
          return false;
        },
      });
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({
      assetPath: path,
      spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true },
      healthIntervalMs: 0,
      reconnectBaseMs: 1_000,
      reconnectMaxMs: 1_000,
      random: () => 0.9,
    });

    const facade = await manager.client('gpu');
    await expect(facade.call('process/read', { processId: 'p1' }))
      .resolves.toMatchObject({ status: { kind: 'running' } });
    expect(readCalls).toBe(2);
    expect(connectCount).toBe(2);
    expect(await manager.client('gpu')).toBe(facade);

    const interrupted = facade.call('fs/write', { path: 'x' }, { mutation: true });
    await expect(interrupted).rejects.toMatchObject({
      kind: 'disconnect', mutationMayHaveStarted: true,
    });
    expect(connectCount).toBe(3); // reconnect happened immediately
    expect(writeCalls).toBe(1); // but no operationId means no replay

    await expect(facade.call('fs/stat', { path: 'missing' })).rejects.toMatchObject({ code: 'E_NOT_FOUND' });
    await expect(facade.call('fs/readNext', { handleId: 'h1', afterSeq: '0' }))
      .resolves.toMatchObject({ seq: '1', eof: false });
    expect(readNextCursors).toEqual(['0', '0']); // response loss retries the same cursor, never the next one
    expect(connectCount).toBe(4);
    const aborted = new AbortController();
    aborted.abort(new Error('stop'));
    await expect(facade.call('health/status', {}, { signal: aborted.signal })).rejects.toThrow('stop');
    expect(connectCount).toBe(4); // RPC errors and caller aborts never reconnect/replay
    await manager.dispose();
  });

  it('reports degraded when resume, PTY, or restricted sandbox capabilities are absent', async () => {
    const path = await helperAsset();
    const degradedCapabilities = {
      filesystem: { confinement: 'dirfd-no-follow' },
      process: { supported: true, sandbox: 'none', restrictedFailClosed: true },
      pty: { supported: false },
      session: { resume: false },
    };
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      if (String(args.at(-1)).includes('connect --stdio')) helperPeer(child, { capabilities: degradedCapabilities });
      else child.stdin.once('finish', () => {
        child.exitCode = 0;
        queueMicrotask(() => child.emit('close', 0, null));
      });
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({
      assetPath: path,
      spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true },
      healthIntervalMs: 0,
    });

    await manager.client('gpu');
    expect(manager.status('gpu').state).toBe('degraded');
    await manager.dispose();
  });
});
