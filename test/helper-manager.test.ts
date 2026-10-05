import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { spawn } from 'node:child_process';
import { DshRpcLineDecoder, encodeDshRpcFrame } from '../src/helper/framing.js';
import { RemoteHelperManager } from '../src/helper/manager.js';
import type { RemoteHelperSessionCallOptions } from '../src/helper/rpc-client.js';
import type { DshRpcFrame } from '../src/helper/protocol.js';
import { openRemoteUserTerminal } from '../src/user-pty.js';

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
    retentionMs?: number;
    sessionId?: string;
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
              sessionId: options.sessionId ?? 'session-1', clientId, resumeToken: 'resume-1', resumed: options.resumed === true,
              retentionMs: options.retentionMs ?? 120_000, serverEpoch: 1,
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
  async function retainedTerminalFixture(options: {
    failures?: number; permanent?: boolean; retentionMs?: number; replace?: boolean; dropWrite?: boolean; holdFirstResume?: boolean;
    blackhole?: 'process/read' | 'process/status' | 'process/write'; blackholeEveryTransport?: boolean;
  } = {}) {
    const transports: FakeChild[] = [];
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    let running = true; let processId = ''; let resumeAttempts = 0; let droppedWrite = false;
    let releaseResume: (() => void) | undefined;
    const capabilities = { ...completeCapabilities, process: { ...completeCapabilities.process, sequencedWrite: true },
      pty: { ...completeCapabilities.pty, sequencedResize: true } };
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      if (!String(args.at(-1)).includes('connect --stdio')) {
        child.stdin.once('finish', () => { child.exitCode = 0; queueMicrotask(() => child.emit('close', 0, null)); });
      } else {
        const ordinal = transports.push(child);
        helperPeer(child, { resumed: ordinal > 1, retentionMs: options.retentionMs, capabilities,
          sessionId: options.replace && ordinal > 1 ? 'replacement-session' : 'session-1',
          onRequest(frame, peer) {
            if (ordinal > 1 && frame.method === 'initialize') {
              resumeAttempts += 1;
              if (options.holdFirstResume && resumeAttempts === 1) {
                releaseResume = () => peer.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result: {
                  protocol: 1, session: { sessionId: 'session-1', clientId: String(frame.params?.clientId), resumeToken: 'resume-1',
                    resumed: true, retentionMs: options.retentionMs ?? 120_000, serverEpoch: 1 }, capabilities, limits: {},
                } }));
                return true;
              }
              if (options.permanent || resumeAttempts <= (options.failures ?? 0)) {
                peer.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, error: {
                  code: options.permanent ? 'E_DENIED' : 'E_BUSY', message: options.permanent ? 'permanent fixture denial' : 'temporary fixture outage',
                  retryable: !options.permanent,
                } }));
                return true;
              }
            }
            if (!frame.method.startsWith('process/') && !frame.method.startsWith('workspace/')) return false;
            calls.push({ method: frame.method, params: frame.params ?? {} });
            if (frame.method === options.blackhole && (ordinal === 1 || options.blackholeEveryTransport)) return true;
            const reply = (result: Record<string, unknown>) => peer.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result }));
            if (frame.method === 'process/start') processId = String(frame.params?.processId);
            if (frame.method === 'process/terminate') running = false;
            if (frame.method === 'process/start' || frame.method === 'process/status') {
              reply({ processId, pid: 321, running, exitCode: running ? null : 0, signal: null });
            } else if (frame.method === 'process/read') {
              const seq = ordinal > 1 ? '2' : '1';
              const chunks = Number(frame.params?.afterSeq) < Number(seq)
                ? [{ seq, stream: 'pty', data: Buffer.from(ordinal > 1 ? 'AFTER_RESUME' : 'BEFORE_OUTAGE').toString('base64') }] : [];
              setTimeout(() => reply({ chunks, nextSeq: seq, truncated: false, exited: !running,
                exitCode: running ? null : 0, signal: null }), 5);
            } else if (frame.method === 'process/write') {
              if (options.dropWrite && !droppedWrite) {
                droppedWrite = true; peer.exitCode = 255; queueMicrotask(() => peer.emit('close', 255, null));
              } else reply({ written: Buffer.from(String(frame.params?.data), 'base64').length,
                nextSeq: (BigInt(String(frame.params?.afterSeq ?? '0')) + 1n).toString() });
            }
            else reply({});
            return true;
          },
        });
      }
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({ assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true }, healthIntervalMs: 0, reconnectBaseMs: 20, reconnectMaxMs: 20, random: () => 0.9 });
    const disconnect = () => { const first = transports[0]; first.exitCode = 255; first.emit('close', 255, null); };
    return { manager, calls, transports, disconnect, resumeAttempts: () => resumeAttempts, releaseResume: () => releaseResume?.() };
  }

  it('retains a terminal and its cursor through multiple failed reconnect attempts without cleanup or respawn', async () => {
    const f = await retainedTerminalFixture({ failures: 2 });
    const terminal = await openRemoteUserTerminal('ssh://gpu/tmp', {
      argv: ['/bin/sh'], cwd: '/tmp', rows: 24, cols: 80, terminalType: 'xterm', graceMs: 1,
    }, f.manager);
    let output = ''; terminal.output.on('data', data => { output += String(data); });
    let settled = false; void terminal.done.finally(() => { settled = true; }).catch(() => {});
    try {
      await vi.waitFor(() => expect(output).toContain('BEFORE_OUTAGE'));
      f.disconnect();
      await terminal.write('queued during outage');
      await vi.waitFor(() => expect(output).toContain('AFTER_RESUME'));
      expect(f.resumeAttempts()).toBe(3);
      expect(settled).toBe(false); expect(terminal.output.destroyed).toBe(false); expect(terminal.pid).toBe(321);
      expect(f.calls.filter(call => call.method === 'process/start')).toHaveLength(1);
      expect(f.calls.filter(call => call.method === 'process/terminate')).toHaveLength(0);
      expect(f.calls.filter(call => call.method === 'process/write')).toHaveLength(1);
      expect(output.match(/BEFORE_OUTAGE/gu)).toHaveLength(1); expect(output.match(/AFTER_RESUME/gu)).toHaveLength(1);
      await terminal.write('still attached');
      expect(f.calls.filter(call => call.method === 'process/write').map(call => call.params.afterSeq)).toEqual(['0', '1']);
      await terminal.terminate();
    } finally { await f.manager.dispose(); }
  });

  it('discards unsent terminal input on explicit host disconnect without reviving the host', async () => {
    const f = await retainedTerminalFixture({ failures: 100 });
    const terminal = await openRemoteUserTerminal('ssh://gpu/tmp', {
      argv: ['/bin/sh'], cwd: '/tmp', rows: 24, cols: 80, terminalType: 'xterm', graceMs: 1,
    }, f.manager);
    terminal.output.resume();
    try {
      f.disconnect();
      const queued = Promise.allSettled([terminal.write('unsent one'), terminal.write('unsent two')]);
      await vi.waitFor(() => expect(f.resumeAttempts()).toBeGreaterThan(0));
      await f.manager.close('gpu');
      expect((await queued).map(result => result.status)).toEqual(['rejected', 'rejected']);
      await expect(terminal.terminate()).rejects.toThrow('host closed');
      const connections = f.transports.length;
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(f.transports).toHaveLength(connections);
      expect(f.calls.filter(call => call.method === 'process/write')).toHaveLength(0);
      expect(f.manager.status('gpu').state).toBe('disconnected');
    } finally { await f.manager.dispose(); }
  });

  it('joins manual retry of an in-flight reconnect without failing the retained terminal', async () => {
    const f = await retainedTerminalFixture({ holdFirstResume: true });
    const terminal = await openRemoteUserTerminal('ssh://gpu/tmp', {
      argv: ['/bin/sh'], cwd: '/tmp', rows: 24, cols: 80, terminalType: 'xterm', graceMs: 1,
    }, f.manager);
    terminal.output.resume();
    try {
      f.disconnect();
      const input = terminal.write('queued across manual retry');
      const accepted = expect(input).resolves.toBeUndefined();
      await vi.waitFor(() => expect(f.resumeAttempts()).toBe(1));
      await f.manager.retry('gpu');
      await accepted;
      expect(f.transports).toHaveLength(3);
      expect(f.calls.filter(call => call.method === 'process/start')).toHaveLength(1);
      expect(f.calls.filter(call => call.method === 'process/terminate')).toHaveLength(0);
      expect(f.calls.filter(call => call.method === 'process/write')).toHaveLength(1);
      expect(terminal.output.destroyed).toBe(false);
      await terminal.terminate();
    } finally { await f.manager.dispose(); }
  });

  it('replays lost input acknowledgement with identical sequence and operation id, then advances only after success', async () => {
    const f = await retainedTerminalFixture({ dropWrite: true });
    const terminal = await openRemoteUserTerminal('ssh://gpu/tmp', {
      argv: ['/bin/sh'], cwd: '/tmp', rows: 24, cols: 80, terminalType: 'xterm', graceMs: 1,
    }, f.manager);
    terminal.output.resume();
    try {
      await terminal.write('first'); await terminal.write('second');
      const writes = f.calls.filter(call => call.method === 'process/write');
      expect(writes).toHaveLength(3);
      expect(writes[0].params).toEqual(writes[1].params);
      expect(writes.map(call => call.params.afterSeq)).toEqual(['0', '0', '1']);
      expect(writes[2].params.operationId).not.toBe(writes[1].params.operationId);
      await terminal.terminate();
    } finally { await f.manager.dispose(); }
  });

  it('never replays an unjournaled session-bound mutation after disconnect', async () => {
    const f = await retainedTerminalFixture({ dropWrite: true });
    try {
      const facade = await f.manager.client('gpu');
      await expect(facade.callInSession!('session-1', 'process/write', { processId: 'retained', data: 'eA==' }, { mutation: true }))
        .rejects.toMatchObject({ kind: 'disconnect', mutationMayHaveStarted: true });
      expect(f.calls.filter(call => call.method === 'process/write')).toHaveLength(1);
    } finally { await f.manager.dispose(); }
  });

  it.each(['process/read', 'process/status'] as const)('recovers a blackholed %s deadline without SSH exit and preserves the session', async method => {
    const f = await retainedTerminalFixture({ blackhole: method, failures: 2, retentionMs: 1_000 });
    try {
      const facade = await f.manager.client('gpu');
      const result = await facade.callInSession!<Record<string, unknown>>('session-1', method, {
        processId: 'retained', afterSeq: '1', waitMs: 0,
      }, { timeoutMs: 20, waitForResume: true });
      expect(result).toMatchObject(method === 'process/read' ? { nextSeq: '2' } : { running: true });
      expect(f.resumeAttempts()).toBe(3);
      expect(f.transports[0].killed).toBe(true);
      const reads = f.calls.filter(call => call.method === method);
      expect(reads).toHaveLength(2); expect(reads[0].params).toEqual(reads[1].params);
      expect(f.calls.filter(call => call.method === 'process/start' || call.method === 'process/terminate')).toHaveLength(0);
      expect(facade.sessionId).toBe('session-1');
    } finally { await f.manager.dispose(); }
  });

  it('keeps a native terminal alive while its read RPC blackholes but SSH and status remain open', async () => {
    const f = await retainedTerminalFixture({ blackhole: 'process/read', failures: 2, retentionMs: 1_000 });
    try {
      const facade = await f.manager.client('gpu');
      const call = facade.callInSession!.bind(facade);
      // Shorten both long-poll and RPC deadline without changing their ordering.
      facade.callInSession = <T>(sessionId: string, method: string, params: Record<string, unknown> = {}, options: RemoteHelperSessionCallOptions = {}) =>
        call<T>(sessionId, method, method === 'process/read' ? { ...params, waitMs: 0 } : params,
          method === 'process/read' ? { ...options, timeoutMs: 20 } : options);
      const terminal = await openRemoteUserTerminal('ssh://gpu/tmp', {
        argv: ['/bin/sh'], cwd: '/tmp', rows: 24, cols: 80, terminalType: 'xterm', graceMs: 1,
      }, f.manager);
      let output = ''; let settled = false;
      terminal.output.on('data', data => { output += String(data); });
      void terminal.done.finally(() => { settled = true; }).catch(() => {});
      await vi.waitFor(() => expect(output).toContain('AFTER_RESUME'));
      expect(settled).toBe(false); expect(terminal.output.destroyed).toBe(false);
      expect(f.resumeAttempts()).toBe(3);
      expect(f.calls.filter(item => item.method === 'process/start')).toHaveLength(1);
      expect(f.calls.filter(item => item.method === 'process/terminate')).toHaveLength(0);
      await terminal.write('still alive after blackhole');
      await terminal.terminate();
    } finally { await f.manager.dispose(); }
  });

  it('does not reset a blackholed query retention budget after each successful resumed handshake', async () => {
    const f = await retainedTerminalFixture({ blackhole: 'process/status', blackholeEveryTransport: true, retentionMs: 90 });
    try {
      const facade = await f.manager.client('gpu');
      const started = Date.now();
      await expect(facade.callInSession!('session-1', 'process/status', { processId: 'retained' }, {
        timeoutMs: 15, waitForResume: true,
      })).rejects.toThrow('session expired');
      expect(Date.now() - started).toBeLessThan(600);
      expect(f.resumeAttempts()).toBeGreaterThan(1);
      expect(f.calls.filter(call => call.method === 'process/start')).toHaveLength(0);
    } finally { await f.manager.dispose(); }
  });

  it('preserves mutation uncertainty when a late dispatch crosses the recovery budget', async () => {
    const f = await retainedTerminalFixture({ holdFirstResume: true, retentionMs: 180,
      blackhole: 'process/write', blackholeEveryTransport: true });
    try {
      const facade = await f.manager.client('gpu');
      f.disconnect();
      const write = facade.callInSession!('session-1', 'process/write', {
        processId: 'retained', operationId: 'late-write', afterSeq: '0', data: 'eA==',
      }, { timeoutMs: 1_000, mutation: true, waitForResume: true });
      const assertion = expect(write).rejects.toMatchObject({ kind: 'abort', mutationMayHaveStarted: true });
      await vi.waitFor(() => expect(f.resumeAttempts()).toBe(1), { interval: 1 });
      await new Promise(resolve => setTimeout(resolve, 120));
      f.releaseResume();
      await assertion;
      expect(f.calls.filter(item => item.method === 'process/write')).toHaveLength(1);
    } finally { await f.manager.dispose(); }
  });

  it.each(['permanent', 'expire'] as const)('preserves a dispatched mutation outcome when resume later fails with %s', async mode => {
    const f = await retainedTerminalFixture({ dropWrite: true, permanent: mode === 'permanent',
      failures: mode === 'expire' ? 100 : 0, retentionMs: 90 });
    try {
      const facade = await f.manager.client('gpu');
      await expect(facade.callInSession!('session-1', 'process/write', {
        processId: 'retained', operationId: 'uncertain-write', afterSeq: '0', data: 'eA==',
      }, { timeoutMs: 1_000, mutation: true, waitForResume: true }))
        .rejects.toMatchObject({ kind: 'disconnect', mutationMayHaveStarted: true });
      expect(f.calls.filter(item => item.method === 'process/write')).toHaveLength(1);
    } finally { await f.manager.dispose(); }
  });

  it.each(['mutation', 'long-poll', 'file-cursor'] as const)('does not reinterpret %s timeouts as safe retained-query replay', async mode => {
    const method = mode === 'mutation' ? 'process/write' : mode === 'long-poll' ? 'process/read' : 'fs/readNext';
    const f = await retainedTerminalFixture({ blackhole: mode === 'mutation' ? 'process/write' : 'process/read' });
    try {
      const facade = await f.manager.client('gpu');
      await expect(facade.callInSession!('session-1', method, {
        processId: 'retained', handleId: 'handle', operationId: 'same-operation', afterSeq: '0', data: 'eA==', waitMs: 100,
      }, { timeoutMs: 15, waitForResume: true, mutation: mode === 'mutation' })).rejects.toMatchObject({ kind: 'timeout' });
      expect(f.transports).toHaveLength(1); expect(f.transports[0].killed).toBe(false);
      expect(f.resumeAttempts()).toBe(0);
    } finally { await f.manager.dispose(); }
  });

  it.each(['cancel', 'close', 'permanent', 'expire', 'replace'] as const)('stops retained-session recovery on %s without recreating a process', async mode => {
    const f = await retainedTerminalFixture({ failures: mode === 'replace' ? 0 : 100,
      permanent: mode === 'permanent', retentionMs: mode === 'expire' ? 35 : 120_000, replace: mode === 'replace' });
    try {
      const facade = await f.manager.client('gpu');
      f.disconnect();
      const controller = new AbortController();
      const read = facade.callInSession!('session-1', 'process/status', { processId: 'retained' }, {
        waitForResume: true, signal: controller.signal,
      });
      const expected = mode === 'cancel' ? 'cancel retained fixture' : mode === 'close' ? 'host closed'
        : mode === 'permanent' ? 'permanent fixture denial' : 'session expired';
      const assertion = expect(read).rejects.toThrow(expected);
      if (mode === 'cancel' || mode === 'close') await vi.waitFor(() => expect(f.resumeAttempts()).toBeGreaterThan(0));
      if (mode === 'cancel') controller.abort(new Error('cancel retained fixture'));
      if (mode === 'close') await f.manager.close('gpu');
      await assertion;
      if (mode === 'close') {
        const connections = f.transports.length;
        await expect(facade.callInSession!('session-1', 'process/terminate', { processId: 'retained', operationId: 'cleanup' }, { mutation: true }))
          .rejects.toThrow('host closed');
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(f.transports).toHaveLength(connections); expect(f.manager.status('gpu').state).toBe('disconnected');
      }
      expect(f.calls.filter(call => call.method === 'process/start')).toHaveLength(0);
    } finally { await f.manager.dispose(); }
  });

  it.each(['initialize', 'environment/check'] as const)('does not expose a raw client before pending %s completes', async (stage) => {
    const capabilities = { ...completeCapabilities, environment: { check: true } };
    let release: (() => void) | undefined;
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      if (String(args.at(-1)).includes('connect --stdio')) {
        helperPeer(child, { capabilities, onRequest(frame, peer) {
          if (frame.method === stage) {
            release = () => peer.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result:
              stage === 'initialize' ? {
                protocol: 1, session: { sessionId: 'session-1', clientId: String(frame.params?.clientId),
                  resumeToken: 'resume-1', resumed: false, retentionMs: 120_000, serverEpoch: 1 }, capabilities, limits: {},
              } : { search: { available: true } },
            }));
            return true;
          }
          if (frame.method === 'environment/check') {
            peer.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result: { search: { available: true } } }));
            return true;
          }
          return false;
        } });
      } else child.stdin.once('finish', () => { child.exitCode = 0; queueMicrotask(() => child.emit('close', 0, null)); });
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({ assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true }, healthIntervalMs: 0 });
    try {
      const first = manager.client('gpu');
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      let settled = false;
      const second = manager.client('gpu').then(client => { settled = true; return client; });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(settled).toBe(false);
      release!();
      const [a, b] = await Promise.all([first, second]);
      expect(a).toBe(b); expect(b.sessionId).toBe('session-1');
      await expect(b.call('health/status')).resolves.toEqual({ healthy: true });
      expect(spawnProcess).toHaveBeenCalledTimes(2);
    } finally { await manager.dispose(); }
  });

  it.each(['close', 'dispose'] as const)('rejects every pending initialize waiter after %s', async (action) => {
    let held: (() => void) | undefined;
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      if (String(args.at(-1)).includes('connect --stdio')) helperPeer(child, { onRequest(frame, peer) {
        if (frame.method !== 'initialize') return false;
        held = () => peer.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result: {
          protocol: 1, session: { sessionId: 'session-1', clientId: String(frame.params?.clientId), resumeToken: 'r',
            resumed: false, retentionMs: 120_000, serverEpoch: 1 }, capabilities: completeCapabilities, limits: {},
        } }));
        return true;
      } });
      else child.stdin.once('finish', () => { child.exitCode = 0; queueMicrotask(() => child.emit('close', 0, null)); });
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({ assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true }, healthIntervalMs: 0 });
    const first = manager.client('gpu').catch(error => error);
    await vi.waitFor(() => expect(held).toBeTypeOf('function'));
    const second = manager.client('gpu').catch(error => error);
    if (action === 'close') await manager.close('gpu'); else await manager.dispose();
    held!();
    expect(await first).toBeInstanceOf(Error); expect(await second).toBeInstanceOf(Error);
    expect(manager.status('gpu').state).toBe('disconnected');
    await manager.dispose();
  });

  it('keeps native terminal read/status callers on the same pending resumed handshake', async () => {
    let connections = 0; let firstTransport: FakeChild | undefined; let release: (() => void) | undefined;
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      if (!String(args.at(-1)).includes('connect --stdio')) {
        child.stdin.once('finish', () => { child.exitCode = 0; queueMicrotask(() => child.emit('close', 0, null)); });
      } else {
        connections += 1; const ordinal = connections;
        if (ordinal === 1) firstTransport = child;
        helperPeer(child, { resumed: ordinal > 1, onRequest(frame, peer) {
          if (ordinal > 1 && frame.method === 'initialize') {
            release = () => peer.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result: {
              protocol: 1, session: { sessionId: 'session-1', clientId: String(frame.params?.clientId), resumeToken: 'resume-1',
                resumed: true, retentionMs: 120_000, serverEpoch: 1 }, capabilities: completeCapabilities, limits: {},
            } }));
            return true;
          }
          if (frame.method === 'process/read' || frame.method === 'process/status') {
            if (ordinal === 1) { firstTransport!.exitCode = 255; queueMicrotask(() => firstTransport!.emit('close', 255, null)); }
            else peer.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result: { running: true, method: frame.method } }));
            return true;
          }
          return false;
        } });
      }
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({ assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true }, healthIntervalMs: 0, reconnectBaseMs: 10_000, reconnectMaxMs: 10_000, random: () => 0.9 });
    try {
      const facade = await manager.client('gpu');
      const entry = (manager as any).entries.get('gpu'); const previous = entry.client;
      const read = facade.call('process/read', { processId: 'user-terminal' });
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      let settled = 0;
      const status = facade.call('process/status', { processId: 'user-terminal' }).then(value => { settled += 1; return value; });
      const acquired = manager.client('gpu').then(value => { settled += 1; return value; });
      const resumed = (manager as any).resumeAfterDisconnect(entry, previous).then((value: unknown) => { settled += 1; return value; });
      await new Promise(resolve => setTimeout(resolve, 10)); expect(settled).toBe(0);
      release!();
      await expect(read).resolves.toMatchObject({ running: true });
      await expect(status).resolves.toMatchObject({ running: true });
      expect(await acquired).toBe(facade); await resumed;
      expect(facade.sessionId).toBe('session-1'); expect(facade.session.resumed).toBe(true); expect(connections).toBe(2);
    } finally { await manager.dispose(); }
  });

  it.each(['exit', 'EPIPE'])('stops retrying permanent installation failures with a stable hint (%s)', async (failure) => {
    const spawnProcess = vi.fn(() => {
      const child = new FakeChild();
      child.stdin.once('finish', () => {
        child.stderr.write('Permission denied (publickey).');
        if (failure === 'EPIPE') { child.stdin.emit('error', new Error('write EPIPE')); return; }
        child.exitCode = 255;
        queueMicrotask(() => child.emit('close', 255, null));
      });
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({ assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true }, reconnectBaseMs: 10, reconnectMaxMs: 10 });
    await expect(manager.client('gpu')).rejects.toThrow(failure === 'EPIPE' ? /failed to upload/u : /Permission denied/u);
    expect(manager.status('gpu')).toMatchObject({ state: 'error', errorCode: 'SSH_AUTH', retryable: false });
    expect(manager.status('gpu').nextRetryAt).toBeUndefined();
    expect(manager.diagnostics('gpu').stderr).toContain('Permission denied');
    expect(manager.status('gpu').lastError).toContain('Permission denied');
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(spawnProcess).toHaveBeenCalledOnce();
    await manager.dispose();
  });

  it('cancels an in-progress upload and ignores its late completion', async () => {
    const child = new FakeChild();
    const spawnProcess = vi.fn(() => child as unknown as ReturnType<typeof spawn>);
    const manager = new RemoteHelperManager({ assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true }, healthIntervalMs: 0 });
    const pending = manager.client('gpu').catch(reason => reason);
    await vi.waitFor(() => expect(manager.status('gpu').state).toBe('installing'));
    await manager.close('gpu');
    expect(await pending).toBeInstanceOf(Error);
    child.emit('close', 0, null);
    expect(child.killed).toBe(true);
    expect(spawnProcess).toHaveBeenCalledOnce();
    expect(manager.status('gpu').state).toBe('disconnected');
    await manager.dispose();
  });

  it.each(['initialize', 'environment/check'] as const)(
    'stops during %s and ignores a successful response arriving after close',
    async (stage) => {
      const capabilities = { ...completeCapabilities, environment: { check: true } };
      let transport: FakeChild | undefined;
      let releaseLateReply: (() => void) | undefined;
      const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
        const child = new FakeChild();
        if (String(args.at(-1)).includes('connect --stdio')) {
          transport = child;
          helperPeer(child, {
            capabilities,
            onRequest(frame, peer) {
              if (frame.method !== stage) return false;
              releaseLateReply = () => peer.stdout.write(encodeDshRpcFrame({
                dshRpc: '1', id: frame.id!,
                result: stage === 'initialize' ? {
                  protocol: 1,
                  session: {
                    sessionId: 'session-1', clientId: String(frame.params?.clientId),
                    resumeToken: 'resume-1', resumed: false, retentionMs: 120_000, serverEpoch: 1,
                  },
                  capabilities,
                  limits: { maxFrameBytes: 1_048_576 },
                } : { search: { available: true, path: '/usr/bin/rg', version: 'ripgrep fixture' } },
              }));
              return true;
            },
          });
        } else {
          child.stdin.once('finish', () => {
            child.exitCode = 0;
            queueMicrotask(() => child.emit('close', 0, null));
          });
        }
        return child as unknown as ReturnType<typeof spawn>;
      });
      const manager = new RemoteHelperManager({
        assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
        capabilities: { sessionTypeSupported: true }, healthIntervalMs: 0,
        reconnectBaseMs: 10, reconnectMaxMs: 10, random: () => 0.5,
      });
      const states: string[] = [];
      manager.onStatus(status => states.push(status.state));
      try {
        // Attach rejection handling before aborting to catch stale attempts without
        // creating an unhandled rejection in the application/test process.
        const pending = manager.client('gpu').catch(reason => reason);
        await vi.waitFor(() => expect(releaseLateReply).toBeTypeOf('function'));
        expect(manager.status('gpu').state).toBe('connecting');
        await manager.close('gpu');
        expect(await pending).toBeInstanceOf(Error);
        expect(transport?.killed).toBe(true);
        const statesAfterClose = states.length;

        // A successful reply from the retired transport must not resurrect the
        // helper, install a session id, or schedule a background reconnect.
        releaseLateReply!();
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(manager.status('gpu')).toMatchObject({ state: 'disconnected', attempt: 0 });
        expect(manager.status('gpu').sessionId).toBeUndefined();
        expect(manager.status('gpu').nextRetryAt).toBeUndefined();
        expect(spawnProcess).toHaveBeenCalledTimes(2);
        expect(states.slice(statesAfterClose)).toEqual([]);
        expect(states).not.toContain('connected');
        expect(states).not.toContain('degraded');
      } finally {
        await manager.dispose();
      }
    },
  );

  it('reports missing search and refreshes it without reconnecting or killing tasks', async () => {
    let available = false;
    let hold = false;
    const pendingProbes: Array<(available: boolean) => void> = [];
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      if (String(args.at(-1)).includes('connect --stdio')) {
        helperPeer(child, { capabilities: { ...completeCapabilities, environment: { check: true } },
          onRequest(frame, transport) {
            if (frame.method !== 'environment/check') return false;
            if (hold) {
              pendingProbes.push(value => transport.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result: { search: { available: value } } })));
              return true;
            }
            transport.stdout.write(encodeDshRpcFrame({ dshRpc: '1', id: frame.id!, result: {
              search: available ? { available: true, path: '/home/test/.local/bin/rg', version: 'ripgrep 15.2.0' }
                : { available: false, error: 'ripgrep missing in login PATH' },
            } }));
            return true;
          } });
      } else child.stdin.once('finish', () => { child.exitCode = 0; queueMicrotask(() => child.emit('close', 0, null)); });
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({ assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true }, healthIntervalMs: 0 });
    const client = await manager.client('gpu');
    expect(manager.status('gpu')).toMatchObject({ state: 'degraded', environment: { search: { available: false } } });
    available = true;
    await manager.refreshEnvironment('gpu');
    expect(manager.status('gpu')).toMatchObject({ state: 'connected', environment: { search: { available: true } } });
    expect(await manager.client('gpu')).toBe(client);
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    hold = true;
    const oldProbe = manager.refreshEnvironment('gpu');
    const newProbe = manager.refreshEnvironment('gpu');
    await vi.waitFor(() => expect(pendingProbes.length).toBe(2));
    pendingProbes[1](true);
    await newProbe;
    pendingProbes[0](false);
    await oldProbe;
    expect(manager.status('gpu')).toMatchObject({ state: 'connected', environment: { search: { available: true } } });
    await manager.dispose();
  });

  it('does not publish a closed connection when environment probing loses transport', async () => {
    const spawnProcess = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      if (String(args.at(-1)).includes('connect --stdio')) {
        helperPeer(child, { capabilities: { ...completeCapabilities, environment: { check: true } },
          onRequest(frame, transport) {
            if (frame.method !== 'environment/check') return false;
            transport.exitCode = 255;
            queueMicrotask(() => transport.emit('close', 255, null));
            return true;
          } });
      } else child.stdin.once('finish', () => { child.exitCode = 0; queueMicrotask(() => child.emit('close', 0, null)); });
      return child as unknown as ReturnType<typeof spawn>;
    });
    const manager = new RemoteHelperManager({ assetPath: await helperAsset(), spawnProcess: spawnProcess as never,
      capabilities: { sessionTypeSupported: true }, healthIntervalMs: 0, reconnectBaseMs: 1000, random: () => 0.9 });
    const states: string[] = [];
    manager.onStatus(status => states.push(status.state));
    await expect(manager.client('gpu')).rejects.toThrow(/transport exited/u);
    expect(manager.status('gpu')).toMatchObject({ state: 'reconnecting', retryable: true, errorCode: 'SSH_NETWORK' });
    expect(states).not.toContain('connected');
    expect(states).not.toContain('degraded');
    await manager.dispose();
  });

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
