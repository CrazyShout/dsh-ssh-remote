import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteFileIndex, installRemoteFileReferencesRouter, rankCandidates, representable } from '../src/file-index.js';

const indexes: RemoteFileIndex[] = [];
afterEach(async () => { await Promise.all(indexes.splice(0).map(x => x.dispose())); });
const scope = { sessionId: 'session-a' as any, workspaceRoot: '/anchor' };
const resolve = (path: string) => path === '/anchor' ? 'ssh://host/work' : path === '/other' ? 'ssh://other/work' : undefined;
function fixture() {
  let rows = [{ path: 'src/中文 file.ts', kind: 'file' }];
  let complete = true, error: any = null;
  let blocked = false;
  const calls: string[] = [];
  let clock = 1_000;
  const client: any = { sessionId: 'helper-a', hello: { serverInstanceId: 'epoch' }, capabilities: { filesystem: { discovery: { version: 1 } } },
    call: vi.fn(async (method: string, params: any) => {
      calls.push(method);
      if (method === 'workspace/open') return { workspaceId: params.workspaceId, path: '/work', access: 'read-only' };
      if (method === 'fs/discoverRead') {
        if (blocked) return { entries: [], cursor: 0, eof: false, complete: false };
        return { entries: rows, cursor: rows.length, eof: true, complete, error, reason: complete ? null : 'limit' };
      }
      if (method.endsWith('Close') || method === 'workspace/close') return { closed: true };
      return {};
    }),
  };
  const index = new RemoteFileIndex({ client: async () => client }, resolve, () => clock);
  indexes.push(index);
  return { index, client, calls, rows: (value: typeof rows) => { rows = value; },
    error: (value: any) => { error = value; }, incomplete: () => { complete = false; },
    block: (value: boolean) => { blocked = value; }, tick: () => { clock += 61_000; } };
}
describe('session-owned shared file index', () => {
  it('retains unconfirmed cleanup and retries the same resource identity before building again', async () => {
    const f = fixture(), signal = new AbortController().signal;
    const original = f.client.call.getMockImplementation()!;
    let refuse = true;
    f.client.call.mockImplementation(async (method: string, params: any) => {
      if (method === 'fs/discoverClose' && refuse) return { closed: false };
      return original(method, params);
    });
    expect((await f.index.query(scope, '', false, signal)).message).toContain('保留清理责任');
    const firstClose = f.client.call.mock.calls.find((c: any[]) => c[0] === 'fs/discoverClose')[1];
    refuse = false;
    expect((await f.index.query(scope, '', false, signal)).state).toBe('ready');
    expect(f.client.call.mock.calls.filter((c: any[]) => c[0] === 'fs/discoverClose')[1][1]).toEqual(firstClose);
  });
  it('lets a new consumer wait for abandoned cleanup then allocate a fresh scan', async () => {
    const f = fixture(); f.block(true);
    const original = f.client.call.getMockImplementation()!;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let closing = false;
    f.client.call.mockImplementation(async (method: string, params: any) => {
      if (method === 'fs/discoverClose' && !closing) { closing = true; await barrier; }
      return original(method, params);
    });
    const abort = new AbortController();
    const first = f.index.query(scope, '', false, abort.signal).catch(() => {});
    await vi.waitFor(() => expect(f.calls).toContain('fs/discoverRead'));
    abort.abort(); await first;
    await vi.waitFor(() => expect(closing).toBe(true));
    const second = f.index.query(scope, '', false, new AbortController().signal);
    f.block(false); release();
    expect((await second).state).toBe('ready');
    expect(f.calls.filter(x => x === 'fs/discoverOpen')).toHaveLength(2);
  });
  it('shares one build, isolates hosts/modes and expires/invalidates without losing valid data on error', async () => {
    const f = fixture(); const signal = new AbortController().signal;
    const [a, b] = await Promise.all([f.index.query(scope, 'file', false, signal), f.index.query({ ...scope, sessionId: 'second' as any }, 'file', false, signal)]);
    expect(f.calls.filter(x => x === 'fs/discoverOpen')).toHaveLength(1);
    expect(a.generation).toBe(b.generation); expect(b.sessionId).toBe('second');
    expect(a.candidates[0].path).toBe('src/中文 file.ts');
    await f.index.query({ ...scope, workspaceRoot: '/other' }, 'file', false, signal);
    await f.index.query(scope, 'file', true, signal);
    expect(f.calls.filter(x => x === 'fs/discoverOpen')).toHaveLength(3);
    f.tick(); expect(f.index.status(scope, false).stale).toBe(true);
    f.rows([]); f.error({ code: 'E_PERMISSION_DENIED', message: 'denied' });
    const failed = await f.index.query(scope, 'file', false, signal);
    expect(failed).toMatchObject({ stale: true, state: 'error', complete: false, generation: a.generation });
    expect(failed.candidates).toEqual(a.candidates);
    f.error(null); f.rows([{ path: 'new.ts', kind: 'file' }]); f.index.invalidate('/anchor');
    expect((await f.index.query(scope, 'new', false, signal)).candidates[0].path).toBe('new.ts');
  });
  it('cancels only the final consumer and still closes late allocations', async () => {
    const f = fixture(); f.block(true);
    const a = new AbortController(), b = new AbortController();
    const first = f.index.query(scope, '', false, a.signal).catch(e => e);
    const second = f.index.query(scope, '', false, b.signal);
    await vi.waitFor(() => expect(f.calls).toContain('fs/discoverRead'));
    a.abort(); await first;
    await new Promise(r => setTimeout(r, 250));
    expect(f.calls).not.toContain('fs/discoverClose');
    f.block(false); await second;
    expect(f.calls.filter(x => x === 'fs/discoverOpen')).toHaveLength(1);
    expect(f.calls).toContain('fs/discoverClose');
    f.index.invalidate('/anchor'); f.block(true);
    const c = new AbortController(); const pending = f.index.query(scope, '', false, c.signal).catch(e => e);
    await vi.waitFor(() => expect(f.calls.filter(x => x === 'fs/discoverOpen')).toHaveLength(2));
    c.abort(); await pending;
    await vi.waitFor(() => expect(f.calls.filter(x => x === 'fs/discoverClose')).toHaveLength(2));
  });
  it('never falls back to local, preserves receiver for local requests, and filters unrepresentable names', async () => {
    const f = fixture(); f.rows([{ path: 'quote"file', kind: 'file' }, { path: 'back\\slash', kind: 'file' }, { path: 'ok.txt', kind: 'file' }]);
    const local = vi.fn(function (this: unknown) { return Promise.resolve([{ path: String((this as any).owner), kind: 'file' as const }]); });
    const service: any = { list: local, owner: 'local' }; const restore = installRemoteFileReferencesRouter(service, f.index, resolve);
    const agent = (cwd: string) => ({ session: { id: 's', header: { cwd } } });
    const signal = new AbortController().signal;
    expect(await service.list.call({ owner: 'bound' }, agent('/local'), '', signal)).toEqual([{ path: 'bound', kind: 'file' }]);
    expect(await service.list(agent('/anchor'), '', signal)).toEqual([{ path: 'ok.txt', kind: 'file' }]);
    expect(f.index.status(scope, false).unsupported).toBe(2);
    f.client.sessionId = 'changed'; f.error({ code: 'E_CONNECTION', message: 'offline' });
    expect(await service.list(agent('/anchor'), '', signal)).toEqual([]);
    expect(local).toHaveBeenCalledTimes(1);
    await expect(f.index.query(scope, '../outside', false, signal)).rejects.toThrow('上级');
    await expect(f.index.query({ ...scope, workspaceRoot: '/local' }, '', false, signal)).rejects.toThrow('SSH');
    restore(); expect(service.list).toBe(local);
  });
  it('reports partial snapshots and rejects traversals, duplicate paths and malformed pages', async () => {
    const f = fixture(), signal = new AbortController().signal; f.incomplete();
    expect(await f.index.query(scope, 'none', false, signal)).toMatchObject({ state: 'partial', complete: false, candidates: [] });
    for (const path of ['../outside', '/etc/passwd', 'a/.git/config']) {
      f.rows([{ path, kind: 'file' }]); f.index.invalidate('/anchor');
      expect((await f.index.query(scope, '', false, signal)).state).toBe('error');
    }
    expect(rankCandidates([{ path: 'train.py', kind: 'file' }, { path: 'src/trainer.py', kind: 'file' }], 'train')[0].path).toBe('train.py');
    expect(representable('中文 spaces #%.ts')).toBe(true);
    expect(representable('line\nname')).toBe(false);
  });
});
