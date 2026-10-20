// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalStatePane } from '../client/terminal-state.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react'); return { ...(await import('./native-control-stubs.js')).nativeControls, Button: ({ size: _size, children, ...props }: any) => h('button', props, children) };
});
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const row = { id: 'terminal-one', title: 'bash', alias: 'hk', state: 'prompt', reason: '', cwd: '/remote', recent: [], current: null, stale: false };
const ok = (value: any) => Promise.resolve({ ok: true, value });
describe('terminal state UI', () => {
  it('previews before insertion, uses revision-guarded original actions, and never submits', async () => {
    const remote: any = { list: vi.fn(() => ok([row])), context: vi.fn(() => ok({ text: 'REMOTE_CONTEXT', terminal: row, truncated: false })) };
    const actions: any = { captureInsertion: vi.fn(() => ({ revision: 1 })), insertText: vi.fn(() => false), submit: vi.fn(), setDraft: vi.fn() };
    const element = document.createElement('div'), root = createRoot(element);
    const button = (name: string) => [...element.querySelectorAll('button')].find(item => item.textContent === name)!;
    await act(async () => root.render(createElement(TerminalStatePane, { sessionId: 'original', remote, inputActions: actions })));
    expect(actions.insertText).not.toHaveBeenCalled();
    await act(async () => button('预览终端上下文').click());
    expect(remote.context).toHaveBeenCalledWith('original', 'terminal-one', expect.any(AbortSignal));
    expect(element.querySelector('textarea')?.value).toBe('REMOTE_CONTEXT'); expect(actions.insertText).not.toHaveBeenCalled();
    await act(async () => button('插入原会话草稿').click()); expect(element.textContent).toContain('未覆盖任何内容');
    actions.insertText.mockReturnValue(true);
    await act(async () => button('预览终端上下文').click()); await act(async () => button('插入原会话草稿').click());
    expect(element.textContent).toContain('未发送'); expect(actions.submit).not.toHaveBeenCalled(); expect(actions.setDraft).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
  it('rejects an old preview after Session switch, and marks stale state rather than guessing', async () => {
    let resolve!: (value: unknown) => void;
    const remote: any = { list: vi.fn(() => ok([row])), context: vi.fn(() => new Promise(done => { resolve = done; })) };
    const element = document.createElement('div'), root = createRoot(element);
    await act(async () => root.render(createElement(TerminalStatePane, { sessionId: 'first', remote })));
    await act(async () => [...element.querySelectorAll('button')].find(item => item.textContent === '预览终端上下文')!.click());
    await act(async () => root.render(createElement(TerminalStatePane, { sessionId: 'second', remote })));
    await act(async () => resolve({ ok: true, value: { text: 'OLD_SESSION_SECRET' } }));
    expect(element.textContent).not.toContain('OLD_SESSION_SECRET'); expect(element.querySelector('textarea')).toBeNull();
    remote.list.mockRejectedValue(new Error('disconnected'));
    await act(async () => [...element.querySelectorAll('button')].find(item => item.textContent === '刷新状态')!.click());
    expect(element.textContent).toContain('过期'); expect(element.textContent).toContain('disconnected');
    await act(async () => root.unmount());
  });
});
