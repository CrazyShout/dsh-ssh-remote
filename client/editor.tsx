import { t, localized } from './locale.js';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { Button, Input, Modal, PathLabel } from '@deepseek-ai/dsh-client-ui-primitives';
import { panelStyle, rowStyle } from './presentation.js';
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import { EditorModel } from './editor-model.js';
import './editor-schema.js';
import type { EditorBridge } from './file-search-types.js';
const KIND = 'ssh-editor';
const ID = 'dsh-ssh-remote.editor';
export function mountRemoteEditor(ctx: Context, bridge?: EditorBridge): () => Promise<void> {
    const fiber = ctx.inject(['remote.sshRemoteEditor', 'remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
        if (!scope.sidebarRightTabs || !scope.sidebarRight || typeof scope.remote.sshRemoteEditor?.read !== 'function')
            return () => { };
        const buffers = new Map<string, EditorModel>();
        const model = (sessionId: string) => {
            let buffer = buffers.get(sessionId);
            if (!buffer) {
                for (const [id, existing] of buffers) {
                    if (!existing.needsProtection && !existing.snapshot().reading
                        && !scope.sidebarRight.tabsIn(id as SessionId).some(tab => tab.kind === KIND)) {
                        existing.dispose();
                        buffers.delete(id);
                    }
                }
                if (buffers.size >= 32)
                    throw new Error(t('已达到 32 个会话编辑缓冲上限；请先保存草稿后重启。'));
                buffer = new EditorModel(sessionId, scope.remote.sshRemoteEditor);
                buffers.set(sessionId, buffer);
            }
            return buffer;
        };
        const unregister = scope.sidebarRightTabs.register({ id: ID, kind: KIND, keepMounted: true,
            title: () => t('远程编辑'), guide: [] });
        const openEditor = (sessionId: string, path: string) => {
            if (scope.sidebarRight.mounted.getSnapshot() !== sessionId)
                throw new Error(t('会话已切换，请重新打开。'));
            const buffer = model(sessionId);
            scope.sidebarRight.openTab(KIND);
            buffer.requestOpen(path);
        };
        if (bridge)
            bridge.open = openEditor;
        const confirmedClosures = new Set<string>();
        const close = scope.sidebarRight.registerCloseHandler(KIND, (sessionId, tab) => {
            const key = `${sessionId}\0${tab.id}`;
            if (confirmedClosures.has(key))
                return;
            const buffer = buffers.get(sessionId);
            if (buffer && !buffer.requestClose(() => {
                confirmedClosures.add(key);
                try {
                    scope.sidebarRight.closeIn(sessionId, tab.id);
                }
                finally {
                    confirmedClosures.delete(key);
                }
            })) {
                throw new Error(t('已保留草稿，请在编辑器内确认是否关闭。'));
            }
        });
        const body = scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
            name: 'sidebar.right.pane.tab', key: ID, inject: sessionId => ({ model: model(sessionId) }),
        }, localized(RemoteEditorPane)));
        const title = scope.slots.inject('sidebar.right.pane.tab.title', () => scope.slots.register({
            name: 'sidebar.right.pane.tab.title', key: ID, inject: sessionId => ({ model: model(sessionId) }),
        }, localized(RemoteEditorTitle)));
        const menu = scope.slots.inject('sidebar.right.tab.menu.item', () => scope.slots.register({
            name: 'sidebar.right.tab.menu.item', id: `${ID}.open`,
            inject: sessionId => ({
                workspaceInfo: scope.remote.sshRemote.workspaceInfo,
                openEditor: (path: string) => {
                    openEditor(sessionId, path);
                },
            }),
        }, localized(RemoteEditMenu)));
        const protectUnload = (event: BeforeUnloadEvent) => {
            if (![...buffers.values()].some(buffer => buffer.needsProtection))
                return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', protectUnload);
        return () => {
            if (bridge?.open === openEditor)
                bridge.open = undefined;
            window.removeEventListener('beforeunload', protectUnload);
            menu();
            title();
            body();
            close();
            unregister();
            for (const buffer of buffers.values())
                buffer.dispose();
        };
    });
    return async () => { await fiber.dispose(); };
}
export function RemoteEditorPane({ model }: {
    model: EditorModel;
}) {
    const state = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
    const [path, setPath] = useState('');
    useEffect(() => {
        if (state.document)
            setPath(state.document.path);
    }, [state.document?.path]);
    const open = (target: string) => model.requestOpen(target);
    const document = state.document;
    return <section aria-label={t('远程文本编辑器')} style={panelStyle}>
    <Modal open={state.confirmation !== undefined} onClose={() => model.confirm(false)} title={state.confirmation === 'close' ? t('关闭远程编辑页签？') : t('放弃当前草稿？')} closeLabel={t('取消')} description={state.confirmation === 'close'
            ? t('草稿仅在本次运行中保留；退出应用会丢失。关闭页签不会撤销已发出的保存。') : t('重新加载或切换文件会放弃当前未保存修改；只有完整读取新文件成功后才替换草稿。')} footer={<><Button onClick={() => model.confirm(false)}>{t('保留草稿')}</Button><Button onClick={() => model.confirm(true)}>
        {state.confirmation === 'close' ? t('关闭页签') : t('放弃并打开')}</Button></>}/>
    <form style={{ display: 'flex', gap: 6 }} onSubmit={event => { event.preventDefault(); open(path); }}>
      <Input aria-label={t('远程文件路径')} placeholder={t('工作区内的文件路径（可输入完整路径）')} value={path} style={{ flex: 1, minWidth: 0 }} onChange={event => setPath(event.target.value)}/>
      <Button type="submit" disabled={!path || state.reading || model.unsettled}>{t('打开')}</Button>
    </form>
    {document && <>
      <div style={{ ...rowStyle, fontSize: 12 }}>
        <span>SSH · {document.alias}</span>
        <PathLabel path={document.path} style={{ flex: 1, minWidth: 0 }}/>
        {model.dirty && <span role="status">{t('● 未保存')}</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Button variant="primary" disabled={!model.dirty || state.reading || model.unsettled} onClick={() => void model.save()}>{t('保存')}</Button>
        <Button variant="ghost" disabled={state.reading || model.unsettled} onClick={() => open(document.path)}>{t('重新加载')}</Button>
        <Button variant="ghost" disabled={state.reading || state.saving} onClick={() => void model.compare()}>{t('查看远端版本')}</Button>
        {model.unsettled && <Button disabled={state.saving} onClick={() => void model.verify()}>{t('核对保存结果')}</Button>}
      </div>
      <small>UTF-8{document.bom ? ' BOM' : ''} · {document.newline.toUpperCase()}{t('· 最大')}{document.maxBytes / 1024} KiB</small>
      <textarea aria-label={t('远程文件内容')} spellCheck={false} value={state.draft} disabled={state.reading || state.saving} onChange={event => model.edit(event.target.value)} onKeyDown={event => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    void model.save();
                }
            }} style={{ flex: 1, minHeight: 180, resize: 'none', padding: 10, tabSize: 4, whiteSpace: 'pre', overflow: 'auto',
                fontFamily: 'ui-monospace,monospace', fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-primary)',
                background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }}/>
    </>}
    <div role={['conflict', 'unknown', 'failed'].includes(state.outcome ?? '') ? 'alert' : 'status'} style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{state.message || t('输入远程文本文件路径；仅支持工作区内完整 UTF-8 文本。不自动保存。')}</div>
    {state.remoteText !== undefined && <details open><summary>{t('最新远端内容（只读；上方仍是你的草稿）')}</summary>
      <pre style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{state.remoteText}</pre>
    </details>}
  </section>;
}
function RemoteEditorTitle({ model }: {
    model: EditorModel;
}) {
    const state = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
    return <span>{model.dirty ? '● ' : ''}{state.document ? t('编辑 · {value1}', { value1: state.document.path.split('/').pop() }) : t('远程编辑')}</span>;
}
function RemoteEditMenu(props: PropsRuntime<'sidebar.right.tab.menu.item'> & {
    workspaceInfo: (path: string) => Promise<any>;
    openEditor: (path: string) => void;
}) {
    const file = parseFileAddress(props.tab.contentId);
    const cwd = props.useSessions((snapshot: SessionListState) => snapshot.byId[props.sessionId]?.cwd);
    const [remote, setRemote] = useState<string>();
    useEffect(() => {
        let active = true;
        if (cwd)
            void props.workspaceInfo(cwd).then(result => {
                if (active)
                    setRemote(result.ok && result.value ? cwd : undefined);
            }, () => { });
        return () => { active = false; };
    }, [cwd, props.workspaceInfo]);
    if (file?.scope !== 'session' || file.sessionId !== props.sessionId || remote !== cwd || !cwd)
        return null;
    return <Button onClick={() => { props.dismiss(); props.openEditor(file.path); }}>{t('编辑远程文本')}</Button>;
}
