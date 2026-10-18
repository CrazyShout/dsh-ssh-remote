import { mountWorkbenchSection, openWorkbench, usePageVisible, type Workbench } from './workbench.js';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client';
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type {} from '@deepseek-ai/dsh-client-shortcuts/client';
import { Button, Input, FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives';
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

export function mountQuickOpen(ctx: Context, editor: EditorBridge, workbench: Workbench): () => Promise<void> {
  const fiber = ctx.inject(['remote.sshRemoteFiles', 'remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
    if (!scope.sidebarRightTabs || typeof scope.remote.sshRemoteFiles?.query !== 'function') return () => {};
    const pendingPreviews = new Map<string, AbortController>();
    const open = async (sessionId: string, path: string, editing: boolean, signal: AbortSignal) => {
      signal.throwIfAborted();
      if (scope.sidebarRight.mounted.getSnapshot() !== sessionId) throw new Error('会话已切换，请重新打开。');
      safePreviewPath(path);
      if (editing) {
        if (!editor.open) throw new Error('远程编辑器尚未加载。');
        editor.open(sessionId, path);
      } else {
        pendingPreviews.get(sessionId)?.abort();
        const controller = new AbortController(); pendingPreviews.set(sessionId, controller);
        const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
        try {
          const result = await scope.remote.sshRemoteFiles.preview(sessionId, path, controller.signal);
          if (controller.signal.aborted) return;
          if (!result.ok) throw new Error(result.error.message);
          if (result.value.sessionId !== sessionId || scope.sidebarRight.mounted.getSnapshot() !== sessionId) throw new Error('会话已切换，未打开预览。');
          safePreviewPath(result.value.path);
          scope.sidebarRight.openResourceIn(sessionId as SessionId, sessionFileAddress(sessionId, result.value.path));
        } finally { signal.removeEventListener('abort', abort); if (pendingPreviews.get(sessionId) === controller) pendingPreviews.delete(sessionId); }
      }
    };
    const body = mountWorkbenchSection(scope, workbench, ID, KIND, 'files', props => <QuickOpenPane {...props}
      remote={scope.remote.sshRemoteFiles} open={(path, editing, signal) => open(props.sessionId, path, editing, signal)} />);
    const shortcuts = scope.inject(['shortcuts'], child => child.shortcuts.register({
      id: 'dsh-ssh-remote.quick-open' as ShortcutCommandId,
      label: () => '远程快速打开', aliases: ['SSH', 'remote', 'file'], defaults: {}, regions: ['page', 'editable'], modals: [],
      resolve: () => {
        const sessionId = scope.sidebarRight.mounted.getSnapshot();
        if (!sessionId) return { status: 'pass' };
        return { status: 'handled', run: () => {
          if (scope.sidebarRight.mounted.getSnapshot() === sessionId) openWorkbench(scope, workbench, sessionId, 'files');
        } };
      },
    }));
    return async () => { for (const controller of pendingPreviews.values()) controller.abort(); await shortcuts.dispose(); body(); };
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
  active?: boolean; sessionId: string; remote: FileSearchRemote; open(path: string, editing: boolean, signal: AbortSignal): void | Promise<void>;
}
export function QuickOpenPane({ sessionId, remote, open, active = true }: PaneProps) {
  const visible = usePageVisible(active);
  const listId = useId();
  const [selected, setSelected] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [selected]);
  const [query, setQuery] = useState('');
  const [ignored, setIgnored] = useState(false);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<FileIndexResult>();
  const [status, setStatus] = useState<FileIndexStatus>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lifetime = useRef(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, [sessionId]);
  useEffect(() => { setQuery(''); setIgnored(false); setResult(undefined); setStatus(undefined); setError(''); }, [sessionId]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController(); let live = true;
    setPending(true); setError('');
    const timer = setTimeout(() => {
      void remote.query(sessionId, query, ignored, controller.signal).then(response => {
        if (!live) return;
        if (!response.ok) { setError(response.error.message); return; }
        if (response.value.sessionId !== sessionId) { setError('会话身份不一致，已拒绝显示结果。'); return; }
        setResult(response.value); setStatus(response.value); setSelected(-1);
      }, error => { if (live) setError(String(error)); }).finally(() => { if (live) setPending(false); });
    }, 150);
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [sessionId, query, ignored, revision, remote, visible]);
  useEffect(() => {
    if (!pending || !visible) return;
    const controller = new AbortController(); let live = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const response = await remote.status(sessionId, ignored, controller.signal); if (live && response.ok) setStatus(response.value); }
      catch { /* The query owns user-visible transport failures. */ }
      if (live) timer = setTimeout(poll, 750);
    };
    void poll(); return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [pending, sessionId, ignored, remote, visible]);
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
    try {
      safePreviewPath(path);
      const signal = lifetime.current.signal;
      void Promise.resolve(open(path, editing, signal)).catch(error => { if (!signal.aborted) setError(error instanceof Error ? error.message : String(error)); });
    }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  const current = result?.sessionId === sessionId ? result : undefined;
  return <section aria-label="远程快速打开" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minWidth: 0 }}>
    <form onSubmit={event => { event.preventDefault(); choose(query); }} style={{ display: 'flex', gap: 6 }}>
      <Input aria-label="搜索远程文件" role="combobox" aria-autocomplete="list" aria-expanded={Boolean(current?.candidates.length)} aria-controls={listId}
        aria-activedescendant={selected >= 0 ? `${listId}-${selected}` : undefined} value={query} placeholder="文件名或完整路径"
        onChange={event => { setQuery(event.target.value); setSelected(-1); }}
        onKeyDown={event => {
          const candidates = current?.candidates ?? [];
          if (event.key === 'Escape') { event.preventDefault(); setSelected(-1); }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault();
            setSelected(index => candidates.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length : -1); }
          else if (event.key === 'Enter' && candidates.length) { event.preventDefault(); const candidate = candidates[selected < 0 ? 0 : selected];
            if (candidate.kind === 'directory') setQuery(`${candidate.path}/`); else choose(candidate.path); }
        }} style={{ flex: 1, minWidth: 0 }} />
      <Button type="submit" disabled={!query}>按路径预览</Button>
    </form>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <label><input type="checkbox" checked={ignored} onChange={event => setIgnored(event.target.checked)} /> 包含忽略项</label>
      <Button onClick={() => void refresh()}>刷新索引</Button>
    </div>
    <details><summary>搜索帮助</summary><small>方向键选择，Enter 预览，Escape 取消选择。默认只读；编辑保留草稿保护。包含忽略项仅影响本次搜索，不改变 @ 补全。</small></details>
    <div role="status" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
      {pending ? (current ? '正在更新，以下为旧结果（可能过期）…' : '正在搜索远程文件…') : status?.message}
      {!pending && status?.stale && ' 结果已过期。'}
      {!pending && status && ` ${status.count} 项${status.complete ? '' : '（索引不完整，未命中不代表不存在）'}`}
      {!pending && status?.unsupported && !status.message ? ` · ${status.unsupported} 个文件名不能安全引用或预览` : ''}
    </div>
    {error && <div role="alert" style={{ color: 'var(--dsw-alias-label-error)', overflowWrap: 'anywhere' }}>{error}</div>}
    <div ref={list} id={listId} role="listbox" aria-label="远程文件搜索结果" style={{ flex: 1, minHeight: 100, overflow: 'auto' }}>
      {current?.candidates.map((candidate, index) => <div role="option" id={`${listId}-${index}`} aria-selected={selected === index} key={candidate.path}
        title={candidate.path} onClick={() => { setSelected(index); candidate.kind === 'directory' ? setQuery(`${candidate.path}/`) : choose(candidate.path); }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 8px', borderRadius: 8,
          background: selected === index ? 'var(--dsw-alias-bg-hover,rgba(128,128,128,.12))' : undefined }}>
        <span style={{ flexShrink: 0, display: 'flex' }}>{candidate.kind === 'directory' ? <FileTypeIcon kind="folder" size={18} /> : <FileTypeIcon path={candidate.path} size={18} />}</span>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.path}</span>
      </div>)}
    </div>
    {!pending && current?.candidates.length === 0 && <p>{status?.complete ? '当前搜索没有匹配项。' : '暂未发现匹配项；可输入完整路径直接预览。'}</p>}
    {selected >= 0 && current?.candidates[selected]?.kind === 'file' && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button size="sm" variant="outline" onClick={() => choose(current.candidates[selected].path, true)}>编辑</Button>
      <small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.candidates[selected].path}</small>
    </div>}
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
export function ReferenceIndexStatus(props: PropsRuntime<'conversation.input.dock'> & {
  remote: FileSearchRemote; workspaceInfo(path: string): Promise<any>; controller(): InputTriggerController | undefined;
}) {
  const cwd = props.useSessions((s: SessionListState) => s.byId[props.sessionId]?.cwd);
  const trigger = props.controller();
  const menuOpen = useSyncExternalStore(listener => trigger?.menu.subscribe(listener) ?? (() => {}),
    () => { const menu = trigger?.menu.getSnapshot(); return !!menu?.open && menu.hit?.trigger === '@'; });
  const visible = usePageVisible(menuOpen);
  const [status, setStatus] = useState<{ key: string; value: FileIndexStatus }>();
  const key = `${props.sessionId}\0${cwd ?? ''}`;
  const latest = useRef(props); latest.current = props;
  useEffect(() => {
    if (!cwd || !visible) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController(), refresh = new IndexMenuRefresh();
    const poll = async () => {
      try {
        const response = await latest.current.remote.status(props.sessionId, false, controller.signal);
        if (!active) return;
        if (response.ok) { setStatus({ key, value: response.value }); refresh.update(response.value, trigger); }
      } catch { /* No candidate is fabricated on failure. */ }
      if (active) timer = setTimeout(poll, 750);
    };
    void latest.current.workspaceInfo(cwd).then(response => { if (active && response.ok && response.value) void poll(); }, () => {});
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [key, cwd, visible, trigger]);
  if (!visible || status?.key !== key || !['building', 'error', 'partial'].includes(status.value.state)) return null;
  return <small role="status" style={{ display: 'block', overflowWrap: 'anywhere', padding: '4px 0', color: 'var(--dsw-alias-label-secondary)' }}>
    {status.value.message}
  </small>;
}
