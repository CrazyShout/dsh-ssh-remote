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
  const recheck = vi.fn(async (): Promise<unknown> => ({}));
  const store = new ConnectionStatusStore(load, {
    getSnapshot: () => generation,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  }, recheck);
  stores.push(store);
  return { store, load, recheck, listeners, change(id?: number) {
    generation = id === undefined ? undefined : { id, host: { home: '/home/test' } };
    for (const listener of listeners) listener();
  } };
}
const degraded = { alpha: { ...connected, status: 'degraded' as const, environment: { search: { available: false } } } };
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

  it('shares different visible surfaces and never overlaps a timed-out read or an explicit refresh', async () => {
    const { store, load } = fixture(), pending = deferred();
    load.mockReturnValueOnce(pending.promise);
    const badge = store.retain('a\0/anchor\0alpha');
    await flush();
    const settings = store.retain('settings\0alpha'), second = store.retain('settings\0beta');
    store.refresh(); store.refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().unavailable).toContain('超时');
    pending.resolve(success()); await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().hosts.alpha.status).toBe('connected');
    badge(); settings(); second();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(['failure', 'throw', 'timeout'])('clears a good snapshot after %s and ignores a late success', async kind => {
    const { store, load } = fixture(); store.retain('a\0/anchor\0alpha'); await flush();
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
    const { store, load, change } = fixture(); store.retain('a\0/anchor\0alpha'); await flush();
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
    const release = store.retain('a\0/anchor\0alpha'); await flush(); expect(load).not.toHaveBeenCalled();
    release(); change(3);
    store.retain('b')(); await flush(); expect(load).not.toHaveBeenCalled();
  });
});

describe('environment revalidation', () => {
  it('PR33 follow-up: does not spin retry timers while a second host probe is pending', async () => {
    const { store, load, recheck } = fixture();
    load.mockResolvedValue(success({ alpha: degraded.alpha, beta: degraded.alpha }));
    store.retain('a\0/anchor-a\0alpha'); store.retain('b\0/anchor-b\0beta'); await flush();
    let release!: () => void;
    const pending = new Promise<void>(done => { release = done; });
    recheck.mockImplementation(alias => alias === 'beta' ? pending : Promise.resolve());
    const retry = vi.spyOn(store as any, 'retryDue');
    const alpha = store.recheckHost('alpha'), beta = store.recheckHost('beta');
    await alpha;
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(retry.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      store.dispose(); release(); await beta;
    }
  });

  it('PR33 follow-up: stops retrying alpha after switching the visible owner to beta', async () => {
    const { store, load, recheck } = fixture();
    load.mockResolvedValue(success({ alpha: degraded.alpha, beta: degraded.alpha }));
    const releaseAlpha = store.retain('a\0/anchor-a\0alpha'); await flush();
    await store.recheckHost('alpha'); await flush();
    releaseAlpha(); store.retain('b\0/anchor-b\0beta'); await flush();
    await store.recheckHost('beta'); await flush();
    recheck.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recheck.mock.calls.map(([alias]) => alias)).not.toContain('alpha');
    expect(recheck).toHaveBeenCalledWith('beta');
  });

  it('PR33 follow-up: a late probe must not restart polling after carrier loss', async () => {
    const { store, load, recheck, change } = fixture();
    load.mockResolvedValue(success(degraded));
    store.retain('a\0/anchor-a\0alpha'); await flush();
    let release!: () => void;
    recheck.mockReturnValue(new Promise<void>(done => { release = done; }));
    const pending = store.recheckHost('alpha');
    change();
    release(); await pending; await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().hosts).toEqual({});
  });

  it('republishes immediately after a probe instead of waiting for the next poll', async () => {
    const { store, load, recheck } = fixture();
    load.mockResolvedValue(success(degraded));
    store.retain('a\0/anchor\0alpha'); await flush();
    expect(store.getSnapshot().hosts.alpha.status).toBe('degraded');
    load.mockResolvedValue(success());
    await store.recheckHost('alpha');
    await flush();
    expect(recheck).toHaveBeenCalledWith('alpha');
    expect(store.getSnapshot().hosts.alpha.status).toBe('connected');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('probes once when sibling surfaces ask for the same host', async () => {
    const { store, recheck, load } = fixture();
    load.mockResolvedValue(success(degraded));
    store.retain('a\0/anchor\0alpha'); store.retain('b\0/anchor\0alpha'); await flush();
    let release!: () => void;
    recheck.mockReturnValue(new Promise<void>(done => { release = done; }));
    const first = store.recheckHost('alpha');
    const second = store.recheckHost('alpha');
    expect(recheck).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(recheck).toHaveBeenCalledTimes(1);
  });

  it('retries a still-degraded host on its own clock, so a later install recovers without a reconnect', async () => {
    const { store, load, recheck } = fixture();
    load.mockResolvedValue(success(degraded));
    store.retain('a\0/anchor\0alpha'); await flush();
    let installed = false;
    recheck.mockImplementation(async () => { if (installed) load.mockResolvedValue(success()); });
    await store.recheckHost('alpha');
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().hosts.alpha.status).toBe('degraded');
    // The tool is installed after the first probe failed. No surface re-renders
    // and nobody calls recheckHost again: only the bounded retry can recover.
    installed = true;
    await vi.advanceTimersByTimeAsync(59_000);
    expect(recheck).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(recheck).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().hosts.alpha.status).toBe('connected');
  });

  it('keeps the last good snapshot when a probe fails and still retries later', async () => {
    const { store, load, recheck } = fixture();
    load.mockResolvedValue(success(degraded));
    store.retain('a\0/anchor\0alpha'); await flush();
    recheck.mockRejectedValue(new Error('probe failed'));
    await expect(store.recheckHost('alpha')).resolves.toBeUndefined();
    expect(store.getSnapshot().hosts.alpha.status).toBe('degraded');
    await expect(store.recheckHost('alpha')).resolves.toBeUndefined();
    expect(recheck).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recheck).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().hosts.alpha.status).toBe('degraded');
  });

  it('never probes while no surface is visible', async () => {
    const { store, recheck } = fixture();
    await store.recheckHost('alpha');
    expect(recheck).not.toHaveBeenCalled();
    const release = store.retain('a\0/anchor\0alpha'); await flush();
    release();
    await store.recheckHost('alpha');
    expect(recheck).not.toHaveBeenCalled();
  });

  it('re-probes a new connection identity without inheriting the old cooldown', async () => {
    const { store, load, recheck, change } = fixture();
    load.mockResolvedValue(success(degraded));
    store.retain('a\0/anchor\0alpha'); await flush();
    await store.recheckHost('alpha');
    expect(recheck).toHaveBeenCalledTimes(1);
    await store.recheckHost('alpha');
    expect(recheck).toHaveBeenCalledTimes(1);
    change(2); await flush();
    await store.recheckHost('alpha');
    expect(recheck).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the composed backend exposes no probe', async () => {
    const load = vi.fn(async () => success());
    const store = new ConnectionStatusStore(load, { getSnapshot: () => ({ id: 1, host: { home: '/home/test' } }), subscribe: () => () => {} });
    stores.push(store);
    store.retain('a\0/anchor\0alpha'); await flush();
    await expect(store.recheckHost('alpha')).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
