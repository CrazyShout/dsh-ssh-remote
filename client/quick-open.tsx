import { useEffect, useRef, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client';
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type {} from '@deepseek-ai/dsh-client-shortcuts/client';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import type { EditorBridge, FileIndexResult, FileIndexStatus, FileSearchRemote } from './file-search-types.js';
import './file-search-schema.js';

const KIND = 'ssh-quick-open';
const ID = 'dsh-ssh-remote.quick-open';

export function safePreviewPath(path: string): string {
  // Public DSH addresses normalize backslashes; the mention grammar also
  // cannot encode quotes/control characters. Never silently target a sibling.
  if (!path || path.length > 4096 || /[\\"\u0000-\u001f\u007f-\u009f]/u.test(path)
    || path.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/iu.test(path)) {
    throw new Error('此路径无法安全表示为 DSH 引用或预览地址，请使用远程终端；不改写文件名。');
  }
  return path;
}

export function mountQuickOpen(ctx: Context, editor: EditorBridge): () => Promise<void> {
  const fiber = ctx.inject(['remote.sshRemoteFiles', 'remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
    if (!scope.sidebarRightTabs || typeof scope.remote.sshRemoteFiles?.query !== 'function') return () => {};
    const unregister = scope.sidebarRightTabs.register({ id: ID, kind: KIND, title: () => '远程快速打开', guide: [] });
    const open = (sessionId: string, path: string, editing: boolean) => {
      if (scope.sidebarRight.mounted.getSnapshot() !== sessionId) throw new Error('会话已切换，请重新打开。');
      safePreviewPath(path);
      if (editing) {
        if (!editor.open) throw new Error('远程编辑器尚未加载。');
        editor.open(sessionId, path);
      } else scope.sidebarRight.openResourceIn(sessionId as SessionId, sessionFileAddress(sessionId, path));
    };
    const body = scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: ID,
      inject: sessionId => ({ remote: scope.remote.sshRemoteFiles, open: (path: string, editing: boolean) => open(sessionId, path, editing) }),
    }, QuickOpenPane));
    const shortcuts = scope.inject(['shortcuts'], child => child.shortcuts.register({
      id: 'dsh-ssh-remote.quick-open' as ShortcutCommandId,
      label: () => '远程快速打开', aliases: ['SSH', 'remote', 'file'], defaults: {}, regions: ['page', 'editable'], modals: [],
      resolve: () => {
        const sessionId = scope.sidebarRight.mounted.getSnapshot();
        if (!sessionId) return { status: 'pass' };
        return { status: 'handled', run: () => {
          if (scope.sidebarRight.mounted.getSnapshot() === sessionId) scope.sidebarRight.openTab(KIND);
        } };
      },
    }));
    return async () => { await shortcuts.dispose(); body(); unregister(); };
  });
  const statusFiber = ctx.inject(['remote.sshRemoteFiles', 'remote.sshRemote', 'slots', 'sessions', 'inputTriggers'], scope => {
    if (typeof scope.remote.sshRemoteFiles?.status !== 'function') return () => {};
    return scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock', id: `${ID}.index-status`, order: 45,
      inject: sessionId => ({ remote: scope.remote.sshRemoteFiles, workspaceInfo: scope.remote.sshRemote.workspaceInfo,
        controller: () => { const actx = scope.sessions.scope(sessionId); return actx ? scope.inputTriggers.sessionOf(actx) : undefined; } }),
    }, ReferenceIndexStatus));
  });
  return async () => { await statusFiber.dispose(); await fiber.dispose(); };
}

interface PaneProps {
  sessionId: string; remote: FileSearchRemote; open(path: string, editing: boolean): void;
}
export function QuickOpenPane({ sessionId, remote, open }: PaneProps) {
  const [query, setQuery] = useState('');
  const [ignored, setIgnored] = useState(false);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<FileIndexResult>();
  const [status, setStatus] = useState<FileIndexStatus>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setQuery(''); setIgnored(false); setResult(undefined); setStatus(undefined); setError(''); }, [sessionId]);
  useEffect(() => {
    const controller = new AbortController(); let live = true;
    setPending(true); setError('');
    const timer = setTimeout(() => {
      void remote.query(sessionId, query, ignored, controller.signal).then(response => {
        if (!live) return;
        if (!response.ok) { setError(response.error.message); return; }
        if (response.value.sessionId !== sessionId) { setError('会话身份不一致，已拒绝显示结果。'); return; }
        setResult(response.value); setStatus(response.value);
      }, error => { if (live) setError(String(error)); }).finally(() => { if (live) setPending(false); });
    }, 150);
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [sessionId, query, ignored, revision, remote]);
  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController(); let live = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const response = await remote.status(sessionId, ignored, controller.signal); if (live && response.ok) setStatus(response.value); }
      catch { /* The query owns user-visible transport failures. */ }
      if (live) timer = setTimeout(poll, 750);
    };
    void poll(); return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [pending, sessionId, ignored, remote]);
  const refreshController = useRef<AbortController>();
  useEffect(() => () => refreshController.current?.abort(), [sessionId, ignored]);
  const refresh = async () => {
    refreshController.current?.abort(); const controller = new AbortController(); refreshController.current = controller;
    try {
      const response = await remote.refresh(sessionId, ignored, controller.signal);
      if (controller.signal.aborted) return;
      if (!response.ok) { setError(response.error.message); return; }
      setStatus(response.value); setRevision(n => n + 1);
    } catch (error) { if (!controller.signal.aborted) setError(String(error)); }
  };
  const choose = (path: string, editing = false) => {
    try { safePreviewPath(path); open(path, editing); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  const current = result?.sessionId === sessionId ? result : undefined;
  return <section aria-label="远程快速打开" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minWidth: 0 }}>
    <form onSubmit={event => { event.preventDefault(); choose(query); }} style={{ display: 'flex', gap: 6 }}>
      <Input aria-label="搜索远程文件" value={query} placeholder="文件名或完整路径" onChange={event => setQuery(event.target.value)} style={{ flex: 1, minWidth: 0 }} />
      <Button type="submit" disabled={!query}>按路径预览</Button>
    </form>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <label><input type="checkbox" checked={ignored} onChange={event => setIgnored(event.target.checked)} /> 包含忽略项</label>
      <Button onClick={() => void refresh()}>刷新索引</Button>
    </div>
    <small>默认只读预览；“编辑”会复用原编辑器及草稿保护。包含忽略项仅影响本页搜索，不改变 @ 补全。</small>
    <div role="status" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
      {pending ? (current ? '正在更新，以下为旧结果（可能过期）…' : '正在搜索远程文件…') : status?.message}
      {!pending && status?.stale && ' 结果已过期。'}
      {!pending && status && ` ${status.count} 项${status.complete ? '' : '（索引不完整，未命中不代表不存在）'}`}
      {!pending && status?.unsupported && !status.message ? ` · ${status.unsupported} 个文件名不能安全引用或预览` : ''}
    </div>
    {error && <div role="alert" style={{ color: 'var(--dsw-alias-label-error)', overflowWrap: 'anywhere' }}>{error}</div>}
    <div role="list" aria-label="远程文件搜索结果" style={{ flex: 1, overflow: 'auto' }}>
      {current?.candidates.map(candidate => <div role="listitem" key={candidate.path} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBlock: 4 }}>
        <Button variant="ghost" title={candidate.path} style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', overflowWrap: 'anywhere', whiteSpace: 'normal', textAlign: 'left' }}
          onClick={() => candidate.kind === 'directory' ? setQuery(`${candidate.path}/`) : choose(candidate.path)}>
          {candidate.kind === 'directory' ? '📁 ' : ''}{candidate.path}
        </Button>
        {candidate.kind === 'file' && <Button size="sm" onClick={() => choose(candidate.path, true)}>编辑</Button>}
      </div>)}
      {!pending && current?.candidates.length === 0 && <p>{status?.complete ? '当前搜索没有匹配项。' : '暂未发现匹配项；可输入完整路径直接预览。'}</p>}
    </div>
  </section>;
}

/** Only the public menu refresh API is called: never mutate input/caret or reopen. */
export class IndexMenuRefresh {
  private generation = 0;
  private stale = false;
  update(status: FileIndexStatus, controller: Pick<InputTriggerController, 'menu' | 'refreshOpenMenu'> | undefined) {
    const changed = status.generation !== this.generation || (status.stale && !this.stale);
    this.generation = status.generation; this.stale = status.stale;
    const menu = controller?.menu.getSnapshot();
    if (changed && menu?.open && menu.hit?.trigger === '@') controller?.refreshOpenMenu();
  }
}
function ReferenceIndexStatus(props: PropsRuntime<'conversation.input.dock'> & {
  remote: FileSearchRemote; workspaceInfo(path: string): Promise<any>; controller(): InputTriggerController | undefined;
}) {
  const cwd = props.useSessions((s: SessionListState) => s.byId[props.sessionId]?.cwd);
  const [status, setStatus] = useState<{ key: string; value: FileIndexStatus }>();
  const key = `${props.sessionId}\0${cwd ?? ''}`;
  const latest = useRef(props); latest.current = props;
  useEffect(() => {
    if (!cwd) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController(), refresh = new IndexMenuRefresh();
    const poll = async () => {
      try {
        const response = await latest.current.remote.status(props.sessionId, false, controller.signal);
        if (!active) return;
        if (response.ok) { setStatus({ key, value: response.value }); refresh.update(response.value, latest.current.controller()); }
      } catch { /* No candidate is fabricated on failure. */ }
      if (active) timer = setTimeout(poll, 750);
    };
    void latest.current.workspaceInfo(cwd).then(response => { if (active && response.ok && response.value) void poll(); }, () => {});
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [key, cwd]);
  if (status?.key !== key || status.value.state === 'idle' || (status.value.state === 'ready' && !status.value.stale && !status.value.unsupported)) return null;
  return <small role="status" style={{ display: 'block', overflowWrap: 'anywhere', padding: '4px 0', color: 'var(--dsw-alias-label-secondary)' }}>
    SSH 文件索引：{status.value.message || '结果已过期，请重新搜索或刷新索引。'}
  </small>;
}
