import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { Button, IconDownloadOutlineRegular, IconGlobeOutlineRegular, IconLinkOutlineRegular, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { RemoteWorkspaceInfo } from './typert.remote-client.js';

type InfoResult =
  | { ok: true; value: RemoteWorkspaceInfo | null }
  | { ok: false; error: { message: string } };

interface WorkspaceInfoRemote {
  workspaceInfo?(path: string): Promise<InfoResult>;
}

const TOOLS_ID = 'dsh-ssh-remote.tools';
const tools = [
  { kind: 'ssh-quick-open', bit: 2, title: '快速打开', description: '查找并预览远端文件', icon: IconSearchOutlineRegular },
  { kind: 'ssh-transfers', bit: 4, title: '文件传输', description: '上传和下载文件或目录', icon: IconDownloadOutlineRegular },
  { kind: 'ssh-ports', bit: 8, title: '端口转发', description: '访问远端运行的网页服务', icon: IconLinkOutlineRegular },
] as const;
type PanelKind = 'ssh-tools' | typeof tools[number]['kind'];
interface NativePanelInjected {
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
export function mountNativePanels(ctx: Context): () => Promise<void> {
  const fiber = ctx.inject(['remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs', 'sessions'], scope => {
    const ssh = scope.remote.sshRemote as WorkspaceInfoRemote;
    // Older plugin backends can still serve settings and directory picking.
    if (typeof ssh.workspaceInfo !== 'function') return () => {};
    const workspaceInfo = (path: string) => ssh.workspaceInfo!(path);
    const inject = (sessionId: SessionId): NativePanelInjected => ({
        workspaceInfo,
        openPanel: (kind: PanelKind) => {
          // The public navigator addresses the visible Session. Never open an
          // old occurrence's terminal in the Session that just replaced it.
          if (scope.sidebarRight.mounted.getSnapshot() !== sessionId) {
            throw new Error('会话已切换，请在当前会话中重新打开。');
          }
          if (scope.sidebarRightTabs.get(kind) === undefined) {
            throw new Error('工具尚未加载，请稍后再试。');
          }
          scope.sidebarRight.openTab(kind);
        },
        availablePanels: () => tools.reduce((bits, tool) => bits | (scope.sidebarRightTabs.get(tool.kind) ? tool.bit : 0),
          scope.sidebarRightTabs.get('ssh-tools') ? 1 : 0),
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
      if (next === identity) return;
      identity = next;
      const revision = ++generation;
      clearTimeout(timeout);
      unregister?.(); unregister = undefined;
      if (!sessionId || !cwd) return;
      timeout = setTimeout(() => { if (revision === generation) generation++; }, 10_000);
      void Promise.resolve().then(() => workspaceInfo(cwd)).then(result => {
        if (revision !== generation) return;
        clearTimeout(timeout);
        if (result.ok && result.value) {
          unregister = scope.sidebarRightTabs.register({
            id: TOOLS_ID, kind: 'ssh-tools', title: () => '远程工具',
            guide: [{ id: TOOLS_ID, order: 40, title: () => '远程工具', icon: IconGlobeOutlineRegular }],
          });
        }
      }, () => { if (revision === generation) clearTimeout(timeout); });
    };
    const stopMounted = scope.sidebarRight.mounted.subscribe(updateGuide);
    const stopSessions = scope.sessions.list.subscribe(updateGuide);
    updateGuide();
    const body = scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: TOOLS_ID, inject,
    }, RemoteToolsPane));
    const header = scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'dsh-ssh-remote.native-panels',
      order: 40,
      inject,
    }, NativePanelActions));
    const blank = scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock',
      id: 'dsh-ssh-remote.native-panels.blank',
      order: 40,
      inject,
    }, BlankNativePanelActions));
    return () => {
      generation++; clearTimeout(timeout); stopSessions(); stopMounted();
      blank(); header(); body(); unregister?.();
    };
  });
  return async () => { await fiber.dispose(); };
}

/** The official header hides its utilities while a real Session is still blank. */
export function BlankNativePanelActions(props: BlankNativePanelProps) {
  const activeTarget = props.useConversation((snapshot: ConversationSnapshot) => snapshot.activeTargets.size > 0);
  if (!props.session.blank || props.session.running || props.session.promptAttempted || activeTarget) return null;
  return <NativePanelActions {...props} presentation="dock" />;
}

/** Session identity comes from the SDK; SSH identity comes only from the Host's saved mapping. */
function useRemoteWorkspace({ sessionId, useSessions, workspaceInfo }: Pick<NativePanelProps, 'sessionId' | 'useSessions' | 'workspaceInfo'>) {
  const cwd: string | undefined = useSessions((snapshot: SessionListState) => snapshot.byId[sessionId]?.cwd);
  const key = `${sessionId}\0${cwd ?? ''}`;
  const [resolved, setResolved] = useState<{ key: string; info: RemoteWorkspaceInfo | null } | null>(null);

  useEffect(() => {
    let active = true;
    if (cwd === undefined || cwd === '') return;
    // The lookup reads a local mapping only. Bound a wedged Remote, and never
    // infer SSH identity from a title, basename, URI-looking string or prefix.
    const timeout = setTimeout(() => { active = false; setResolved({ key, info: null }); }, 10_000);
    void Promise.resolve().then(() => workspaceInfo(cwd)).then(result => {
      if (active) setResolved({ key, info: result.ok ? result.value : null });
    }, () => {
      if (active) setResolved({ key, info: null });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
  }, [key, cwd, workspaceInfo]);

  return { key, info: resolved?.key === key ? resolved.info : null, pending: Boolean(cwd) && resolved?.key !== key };
}

export function NativePanelActions(props: NativePanelProps) {
  const { openPanel, availablePanels, subscribePanels, presentation = 'header' } = props;
  const { key, info } = useRemoteWorkspace(props);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const panels = useSyncExternalStore(subscribePanels, availablePanels, availablePanels);
  if (!info) return null;
  const open = (kind: PanelKind) => {
    setFailure(null);
    try { openPanel(kind); }
    catch (error) { setFailure({ key, message: error instanceof Error ? error.message : String(error) }); }
  };

  return (
    <div aria-label={`远程工作区 ${info.alias}:${info.remotePath}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, ...(presentation === 'dock' ? { justifyContent: 'flex-end', marginBottom: 8 } : {}) }}>
      <Button size="sm" variant="ghost" disabled={(panels & 1) === 0}
        aria-label={`远程工具 · ${info.alias}`} title={`${info.alias}:${info.remotePath}`}
        style={{ minWidth: 0, maxWidth: 160, color: 'var(--dsw-alias-label-secondary)' }}
        onClick={() => open('ssh-tools')}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>SSH · {info.alias}</span>
      </Button>
      {failure?.key === key && <span role="alert" style={{ color: 'var(--dsw-alias-label-error)', fontSize: 11 }}>{failure.message}</span>}
    </div>
  );
}

export function RemoteToolsPane(props: PropsRuntime<'sidebar.right.pane.tab'> & NativePanelInjected) {
  const { key, info, pending } = useRemoteWorkspace(props);
  const [failure, setFailure] = useState<{ key: string; kind: PanelKind; message: string } | null>(null);
  const panels = useSyncExternalStore(props.subscribePanels, props.availablePanels, props.availablePanels);
  const open = (kind: PanelKind) => {
    setFailure(null);
    try { props.openPanel(kind); }
    catch (error) { setFailure({ key, kind, message: error instanceof Error ? error.message : String(error) }); }
  };
  return <section aria-label="远程工具" style={{ containerType: 'inline-size', containerName: 'dsh-ssh-tools', height: '100%', minWidth: 0, overflow: 'auto' }}>
    <style>{'.dsh-ssh-tools-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}@container dsh-ssh-tools (min-width:520px){.dsh-ssh-tools-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {info ? <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>远程工具</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>
            <span aria-hidden="true" style={{ display: 'flex', flexShrink: 0 }}><IconGlobeOutlineRegular size={16} /></span>
            <span title={info.alias} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>SSH · {info.alias}</span>
          </div>
          <div title={info.remotePath} style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', overflowWrap: 'anywhere' }}>{info.remotePath}</div>
        </div>
        <div className="dsh-ssh-tools-grid">
          {tools.map(tool => <div key={tool.kind} style={{ minWidth: 0 }}>
            <Button variant="outline" aria-label={tool.title} disabled={(panels & tool.bit) === 0}
              title={(panels & tool.bit) === 0 ? '工具尚未加载' : undefined}
              onClick={() => open(tool.kind)}
              style={{ width: '100%', height: 'auto', minHeight: 76, padding: 14, gap: 12, justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }}>
              <span aria-hidden="true" style={{ display: 'flex', flexShrink: 0, color: 'var(--dsw-alias-label-secondary)' }}><tool.icon size={20} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{tool.title}</span>
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--dsw-alias-label-secondary)' }}>{tool.description}</span>
              </span>
            </Button>
            {failure?.key === key && failure.kind === tool.kind && <p role="alert" style={{ fontSize: 12, color: 'var(--dsw-alias-label-error)' }}>{failure.message}</p>}
          </div>)}
        </div>
      </> : <p role="status" style={{ fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>{pending ? '正在读取工作区…' : '当前会话没有可用的 SSH 工作区。'}</p>}
    </div>
  </section>;
}
