// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorModel } from '../client/editor-model.js';
import { RemoteEditorPane } from '../client/editor.js';
import type { EditorDocument, EditorRemote } from '../client/editor-types.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return { ...(await import('./native-control-stubs.js')).nativeControls, Button: ({ children, ...props }: any) => h('button', props, children), Input: (props: any) => h('input', props),
    Modal: ({ open, title, description, footer }: any) => open ? h('div', { role: 'dialog' }, title, description, footer) : null };
});
const ok = <T,>(value: T) => ({ ok: true as const, value });
const doc = (sessionId = 'a', path = '/project/中文 space.txt'): EditorDocument => ({ sessionId, rootUri: `ssh://${sessionId}/project`,
  path, alias: sessionId, version: 'v1:original', text: 'original\n', bom: false, newline: 'lf', maxBytes: 256 * 1024 });
function remote() {
  return { read: vi.fn(async (id: string, path: string) => ok(doc(id, path))),
    save: vi.fn(async () => ok({ state: 'saved' as const, version: 'v1:saved' })),
    status: vi.fn(async () => ok({ state: 'saved' as const, version: 'v1:saved' })) };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('remote editor buffer ownership', () => {
  it('keeps known pre-write refusals retryable and rejects oversized UTF-8 before sending', async () => {
    const rpc = remote(); const model = new EditorModel('a', rpc);
    await model.open('/project/file'); model.edit('draft');
    rpc.save.mockResolvedValueOnce({ ok: false, error: { code: 'ssh-editor/refused', message: 'invalid encoding' } } as any);
    await model.save(); expect(model.unsettled).toBe(false); expect(model.snapshot().outcome).toBe('failed');
    model.edit('中'.repeat(90_000)); await model.save();
    expect(rpc.save).toHaveBeenCalledTimes(1); expect(model.snapshot().message).toContain('未发送');
    model.edit('valid again'); await model.save(); expect(model.dirty).toBe(false);
  });
  it('requires a separate explicit confirmation to close a dirty buffer', async () => {
    const model = new EditorModel('a', remote());
    await model.open('/project/file'); model.edit('draft');
    const close = vi.fn();
    expect(model.requestClose(close)).toBe(false);
    model.confirm(false); expect(close).not.toHaveBeenCalled(); expect(model.dirty).toBe(true);
    model.requestClose(close); model.confirm(true);
    expect(close).toHaveBeenCalledOnce(); expect(model.snapshot().draft).toBe('draft');
  });
  it('does not show a late comparison under another file', async () => {
    const rpc = remote(); const model = new EditorModel('a', rpc);
    await model.open('/project/old');
    let complete!: (value: any) => void;
    rpc.read.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const pending = model.compare();
    await model.open('/project/new'); complete(ok(doc('a', '/project/old'))); await pending;
    expect(model.snapshot().remoteText).toBeUndefined();
    expect(model.snapshot().document?.path).toBe('/project/new');
  });
  it('retains drafts, rejects dirty file switches, and pins writes to the original session', async () => {
    const rpc = remote();
    const a = new EditorModel('a', rpc); const b = new EditorModel('b', rpc);
    await a.open('/project/中文 space.txt'); await b.open('/project/中文 space.txt');
    a.edit('edited-a'); b.edit('edited-b');
    await a.open('/project/other');
    expect(a.snapshot().draft).toBe('edited-a');
    expect(a.snapshot().document?.path).toBe('/project/中文 space.txt');
    await a.save();
    expect(rpc.save).toHaveBeenCalledWith('a', expect.objectContaining({ rootUri: 'ssh://a/project', text: 'edited-a', version: 'v1:original' }));
    expect(b.snapshot().draft).toBe('edited-b'); expect(b.dirty).toBe(true); expect(a.dirty).toBe(false);
    a.edit('new unsaved edit'); expect(a.snapshot().message).toBe('尚未保存。');
  });

  it('preserves the draft after a conflict and while comparing the latest remote content', async () => {
    const rpc = remote(); const model = new EditorModel('a', rpc);
    await model.open('/project/file'); model.edit('draft');
    rpc.save.mockResolvedValueOnce(ok({ state: 'conflict', message: 'changed' }) as any);
    await model.save(); await model.compare();
    expect(model.snapshot()).toMatchObject({ draft: 'draft', remoteText: 'original\n', outcome: 'conflict' });
    expect(model.dirty).toBe(true);
    rpc.read.mockResolvedValueOnce({ ok: false, error: { message: 'offline' } } as any);
    await model.open('/project/file', true);
    expect(model.snapshot().draft).toBe('draft');
  });

  it('does not resend or discard a timed-out save, then reconciles the same operation', async () => {
    vi.useFakeTimers();
    const rpc = remote(); const model = new EditorModel('a', rpc, 100);
    await model.open('/project/file'); model.edit('draft');
    rpc.save.mockImplementationOnce(() => new Promise(() => {}));
    const pending = model.save();
    await vi.advanceTimersByTimeAsync(101); await pending;
    expect(model.snapshot().outcome).toBe('unknown');
    await model.save(); await model.open('/project/other', true);
    expect(rpc.save).toHaveBeenCalledTimes(1);
    expect(model.snapshot().draft).toBe('draft');
    await model.verify();
    expect(rpc.status).toHaveBeenCalledWith('a', expect.any(String), expect.any(AbortSignal));
    expect(model.dirty).toBe(false); expect(rpc.save).toHaveBeenCalledTimes(1);
  });

  it('ignores an old read response after a new path has opened', async () => {
    const rpc = remote(); let complete!: (value: any) => void;
    rpc.read.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const model = new EditorModel('a', rpc);
    const first = model.open('/project/old');
    await model.open('/project/new');
    complete(ok(doc('a', '/project/old'))); await first;
    expect(model.snapshot().document?.path).toBe('/project/new');
  });
});

describe('remote editor component interaction', () => {
  it('requires confirmation before reload and safely renders HTML-looking file content', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const rpc: EditorRemote = remote();
    const model = new EditorModel('a', rpc);
    await model.open('/project/中文 space.txt');
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(RemoteEditorPane, { model })));
      const input = container.querySelector('textarea')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '<img src=x onerror=alert(1)>\n');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(model.dirty).toBe(true); expect(container.textContent).toContain('未保存');
      expect(container.querySelector('img')).toBeNull();
      const reload = [...container.querySelectorAll('button')].find(button => button.textContent === '重新加载')!;
      await act(async () => reload.click());
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
      const keep = [...container.querySelectorAll('button')].find(button => button.textContent === '保留草稿')!;
      await act(async () => keep.click());
      expect(model.dirty).toBe(true);
      await act(async () => reload.click());
      const discard = [...container.querySelectorAll('button')].find(button => button.textContent === '放弃并打开')!;
      await act(async () => discard.click());
      expect(model.dirty).toBe(false);
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'save via shortcut');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })));
      expect(rpc.save).toHaveBeenCalledTimes(1); expect(model.dirty).toBe(false);
    } finally { await act(async () => root.unmount()); container.remove(); model.dispose(); }
  });
});
