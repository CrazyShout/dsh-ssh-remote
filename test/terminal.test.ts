import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientChannel } from 'ssh2';
import type { TerminalBackendSession } from '@deepseek-ai/dsh-terminal';
import { RemoteTerminalBackend } from '../src/terminal.js';

class FakeChannel extends EventEmitter {
  readonly writes: string[] = [];
  readonly signals: string[] = [];
  readonly listenerCountsAtWrite: Array<{ data: number; close: number; error: number }> = [];
  endCalls = 0;
  destroyCalls = 0;

  write(data: string | Buffer): boolean {
    this.listenerCountsAtWrite.push({
      data: this.listenerCount('data'),
      close: this.listenerCount('close'),
      error: this.listenerCount('error'),
    });
    this.writes.push(String(data));
    return true;
  }

  end(): this {
    this.endCalls += 1;
    return this;
  }

  destroy(): this {
    this.destroyCalls += 1;
    return this;
  }

  signal(name: string): void {
    this.signals.push(name);
  }

  data(text: string): void {
    this.emit('data', Buffer.from(text, 'utf8'));
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function createSession(
  channel: FakeChannel,
  cwd = 'ssh://gpu/home/atlas/project',
): Promise<{ session: TerminalBackendSession; transport: ReturnType<typeof vi.fn>; shell: ReturnType<typeof vi.fn> }> {
  const shell = vi.fn(async () => channel as unknown as ClientChannel);
  const transport = vi.fn(async () => ({ shell }));
  const backend = new RemoteTerminalBackend({ transport } as never, () => undefined);
  const session = await backend.spawn({ cwd } as never);
  return { session, transport, shell };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RemoteTerminalBackend setup', () => {
  it('installs channel listeners before safely entering the URI workspace cwd', async () => {
    const channel = new FakeChannel();
    const { transport, shell } = await createSession(
      channel,
      "ssh://gpu/home/atlas/O'Brien/My Project",
    );

    expect(transport).toHaveBeenCalledWith("ssh://gpu/home/atlas/O'Brien/My Project");
    expect(shell).toHaveBeenCalledWith({ cols: 80, rows: 24 });
    expect(channel.writes).toEqual(["cd '/home/atlas/O'\\''Brien/My Project' || exit $?\r"]);
    expect(channel.listenerCountsAtWrite[0]).toEqual({ data: 1, close: 1, error: 1 });
  });

  it('rejects an already-aborted spawn without opening a transport', async () => {
    const controller = new AbortController();
    const reason = new Error('cancel setup');
    controller.abort(reason);
    const transport = vi.fn();
    const backend = new RemoteTerminalBackend({ transport } as never, () => undefined);

    await expect(backend.spawn({ cwd: 'ssh://gpu/work', signal: controller.signal } as never))
      .rejects.toBe(reason);
    expect(transport).not.toHaveBeenCalled();
  });

  it('retires a shell channel that arrives after spawn cancellation', async () => {
    const channel = new FakeChannel();
    const allocated = deferred<ClientChannel>();
    const shell = vi.fn(() => allocated.promise);
    const transport = vi.fn(async () => ({ shell }));
    const backend = new RemoteTerminalBackend({ transport } as never, () => undefined);
    const controller = new AbortController();
    const reason = new Error('cancel pending shell');

    const spawning = backend.spawn({ cwd: 'ssh://gpu/work', signal: controller.signal } as never);
    await vi.waitFor(() => { expect(shell).toHaveBeenCalledTimes(1); });
    controller.abort(reason);
    await expect(spawning).rejects.toBe(reason);

    allocated.resolve(channel as unknown as ClientChannel);
    await vi.waitFor(() => { expect(channel.endCalls).toBe(1); });
    channel.emit('close');
  });

  it('force-destroys a cancelled unpublished channel after a bounded grace period', async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const allocated = deferred<ClientChannel>();
    const shell = vi.fn(() => allocated.promise);
    const transport = vi.fn(async () => ({ shell }));
    const backend = new RemoteTerminalBackend({ transport } as never, () => undefined);
    const controller = new AbortController();

    const spawning = backend.spawn({ cwd: 'ssh://gpu/work', signal: controller.signal } as never);
    await vi.waitFor(() => { expect(shell).toHaveBeenCalledTimes(1); });
    controller.abort(new Error('cancel pending shell'));
    await expect(spawning).rejects.toThrow('cancel pending shell');

    allocated.resolve(channel as unknown as ClientChannel);
    await Promise.resolve();
    await Promise.resolve();
    expect(channel.endCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(channel.destroyCalls).toBe(1);
    channel.emit('close');
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('remote terminal send lifecycle', () => {
  it('does not invent a foreground PGID for explicit terminal signals', async () => {
    const channel = new FakeChannel();
    const { session } = await createSession(channel);

    await expect(session.signal('SIGTERM')).rejects.toThrow(/cannot verify a foreground process group/u);
    expect(channel.signals).toEqual([]);
    channel.emit('close');
  });

  it('uses AbortSignal to interrupt the channel and removes its listener on settle', async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const { session } = await createSession(channel);
    channel.writes.length = 0;
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');

    const operation = session.startSend({ text: 'sleep 10', submit: true, signal: controller.signal });
    expect(channel.writes).toEqual(['sleep 10', '\r']);
    controller.abort();
    expect(channel.signals).toEqual(['INT']);
    channel.data('^C\n');

    await vi.advanceTimersByTimeAsync(3_000);
    await expect(operation.done).resolves.toMatchObject({
      waitReason: 'inferred_idle',
      viewport: '^C\n',
      sessionStatus: { kind: 'running' },
    });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds incremental and settled send output in UTF-8 bytes and reports truncation', async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const { session } = await createSession(channel);
    const operation = session.startSend({ text: '', submit: false });
    channel.data('🙂'.repeat(20_000));

    const incremental = operation.readOutput();
    expect(Buffer.byteLength(incremental.delta, 'utf8')).toBeLessThanOrEqual(64 * 1024);
    expect(incremental.truncated).toBe(true);

    await vi.advanceTimersByTimeAsync(3_000);
    const result = await operation.done;
    expect(Buffer.byteLength(result.viewport, 'utf8')).toBeLessThanOrEqual(64 * 1024);
    expect(result.truncated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails an active send on channel error and clears timers', async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const { session } = await createSession(channel);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const operation = session.startSend({ text: 'run', submit: true, signal: controller.signal });
    const failure = new Error('transport failed');

    channel.emit('error', failure);
    await expect(operation.done).rejects.toBe(failure);
    expect(session.status()).toEqual({ kind: 'exited', exitCode: null, signal: null });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    channel.emit('close');
  });
});

describe('remote terminal exit and close', () => {
  it('publishes the SSH exit code and settles only when queued channel output closes', async () => {
    const channel = new FakeChannel();
    const { session } = await createSession(channel);
    const operation = session.startSend({ text: 'exit 23', submit: true });

    channel.emit('exit', 23);
    expect(session.status()).toEqual({ kind: 'exited', exitCode: 23, signal: null });
    channel.data('bye\n');
    channel.emit('close');

    await expect(operation.done).resolves.toEqual({
      viewport: 'bye\n',
      waitReason: 'session_exit',
      sessionStatus: { kind: 'exited', exitCode: 23, signal: null },
      truncated: false,
    });
  });

  it('normalizes an SSH exit signal into the terminal status vocabulary', async () => {
    const channel = new FakeChannel();
    const { session } = await createSession(channel);
    channel.emit('exit', null, 'TERM', '', 'terminated');
    channel.emit('close');

    expect(session.status()).toEqual({ kind: 'exited', exitCode: null, signal: 'SIGTERM' });
  });

  it('waits for the channel close event before close resolves', async () => {
    const channel = new FakeChannel();
    const { session } = await createSession(channel);
    let resolved = false;

    const closing = session.close('test').then(() => { resolved = true; });
    await Promise.resolve();
    expect(channel.endCalls).toBe(1);
    expect(resolved).toBe(false);

    channel.emit('close');
    await closing;
    expect(resolved).toBe(true);
  });

  it('force-destroys a channel that misses the graceful close deadline, then joins close', async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const { session } = await createSession(channel);
    const closing = session.close('deadline');

    await vi.advanceTimersByTimeAsync(3_000);
    expect(channel.destroyCalls).toBe(1);
    channel.emit('close');
    await expect(closing).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
