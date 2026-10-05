import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionFileAddress, absoluteFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import { imageFilePath, SessionImageCache, type ReadImageBytes } from '../client/markdown-images.js';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const caches: SessionImageCache[] = [];
afterEach(() => { caches.splice(0).forEach(cache => cache.dispose()); vi.useRealTimers(); vi.unstubAllGlobals(); });
const result = (extra = {}) => ({ ok: true as const, value: { data: png, absolutePath: '/remote/image.png', version: 'v1', bytes: png.length, offset: 0, eof: true, ...extra } });
function fixture(address = sessionFileAddress('owner-session', '/remote/文档/read me.md'), limits = {}, read: ReadImageBytes = vi.fn(async () => result())) {
  let sequence = 0;
  const urls = { create: vi.fn(() => `blob:session-${++sequence}`), revoke: vi.fn() };
  const changed = vi.fn(); const dependency = vi.fn();
  const cache = new SessionImageCache(address, read, changed, dependency, limits, urls);
  caches.push(cache); return { cache, read, urls, changed, dependency };
}

describe('session-scoped Markdown image cache', () => {
  it('decodes Unicode paths once and retains the document session and base file', async () => {
    const f = fixture();
    f.cache.request(['../图%20片%23一.png?raw=1#view']);
    await vi.waitFor(() => expect(f.cache.get('../图%20片%23一.png?raw=1#view')).toBe('blob:session-1'));
    expect(f.read).toHaveBeenCalledWith('owner-session', '../图 片#一.png', {
      baseFile: '/remote/文档/read me.md', range: { offset: 0, length: 65536 },
    }, expect.any(AbortSignal));
    expect(f.dependency).toHaveBeenCalledWith(sessionFileAddress('owner-session', '/remote/image.png'));
    f.cache.request(['../图%20片%23一.png?raw=2']);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(imageFilePath('C:/图像.png')).toBe('C:/图像.png');
  });

  it('never aliases the same remote filename across sessions', async () => {
    const read = vi.fn(async () => result());
    const a = fixture(sessionFileAddress('session-a', '/same/note.md'), {}, read);
    const b = fixture(sessionFileAddress('session-b', '/same/note.md'), {}, read);
    a.cache.request(['same.png']); b.cache.request(['same.png']);
    await vi.waitFor(() => expect(a.urls.create).toHaveBeenCalledOnce());
    expect(read.mock.calls.map(args => args[0])).toEqual(['session-a', 'session-b']);
    a.cache.dispose();
    expect(a.urls.revoke).toHaveBeenCalledOnce(); expect(b.urls.revoke).not.toHaveBeenCalled();
    expect(b.cache.get('same.png')).toBeDefined();
  });

  it('never falls back to Host URLs when identity is missing, a scheme is authored, or a read fails', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    for (const address of ['invalid', absoluteFileAddress('/host/note.md')]) {
      const f = fixture(address); f.cache.request(['/host/image.png']); expect(f.read).not.toHaveBeenCalled();
    }
    const f = fixture();
    f.cache.request(['https://example.com/image.png', '//example.com/image.png', 'file:///host/image.png', 'ssh://other/image.png', 'data:image/png;base64,x', '%zz.png', 'bad%00.png']);
    expect(f.read).not.toHaveBeenCalled();
    const failed = fixture(undefined, {}, vi.fn(async () => ({ ok: false, error: { message: 'remote unavailable' } })));
    failed.cache.request(['image.png']);
    await vi.waitFor(() => expect(failed.cache.failed).toBe(true));
    expect(failed.cache.get('image.png')).toBeUndefined(); expect(failed.urls.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds pending work and cancels all active reads and queued images on disposal', async () => {
    let release!: (value: ReturnType<typeof result>) => void;
    const pending = new Promise<ReturnType<typeof result>>(resolve => { release = resolve; });
    const read = vi.fn(() => pending); const f = fixture(undefined, { concurrent: 2 }, read);
    f.cache.request(['1.png', '2.png', '3.png', '4.png']);
    expect(read).toHaveBeenCalledTimes(2);
    const signals = read.mock.calls.map(args => args[3] as AbortSignal);
    f.cache.dispose(); signals.forEach(signal => expect(signal.aborted).toBe(true));
    release(result()); await Promise.resolve(); await Promise.resolve();
    expect(f.urls.create).not.toHaveBeenCalled(); expect(f.changed).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('bounds entry count, per-image bytes, and retained Blob bytes', async () => {
    const entries = fixture(undefined, { entries: 2 });
    entries.cache.request(['1.png', '2.png', '3.png']);
    await vi.waitFor(() => expect(entries.urls.create).toHaveBeenCalledTimes(2));
    expect(entries.read).toHaveBeenCalledTimes(2); expect(entries.cache.failed).toBe(true);
    const image = fixture(undefined, { imageBytes: 7 }); image.cache.request(['large.png']);
    await vi.waitFor(() => expect(image.cache.failed).toBe(true)); expect(image.urls.create).not.toHaveBeenCalled();
    const total = fixture(undefined, { totalBytes: 8 }); total.cache.request(['1.png', '2.png']);
    await vi.waitFor(() => expect(total.cache.failed).toBe(true)); expect(total.urls.create).toHaveBeenCalledOnce();
    total.cache.dispose(); expect(total.urls.revoke).toHaveBeenCalledOnce();
  });

  it('fails closed if file identity or freshness changes between byte windows', async () => {
    const read = vi.fn().mockResolvedValueOnce(result({ data: png.subarray(0, 4), eof: false }))
      .mockResolvedValueOnce(result({ data: png.subarray(4), offset: 4, version: 'v2' }));
    const f = fixture(undefined, {}, read); f.cache.request(['image.png']);
    await vi.waitFor(() => expect(f.cache.failed).toBe(true));
    expect(f.urls.create).not.toHaveBeenCalled(); expect(read.mock.calls[1][2].range.offset).toBe(4);
  });

  it('times out a read that ignores cancellation without launching a fallback', async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => new Promise<never>(() => {}));
    const f = fixture(undefined, { readTimeoutMs: 20 }, read); f.cache.request(['image.png']);
    await vi.advanceTimersByTimeAsync(25);
    expect(f.cache.failed).toBe(true); expect(f.urls.create).not.toHaveBeenCalled();
    expect((read.mock.calls[0][3] as AbortSignal).aborted).toBe(true);
  });

  it('does not recycle concurrency permits when timed-out underlying requests remain unresolved', async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => new Promise<never>(() => {}));
    const f = fixture(undefined, { concurrent: 2, readTimeoutMs: 20 }, read);
    f.cache.request(['1.png', '2.png', '3.png', '4.png', '5.png']);
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledTimes(2); expect(f.cache.failed).toBe(true);
    f.cache.request(['6.png']); await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('still revokes previously loaded Blob URLs after another image stalls the cache', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce(result()).mockImplementation(() => new Promise<never>(() => {}));
    const f = fixture(undefined, { readTimeoutMs: 20 }, read);
    f.cache.request(['loaded.png']); await vi.advanceTimersByTimeAsync(0);
    expect(f.urls.create).toHaveBeenCalledOnce();
    f.cache.request(['stalled.png']); await vi.advanceTimersByTimeAsync(25);
    f.cache.dispose(); expect(f.urls.revoke).toHaveBeenCalledWith('blob:session-1');
  });
});
