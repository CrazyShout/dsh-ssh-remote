import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionStatusStore } from '../client/connection-status.js';
import type { HelperHostStatus, RemoteResult } from '../shared/ssh.js';

const connected: HelperHostStatus = { status: 'connected', version: '', sessionId: '', capabilities: {}, error: '' };
const success = (hosts = { alpha: connected, beta: connected }) => ({ ok: true as const, value: hosts });
function deferred() {
  let resolve!: (value: RemoteResult<Record<string, HelperHostStatus>>) => void;
  const promise = new Promise<RemoteResult<Record<string, HelperHostStatus>>>(done => { resolve = done; });
  return { resolve, promise };
}
const stores: ConnectionStatusStore[] = [];
function fixture() {
  let generation: { id: number; host: { home: string } } | undefined = { id: 1, host: { home: '/home/test' } };
  const listeners = new Set<() => void>();
  const load = vi.fn(async (): Promise<RemoteResult<Record<string, HelperHostStatus>>> => success());
  const store = new ConnectionStatusStore(load, {
    getSnapshot: () => generation,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  stores.push(store);
  return { store, load, listeners, change(id?: number) {
    generation = id === undefined ? undefined : { id, host: { home: '/home/test' } };
    for (const listener of listeners) listener();
  } };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const store of stores.splice(0)) store.dispose(); vi.useRealTimers(); });
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('shared read-only connection status', () => {
  it('does no work without a consumer, shares duplicate owners and releases the last one', async () => {
    const { store, load, listeners } = fixture();
    await vi.advanceTimersByTimeAsync(20_000); expect(load).not.toHaveBeenCalled();
    const releaseBadge = store.retain('a\0/anchor\0alpha'), releasePane = store.retain('a\0/anchor\0alpha');
    await flush(); expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000); expect(load).toHaveBeenCalledTimes(2);
    releaseBadge(); releaseBadge();
    await vi.advanceTimersByTimeAsync(5_000); expect(load).toHaveBeenCalledTimes(3);
    releasePane();
    expect(store.getSnapshot().hosts).toEqual({});
    await vi.advanceTimersByTimeAsync(20_000); expect(load).toHaveBeenCalledTimes(3);
    store.dispose(); expect(listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('never overlaps ordinary polls while a read is pending', async () => {
    const { store, load } = fixture(), pending = deferred();
    load.mockReturnValue(pending.promise); store.retain('a');
    await vi.advanceTimersByTimeAsync(9_999); expect(load).toHaveBeenCalledTimes(1);
    pending.resolve(success()); await flush();
    await vi.advanceTimersByTimeAsync(4_999); expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(['failure', 'throw', 'timeout'])('clears a good snapshot after %s and ignores a late success', async kind => {
    const { store, load } = fixture(); store.retain('a'); await flush();
    expect(store.getSnapshot().hosts.alpha.status).toBe('connected');
    const pending = deferred();
    if (kind === 'failure') load.mockResolvedValue({ ok: false, error: { message: 'offline' } });
    if (kind === 'throw') load.mockRejectedValue(new Error('offline'));
    if (kind === 'timeout') load.mockReturnValue(pending.promise);
    await vi.advanceTimersByTimeAsync(kind === 'timeout' ? 15_000 : 5_000);
    expect(store.getSnapshot().hosts).toEqual({});
    expect(store.getSnapshot().unavailable).toContain(kind === 'timeout' ? '超时' : 'offline');
    pending.resolve(success()); await flush(); expect(store.getSnapshot().hosts).toEqual({});
    load.mockResolvedValue(success()); await vi.advanceTimersByTimeAsync(5_000);
    expect(store.getSnapshot().hosts.alpha.status).toBe('connected');
  });

  it('withdraws green immediately on carrier loss and rejects the old generation response', async () => {
    const { store, load, change } = fixture(); store.retain('a'); await flush();
    const old = deferred(); load.mockReturnValue(old.promise);
    await vi.advanceTimersByTimeAsync(5_000);
    change(); expect(store.getSnapshot().hosts).toEqual({});
    expect(store.getSnapshot().unavailable).toContain('DSH');
    await vi.advanceTimersByTimeAsync(20_000); expect(load).toHaveBeenCalledTimes(2);
    const fresh = deferred(); load.mockReturnValue(fresh.promise); change(2); await flush();
    old.resolve(success()); await flush(); expect(store.getSnapshot().hosts).toEqual({});
    fresh.resolve(success()); await flush(); expect(store.getSnapshot().hosts.alpha).toEqual(connected);
  });

  it('rejects a late snapshot after a Session/host switch or after the last owner leaves', async () => {
    const { store, load } = fixture(), old = deferred();
    load.mockReturnValue(old.promise); const release = store.retain('session-a\0/anchor\0alpha'); await flush();
    const fresh = deferred(); load.mockReturnValue(fresh.promise);
    const releaseNew = store.retain('session-b\0/anchor\0beta'); release(); await flush();
    old.resolve(success()); await flush(); expect(store.getSnapshot().hosts).toEqual({});
    fresh.resolve(success({ alpha: connected, beta: { ...connected, status: 'disconnected' } })); await flush();
    expect(store.getSnapshot().hosts.beta.status).toBe('disconnected');
    const late = deferred(); load.mockReturnValue(late.promise);
    await vi.advanceTimersByTimeAsync(5_000); releaseNew();
    late.resolve(success()); await flush(); expect(store.getSnapshot().hosts).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts unknown when the carrier is not ready and does not start a request after immediate withdrawal', async () => {
    const { store, load, change } = fixture(); change();
    const release = store.retain('a'); await flush(); expect(load).not.toHaveBeenCalled();
    release(); change(3);
    store.retain('b')(); await flush(); expect(load).not.toHaveBeenCalled();
  });
});
