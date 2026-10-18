import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';

export const sections = [
  { id: 'files', title: '快速打开' }, { id: 'transfers', title: '文件传输' },
  { id: 'ports', title: '端口转发' }, { id: 'terminals', title: '终端状态' },
] as const;
export type WorkbenchSection = typeof sections[number]['id'];
export type WorkbenchProps = PropsRuntime<'sidebar.right.pane.tab'> & { active: boolean };
export class Workbench {
  private version = 0;
  private readonly listeners = new Set<() => void>();
  private readonly renderers = new Map<WorkbenchSection, (props: WorkbenchProps) => ReactNode>();
  private readonly last = new Map<string, WorkbenchSection>();
  snapshot = () => this.version;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private changed() { this.version++; for (const listener of this.listeners) listener(); }
  register(section: WorkbenchSection, render: (props: WorkbenchProps) => ReactNode) {
    this.renderers.set(section, render); this.changed();
    return () => { if (this.renderers.get(section) === render) { this.renderers.delete(section); this.changed(); } };
  }
  selected(session: string): WorkbenchSection { return this.last.get(session) ?? 'files'; }
  select(session: string, section: WorkbenchSection) {
    this.last.delete(session); this.last.set(session, section);
    if (this.last.size > 128) this.last.delete(this.last.keys().next().value!);
    this.changed();
  }
  render(section: WorkbenchSection, props: WorkbenchProps) { return this.renderers.get(section)?.(props) ?? <p role="status">工具正在加载…</p>; }
}

/** A persisted legacy tab is replaced through the public navigator, never by editing layout files. */
export function mountWorkbenchSection(scope: Context, workbench: Workbench, id: string, kind: string,
  section: WorkbenchSection, render: (props: WorkbenchProps) => ReactNode) {
  const provider = workbench.register(section, render);
  const unregister = scope.sidebarRightTabs.register({ id, kind, title: () => sections.find(item => item.id === section)!.title, guide: [] });
  function Redirect({ sessionId, useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) {
    const { tab } = useTabInfo();
    const available = useSyncExternalStore(scope.sidebarRightTabs.subscribe, () => !!scope.sidebarRightTabs.get('ssh-tools'));
    useEffect(() => {
      if (!available) return;
      workbench.select(sessionId, section);
      scope.sidebarRight.openTabIn(sessionId, 'ssh-tools', { replaceTab: tab.id });
    }, [sessionId, tab.id, available]);
    return <p role="status">正在打开远程工作台…</p>;
  }
  const body = scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Redirect));
  return () => { body(); unregister(); provider(); };
}
export function openWorkbench(scope: Context, workbench: Workbench, sessionId: string, section: WorkbenchSection) {
  if (scope.sidebarRight.mounted.getSnapshot() !== sessionId) throw new Error('会话已切换，请重新打开。');
  workbench.select(sessionId, section);
  scope.sidebarRight.openTabIn(sessionId as SessionId, 'ssh-tools');
}
/** Mount lifetime is not visibility: native tabs remain mounted in hidden panes. */
export function usePageVisible(active = true) {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => { const changed = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed); }, []);
  return active && visible;
}
