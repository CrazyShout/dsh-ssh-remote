import { t, localized } from './locale.js';
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
import { Button, Input, FileTypeIcon, Checkbox, PathLabel } from '@deepseek-ai/dsh-client-ui-primitives';
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import type { EditorBridge, FileIndexResult, FileIndexStatus, FileSearchRemote } from './file-search-types.js';
import './file-search-schema.js';
import { panelStyle, mutedStyle, rowStyle } from './presentation.js';
const KIND = 'ssh-quick-open';
const ID = 'dsh-ssh-remote.quick-open';
export function safePreviewPath(path: string): string {
    // Public DSH addresses normalize backslashes; the mention grammar also
    // cannot encode quotes/control characters. Never silently target a sibling.
    if (!path || path.length > 4096 || /[\\"\u0000-\u001f\u007f-\u009f]/u.test(path)
        || path.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/iu.test(path)) {
        throw new Error(t('此路径无法安全表示为 DSH 引用或预览地址，请使用远程终端；不改写文件名。'));
    }
    return path;
}
export function mountQuickOpen(ctx: Context, editor: EditorBridge, workbench: Workbench): () => Promise<void> {
    const fiber = ctx.inject(['remote.sshRemoteFiles', 'remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
        if (!scope.sidebarRightTabs || typeof scope.remote.sshRemoteFiles?.query !== 'function')
            return () => { };
        // Cordis may return a fresh service face on each read. Keep one per fiber
        // so header/status/resize renders do not restart an unchanged query.
        const remote = scope.remote.sshRemoteFiles;
        const pendingPreviews = new Map<string, AbortController>();
        const open = async (sessionId: string, path: string, editing: boolean, signal: AbortSignal) => {
            signal.throwIfAborted();
            if (scope.sidebarRight.mounted.getSnapshot() !== sessionId)
                throw new Error(t('会话已切换，请重新打开。'));
            safePreviewPath(path);
            if (editing) {
                if (!editor.open)
                    throw new Error(t('远程编辑器尚未加载。'));
                editor.open(sessionId, path);
            }
            else {
                pendingPreviews.get(sessionId)?.abort();
                const controller = new AbortController();
                pendingPreviews.set(sessionId, controller);
                const abort = () => controller.abort();
                signal.addEventListener('abort', abort, { once: true });
                try {
                    const result = await remote.preview(sessionId, path, controller.signal);
                    if (controller.signal.aborted)
                        return;
                    if (!result.ok)
                        throw new Error(result.error.message);
                    if (result.value.sessionId !== sessionId || scope.sidebarRight.mounted.getSnapshot() !== sessionId)
                        throw new Error(t('会话已切换，未打开预览。'));
                    safePreviewPath(result.value.path);
                    // This action promises a read-only DSH preview. A higher-priority
                    // third-party editor may read node:fs directly, bypassing SSH.
                    if (!scope.sidebarRightTabs.get('text'))
                        throw new Error(t('原生文件预览尚未加载。'));
                    scope.sidebarRight.openResourceIn(sessionId as SessionId, sessionFileAddress(sessionId, result.value.path), { kind: 'text' });
                }
                finally {
                    signal.removeEventListener('abort', abort);
                    if (pendingPreviews.get(sessionId) === controller)
                        pendingPreviews.delete(sessionId);
                }
            }
        };
        const body = mountWorkbenchSection(scope, workbench, ID, KIND, 'files', props => <QuickOpenPane {...props} remote={remote} open={(path, editing, signal) => open(props.sessionId, path, editing, signal)}/>);
        const shortcuts = scope.inject(['shortcuts'], child => child.shortcuts.register({
            id: 'dsh-ssh-remote.quick-open' as ShortcutCommandId,
            label: () => t('远程快速打开'), aliases: ['SSH', 'remote', 'file'], defaults: {}, regions: ['page', 'editable'], modals: [],
            resolve: () => {
                const sessionId = scope.sidebarRight.mounted.getSnapshot();
                if (!sessionId)
                    return { status: 'pass' };
                return { status: 'handled', run: () => {
                        if (scope.sidebarRight.mounted.getSnapshot() === sessionId)
                            openWorkbench(scope, workbench, sessionId, 'files');
                    } };
            },
        }));
        return async () => {
            for (const controller of pendingPreviews.values())
                controller.abort();
            await shortcuts.dispose();
            body();
        };
    });
    const statusFiber = ctx.inject(['remote.sshRemoteFiles', 'remote.sshRemote', 'slots', 'sessions', 'inputTriggers'], scope => {
        if (typeof scope.remote.sshRemoteFiles?.status !== 'function')
            return () => { };
        return scope.slots.inject('conversation.input.dock', () => scope.slots.register({
            name: 'conversation.input.dock', id: `${ID}.index-status`, order: 45,
            inject: sessionId => ({ remote: scope.remote.sshRemoteFiles, workspaceInfo: scope.remote.sshRemote.workspaceInfo,
                controller: () => { const actx = scope.sessions.scope(sessionId); return actx ? scope.inputTriggers.sessionOf(actx) : undefined; } }),
        }, localized(ReferenceIndexStatus)));
    });
    return async () => { await statusFiber.dispose(); await fiber.dispose(); };
}
interface PaneProps {
    active?: boolean;
    sessionId: string;
    remote: FileSearchRemote;
    open(path: string, editing: boolean, signal: AbortSignal): void | Promise<void>;
}
export function QuickOpenPane({ sessionId, remote, open, active = true }: PaneProps) {
    const visible = usePageVisible(active);
    const composing = useRef(false);
    const listId = useId();
    const [selectedPath, setSelectedPath] = useState<string>();
    const list = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState('');
    const [ignored, setIgnored] = useState(false);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{
        key: string;
        value: FileIndexResult;
    }>();
    const [status, setStatus] = useState<FileIndexStatus>();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const queryKey = JSON.stringify([sessionId, query, ignored]);
    const lifetime = useRef(new AbortController());
    useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, [sessionId]);
    useEffect(() => { setQuery(''); setIgnored(false); setSelectedPath(undefined); setResult(undefined); setStatus(undefined); setError(''); }, [sessionId]);
    useEffect(() => {
        if (!visible)
            return;
        const controller = new AbortController();
        let live = true;
        setPending(true);
        setError('');
        const timer = setTimeout(() => {
            void remote.query(sessionId, query, ignored, controller.signal).then(response => {
                if (!live)
                    return;
                if (!response.ok) {
                    setError(response.error.message);
                    return;
                }
                if (response.value.sessionId !== sessionId) {
                    setError(t('会话身份不一致，已拒绝显示结果。'));
                    return;
                }
                setResult({ key: queryKey, value: response.value });
                setStatus(response.value);
            }, error => {
                if (live)
                    setError(String(error));
            }).finally(() => {
                if (live)
                    setPending(false);
            });
        }, 150);
        return () => { live = false; clearTimeout(timer); controller.abort(); };
    }, [sessionId, query, ignored, queryKey, revision, remote, visible]);
    useEffect(() => {
        if (!pending || !visible)
            return;
        const controller = new AbortController();
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const response = await remote.status(sessionId, ignored, controller.signal);
                if (live && response.ok)
                    setStatus(response.value);
            }
            catch { /* The query owns user-visible transport failures. */ }
            if (live)
                timer = setTimeout(poll, 750);
        };
        void poll();
        return () => { live = false; clearTimeout(timer); controller.abort(); };
    }, [pending, sessionId, ignored, remote, visible]);
    const refreshController = useRef<AbortController>();
    useEffect(() => () => refreshController.current?.abort(), [sessionId, ignored]);
    const refresh = async () => {
        refreshController.current?.abort();
        const controller = new AbortController();
        refreshController.current = controller;
        try {
            const response = await remote.refresh(sessionId, ignored, controller.signal);
            if (controller.signal.aborted)
                return;
            if (!response.ok) {
                setError(response.error.message);
                return;
            }
            setStatus(response.value);
            setRevision(n => n + 1);
        }
        catch (error) {
            if (!controller.signal.aborted)
                setError(String(error));
        }
    };
    const choose = (path: string, editing = false) => {
        try {
            safePreviewPath(path);
            const signal = lifetime.current.signal;
            void Promise.resolve(open(path, editing, signal)).catch(error => {
                if (!signal.aborted)
                    setError(error instanceof Error ? error.message : String(error));
            });
        }
        catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    };
    const current = result?.key === queryKey && result.value.sessionId === sessionId ? result.value : undefined;
    // A visibility refresh can reorder the results. Keep the chosen identity,
    // not its old row index; returning from preview must not lose the Edit action.
    const selected = current?.candidates.findIndex(candidate => candidate.path === selectedPath) ?? -1;
    useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [selected]);
    return <section aria-label={t('远程快速打开')} style={{ ...panelStyle, gap: 12 }}>
    <style>{'.dsh-ssh-workbench .dsh-ssh-file-option:hover{background:var(--dsw-alias-bg-hover,rgba(128,128,128,.08))}'}</style>
    <form onSubmit={event => { event.preventDefault(); if (!composing.current) choose(query); }} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6, minWidth: 0 }}>
      <Input aria-label={t('搜索远程文件')} role="combobox" aria-autocomplete="list"
        aria-expanded={Boolean(current?.candidates.length)} aria-controls={listId}
        aria-activedescendant={selected >= 0 ? `${listId}-${selected}` : undefined}
        value={query} placeholder={t('文件名或完整路径')}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onChange={event => { setQuery(event.target.value); setSelectedPath(undefined); }}
        onKeyDown={event => {
            if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)
                return;
            const candidates = current?.candidates ?? [];
            if (event.key === 'Escape') {
                event.preventDefault();
                setSelectedPath(undefined);
            }
            else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const next = selected < 0 ? (event.key === 'ArrowDown' ? 0 : candidates.length - 1)
                    : (selected + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length;
                setSelectedPath(candidates[next]?.path);
            }
            else if (event.key === 'Enter') {
                event.preventDefault();
                // Debounced input must never activate a previous query's candidate.
                // The explicit path button remains available while indexing.
                if (!current)
                    return;
                if (candidates.length) {
                    const candidate = candidates[selected < 0 ? 0 : selected];
                    if (candidate.kind === 'directory')
                        setQuery(`${candidate.path}/`);
                    else
                        choose(candidate.path);
                }
                else if (!pending && query)
                    choose(query);
            }
        }} style={{ width: '100%', minWidth: 0 }}/>
      <Button type="submit" disabled={!query}>{t('按路径预览')}</Button>
    </form>
    <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
      <Checkbox checked={ignored} onChange={setIgnored} label={t('包含忽略项')}/>
      <Button size="sm" variant="ghost" onClick={() => void refresh()}>{t('刷新索引')}</Button>
    </div>
    <div role="status" style={mutedStyle}>
      {pending ? (current ? t('正在更新，以下为旧结果（可能过期）…') : t('正在搜索远程文件…')) : status?.state === 'error' ? t('索引暂不可用') : ''}
      {!pending && status?.stale && t(' 结果已过期。')}
      {!pending && status && t(' 已索引 {value1} 项{value2}', { value1: status.count, value2: status.complete ? '' : t('（索引不完整，未命中不代表不存在）') })}
      {!pending && status?.unsupported && !status.message ? t(' · {value1} 个文件名不能安全引用或预览', { value1: status.unsupported }) : ''}
    </div>
    {!pending && status?.message && <details><summary>{t('索引详情')}</summary><small>{status.message}</small></details>}
    {error && <div role="alert" style={{ color: 'var(--dsw-alias-label-error)', overflowWrap: 'anywhere' }}>{error}</div>}
    <div ref={list} id={listId} role="listbox" aria-label={t('远程文件搜索结果')} style={{ flex: 1, minHeight: 100, overflow: 'auto', borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 8 }}>
      {current?.candidates.map((candidate, index) => <div role="option" id={`${listId}-${index}`} aria-selected={selected === index} aria-label={candidate.path} key={candidate.path} title={candidate.path} onClick={() => { setSelectedPath(candidate.path); candidate.kind === 'directory' ? setQuery(`${candidate.path}/`) : choose(candidate.path); }} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 8px', borderRadius: 8,
                background: selected === index ? 'var(--dsw-alias-bg-hover,rgba(128,128,128,.12))' : undefined }} className="dsh-ssh-file-option">
        <span style={{ flexShrink: 0, display: 'flex' }}>{candidate.kind === 'directory' ? <FileTypeIcon kind="folder" size={18}/> : <FileTypeIcon path={candidate.path} size={18}/>}</span>
        <span style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{candidate.path.split('/').filter(Boolean).at(-1)}</span>
          {candidate.path.includes('/') && <PathLabel path={candidate.path.slice(0, candidate.path.lastIndexOf('/')) || '/'} style={{ ...mutedStyle, minWidth: 0 }}/>}</span>
      </div>)}
    </div>
    {!pending && current?.candidates.length === 0 && <p>{status?.complete ? t('当前搜索没有匹配项。') : t('暂未发现匹配项；可输入完整路径直接预览。')}</p>}
    <footer style={{ display: 'grid', gap: 8, paddingTop: 10, borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
    {selected >= 0 && current?.candidates[selected]?.kind === 'file' ? <div style={rowStyle}>
      <Button size="sm" variant="outline" onClick={() => choose(current.candidates[selected].path, true)}>{t('编辑')}</Button>
      <PathLabel path={current.candidates[selected].path} style={{ fontSize: 12, flex: 1 }}/>
    </div> : <span style={mutedStyle}>{t('选择文件以预览')}</span>}
    <details><summary>{t('搜索帮助')}</summary><small>{t('方向键选择，Enter 预览，Escape 取消选择。默认只读；编辑保留草稿保护。包含忽略项仅影响本次搜索，不改变 @ 补全。')}</small></details>
    </footer>
  </section>;
}
/** Only the public menu refresh API is called: never mutate input/caret or reopen. */
export class IndexMenuRefresh {
    private generation = 0;
    private stale = false;
    update(status: FileIndexStatus, controller: Pick<InputTriggerController, 'menu' | 'refreshOpenMenu'> | undefined) {
        const changed = status.generation !== this.generation || (status.stale && !this.stale);
        this.generation = status.generation;
        this.stale = status.stale;
        const menu = controller?.menu.getSnapshot();
        if (changed && menu?.open && menu.hit?.trigger === '@')
            controller?.refreshOpenMenu();
    }
}
export function ReferenceIndexStatus(props: PropsRuntime<'conversation.input.dock'> & {
    remote: FileSearchRemote;
    workspaceInfo(path: string): Promise<any>;
    controller(): InputTriggerController | undefined;
}) {
    const cwd = props.useSessions((s: SessionListState) => s.byId[props.sessionId]?.cwd);
    const trigger = props.controller();
    const menuOpen = useSyncExternalStore(listener => trigger?.menu.subscribe(listener) ?? (() => { }), () => { const menu = trigger?.menu.getSnapshot(); return !!menu?.open && menu.hit?.trigger === '@'; });
    const visible = usePageVisible(menuOpen);
    const [status, setStatus] = useState<{
        key: string;
        value: FileIndexStatus;
    }>();
    const key = `${props.sessionId}\0${cwd ?? ''}`;
    const latest = useRef(props);
    latest.current = props;
    useEffect(() => {
        if (!cwd || !visible)
            return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        const controller = new AbortController(), refresh = new IndexMenuRefresh();
        const poll = async () => {
            try {
                const response = await latest.current.remote.status(props.sessionId, false, controller.signal);
                if (!active)
                    return;
                if (response.ok) {
                    setStatus({ key, value: response.value });
                    refresh.update(response.value, trigger);
                }
            }
            catch { /* No candidate is fabricated on failure. */ }
            if (active)
                timer = setTimeout(poll, 750);
        };
        void latest.current.workspaceInfo(cwd).then(response => {
            if (active && response.ok && response.value)
                void poll();
        }, () => { });
        return () => { active = false; clearTimeout(timer); controller.abort(); };
    }, [key, cwd, visible, trigger]);
    if (!visible || status?.key !== key || !['building', 'error', 'partial'].includes(status.value.state))
        return null;
    return <small role="status" style={{ display: 'block', overflowWrap: 'anywhere', padding: '4px 0', color: 'var(--dsw-alias-label-secondary)' }}>
    {status.value.message}
  </small>;
}
