import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { RemoteWorkspaceInfo } from './typert.remote-client.js';

type InfoResult =
  | { ok: true; value: RemoteWorkspaceInfo | null }
  | { ok: false; error: { message: string } };

interface WorkspaceInfoRemote {
  workspaceInfo?(path: string): Promise<InfoResult>;
}

type PanelKind = 'files' | 'terminal';
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
  const fiber = ctx.inject(['remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
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
            throw new Error(kind === 'files' ? '文件面板尚未加载。' : '终端面板尚未加载。');
          }
          scope.sidebarRight.openTab(kind);
        },
        availablePanels: () => (scope.sidebarRightTabs.get('files') === undefined ? 0 : 1)
          | (scope.sidebarRightTabs.get('terminal') === undefined ? 0 : 2),
        subscribePanels: (listener: () => void) => scope.sidebarRightTabs.subscribe(listener),
    });
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
    return () => { blank(); header(); };
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
export function NativePanelActions({
  sessionId, useSessions, workspaceInfo, openPanel, availablePanels, subscribePanels, presentation = 'header',
}: NativePanelProps) {
  const cwd: string | undefined = useSessions((snapshot: SessionListState) => snapshot.byId[sessionId]?.cwd);
  const key = `${sessionId}\0${cwd ?? ''}`;
  const [resolved, setResolved] = useState<{ key: string; info: RemoteWorkspaceInfo | null } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const panels = useSyncExternalStore(subscribePanels, availablePanels, availablePanels);

  useEffect(() => {
    let active = true;
    if (cwd === undefined || cwd === '') return;
    // The lookup reads a local mapping only. Bound a wedged Remote, and never
    // infer SSH identity from a title, basename, URI-looking string or prefix.
    const timeout = setTimeout(() => { active = false; }, 10_000);
    void Promise.resolve().then(() => workspaceInfo(cwd)).then(result => {
      if (active) setResolved({ key, info: result.ok ? result.value : null });
    }, () => {
      if (active) setResolved({ key, info: null });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
  }, [key, cwd, workspaceInfo]);

  if (resolved?.key !== key || resolved.info === null) return null;
  const info = resolved.info;
  const identity = `${info.alias}:${info.remotePath}`;
  const open = (kind: PanelKind) => {
    setFailure(null);
    try { openPanel(kind); }
    catch (error) { setFailure({ key, message: error instanceof Error ? error.message : String(error) }); }
  };

  return (
    <div aria-label={`远程工作区 ${identity}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, ...(presentation === 'dock' ? { justifyContent: 'flex-end', marginBottom: 8 } : {}) }}>
      <span title={identity} style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        SSH · {info.alias}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={(panels & 1) === 0}
        title={(panels & 1) === 0 ? 'DSH 文件面板尚未加载。' : `浏览 ${identity}，文件预览为只读。`}
        onClick={() => open('files')}
      >远程文件</Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={(panels & 2) === 0}
        title={(panels & 2) === 0 ? 'DSH 终端面板尚未加载。' : `在 ${identity} 打开交互终端；使用 SSH 账号权限，不受模型沙箱限制。`}
        onClick={() => open('terminal')}
      >远程终端</Button>
      <span
        aria-label="本机打开不支持远端文件"
        title="DSH 的“在本机应用打开 / 在 Finder 中显示”及其快捷键不支持 SSH，可能打开本机同名路径或空目录。请使用远程文件预览和远程终端。"
        style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' }}
      >本机打开不支持远端</span>
      {failure?.key === key && <span role="alert" style={{ color: 'var(--dsw-alias-label-error)', fontSize: 11 }}>{failure.message}</span>}
    </div>
  );
}
