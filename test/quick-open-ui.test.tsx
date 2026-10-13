// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexMenuRefresh, QuickOpenPane, safePreviewPath } from '../client/quick-open.js';
import type { FileIndexResult, FileIndexStatus } from '../client/file-search-types.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return { Button: ({ children, variant: _variant, size: _size, ...props }: any) => h('button', props, children),
    Input: (props: any) => h('input', props) };
});
const state = (overrides: Partial<FileIndexResult> = {}): FileIndexResult => ({
  sessionId: 'a', rootUri: 'ssh://host/work', generation: 1, state: 'ready', stale: false,
  complete: true, count: 1, pathBytes: 20, unsupported: 0, message: '',
  candidates: [{ path: '中文 space.txt', kind: 'file' }], ...overrides,
});
const ok = <T,>(value: T) => ({ ok: true as const, value });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function render() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const remote = { preview: vi.fn(async (sessionId: string, path: string) => ok({ sessionId, path })), query: vi.fn(async () => ok(state())), status: vi.fn(async () => ok(state())), refresh: vi.fn(async () => ok(state({ stale: true }))) };
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container), open = vi.fn();
  await act(async () => { root.render(createElement(QuickOpenPane, { sessionId: 'a', remote, open })); });
  return { remote, container, root, open, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}
describe('quick open interaction and native menu refresh', () => {
  it('debounces, previews by default, edits only explicitly, and scopes includeIgnored/refresh', async () => {
    vi.useFakeTimers(); const f = await render();
    expect(f.remote.query).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    const buttons = () => [...f.container.querySelectorAll('button')];
    await act(async () => buttons().find(b => b.textContent === '中文 space.txt')!.click());
    expect(f.open).toHaveBeenLastCalledWith('中文 space.txt', false, expect.any(AbortSignal));
    await act(async () => buttons().find(b => b.textContent === '编辑')!.click());
    expect(f.open).toHaveBeenLastCalledWith('中文 space.txt', true, expect.any(AbortSignal));
    await act(async () => { (f.container.querySelector('input[type=checkbox]') as HTMLInputElement).click(); await vi.advanceTimersByTimeAsync(151); });
    expect(f.remote.query).toHaveBeenLastCalledWith('a', '', true, expect.any(AbortSignal));
    await act(async () => buttons().find(b => b.textContent === '刷新索引')!.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    expect(f.remote.refresh).toHaveBeenCalledWith('a', true, expect.any(AbortSignal));
    await f.close();
  });
  it('cancels on close, drops late responses/session mismatches and shows incomplete empty results honestly', async () => {
    vi.useFakeTimers(); const f = await render();
    let finish!: (value: any) => void;
    f.remote.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    const signal = (f.remote.query.mock.calls[0] as any[])[3] as AbortSignal;
    await f.close(); expect(signal.aborted).toBe(true);
    await act(async () => finish(ok(state({ sessionId: 'other' }))));
    const g = await render();
    g.remote.query.mockResolvedValueOnce(ok(state({ candidates: [], state: 'partial', complete: false })));
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    expect(g.container.textContent).toContain('未命中不代表不存在');
    expect(g.container.textContent).toContain('完整路径直接预览');
    await g.close();
  });
  it('never rewrites unsafe filenames or mutates/reopens a dismissed native menu', () => {
    for (const path of ['back\\slash', 'quote"name', 'line\nname', '../escape', 'ssh://other/file']) expect(() => safePreviewPath(path)).toThrow('不改写');
    expect(safePreviewPath('中文 space#%.txt')).toBe('中文 space#%.txt');
    let menu = { open: true, hit: { trigger: '@' } };
    const controller = { menu: { getSnapshot: () => menu }, refreshOpenMenu: vi.fn() } as any;
    const gate = new IndexMenuRefresh();
    gate.update(state(), controller); expect(controller.refreshOpenMenu).toHaveBeenCalledTimes(1);
    gate.update(state(), controller); expect(controller.refreshOpenMenu).toHaveBeenCalledTimes(1);
    menu = { open: false, hit: { trigger: '@' } };
    gate.update(state({ generation: 2 }), controller); expect(controller.refreshOpenMenu).toHaveBeenCalledTimes(1);
    menu = { open: true, hit: { trigger: '/' } };
    gate.update(state({ generation: 3 }), controller); expect(controller.refreshOpenMenu).toHaveBeenCalledTimes(1);
    menu = { open: true, hit: { trigger: '@' } };
    gate.update(state({ generation: 3, stale: true }), controller); expect(controller.refreshOpenMenu).toHaveBeenCalledTimes(2);
  });
});
