import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateStore } from '../client/update-store.js';
import type { ReleaseTarget, UpdateInfo } from '../shared/updates.js';

const base = 'https://github.com/CrazyShout/dsh-ssh-remote/releases';
const target: ReleaseTarget = { version: '0.13.3', url: `${base}/tag/v0.13.3`,
  packageUrl: `${base}/download/v0.13.3/dsh-ssh-remote-0.13.3.tgz`,
  sha256: 'b'.repeat(64), testedDshVersions: ['0.2.0-rc.2', '0.2.1-rc.3'], publishedAt: '2026-10-29T00:00:00Z' };
const receiptKey = 'dsh-ssh-remote:updates:recovery-profile:pending';
const requestId = '00000000-1111-4222-8333-444444444444';
const ok = <T>(value: T) => ({ ok: true as const, value });
const lost = () => ({ ok: false as const, error: { message: 'connection lost' } });
const applied = () => ok({ changed: true, application: 'applied', stage: 'enable', target: 'dsh-ssh-remote' });
function deferred<T = any>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const stores: UpdateStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.dispose(); });
function setup(receipts: StorageLike = new MemoryStorage()) {
  let info: UpdateInfo = { profileId: 'recovery-profile', runningVersion: '0.13.2', installedVersion: '0.13.2',
    source: `${base}/download/v0.13.2/dsh-ssh-remote-0.13.2.tgz`, sourceKind: 'release', enabled: true };
  const order: string[] = [];
  const remote = {
    info: vi.fn(async (): Promise<any> => { order.push('info'); return ok({ ...info }); }),
    check: vi.fn(async (): Promise<any> => ok({ checkedAt: Date.now(), latest: target, error: '' })),
  };
  const installer = {
    installBundle: vi.fn(async (): Promise<any> => {
      info = { ...info, installedVersion: target.version, runningVersion: target.version, source: target.packageUrl };
      return applied();
    }),
    waitForInstall: vi.fn(async (): Promise<any> => { order.push('wait'); return ok(null); }),
    cancelInstall: vi.fn(async (): Promise<any> => ok({ status: 'not-running' })),
  };
  const store = new UpdateStore(remote, installer as never, new MemoryStorage(), receipts);
  store.setVisible(false); stores.push(store);
  return { store, remote, installer, receipts, order, get info() { return info; },
    setInfo(changes: Partial<UpdateInfo>) { info = { ...info, ...changes }; } };
}
type Fixture = ReturnType<typeof setup>;
async function ready(f: Fixture) { await f.store.start(); await f.store.check(true); }
async function unknown(f: Fixture) {
  await ready(f); f.installer.installBundle.mockResolvedValueOnce(lost());
  await f.store.install(target);
  expect(f.store.getSnapshot().operation?.phase).toBe('unknown');
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

describe('current installation observations', () => {
  it('refreshes local versions during a manual check even when GitHub fails', async () => {
    const f = setup(); await ready(f);
    const reads = f.remote.info.mock.calls.length;
    f.setInfo({ installedVersion: target.version, source: target.packageUrl });
    f.remote.check.mockRejectedValueOnce(new Error('GitHub offline'));
    await f.store.check(true);
    expect(f.remote.info.mock.calls.length).toBeGreaterThan(reads);
    expect(f.store.getSnapshot().info).toMatchObject({ installedVersion: target.version, runningVersion: '0.13.2' });
    expect(f.store.getSnapshot().error).toContain('GitHub offline');
    expect(f.store.getSnapshot().infoError).toBe('');
    expect(f.installer.installBundle).not.toHaveBeenCalled();
  });

  it('refreshes files after activation failure instead of offering the already installed update again', async () => {
    const f = setup(); await ready(f);
    f.installer.installBundle.mockImplementationOnce(async () => {
      f.setInfo({ installedVersion: target.version, source: target.packageUrl });
      return ok({ changed: true, application: 'failed', stage: 'enable', target: 'dsh-ssh-remote',
        error: { code: 'operation-error', diagnostic: 'activation failed' },
        packageResult: { output: 'pnpm completed', exitCode: 0, truncated: false, logPath: '/profile/logs/activation.log' } });
    });
    await f.store.install(target);
    expect(f.store.getSnapshot().info).toMatchObject({ installedVersion: target.version, runningVersion: '0.13.2' });
    expect(f.store.getSnapshot().operation).toMatchObject({ phase: 'failed', stage: 'enable',
      message: 'activation failed', logPath: '/profile/logs/activation.log' });
    expect(f.store.available()).toBeFalsy();
    await f.store.check(true); await f.store.install(target);
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
  });

  it('updates a changed preflight source without dispatching an installation', async () => {
    const f = setup(); await ready(f);
    f.setInfo({ source: 'file:/profile/manual.tgz' });
    await f.store.install(target);
    expect(f.store.getSnapshot().info?.source).toBe('file:/profile/manual.tgz');
    expect(f.store.getSnapshot().operation?.message).toContain('已改变');
    expect(f.installer.installBundle).not.toHaveBeenCalled();
    await f.store.check(true); await f.store.install(target);
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
  });

  it('does not let an older version read overwrite the post-install observation', async () => {
    const f = setup(); await ready(f);
    const previous = { ...f.info }, old = deferred();
    f.remote.info.mockReturnValueOnce(old.promise);
    const check = f.store.check(true);
    await settle();
    await f.store.install(target);
    expect(f.store.getSnapshot().info?.installedVersion).toBe(target.version);
    old.resolve(ok(previous)); await check;
    expect(f.store.getSnapshot().info?.installedVersion).toBe(target.version);
    expect(f.store.getSnapshot().operation?.phase).toBe('done');
  });

  it('coalesces same-turn change notifications and keeps checks read-only', async () => {
    const f = setup(); await ready(f);
    const before = f.remote.info.mock.calls.length;
    f.setInfo({ installedVersion: target.version });
    await Promise.all([f.store.refreshInstallation(), f.store.refreshInstallation(), f.store.refreshInstallation()]);
    expect(f.remote.info.mock.calls.length - before).toBe(1);
    expect(f.store.getSnapshot().info?.installedVersion).toBe(target.version);
    expect(f.installer.installBundle).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'] as const)('does not manufacture a failure from a stale preflight %s after a newer successful check', async outcome => {
    const f = setup(); await ready(f);
    const gate = deferred(); f.remote.info.mockReturnValueOnce(gate.promise);
    const installation = f.store.install(target); await settle();
    await f.store.check(true);
    if (outcome === 'success') gate.resolve(ok({ ...f.info }));
    else gate.reject(new Error('obsolete read disconnected'));
    await installation;
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
    expect(f.store.getSnapshot().operation?.phase).toBe('done');
    expect(f.store.getSnapshot().infoError).toBe('');
  });

  it('refreshes installation information after confirmed cancellation', async () => {
    const f = setup(); await unknown(f);
    f.installer.cancelInstall.mockImplementationOnce(async () => {
      f.setInfo({ source: 'file:/restored-original.tgz' });
      return ok({ status: 'cancelled' });
    });
    await f.store.cancel();
    expect(f.store.getSnapshot().info?.source).toBe('file:/restored-original.tgz');
    expect(f.store.getSnapshot().operation?.phase).toBe('cancelled');
  });

  it('does not offer an update from a stale local snapshot when local reads fail', async () => {
    const f = setup(); await ready(f);
    f.remote.info.mockRejectedValueOnce(new Error('local version unavailable'));
    await f.store.check(true);
    expect(f.store.getSnapshot().infoError).toContain('local version unavailable');
    expect(f.store.available()).toBeFalsy();
    await f.store.install(target);
    expect(f.installer.installBundle).not.toHaveBeenCalled();
    await f.store.check(true);
    expect(f.store.available()).toEqual(target);
  });
});

describe('unknown results and explicit recovery', () => {
  it('permits a read-only check without retrying an unknown installation', async () => {
    const f = setup(); await unknown(f);
    const checks = f.remote.check.mock.calls.length;
    await f.store.check(true); await f.store.install(target);
    expect(f.remote.check.mock.calls.length).toBeGreaterThan(checks);
    expect(f.store.getSnapshot().operation?.phase).toBe('unknown');
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
  });

  it('reads versions after the no-active-request reply, including an install finishing during lookup', async () => {
    const f = setup(); await unknown(f); f.order.length = 0;
    f.installer.waitForInstall.mockImplementationOnce(async () => {
      f.order.push('wait');
      f.setInfo({ installedVersion: target.version, source: target.packageUrl });
      return ok(null);
    });
    await f.store.reconcile();
    expect(f.order).toEqual(['wait', 'info']);
    expect(f.store.getSnapshot().operation).toMatchObject({ phase: 'restart', canDismiss: false });
    expect(f.store.getSnapshot().info?.installedVersion).toBe(target.version);
  });

  it('only ends a verified old prompt and requires another explicit installation', async () => {
    const f = setup(); await unknown(f); await f.store.reconcile();
    expect(f.store.getSnapshot().operation).toMatchObject({ phase: 'unknown', canDismiss: true });
    const waits = f.installer.waitForInstall.mock.calls.length;
    await f.store.finishUnknown();
    expect(f.installer.waitForInstall.mock.calls.length).toBeGreaterThan(waits);
    expect(f.store.getSnapshot().operation).toBeUndefined();
    expect(f.store.busy()).toBe(false);
    expect(f.receipts.getItem(receiptKey)).toBeNull();
    expect(f.installer.cancelInstall).not.toHaveBeenCalled();
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
    await f.store.install(target);
    expect(f.installer.installBundle).toHaveBeenCalledTimes(2);
    expect(f.store.getSnapshot().operation?.phase).toBe('done');
  });

  it.each(['lookup', 'info'] as const)('does not allow ending a prompt after %s fails', async stage => {
    const f = setup(); await unknown(f); await f.store.reconcile();
    if (stage === 'lookup') f.installer.waitForInstall.mockRejectedValueOnce(new Error('offline'));
    else f.remote.info.mockRejectedValueOnce(new Error('offline'));
    await f.store.finishUnknown();
    expect(f.store.getSnapshot().operation).toMatchObject({ phase: 'unknown', canDismiss: false });
    expect(f.receipts.getItem(receiptKey)).not.toBeNull();
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
    expect(f.installer.cancelInstall).not.toHaveBeenCalled();
  });

  it('retains a pending lookup while permitting independent version checks', async () => {
    const f = setup(); await unknown(f);
    const gate = deferred(); f.installer.waitForInstall.mockReturnValueOnce(gate.promise);
    const lookup = f.store.reconcile();
    await settle();
    expect(f.store.getSnapshot().operation?.canDismiss).not.toBe(true);
    await f.store.check(true); await f.store.finishUnknown();
    expect(f.receipts.getItem(receiptKey)).not.toBeNull();
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
    gate.resolve(ok(null)); await lookup;
    expect(f.store.getSnapshot().operation?.canDismiss).toBe(true);
  });

  it('does not clear the original profile receipt after the profile changes', async () => {
    const f = setup(); await unknown(f); await f.store.reconcile();
    const saved = f.receipts.getItem(receiptKey);
    f.setInfo({ profileId: 'different-profile' });
    await f.store.finishUnknown();
    expect(f.store.getSnapshot().operation?.canDismiss).not.toBe(true);
    expect(f.receipts.getItem(receiptKey)).toBe(saved);
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
    expect(f.installer.cancelInstall).not.toHaveBeenCalled();
  });

  it('shows an installed target instead of ending its prompt if it completes before confirmation', async () => {
    const f = setup(); await unknown(f); await f.store.reconcile();
    expect(f.store.getSnapshot().operation?.canDismiss).toBe(true);
    f.setInfo({ installedVersion: target.version, source: target.packageUrl });
    await f.store.finishUnknown();
    expect(f.store.getSnapshot().operation).toMatchObject({ phase: 'restart', canDismiss: false });
    expect(f.store.getSnapshot().info?.installedVersion).toBe(target.version);
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
    expect(f.installer.cancelInstall).not.toHaveBeenCalled();
  });

  it.each(['failure', 'exception'] as const)('does not resurrect a confirmed cancellation after a late install %s', async outcome => {
    const f = setup(); await ready(f);
    const old = deferred(); f.installer.installBundle.mockReturnValueOnce(old.promise);
    f.installer.cancelInstall.mockResolvedValueOnce(ok({ status: 'cancelled' }));
    const task = f.store.install(target); await settle();
    await f.store.cancel();
    expect(f.store.getSnapshot().operation?.phase).toBe('cancelled');
    if (outcome === 'exception') old.reject(new Error('late disconnected caller'));
    else old.resolve(lost());
    await task;
    expect(f.store.getSnapshot().operation?.phase).toBe('cancelled');
    expect(f.receipts.getItem(receiptKey)).toBeNull();
  });

  it.each(['success', 'failure', 'exception'] as const)('ignores a late installation %s after ending its prompt and starting another update', async outcome => {
    const f = setup(); await ready(f);
    const old = deferred(), next = deferred();
    f.installer.installBundle.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const first = f.store.install(target); await settle();
    await f.store.reconcile(); await f.store.finishUnknown();
    const second = f.store.install(target); await settle();
    const newId = f.store.getSnapshot().operation!.requestId;
    const saved = f.receipts.getItem(receiptKey);
    if (outcome === 'exception') old.reject(new Error('late old exception'));
    else old.resolve(outcome === 'success' ? applied() : lost());
    await first;
    expect(f.store.getSnapshot().operation).toMatchObject({ requestId: newId, phase: 'installing' });
    expect(f.receipts.getItem(receiptKey)).toBe(saved);
    f.setInfo({ installedVersion: target.version, runningVersion: target.version, source: target.packageUrl });
    next.resolve(applied()); await second;
    expect(f.store.getSnapshot().operation?.phase).toBe('done');
  });

  it('ignores a late cancellation reply without clearing the next request', async () => {
    const f = setup(); await unknown(f);
    const cancelled = deferred(); f.installer.cancelInstall.mockReturnValueOnce(cancelled.promise);
    const cancellation = f.store.cancel();
    await f.store.reconcile(); await f.store.finishUnknown();
    const next = deferred(); f.installer.installBundle.mockReturnValueOnce(next.promise);
    const task = f.store.install(target); await settle();
    const id = f.store.getSnapshot().operation!.requestId, saved = f.receipts.getItem(receiptKey);
    cancelled.resolve(ok({ status: 'cancelled' })); await cancellation;
    expect(f.store.getSnapshot().operation).toMatchObject({ requestId: id, phase: 'installing' });
    expect(f.receipts.getItem(receiptKey)).toBe(saved);
    f.setInfo({ installedVersion: target.version, runningVersion: target.version }); next.resolve(applied()); await task;
  });

  it('ignores a stale recovery reply after reconnection, dismissal and a new request', async () => {
    const f = setup(); await unknown(f);
    const old = deferred(); f.installer.waitForInstall.mockReturnValueOnce(old.promise);
    const recovery = f.store.reconcile(); await settle();
    await f.store.start(); await f.store.reconcile(); await f.store.finishUnknown();
    const next = deferred(); f.installer.installBundle.mockReturnValueOnce(next.promise);
    const task = f.store.install(target); await settle();
    const id = f.store.getSnapshot().operation!.requestId, saved = f.receipts.getItem(receiptKey);
    old.resolve(ok({ changed: false, application: 'failed', stage: 'install', target: target.packageUrl,
      error: { code: 'operation-error', diagnostic: 'late lookup result' } }));
    await recovery;
    expect(f.store.getSnapshot().operation).toMatchObject({ requestId: id, phase: 'installing' });
    expect(f.receipts.getItem(receiptKey)).toBe(saved);
    f.setInfo({ installedVersion: target.version, runningVersion: target.version }); next.resolve(applied()); await task;
  });
});

describe('recovery records at the controller boundary', () => {
  it('adopts a late HMR summary after the replacement controller has loaded the pending record', async () => {
    const old = setup(); await ready(old); const reply = deferred();
    old.installer.installBundle.mockReturnValueOnce(reply.promise);
    const task = old.store.install(target); await settle(); old.store.dispose();
    const next = setup(old.receipts); await next.store.start(); await next.store.reconcile();
    expect(next.store.getSnapshot().operation?.phase).toBe('unknown');
    reply.resolve(ok({ changed: false, application: 'failed', stage: 'install', target: target.packageUrl,
      error: { code: 'operation-error', diagnostic: 'late HMR failure' },
      packageResult: { exitCode: 1, output: 'x'.repeat(16384), truncated: true, logPath: '/profile/logs/late.log' } }));
    await task;
    await next.store.reconcile();
    expect(next.store.getSnapshot().operation).toMatchObject({ phase: 'failed', message: 'late HMR failure', logPath: '/profile/logs/late.log' });
    expect(next.installer.installBundle).not.toHaveBeenCalled();
  });
  it('recovers a full-size late installer result without persisting its log body', async () => {
    const f = setup(); await ready(f); const late = deferred();
    f.installer.installBundle.mockReturnValueOnce(late.promise);
    const task = f.store.install(target); await settle(); f.store.dispose();
    late.resolve(ok({ changed: false, application: 'failed', stage: 'install', target: target.packageUrl,
      error: { code: 'operation-error', diagnostic: 'dependency failed' },
      packageResult: { output: 'LONG_LOG_MARKER'.repeat(2000), exitCode: 1, truncated: true, logPath: '/profile/logs/update.log' } }));
    await task;
    const raw = f.receipts.getItem(receiptKey)!;
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(8192);
    expect(raw).not.toContain('LONG_LOG_MARKER');
    const next = setup(f.receipts); await next.store.start(); await next.store.reconcile();
    expect(next.store.getSnapshot().operation).toMatchObject({ phase: 'failed', message: 'dependency failed', logPath: '/profile/logs/update.log' });
  });

  it('migrates an old large record and retains its known outcome', async () => {
    const f = setup();
    f.receipts.setItem(receiptKey, JSON.stringify({ requestId, target, result: {
      changed: false, application: 'failed', stage: 'install', target: target.packageUrl,
      error: { code: 'operation-error', diagnostic: 'legacy dependency failure' },
      packageResult: { output: 'x'.repeat(16384), exitCode: 1, truncated: true, logPath: '/profile/logs/legacy.log' },
    } }));
    await f.store.start(); await f.store.reconcile();
    expect(f.store.getSnapshot().receiptError).toBe('');
    expect(f.store.getSnapshot().operation).toMatchObject({ phase: 'failed', message: 'legacy dependency failure', logPath: '/profile/logs/legacy.log' });
    expect(f.installer.installBundle).not.toHaveBeenCalled();
  });

  it.each([{ label: 'invalid JSON', raw: 'invalid JSON' }, { label: 'oversized legacy JSON', raw: 'x'.repeat(256 * 1024 + 1) }])('reports $label without treating it as no previous operation', async ({ raw }) => {
    const f = setup(); f.receipts.setItem(receiptKey, raw);
    await ready(f);
    expect(f.store.getSnapshot().receiptError).not.toBe('');
    expect(f.store.getSnapshot().info?.installedVersion).toBe('0.13.2');
    expect(f.remote.check).toHaveBeenCalled();
    await f.store.install(target);
    expect(f.installer.installBundle).not.toHaveBeenCalled();
  });

  it('can reconcile the current in-memory operation when browser storage is unavailable', async () => {
    const unavailable: StorageLike = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
      removeItem: () => { throw new Error('storage disabled'); },
    };
    const f = setup(unavailable); await unknown(f); await f.store.reconcile();
    expect(f.store.getSnapshot().operation?.canDismiss).toBe(true);
    await f.store.finishUnknown();
    expect(f.store.busy()).toBe(false);
    expect(f.installer.cancelInstall).not.toHaveBeenCalled();
    expect(f.installer.installBundle).toHaveBeenCalledOnce();
  });
});
