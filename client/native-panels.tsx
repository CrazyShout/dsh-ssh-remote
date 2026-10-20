import { t, localized } from './locale.js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sections, usePageVisible, type Workbench } from './workbench.js';
import { helperStateLabel } from './connection-ui.js';
import type { ConnectionStatusStore } from './connection-status.js';
import type { HelperHostStatus } from 'dsh-ssh-remote/ssh';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { Button, Menu, SegmentedTabs, Tooltip, PathLabel, IconGlobeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { RemoteWorkspaceInfo } from './typert.remote-client.js';
type InfoResult = {
    ok: true;
    value: RemoteWorkspaceInfo | null;
} | {
    ok: false;
    error: {
        message: string;
    };
};
interface WorkspaceInfoRemote {
    workspaceInfo?(path: string): Promise<InfoResult>;
}
const TOOLS_ID = 'dsh-ssh-remote.tools';
const tools = [
    { kind: 'ssh-quick-open', bit: 2 },
    { kind: 'ssh-transfers', bit: 4 },
    { kind: 'ssh-ports', bit: 8 },
] as const;
type PanelKind = 'ssh-tools' | typeof tools[number]['kind'];
interface NativePanelInjected {
    workbench: Workbench;
    connectionStatus: ConnectionStatusStore;
    workspaceInfo(path: string): Promise<InfoResult>;
    openPanel(kind: PanelKind): void;
    availablePanels(): number;
    subscribePanels(listener: () => void): () => void;
}
type NativePanelProps = PropsRuntime<'conversation.session.header.utilities'> & NativePanelInjected & {
    presentation?: 'header' | 'dock';
};
type BlankNativePanelProps = PropsRuntime<'conversation.input.dock'> & NativePanelInjected;
/** Additive optional integration: no sidebar/conversation composition is required at boot. */
export function mountNativePanels(ctx: Context, workbench: Workbench): () => Promise<void> {
    const fiber = ctx.inject(['remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'sshConnectionStatus'], scope => {
        const ssh = scope.remote.sshRemote as WorkspaceInfoRemote;
        // Older plugin backends can still serve settings and directory picking.
        if (typeof ssh.workspaceInfo !== 'function')
            return () => { };
        const workspaceInfo = (path: string) => ssh.workspaceInfo!(path);
        const connectionStatus = scope.sshConnectionStatus;
        const inject = (sessionId: SessionId): NativePanelInjected => ({
            workspaceInfo, workbench, connectionStatus,
            openPanel: (kind: PanelKind) => {
                // The public navigator addresses the visible Session. Never open an
                // old occurrence's terminal in the Session that just replaced it.
                if (scope.sidebarRight.mounted.getSnapshot() !== sessionId) {
                    throw new Error(t('会话已切换，请在当前会话中重新打开。'));
                }
                if (scope.sidebarRightTabs.get(kind) === undefined) {
                    throw new Error(t('工具尚未加载，请稍后再试。'));
                }
                scope.sidebarRight.openTab(kind);
            },
            availablePanels: () => tools.reduce((bits, tool) => bits | (scope.sidebarRightTabs.get(tool.kind) ? tool.bit : 0), scope.sidebarRightTabs.get('ssh-tools') ? 1 : 0),
            subscribePanels: (listener: () => void) => scope.sidebarRightTabs.subscribe(listener),
        });
        let identity = '';
        let generation = 0;
        let unregister: (() => void) | undefined;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const updateGuide = () => {
            const sessionId = scope.sidebarRight.mounted.getSnapshot();
            const cwd = sessionId ? scope.sessions.list.getSnapshot().byId[sessionId]?.cwd : undefined;
            const next = `${sessionId ?? ''}\0${cwd ?? ''}`;
            if (next === identity)
                return;
            identity = next;
            const revision = ++generation;
            clearTimeout(timeout);
            unregister?.();
            unregister = undefined;
            if (!sessionId || !cwd)
                return;
            timeout = setTimeout(() => {
                if (revision === generation)
                    generation++;
            }, 10000);
            void Promise.resolve().then(() => workspaceInfo(cwd)).then(result => {
                if (revision !== generation)
                    return;
                clearTimeout(timeout);
                if (result.ok && result.value) {
                    unregister = scope.sidebarRightTabs.register({
                        id: TOOLS_ID, kind: 'ssh-tools', title: () => t('远程工作台'),
                        guide: [{ id: TOOLS_ID, order: 40, title: () => t('远程工作台'), icon: IconGlobeOutlineRegular }],
                    });
                }
            }, () => {
                if (revision === generation)
                    clearTimeout(timeout);
            });
        };
        const stopMounted = scope.sidebarRight.mounted.subscribe(updateGuide);
        const stopSessions = scope.sessions.list.subscribe(updateGuide);
        updateGuide();
        const body = scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
            name: 'sidebar.right.pane.tab', key: TOOLS_ID, inject,
        }, localized(RemoteToolsPane)));
        const header = scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
            name: 'conversation.session.header.utilities',
            id: 'dsh-ssh-remote.native-panels',
            order: 40,
            inject,
        }, localized(NativePanelActions)));
        const blank = scope.slots.inject('conversation.input.dock', () => scope.slots.register({
            name: 'conversation.input.dock',
            id: 'dsh-ssh-remote.native-panels.blank',
            order: 40,
            inject,
        }, localized(BlankNativePanelActions)));
        return () => {
            generation++;
            clearTimeout(timeout);
            stopSessions();
            stopMounted();
            blank();
            header();
            body();
            unregister?.();
        };
    });
    return async () => { await fiber.dispose(); };
}
/** The official header hides its utilities while a real Session is still blank. */
export function BlankNativePanelActions(props: BlankNativePanelProps) {
    const activeTarget = props.useConversation((snapshot: ConversationSnapshot) => snapshot.activeTargets.size > 0);
    if (!props.session.blank || props.session.running || props.session.promptAttempted || activeTarget)
        return null;
    return <NativePanelActions {...props} presentation="dock"/>;
}
/** Session identity comes from the SDK; SSH identity comes only from the Host's saved mapping. */
function useRemoteWorkspace({ sessionId, useSessions, workspaceInfo, connectionStatus }: Pick<NativePanelProps, 'sessionId' | 'useSessions' | 'workspaceInfo' | 'connectionStatus'>) {
    const { generation } = useSyncExternalStore(connectionStatus.subscribe, connectionStatus.getSnapshot, connectionStatus.getSnapshot);
    const cwd: string | undefined = useSessions((snapshot: SessionListState) => snapshot.byId[sessionId]?.cwd);
    const key = `${sessionId}\0${cwd ?? ''}`;
    const [resolved, setResolved] = useState<{
        key: string;
        generation: number;
        info: RemoteWorkspaceInfo | null;
    } | null>(null);
    useEffect(() => {
        let active = true;
        if (cwd === undefined || cwd === '' || generation === undefined)
            return;
        // The lookup reads a local mapping only. Bound a wedged Remote, and never
        // infer SSH identity from a title, basename, URI-looking string or prefix.
        const timeout = setTimeout(() => { active = false; setResolved({ key, generation, info: null }); }, 10000);
        void Promise.resolve().then(() => workspaceInfo(cwd)).then(result => {
            if (active)
                setResolved({ key, generation, info: result.ok ? result.value : null });
        }, () => {
            if (active)
                setResolved({ key, generation, info: null });
        }).finally(() => clearTimeout(timeout));
        return () => { active = false; clearTimeout(timeout); };
    }, [key, cwd, generation, workspaceInfo]);
    // Keep an already verified identity during an outage (with an unknown dot),
    // but revalidate it before accepting any new connection generation's status.
    const current = resolved?.key === key && (generation === undefined || generation === resolved.generation);
    return { key, info: current ? resolved.info : null, pending: Boolean(cwd) && !current };
}
function connectionPresentation(status: HelperHostStatus | undefined, unavailable?: string) {
    const state = status?.status;
    const label = state ? helperStateLabel(state) : t('状态未知');
    const limited = state === 'degraded' && status?.environment?.search.available === false
        ? status.environment.search.error || t('远程搜索不可用，请检查远端 ripgrep') : '';
    const detail = state === 'error' || state === 'degraded'
        ? [status?.error, status?.hint, limited].filter(Boolean).join('；') || (state === 'degraded' ? t('远端 helper 能力不完整') : t('连接失败，请在 SSH 设置中查看详情'))
        : state === undefined ? unavailable || t('尚未获得该主机的连接状态') : '';
    const tone = state === 'connected' ? 'success' : state === 'error' ? 'error'
        : state && state !== 'disconnected' ? 'warn' : 'neutral';
    return { label, detail, tone, state: state ?? 'unknown' };
}
function useConnectionStatus(store: ConnectionStatusStore, key: string, alias: string | undefined, visible: boolean) {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const owner = `${key}\0${alias ?? ''}`;
    useEffect(() => {
        if (visible && alias)
            return store.retain(owner);
    }, [store, owner, alias, visible]);
    const host = visible && store.hasOwner(owner) && alias ? snapshot.hosts[alias] : undefined;
    // The environment verdict is a snapshot from connect time. A tool installed
    // afterwards (ripgrep is the common case) leaves this surface claiming a
    // limitation that no longer exists, so a degraded surface asks the shared
    // store to revalidate. The store owns deduplication, the bounded retry
    // interval and the visibility gate: this effect re-runs on every poll and on
    // every sibling surface, and neither may multiply remote probes.
    useEffect(() => {
        if (!visible || alias === undefined || host?.environment?.search.available !== false)
            return;
        void store.recheckHost(alias);
    }, [store, alias, visible, host]);
    return connectionPresentation(host, snapshot.unavailable);
}
function StatusDot({ status }: {
    status: ReturnType<typeof connectionPresentation>;
}) {
    const color = status.tone === 'neutral' ? 'var(--dsw-alias-label-secondary)' : `var(--dsw-alias-state-${status.tone}-primary)`;
    return <span aria-hidden="true" data-ssh-status={status.state} style={{ display: 'inline-block', width: 6, height: 6,
            flex: '0 0 6px', boxSizing: 'border-box', borderRadius: '50%', border: `1px solid ${color}`,
            background: status.tone === 'neutral' ? 'transparent' : color }}/>;
}
function statusTooltip(info: RemoteWorkspaceInfo, status: ReturnType<typeof connectionPresentation>) {
    return `${info.alias}:${info.remotePath}\n${status.label}${status.detail ? `：${status.detail}` : ''}`;
}
export function NativePanelActions(props: NativePanelProps) {
    const { openPanel, availablePanels, subscribePanels, presentation = 'header' } = props;
    const { key, info } = useRemoteWorkspace(props);
    const visible = usePageVisible();
    const status = useConnectionStatus(props.connectionStatus, key, info?.alias, visible);
    const [failure, setFailure] = useState<{
        key: string;
        message: string;
    } | null>(null);
    const panels = useSyncExternalStore(subscribePanels, availablePanels, availablePanels);
    if (!info)
        return null;
    const open = (kind: PanelKind) => {
        setFailure(null);
        try {
            openPanel(kind);
        }
        catch (error) {
            setFailure({ key, message: error instanceof Error ? error.message : String(error) });
        }
    };
    return (<div aria-label={t('远程工作区 {value1}:{value2}', { value1: info.alias, value2: info.remotePath })} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, ...(presentation === 'dock' ? { justifyContent: 'flex-end', marginBottom: 8 } : {}) }}>
      <Tooltip label={statusTooltip(info, status)} side="bottom" align="end" portal maxWidth={360} delayMs={300}>
      <Button size="sm" variant="ghost" disabled={(panels & 1) === 0} aria-label={t('远程工具 · {value1} · {value2}', { value1: info.alias, value2: status.label })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: 160, color: 'var(--dsw-alias-label-secondary)' }} onClick={() => open('ssh-tools')}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>SSH · {info.alias}</span>
        <StatusDot status={status}/>
      </Button>
      </Tooltip>
      {failure?.key === key && <span role="alert" style={{ color: 'var(--dsw-alias-label-error)', fontSize: 11 }}>{failure.message}</span>}
    </div>);
}
export function RemoteToolsPane(props: PropsRuntime<'sidebar.right.pane.tab'> & NativePanelInjected) {
    const { tab } = props.useTabInfo();
    const { key, info, pending } = useRemoteWorkspace(props);
    useSyncExternalStore(props.workbench.subscribe, props.workbench.snapshot, props.workbench.snapshot);
    const selected = props.workbench.selected(props.sessionId);
    const navigation = tab.navigation;
    const requested = navigation?.params && 'section' in navigation.params ? navigation.params.section : undefined;
    useEffect(() => {
        if (requested && sections.some(section => section.id === requested))
            props.workbench.select(props.sessionId, requested);
    }, [props.workbench, props.sessionId, tab.id, navigation?.revision, requested]);
    const visible = usePageVisible(tab.visible);
    const [menu, setMenu] = useState(false), [width, setWidth] = useState(0);
    const status = useConnectionStatus(props.connectionStatus, key, info?.alias, visible);
    const container = useRef<HTMLElement>(null);
    useEffect(() => {
        const element = container.current;
        if (!element || typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const choose = (section: typeof selected) => { props.workbench.select(props.sessionId, section); setMenu(false); };
    const tabs = sections.map(section => ({ value: section.id, label: section.title, id: `${tab.id}-tab-${section.id}`, panelId: `${tab.id}-panel-${section.id}` }));
    return <section ref={container} aria-label={t('远程工作台')} className="dsh-ssh-workbench" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden', color: 'var(--dsw-alias-label-primary)', fontSize: 13 }}>
    <style>{`.dsh-ssh-workbench *{box-sizing:border-box}.dsh-ssh-workbench textarea,.dsh-ssh-workbench select{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;max-width:100%;min-width:0}.dsh-ssh-workbench textarea,.dsh-ssh-workbench select{padding:8px}.dsh-ssh-workbench small,.dsh-ssh-workbench summary{color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-ssh-workbench summary{cursor:pointer}.dsh-ssh-workbench [role=alert]{color:var(--dsw-alias-label-error);overflow-wrap:anywhere}.dsh-ssh-workbench progress{width:100%;height:5px;accent-color:var(--dsw-alias-brand-primary,#4d7fff)}`}</style>
    {info ? <>
      <header style={{ padding: '16px 16px 12px', display: 'grid', gap: 8, borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <IconGlobeOutlineRegular size={16}/>
          <strong title={info.alias} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>SSH · {info.alias}</strong>
          <Tooltip label={statusTooltip(info, status)} side="bottom" align="end" portal maxWidth={360} delayMs={300}>
            <small role="status" tabIndex={0} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <StatusDot status={status}/>{status.label}
            </small>
          </Tooltip>
        </div>
        <PathLabel path={info.remotePath} style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}/>
        {width >= 520
                ? <SegmentedTabs label={t('远程工作台分区')} items={tabs as [
                        typeof tabs[number],
                        ...typeof tabs
                    ]} value={selected} onChange={choose}/>
                : <Menu open={menu} onClose={() => setMenu(false)} selectedId={selected} items={sections.map(section => ({ id: section.id, label: section.title }))} onSelect={id => choose(id as typeof selected)} anchor={<Button size="sm" variant="outline" aria-label={t('选择工作台分区')} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{sections.find(section => section.id === selected)!.title} ▾</Button>}/>}
      </header>
      {sections.map(section => <div key={section.id} id={`${tab.id}-panel-${section.id}`} role="tabpanel" aria-label={section.title} aria-labelledby={width >= 520 ? `${tab.id}-tab-${section.id}` : undefined} hidden={selected !== section.id} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: selected === section.id ? 'block' : 'none' }}>
        {props.workbench.render(section.id, { ...props, active: visible && selected === section.id })}
      </div>)}
    </> : <p role="status" style={{ padding: 16 }}>{pending ? t('正在读取工作区…') : t('当前会话没有可用的 SSH 工作区。')}</p>}
  </section>;
}
