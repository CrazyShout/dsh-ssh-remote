import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseCatalog, releaseTarget } from '../src/release-catalog.js';
import { updateSource } from '../src/updates.js';
import { UpdateStore, newerRelease, validTarget } from '../client/update-store.js';
import type { ReleaseTarget, UpdateInfo } from '../shared/updates.js';

const base = 'https://github.com/CrazyShout/dsh-ssh-remote/releases';
const target: ReleaseTarget = { version: '0.12.0', packageUrl: `${base}/download/v0.12.0/dsh-ssh-remote-0.12.0.tgz`,
  url: `${base}/tag/v0.12.0`, sha256: 'a'.repeat(64), testedDshVersions: ['0.2.0-rc.2', '0.2.1-rc.2'], publishedAt: '2026-10-19T00:00:00Z' };
function fixtures() {
  return { release: { tag_name: 'v0.12.0', draft: false, prerelease: false, html_url: target.url, published_at: target.publishedAt,
    assets: [{ name: 'dsh-ssh-remote-0.12.0.tgz', size: 128, state: 'uploaded', digest: `sha256:${target.sha256}`, browser_download_url: target.packageUrl },
      { name: 'release-manifest.json', browser_download_url: `${base}/download/v0.12.0/release-manifest.json` }] },
    manifest: { name: 'dsh-ssh-remote', version: '0.12.0', filename: 'dsh-ssh-remote-0.12.0.tgz', size: 128,
      sha256: target.sha256, dshVersions: target.testedDshVersions } };
}
function deferred<T = any>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const ok = <T>(value: T) => ({ ok: true as const, value });
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}
const stores: UpdateStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.dispose(); vi.useRealTimers(); });
function setup(preferences = new MemoryStorage(), receipts = new MemoryStorage()) {
  let info: UpdateInfo = { profileId: 'test-profile', runningVersion: '0.11.2', installedVersion: '0.11.2',
    source: `${base}/download/v0.11.2/dsh-ssh-remote-0.11.2.tgz`, sourceKind: 'release', enabled: true };
  const remote = { info: vi.fn(async () => ok(info)), check: vi.fn(async () => ok({ checkedAt: Date.now(), latest: target, error: '' })) };
  const installer = { installBundle: vi.fn(async () => { info = { ...info, installedVersion: target.version, runningVersion: target.version };
    return ok({ changed: true, application: 'applied', stage: 'install', target: target.packageUrl }); }),
    waitForInstall: vi.fn(async () => ok(null)), cancelInstall: vi.fn(async () => ok({ status: 'cancelled' })) };
  const store = new UpdateStore(remote, installer as never, preferences, receipts); stores.push(store);
  return { store, remote, installer, preferences, receipts, get info() { return info; }, setInfo: (changes: Partial<UpdateInfo>) => { info = { ...info, ...changes }; } };
}
async function ready(s: ReturnType<typeof setup>) { await s.store.start(); await s.store.check(false); }

describe('bounded public release catalog', () => {
  it('validates the fixed repository, version, archive, digest and compatibility metadata', () => {
    const { release, manifest } = fixtures(); expect(releaseTarget(release, manifest)).toEqual(target);
    expect(() => releaseTarget({ ...release, prerelease: true }, manifest)).toThrow();
    expect(() => releaseTarget({ ...release, draft: true }, manifest)).toThrow();
    expect(() => releaseTarget({ ...release, html_url: 'https://evil.example/' }, manifest)).toThrow();
    expect(() => releaseTarget(release, { ...manifest, version: '0.11.9' })).toThrow();
    expect(() => releaseTarget(release, { ...manifest, size: 129 })).toThrow();
    expect(() => releaseTarget(release, { ...manifest, sha256: 'b'.repeat(64) })).toThrow();
    expect(() => releaseTarget({ ...release, assets: release.assets.slice(0, 1) }, manifest)).toThrow();
  });
  it('shares a request, uses a six-hour success cache and sends no credentials or project data', async () => {
    const { release, manifest } = fixtures(); let now = 1000;
    const gate = deferred<Response>();
    const request = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(new Response(JSON.stringify(manifest)));
    const catalog = new ReleaseCatalog(request, () => now);
    const first = catalog.check(false), same = catalog.check(true); expect(first).toBe(same);
    gate.resolve(new Response(JSON.stringify(release)));
    expect((await first).latest).toEqual(target); expect(request).toHaveBeenCalledTimes(2);
    now += 60_000; expect((await catalog.check(false)).checkedAt).toBe(1000); expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      'https://api.github.com/repos/CrazyShout/dsh-ssh-remote/releases/latest', `${base}/download/v0.12.0/release-manifest.json`]);
    for (const [, options] of request.mock.calls) expect(options).toEqual({ signal: expect.any(AbortSignal), headers: { Accept: 'application/json' }, redirect: 'follow' });
    catalog.dispose();
  });
  it('reports rate limits and bounded-response failures instead of claiming up to date', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 }));
    const catalog = new ReleaseCatalog(request);
    expect(await catalog.check(false)).toMatchObject({ latest: null, error: expect.stringContaining('限制') });
    await catalog.check(false); expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(new Response('x'.repeat(512 * 1024 + 1)));
    expect(await catalog.check(true)).toMatchObject({ latest: null, error: expect.stringContaining('上限') });
    catalog.dispose();
  });
  it('aborts an in-flight check on unload and never accepts a prerelease tag for a URL', async () => {
    const request = vi.fn((_url, { signal }) => new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
    const catalog = new ReleaseCatalog(request as typeof fetch); const task = catalog.check(false); catalog.dispose();
    await expect(task).rejects.toThrow();
    const invalid = new ReleaseCatalog(vi.fn(async () => new Response(JSON.stringify({ tag_name: 'v0.12.1/../../evil', draft: false, prerelease: false }))));
    expect(await invalid.check(false)).toMatchObject({ latest: null, error: expect.stringContaining('稳定版') }); invalid.dispose();
  });
});

describe('source and version policy', () => {
  it.each(['link:/repo', 'file:../checkout', '/Users/test/source', 'workspace:*'])('does not overwrite development source %s', source => expect(updateSource(source)).toBe('development'));
  it.each([target.packageUrl, 'file:/tmp/candidate.tgz', '/tmp/candidate.tgz', 'github:CrazyShout/dsh-ssh-remote#v0.11.2'])('recognizes package source %s', source => expect(updateSource(source)).toBe('release'));
  it('rejects unrelated sources and compares versions numerically without downgrading previews', () => {
    expect(updateSource('dsh-ssh-remote@latest')).toBe('unsupported');
    expect(updateSource('https://evil.example/package.tgz')).toBe('unsupported');
    expect(newerRelease('0.12.0', '0.9.10')).toBe(true);
    expect(newerRelease('0.12.0', '0.12.0-rc.1')).toBe(true);
    expect(newerRelease('0.12.0', '0.13.0-alpha.1')).toBe(false);
    expect(newerRelease('0.12.0', '0.12.0')).toBe(false);
    expect(newerRelease('0.12.0-rc.2', '0.11.2')).toBe(false);
    expect(newerRelease('0.12.0', 'not-a-version')).toBe(false);
    expect(validTarget({ ...target, packageUrl: 'file:/tmp/not-this-package.tgz' })).toBe(false);
  });
});

describe('shared update controller', () => {
  it('explains mixed old-Host/new-client loading and can retry after Host restart', async () => {
    const s = setup(); s.remote.info.mockResolvedValueOnce({ ok: false, error: { message: 'transport failure: HTTP 404' } } as never);
    await s.store.start(); expect(s.store.getSnapshot()).toMatchObject({ checking: false, error: expect.stringContaining('重启当前 DSH') });
    expect(s.remote.check).not.toHaveBeenCalled();
    await ready(s); expect(s.store.available()).toEqual(target); expect(s.store.getSnapshot().error).toBe('');
  });
  it('checks automatically but never installs before explicit confirmation', async () => {
    const s = setup(); await ready(s);
    expect(s.store.available()).toEqual(target); expect(s.installer.installBundle).not.toHaveBeenCalled();
    await s.store.install(target);
    expect(s.installer.installBundle).toHaveBeenCalledExactlyOnceWith(target.packageUrl, { enabled: true, requestId: expect.any(String) });
    expect(s.store.getSnapshot().operation?.phase).toBe('done');
  });
  it('pauses automatic checking when hidden or opted out; preferences and dismissal are per profile', async () => {
    vi.useFakeTimers(); const s = setup(); s.store.setVisible(false); await s.store.start(); expect(s.remote.check).not.toHaveBeenCalled();
    s.store.setVisible(true); await s.store.check(false); expect(s.remote.check).toHaveBeenCalledOnce();
    s.store.dismiss(); s.store.setAutomatic(false); await vi.advanceTimersByTimeAsync(7 * 60 * 60_000); expect(s.remote.check).toHaveBeenCalledOnce();
    const next = setup(s.preferences, s.receipts); await next.store.start(); expect(next.store.getSnapshot()).toMatchObject({ automatic: false, dismissed: '0.12.0' });
    expect(next.remote.check).not.toHaveBeenCalled();
    next.setInfo({ profileId: 'other-profile' }); await next.store.start(); await next.store.check(false);
    expect(next.store.getSnapshot()).toMatchObject({ automatic: true, dismissed: '' });
  });
  it('coalesces checks and ignores a late result after a new connection/profile generation', async () => {
    const s = setup(), old = deferred(); s.remote.check.mockImplementationOnce(() => old.promise);
    await s.store.start(); const initial = s.store.check(false);
    s.setInfo({ profileId: 'second-profile' }); await s.store.start(); await s.store.check(false);
    old.resolve(ok({ checkedAt: 1, latest: null, error: 'stale failure' })); await initial;
    expect(s.store.getSnapshot().info?.profileId).toBe('second-profile'); expect(s.store.getSnapshot().release?.error).toBe('');
  });
  it('blocks source-linked, changed-source and stale-version confirmations', async () => {
    const s = setup(); await ready(s); s.setInfo({ sourceKind: 'development' }); await s.store.install(target);
    expect(s.installer.installBundle).not.toHaveBeenCalled(); expect(s.store.getSnapshot().operation?.message).toContain('源码链接');
    s.setInfo({ sourceKind: 'release', source: 'file:/new-source.tgz' }); await s.store.install(target);
    expect(s.installer.installBundle).not.toHaveBeenCalled(); expect(s.store.getSnapshot().operation?.message).toContain('已改变');
  });
  it('does not duplicate an update while source verification or installation is pending', async () => {
    const s = setup(); await ready(s); const gate = deferred(); s.remote.info.mockReturnValueOnce(gate.promise);
    const first = s.store.install(target); await s.store.install(target); expect(s.installer.installBundle).not.toHaveBeenCalled();
    gate.resolve(ok(s.info)); await first; expect(s.installer.installBundle).toHaveBeenCalledOnce();
  });
  it('distinguishes installed files from running code and requests a restart without restarting', async () => {
    const s = setup(); await ready(s);
    s.installer.installBundle.mockImplementation(async () => { s.setInfo({ installedVersion: target.version }); return ok({ changed: true, application: 'restart-required', stage: 'install', target: target.packageUrl }); });
    await s.store.install(target); expect(s.store.getSnapshot().operation).toMatchObject({ phase: 'restart', message: expect.stringContaining('当前仍运行 0.11.2') });
    s.setInfo({ runningVersion: target.version }); await s.store.reconcile(); expect(s.store.getSnapshot().operation?.phase).toBe('done');
  });
  it('recovers across client reload and does not resurrect a completed receipt from a late response', async () => {
    const s = setup(); await ready(s); const installed = deferred(); s.installer.installBundle.mockImplementation(() => installed.promise);
    const pending = s.store.install(target); await Promise.resolve(); await Promise.resolve(); s.store.dispose();
    const next = setup(s.preferences, s.receipts); next.setInfo({ installedVersion: target.version, runningVersion: target.version });
    await next.store.start(); await next.store.reconcile(); expect(next.store.getSnapshot().operation?.phase).toBe('done');
    installed.resolve(ok({ changed: true, application: 'applied', stage: 'install', target: target.packageUrl })); await pending;
    expect(s.receipts.getItem('dsh-ssh-remote:updates:test-profile:pending')).toBeNull(); expect(next.installer.installBundle).not.toHaveBeenCalled();
  });
  it('keeps an unconfirmed installation unknown and never treats no active request as cancellation', async () => {
    const s = setup(); await ready(s); s.installer.installBundle.mockResolvedValue({ ok: false, error: { message: 'lost connection' } } as never);
    await s.store.install(target); expect(s.store.getSnapshot().operation?.phase).toBe('unknown');
    await s.store.reconcile(); expect(s.store.getSnapshot().operation?.phase).toBe('unknown');
    await s.store.install(target); expect(s.installer.installBundle).toHaveBeenCalledOnce();
  });
  it('reports blocked scripts without approving or removing anything', async () => {
    const s = setup(); await ready(s); s.installer.installBundle.mockResolvedValue(ok({ changed: false, application: 'failed', stage: 'install', target: target.packageUrl, pendingBuilds: ['unknown-build'] }) as never);
    await s.store.install(target); expect(s.store.getSnapshot().operation).toMatchObject({ phase: 'failed', message: expect.stringContaining('不会自动批准') });
    expect(s.installer.installBundle.mock.calls[0][1]).not.toHaveProperty('approvedBuilds');
  });
  it('ignores a late cancellation answer after installation has completed', async () => {
    const s = setup(); await ready(s); const pending = deferred(), cancel = deferred();
    s.installer.installBundle.mockImplementation(() => pending.promise); s.installer.cancelInstall.mockImplementation(() => cancel.promise);
    const task = s.store.install(target); await Promise.resolve(); await Promise.resolve(); const cancellation = s.store.cancel();
    s.setInfo({ installedVersion: target.version, runningVersion: target.version });
    pending.resolve(ok({ changed: true, application: 'applied', stage: 'install', target: target.packageUrl })); await task;
    cancel.resolve(ok({ status: 'not-running' })); await cancellation; expect(s.store.getSnapshot().operation?.phase).toBe('done');
  });
});
