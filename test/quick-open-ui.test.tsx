// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexMenuRefresh, ReferenceIndexStatus, QuickOpenPane, safePreviewPath } from '../client/quick-open.js';
import type { FileIndexResult, FileIndexStatus } from '../client/file-search-types.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return { ...(await import('./native-control-stubs.js')).nativeControls, Button: ({ children, variant: _variant, size: _size, ...props }: any) => h('button', props, children),
    FileTypeIcon: () => null, Input: ({ className, ...props }: any) => h('span', { className }, h('input', props)) };
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
  it('does not open a candidate when Enter confirms an IME composition', async () => {
    vi.useFakeTimers(); const f = await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    const input = f.container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    await act(async () => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    await act(async () => f.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
    expect(f.open).not.toHaveBeenCalled();
    await act(async () => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(f.open).toHaveBeenCalledWith('中文 space.txt', false, expect.any(AbortSignal));
    await f.close();
  });
  it('never activates a previous query while new input is debouncing or awaiting its response', async () => {
    vi.useFakeTimers(); const f = await render();
    f.remote.query.mockResolvedValueOnce(ok(state({ candidates: [
      { path: 'old-folder', kind: 'directory' }, { path: 'protocol.txt', kind: 'file' },
    ] })));
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    const input = f.container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    let finish!: (value: any) => void;
    f.remote.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'protocol');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const enter = async () => { await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))); };
    await enter();
    expect(input.value).toBe('protocol'); expect(f.open).not.toHaveBeenCalled();
    expect(f.container.querySelectorAll('[role="option"]')).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    await enter(); expect(input.value).toBe('protocol'); expect(f.open).not.toHaveBeenCalled();
    await act(async () => finish(ok(state({ candidates: [{ path: 'protocol.txt', kind: 'file' }] }))));
    await enter();
    expect(f.open).toHaveBeenCalledExactlyOnceWith('protocol.txt', false, expect.any(AbortSignal));
    await f.close();
  });
  it('stretches the public Input wrapper without relying on styles on the inner input', async () => {
    vi.useFakeTimers(); const f = await render();
    const form = f.container.querySelector('form')!;
    expect(form.style.gridTemplateColumns).toBe('minmax(0, 1fr) auto');
    expect(form.firstElementChild?.tagName).toBe('SPAN');
    expect(form.querySelector('input')?.style.width).toBe('100%');
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    expect(f.container.textContent).toContain('已索引 1 项');
    await f.close();
  });
  it('navigates results by keyboard and cancels queries when hidden', async () => {
    vi.useFakeTimers(); const f = await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    const input = f.container.querySelector('[role="combobox"]')!;
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(f.container.querySelector('[role="option"]')?.getAttribute('aria-selected')).toBe('true');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(f.open).toHaveBeenLastCalledWith('中文 space.txt', false, expect.any(AbortSignal));
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    await act(async () => f.root.render(createElement(QuickOpenPane, { sessionId: 'a', remote: f.remote, open: f.open, active: false })));
    const calls = f.remote.query.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(f.remote.query).toHaveBeenCalledTimes(calls);
    await f.close();
  });
  it('makes zero index polls with a closed menu and aborts when it closes or the page hides', async () => {
    vi.useFakeTimers();
    let menu = { open: false, hit: { trigger: '@' } }, changed = () => {};
    const controller = { menu: { getSnapshot: () => menu, subscribe: (listener: () => void) => { changed = listener; return () => {}; } }, refreshOpenMenu: vi.fn() };
    const remote = { status: vi.fn(async () => ok(state())) } as any;
    const props = { sessionId: 'a', useSessions: (select: any) => select({ byId: { a: { cwd: '/anchor' } } }), remote,
      workspaceInfo: vi.fn(async () => ok({ alias: 'host' })), controller: () => controller } as any;
    const element = document.createElement('div'), root = createRoot(element);
    await act(async () => root.render(createElement(ReferenceIndexStatus, props)));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(remote.status).not.toHaveBeenCalled(); expect(element.textContent).toBe('');
    await act(async () => { menu = { ...menu, open: true }; changed(); });
    expect(remote.status).toHaveBeenCalledTimes(1);
    const signal = remote.status.mock.calls[0][2];
    await act(async () => { menu = { ...menu, open: false }; changed(); });
    expect(signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(remote.status).toHaveBeenCalledTimes(1); expect(element.textContent).toBe('');
    await act(async () => root.unmount());
  });
  it('debounces, previews by default, edits only explicitly, and scopes includeIgnored/refresh', async () => {
    vi.useFakeTimers(); const f = await render();
    expect(f.remote.query).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(151); });
    const buttons = () => [...f.container.querySelectorAll('button')];
    await act(async () => (f.container.querySelector('[role="option"]') as HTMLElement).click());
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
