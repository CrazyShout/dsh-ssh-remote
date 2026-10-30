// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { ReactElement } from 'react';
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import { mountQuickOpen } from '../client/quick-open.js';
import { Workbench, type WorkbenchProps } from '../client/workbench.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: () => null, Input: () => null, FileTypeIcon: () => null }));
const ok = (sessionId: string, path: string) => ({ ok: true as const, value: { sessionId, path } });

function fixture() {
  let mounted = 'a', nativeAvailable = true;
  const workbench = new Workbench(), editor = { open: vi.fn() };
  const preview = vi.fn(async (id: string, path: string) => ok(id, path));
  const renderedBy: string[] = [];
  // A competing extension wins ordinary resource navigation, as in
  // better-sidebar's editor registration. Explicit kind uses the public seam.
  const openResourceIn = vi.fn((_id: string, _address: string, options?: { kind?: string }) => renderedBy.push(options?.kind ?? 'third-party-editor'));
  const scope = {
    remote: { sshRemoteFiles: { query() {}, preview } },
    sidebarRight: { mounted: { getSnapshot: () => mounted }, openResourceIn },
    sidebarRightTabs: { get: () => nativeAvailable ? { kind: 'text' } : undefined, register: () => () => {} },
    slots: { inject: (_: string, fn: () => unknown) => fn(), register: () => () => {} },
    inject(deps: string[], fn: (scope: unknown) => unknown) {
      const dispose = deps.includes('inputTriggers') || deps.includes('shortcuts') ? undefined : fn(scope);
      return { dispose: async () => { if (typeof dispose === 'function') await dispose(); } };
    },
  };
  const dispose = mountQuickOpen(scope as unknown as Context, editor, workbench);
  const pane = workbench.render('files', { sessionId: 'a', active: true } as WorkbenchProps) as ReactElement<{
    open(path: string, editing: boolean, signal: AbortSignal): Promise<void>;
  }>;
  return { preview, editor, openResourceIn, renderedBy, dispose, open: pane.props.open,
    switchSession: () => { mounted = 'b'; }, missingNative: () => { nativeAvailable = false; } };
}

describe('remote quick-open preview ownership (#40)', () => {
  it.each(['中文 space.md', 'src/example.ts', 'image.png'])('keeps %s on the official read-only preview despite a third-party editor', async path => {
    const f = fixture();
    try {
      await f.open(path, false, new AbortController().signal);
      expect(f.openResourceIn).toHaveBeenCalledExactlyOnceWith('a', sessionFileAddress('a', path), { kind: 'text' });
      expect(f.renderedBy).toEqual(['text']);
      expect(f.editor.open).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });
  it('keeps explicit edit on the SSH editor with draft protection', async () => {
    const f = fixture();
    try {
      await f.open('note.md', true, new AbortController().signal);
      expect(f.editor.open).toHaveBeenCalledExactlyOnceWith('a', 'note.md');
      expect(f.preview).not.toHaveBeenCalled(); expect(f.openResourceIn).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });
  it('reports an unavailable native preview instead of falling back to a local editor', async () => {
    const f = fixture(); f.missingNative();
    try {
      await expect(f.open('note.md', false, new AbortController().signal)).rejects.toThrow('原生文件预览尚未加载');
      expect(f.openResourceIn).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });
  it.each(['switch', 'abort', 'wrong-session'] as const)('rejects a late preview after %s', async scenario => {
    const f = fixture(), controller = new AbortController();
    let resolve!: (answer: ReturnType<typeof ok>) => void;
    f.preview.mockImplementation(() => new Promise(r => { resolve = r; }));
    try {
      const pending = f.open('note.md', false, controller.signal);
      if (scenario === 'switch') f.switchSession();
      if (scenario === 'abort') controller.abort();
      resolve(ok(scenario === 'wrong-session' ? 'b' : 'a', 'note.md'));
      if (scenario === 'abort') await pending;
      else await expect(pending).rejects.toThrow('会话已切换');
      expect(f.openResourceIn).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });
});
