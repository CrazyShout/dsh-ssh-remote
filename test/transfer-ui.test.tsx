// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferModel } from '../client/transfer-model.js';
import { TransferPane } from '../client/transfers.js';
import type { TransferSummary } from '../shared/transfers.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return { Button: ({ size: _size, children, ...props }: any) => h('button', props, children), Input: (props: any) => h('input', props) };
});
const models: TransferModel[] = [];
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(async () => { await Promise.all(models.splice(0).map(model => model.dispose())); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const job: TransferSummary = { id: 'test-ui-transfer-identity', direction: 'upload', alias: 'hk', rootUri: 'ssh://hk/work', target: '', state: 'paused', count: 1, appended: 1, totalBytes: 1, created: 1, updated: 1, live: false, nonce: 'test-ui-nonce-identity' };
  const entries = [{ id: job.id + '-0', index: 0, path: 'file.txt', kind: 'file', size: 1, offset: 0, state: 'paused' }];
  const remote = { list: vi.fn(async () => ({ ok: true, value: [job] })), page: vi.fn(async () => ({ ok: true, value: { job, entries, next: 1, done: true } })), plan: vi.fn(), control: vi.fn() };
  const model = new TransferModel('original-session', remote as any); models.push(model); return { model, remote, job };
}
describe('transfer pane interactions', () => {
  it('clears an old picker error after acknowledged cleanup, without erasing a later error', async () => {
    const f = fixture(); f.job.state = 'complete';
    const element = document.createElement('div'), root = createRoot(element);
    f.remote.control.mockResolvedValue({ ok: true, value: {} });
    await act(async () => root.render(createElement(TransferPane, { sessionId: 'original-session', getModel: () => f.model })));
    await act(async () => f.model.report(new Error('old picker cancelled')));
    await act(async () => [...element.querySelectorAll('button')].find(item => item.textContent === '清理暂存及任务记录')!.click());
    expect(element.textContent).not.toContain('old picker cancelled'); expect(element.textContent).toContain('已完成文件保留');
    expect(f.model.snapshot().jobs).toEqual([]);
    let finish!: (value: any) => void;
    f.remote.control.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => {
      const pending = f.model.forget(f.job); f.model.report(new Error('new operation failed'));
      finish({ ok: true, value: {} }); await pending;
    });
    expect(element.textContent).toContain('new operation failed');
    await act(async () => root.unmount());
  });
  it('shows restart-safe state, does not auto-start, and preserves errors on refresh', async () => {
    const f = fixture(), element = document.createElement('div'), root = createRoot(element);
    await act(async () => root.render(createElement(TransferPane, { sessionId: 'original-session', getModel: () => f.model })));
    expect(element.textContent).toContain('1 TiB'); expect(element.textContent).toContain('已暂停'); expect(f.remote.control).not.toHaveBeenCalled();
    const button = (label: string) => [...element.querySelectorAll('button')].find(item => item.textContent === label)!;
    await act(async () => button('用当前选择开始 / 继续').click());
    expect(element.textContent).toContain('重新选择'); expect(f.remote.control).not.toHaveBeenCalled();
    await act(async () => button('刷新任务').click()); expect(element.textContent).toContain('重新选择');
    await act(async () => root.unmount()); expect(f.model.snapshot().jobs).toHaveLength(1);
  });
  it('keeps a download permission failure explicit instead of silently saving on the Host', async () => {
    const f = fixture(); f.job.direction = 'download'; const element = document.createElement('div'), root = createRoot(element);
    await act(async () => root.render(createElement(TransferPane, { sessionId: 'original-session', getModel: () => f.model })));
    await act(async () => [...element.querySelectorAll('button')].find(item => item.textContent === '授权目录并开始 / 继续')!.click());
    expect(element.textContent).toContain('缺少目录读写授权能力'); expect(f.remote.control).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
