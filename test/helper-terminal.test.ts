import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  RemoteHelperClient,
  RemoteHelperProvider,
  RemoteHelperTerminalBackendSession,
} from '../src/terminal.js';
import { RemoteTerminalBackend } from '../src/terminal.js';

interface CallRecord {
  method: string;
  params: Record<string, unknown>;
  options: { signal?: AbortSignal; timeoutMs?: number; mutation?: boolean };
}

interface ReadResult {
  chunks: Array<{ seq: string; stream: 'pty'; data: string }>;
  earliestSeq: string;
  nextSeq: string;
  truncated: boolean;
  exited: boolean;
  exitCode: number | null;
  signal: string | null;
}

interface PendingRead {
  resolve(value: ReadResult): void;
  reject(reason: unknown): void;
}

function emptyRead(overrides: Partial<ReadResult> = {}): ReadResult {
  return {
    chunks: [],
    earliestSeq: '0',
    nextSeq: '0',
    truncated: false,
    exited: false,
    exitCode: null,
    signal: null,
    ...overrides,
  };
}

class FakeHelperClient implements RemoteHelperClient {
  hello?: { platform?: { shell?: string } };
  readonly calls: CallRecord[] = [];
  readonly pendingReads: PendingRead[] = [];
  readonly queuedReads: ReadResult[] = [];
  foreground = { pgid: 4321, verified: true };
  gracefulTerminateFailure: Error | undefined;
  onStart: (() => void) | undefined;
  workspaceOpenFailure: Error | undefined;
  onWorkspaceOpen: (() => void) | undefined;
  unknownRollbackResources = false;
  statusResults: Array<{ running: boolean; exitCode: number | null; signal: string | null }> = [];

  async call<T>(
    method: string,
    params: Record<string, unknown> = {},
    options: { signal?: AbortSignal; timeoutMs?: number; mutation?: boolean } = {},
  ): Promise<T> {
    this.calls.push({ method, params, options });
    switch (method) {
      case 'workspace/open':
        this.onWorkspaceOpen?.();
        if (this.workspaceOpenFailure !== undefined) throw this.workspaceOpenFailure;
        return {
          workspaceId: params.workspaceId,
          path: params.path,
          access: params.access,
        } as T;
      case 'process/start':
        this.onStart?.();
        return {
          processId: params.processId,
          pid: 1234,
          pgid: 1234,
          tty: true,
          running: true,
          exitCode: null,
          signal: null,
          latestSeq: '0',
        } as T;
      case 'process/read': {
        const queued = this.queuedReads.shift();
        if (queued !== undefined) return queued as T;
        return await new Promise<T>((resolve, reject) => {
          const pending: PendingRead = {
            resolve: value => resolve(value as T),
            reject,
          };
          this.pendingReads.push(pending);
          const signal = options.signal;
          if (signal !== undefined) {
            const onAbort = (): void => {
              const index = this.pendingReads.indexOf(pending);
              if (index >= 0) this.pendingReads.splice(index, 1);
              reject(signal.reason);
            };
            signal.addEventListener('abort', onAbort, { once: true });
          }
        });
      }
      case 'process/inspectForeground':
        return this.foreground as T;
      case 'process/write':
        return { written: Buffer.from(String(params.data ?? ''), 'base64').length } as T;
      case 'process/status':
        return (this.statusResults.shift() ?? { running: false, exitCode: 0, signal: null }) as T;
      case 'process/terminate':
        if (this.unknownRollbackResources && params.force === true) throw helperError('E_UNKNOWN_PROCESS');
        if (params.force === false && this.gracefulTerminateFailure !== undefined) {
          throw this.gracefulTerminateFailure;
        }
        return { running: params.force !== true } as T;
      case 'process/release':
        if (this.unknownRollbackResources) throw helperError('E_UNKNOWN_PROCESS');
        return {} as T;
      case 'workspace/close':
        if (this.unknownRollbackResources) throw helperError('E_UNKNOWN_WORKSPACE');
        return {} as T;
      default:
        return {} as T;
    }
  }

  deliver(result: ReadResult): void {
    const pending = this.pendingReads.shift();
    if (pending === undefined) this.queuedReads.push(result);
    else pending.resolve(result);
  }
}

function helperError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function remoteResolver(path: string): string | undefined {
  const root = '/anchors/gpu';
  if (path !== root && !path.startsWith(`${root}/`)) return undefined;
  return `ssh://gpu/home/atlas/project${path.slice(root.length)}`;
}

function fixture(client = new FakeHelperClient()): {
  backend: RemoteTerminalBackend;
  client: FakeHelperClient;
  provider: RemoteHelperProvider & { client: ReturnType<typeof vi.fn> };
} {
  const getClient = vi.fn(async () => client);
  const provider = { client: getClient } as RemoteHelperProvider & { client: typeof getClient };
  const sandboxPolicy = {
    resolve: vi.fn(() => ({
      mode: 'workspace-write' as const,
      workspaceRoot: '/anchors/gpu',
    })),
  };
  return {
    backend: new RemoteTerminalBackend(provider, remoteResolver, sandboxPolicy as never),
    client,
    provider,
  };
}

function spawnSpec(overrides: Record<string, unknown> = {}): any {
  return {
    cwd: '/anchors/gpu/subdir',
    sessionId: 'terminal-session-7',
    owner: { session: {} },
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('helper-backed remote terminal setup', () => {
  it('uses the remote account login shell reported by helper hello', async () => {
    const client = new FakeHelperClient();
    client.hello = { platform: { shell: '/bin/zsh' } };
    const { backend } = fixture(client);
    const session = await backend.spawn(spawnSpec());
    expect(client.calls.find(call => call.method === 'process/start')?.params.argv)
      .toEqual(['/bin/zsh', '-l']);
    await session.close('test');
  });

  it('opens the policy workspace and starts a stable-id TTY in a relative cwd', async () => {
    const { backend, client, provider } = fixture();
    const session = await backend.spawn(spawnSpec());

    const opened = client.calls.find(call => call.method === 'workspace/open');
    expect(opened?.params).toMatchObject({
      path: '/home/atlas/project',
      access: 'workspace-write',
      workspaceId: expect.stringMatching(/^term-ws-[0-9a-f]{32}$/u),
    });
    const started = client.calls.find(call => call.method === 'process/start');
    expect(started?.params).toMatchObject({
      workspaceId: opened?.params.workspaceId,
      cwd: 'subdir',
      argv: ['/bin/sh', '-i'],
      processId: expect.stringMatching(/^term-proc-[0-9a-f]{32}$/u),
      operationId: expect.stringMatching(/^term-start-[0-9a-f]{32}$/u),
      tty: { rows: 24, cols: 80, term: 'xterm-256color' },
    });
    expect(session.pid).toBe(1234);
    expect(provider.client).toHaveBeenCalledWith('ssh://gpu/home/atlas/project/subdir', undefined);

    await session.close('test');
    expect(client.calls.some(call => call.method === 'process/terminate' && call.params.force === false)).toBe(true);
    expect(client.calls.some(call => call.method === 'process/release')).toBe(true);
    for (const call of client.calls.filter(call => call.options.mutation === true)) {
      expect(call.params.operationId, call.method).toEqual(expect.any(String));
    }
  });

  it('rejects a cwd that belongs to a different SSH authority than the policy root', async () => {
    const { backend, provider } = fixture();
    await expect(backend.spawn(spawnSpec({ cwd: 'ssh://other/home/atlas/project' })))
      .rejects.toThrow(/different SSH hosts/u);
    expect(provider.client).not.toHaveBeenCalled();
  });

  it('does not begin rollback when cancellation happens before workspace/open', async () => {
    const { backend, client, provider } = fixture();
    const controller = new AbortController();
    const reason = new Error('cancel before workspace open');
    controller.abort(reason);

    await expect(backend.spawn(spawnSpec({ signal: controller.signal }))).rejects.toBe(reason);
    expect(provider.client).not.toHaveBeenCalled();
    expect(client.calls).toEqual([]);
  });

  it('rolls back stable ids when workspace/open is interrupted with an unknown outcome', async () => {
    const { backend, client } = fixture();
    const controller = new AbortController();
    const reason = new Error('workspace open transport lost');
    client.onWorkspaceOpen = () => { controller.abort(reason); };
    client.workspaceOpenFailure = reason;
    client.unknownRollbackResources = true;

    // Unknown process/workspace during rollback proves the mutation never
    // landed and must not replace the original cancellation error.
    await expect(backend.spawn(spawnSpec({ signal: controller.signal }))).rejects.toBe(reason);
    expect(client.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'workspace/open' }),
      expect.objectContaining({ method: 'process/terminate' }),
      expect.objectContaining({ method: 'process/release' }),
      expect.objectContaining({ method: 'workspace/close' }),
    ]));
  });

  it('rolls back the stable process id when cancellation wins after process/start', async () => {
    const { backend, client } = fixture();
    const controller = new AbortController();
    const reason = new Error('cancel after remote start');
    client.onStart = () => { controller.abort(reason); };

    await expect(backend.spawn(spawnSpec({ signal: controller.signal }))).rejects.toBe(reason);
    const started = client.calls.find(call => call.method === 'process/start');
    const processId = started?.params.processId;
    expect(client.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'process/terminate',
        params: expect.objectContaining({ processId, force: true, operationId: expect.any(String) }),
      }),
      expect.objectContaining({
        method: 'process/release',
        params: expect.objectContaining({ processId, operationId: expect.any(String) }),
      }),
      expect.objectContaining({ method: 'workspace/close' }),
    ]));
  });
});

describe('helper-backed remote terminal lifecycle', () => {
  it('waits for graceful TERM exit before release and never sends force kill', async () => {
    vi.useFakeTimers();
    const { backend, client } = fixture();
    client.statusResults.push(
      { running: true, exitCode: null, signal: null },
      { running: false, exitCode: 0, signal: null },
    );
    const session = await backend.spawn(spawnSpec());
    const closing = session.close('graceful');

    await vi.advanceTimersByTimeAsync(100);
    await expect(closing).resolves.toBeUndefined();
    const terminateCalls = client.calls.filter(call => call.method === 'process/terminate');
    expect(terminateCalls).toHaveLength(1);
    expect(terminateCalls[0]?.params).toMatchObject({ force: false, graceMs: 3_000 });
    expect(client.calls.findIndex(call => call.method === 'process/release'))
      .toBeGreaterThan(client.calls.findIndex(call => call.method === 'process/status'));
  });

  it('reacquires the helper facade, writes base64 input, and returns bounded pumped output', async () => {
    vi.useFakeTimers();
    const { backend, client, provider } = fixture();
    const session = await backend.spawn(spawnSpec());
    const operation = session.startSend({ text: 'echo hello', submit: true });

    await Promise.resolve();
    await Promise.resolve();
    const write = client.calls.find(call => call.method === 'process/write');
    expect(Buffer.from(String(write?.params.data), 'base64').toString('utf8')).toBe('echo hello\n');
    expect(write?.params.operationId).toEqual(expect.any(String));
    client.deliver(emptyRead({
      chunks: [{ seq: '1', stream: 'pty', data: Buffer.from('hello\n').toString('base64') }],
      nextSeq: '1',
    }));
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(operation.done).resolves.toMatchObject({
      viewport: 'hello\n',
      waitReason: 'inferred_idle',
      truncated: false,
    });
    expect(provider.client.mock.calls.length).toBeGreaterThan(3);
    await session.close('test');
  });

  it('uses a verified helper foreground PGID for explicit signals and cancellation', async () => {
    const { backend, client } = fixture();
    const session = await backend.spawn(spawnSpec());

    await expect(session.signal('SIGTERM')).resolves.toEqual({ delivered: true, targetPgid: 4321 });
    expect(client.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'process/inspectForeground' }),
      expect.objectContaining({
        method: 'process/signal',
        params: expect.objectContaining({
          operationId: expect.any(String),
          signal: 'SIGTERM',
          target: 'foreground',
        }),
      }),
    ]));

    const controller = new AbortController();
    const operation = session.startSend({ text: 'sleep 10', submit: true, signal: controller.signal });
    controller.abort();
    await vi.waitFor(() => {
      expect(client.calls.some(call => call.method === 'process/signal' && call.params.signal === 'SIGINT')).toBe(true);
    });
    client.deliver(emptyRead({ exited: true, exitCode: 130, nextSeq: '2' }));
    await expect(operation.done).resolves.toMatchObject({ waitReason: 'session_exit' });
    await session.close('test');
  });

  it('marks helper output loss, exposes resize, escalates teardown, then releases', async () => {
    vi.useFakeTimers();
    const { backend, client } = fixture();
    client.gracefulTerminateFailure = new Error('grace expired');
    const session = await backend.spawn(spawnSpec()) as RemoteHelperTerminalBackendSession;
    const operation = session.startSend({ text: '', submit: false });
    client.deliver(emptyRead({
      chunks: [{ seq: '1', stream: 'pty', data: Buffer.from('🙂'.repeat(20_000)).toString('base64') }],
      nextSeq: '1',
      truncated: true,
    }));
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await operation.done;
    expect(Buffer.byteLength(result.viewport, 'utf8')).toBeLessThanOrEqual(64 * 1024);
    expect(result.truncated).toBe(true);

    await session.resize(50, 120);
    expect(client.calls).toContainEqual(expect.objectContaining({
      method: 'process/resize',
      params: expect.objectContaining({ operationId: expect.any(String), rows: 50, cols: 120 }),
    }));
    await session.close('test');
    expect(client.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'process/terminate', params: expect.objectContaining({ force: false }) }),
      expect.objectContaining({ method: 'process/terminate', params: expect.objectContaining({ force: true }) }),
      expect.objectContaining({ method: 'process/release' }),
    ]));
  });
});
