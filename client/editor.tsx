import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import { EditorModel } from './editor-model.js';
import './editor-schema.js';
import type { EditorBridge } from './file-search-types.js';

const KIND = 'ssh-editor';
const ID = 'dsh-ssh-remote.editor';

export function mountRemoteEditor(ctx: Context, bridge?: EditorBridge): () => Promise<void> {
  const fiber = ctx.inject(['remote.sshRemoteEditor', 'remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
    if (!scope.sidebarRightTabs || !scope.sidebarRight || typeof scope.remote.sshRemoteEditor?.read !== 'function') return () => {};
    const buffers = new Map<string, EditorModel>();
    const model = (sessionId: string) => {
      let buffer = buffers.get(sessionId);
      if (!buffer) {
        for (const [id, existing] of buffers) {
          if (!existing.needsProtection && !existing.snapshot().reading
            && !scope.sidebarRight.tabsIn(id as SessionId).some(tab => tab.kind === KIND)) {
            existing.dispose(); buffers.delete(id);
          }
        }
        if (buffers.size >= 32) throw new Error('已达到 32 个会话编辑缓冲上限；请先保存草稿后重启。');
        buffer = new EditorModel(sessionId, scope.remote.sshRemoteEditor);
        buffers.set(sessionId, buffer);
      }
      return buffer;
    };
    const unregister = scope.sidebarRightTabs.register({ id: ID, kind: KIND, keepMounted: true,
      title: () => '远程编辑', guide: [] });
    const openEditor = (sessionId: string, path: string) => {
      if (scope.sidebarRight.mounted.getSnapshot() !== sessionId) throw new Error('会话已切换，请重新打开。');
      const buffer = model(sessionId);
      scope.sidebarRight.openTab(KIND);
      buffer.requestOpen(path);
    };
    if (bridge) bridge.open = openEditor;
    const confirmedClosures = new Set<string>();
    const close = scope.sidebarRight.registerCloseHandler(KIND, (sessionId, tab) => {
      const key = `${sessionId}\0${tab.id}`;
      if (confirmedClosures.has(key)) return;
      const buffer = buffers.get(sessionId);
      if (buffer && !buffer.requestClose(() => {
        confirmedClosures.add(key);
        try { scope.sidebarRight.closeIn(sessionId, tab.id); } finally { confirmedClosures.delete(key); }
      })) {
        throw new Error('已保留草稿，请在编辑器内确认是否关闭。');
      }
    });
    const body = scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: ID, inject: sessionId => ({ model: model(sessionId) }),
    }, RemoteEditorPane));
    const title = scope.slots.inject('sidebar.right.pane.tab.title', () => scope.slots.register({
      name: 'sidebar.right.pane.tab.title', key: ID, inject: sessionId => ({ model: model(sessionId) }),
    }, RemoteEditorTitle));
    const menu = scope.slots.inject('sidebar.right.tab.menu.item', () => scope.slots.register({
      name: 'sidebar.right.tab.menu.item', id: `${ID}.open`,
      inject: sessionId => ({
        workspaceInfo: scope.remote.sshRemote.workspaceInfo,
        openEditor: (path: string) => {
          openEditor(sessionId, path);
        },
      }),
    }, RemoteEditMenu));
    const protectUnload = (event: BeforeUnloadEvent) => {
      if (![...buffers.values()].some(buffer => buffer.needsProtection)) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnload);
    return () => {
      if (bridge?.open === openEditor) bridge.open = undefined;
      window.removeEventListener('beforeunload', protectUnload);
      menu(); title(); body(); close(); unregister();
      for (const buffer of buffers.values()) buffer.dispose();
    };
  });
  return async () => { await fiber.dispose(); };
}

export function RemoteEditorPane({ model }: { model: EditorModel }) {
  const state = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
  const [path, setPath] = useState('');
  useEffect(() => { if (state.document) setPath(state.document.path); }, [state.document?.path]);
  const open = (target: string) => model.requestOpen(target);
  const document = state.document;
  return <section aria-label="远程文本编辑器" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, minWidth: 0 }}>
    <Modal open={state.confirmation !== undefined} onClose={() => model.confirm(false)}
      title={state.confirmation === 'close' ? '关闭远程编辑页签？' : '放弃当前草稿？'} closeLabel="取消"
      description={state.confirmation === 'close'
        ? '草稿仅在本次运行中保留；退出应用会丢失。关闭页签不会撤销已发出的保存。'
        : '重新加载或切换文件会放弃当前未保存修改；只有完整读取新文件成功后才替换草稿。'}
      footer={<><Button onClick={() => model.confirm(false)}>保留草稿</Button><Button onClick={() => model.confirm(true)}>
        {state.confirmation === 'close' ? '关闭页签' : '放弃并打开'}</Button></>} />
    <form style={{ display: 'flex', gap: 6 }} onSubmit={event => { event.preventDefault(); open(path); }}>
      <Input aria-label="远程文件路径" placeholder="工作区内的文件路径（可输入完整路径）" value={path} style={{ flex: 1, minWidth: 0 }} onChange={event => setPath(event.target.value)} />
      <Button type="submit" disabled={!path || state.reading || model.unsettled}>打开</Button>
    </form>
    {document && <>
      <div title={`${document.alias}:${document.path}`} style={{ overflowWrap: 'anywhere', fontSize: 12 }}>
        SSH · {document.alias} · {document.path} {model.dirty ? '● 未保存' : ''}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Button disabled={!model.dirty || state.reading || model.unsettled} onClick={() => void model.save()}>保存</Button>
        <Button disabled={state.reading || model.unsettled} onClick={() => open(document.path)}>重新加载</Button>
        <Button disabled={state.reading || state.saving} onClick={() => void model.compare()}>查看远端版本</Button>
        {model.unsettled && <Button disabled={state.saving} onClick={() => void model.verify()}>核对保存结果</Button>}
      </div>
      <small>UTF-8{document.bom ? ' BOM' : ''} · {document.newline.toUpperCase()} · 最大 {document.maxBytes / 1024} KiB</small>
      <textarea aria-label="远程文件内容" spellCheck={false} value={state.draft} disabled={state.reading || state.saving}
        onChange={event => model.edit(event.target.value)}
        onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void model.save(); } }}
        style={{ flex: 1, minHeight: 180, resize: 'none', padding: 10, tabSize: 4, whiteSpace: 'pre', overflow: 'auto',
          fontFamily: 'ui-monospace,monospace', fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-primary)',
          background: 'var(--dsw-alias-background-primary,transparent)', border: '1px solid var(--dsw-alias-border-primary,#aaa)', borderRadius: 6 }} />
    </>}
    <div role={['conflict', 'unknown', 'failed'].includes(state.outcome ?? '') ? 'alert' : 'status'} style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{state.message || '输入远程文本文件路径；仅支持工作区内完整 UTF-8 文本。不自动保存。'}</div>
    {state.remoteText !== undefined && <details open><summary>最新远端内容（只读；上方仍是你的草稿）</summary>
      <pre style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{state.remoteText}</pre>
    </details>}
  </section>;
}
function RemoteEditorTitle({ model }: { model: EditorModel }) {
  const state = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
  return <span>{model.dirty ? '● ' : ''}{state.document ? `编辑 · ${state.document.path.split('/').pop()}` : '远程编辑'}</span>;
}
function RemoteEditMenu(props: PropsRuntime<'sidebar.right.tab.menu.item'> & {
  workspaceInfo: (path: string) => Promise<any>; openEditor: (path: string) => void;
}) {
  const file = parseFileAddress(props.tab.contentId);
  const cwd = props.useSessions((snapshot: SessionListState) => snapshot.byId[props.sessionId]?.cwd);
  const [remote, setRemote] = useState<string>();
  useEffect(() => {
    let active = true;
    if (cwd) void props.workspaceInfo(cwd).then(result => { if (active) setRemote(result.ok && result.value ? cwd : undefined); }, () => {});
    return () => { active = false; };
  }, [cwd, props.workspaceInfo]);
  if (file?.scope !== 'session' || file.sessionId !== props.sessionId || remote !== cwd || !cwd) return null;
  return <Button onClick={() => { props.dismiss(); props.openEditor(file.path); }}>编辑远程文本</Button>;
}
