import { mountWorkbenchSection, openWorkbench, usePageVisible, type Workbench } from './workbench.js';
import { useEffect, useRef, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { TerminalStateRemote, TerminalObservation } from 'dsh-ssh-remote/terminal-state';

const ID = 'dsh-ssh-remote.terminal-state';
const labels = { starting: '初始化中', prompt: '已返回命令行', running: '命令运行中', unsupported: '原始终端（未启用感知）', unknown: '未知', exited: '终端已退出' };
export function mountTerminalState(ctx: Context, workbench: Workbench): () => Promise<void> {
  const fiber = ctx.inject(['remote.sshRemoteTerminalState', 'remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
    const remote = scope.remote.sshRemoteTerminalState;
    if (typeof remote?.list !== 'function') return () => {};
    const body = mountWorkbenchSection(scope, workbench, ID, 'ssh-terminal-state', 'terminals', props => <TerminalStatePane {...props} remote={remote} />);
    const menu = scope.slots.inject('sidebar.right.tab.menu.item', () => scope.slots.register({ name: 'sidebar.right.tab.menu.item', id: ID,
      inject: () => ({ workspaceInfo: (path: string) => scope.remote.sshRemote.workspaceInfo(path),
        open: (sessionId: string) => { if (scope.sidebarRight.mounted.getSnapshot() !== sessionId) return; openWorkbench(scope, workbench, sessionId, 'terminals'); } }) }, TerminalStateMenu));
    return () => { menu(); body(); };
  });
  return async () => { await fiber.dispose(); };
}
function TerminalStateMenu({ tab, sessionId, useSessions, dismiss, workspaceInfo, open }: PropsRuntime<'sidebar.right.tab.menu.item'> & {
  workspaceInfo(path: string): Promise<{ ok: boolean; value?: unknown }>; open(id: string): void;
}) {
  const cwd = useSessions((state: SessionListState) => state.byId[sessionId]?.cwd), [remote, setRemote] = useState('');
  useEffect(() => { let active = true; if (tab.kind === 'terminal' && cwd) void workspaceInfo(cwd).then(result => { if (active) setRemote(result.ok && result.value ? cwd : ''); }, () => {}); return () => { active = false; }; }, [cwd, tab.kind, workspaceInfo]);
  return tab.kind === 'terminal' && cwd && remote === cwd ? <Button size="sm" onClick={() => { dismiss(); open(sessionId); }}>查看 SSH 终端状态</Button> : null;
}
export function TerminalStatePane({ sessionId, remote, inputActions, active = true }: { active?: boolean; sessionId: string; remote: TerminalStateRemote; inputActions?: InputActions }) {
  const visible = usePageVisible(active);
  const [rows, setRows] = useState<TerminalObservation[]>([]), [selected, setSelected] = useState('');
  const [error, setError] = useState(''), [listError, setListError] = useState(''), [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0), insertion = useRef<{ actions: InputActions; span: ReturnType<InputActions['captureInsertion']>; sessionId: string }>();
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!visible) return;
    const lifetime = new AbortController(); let pending = false;
    setRows([]); setSelected(''); setPreview(''); setBusy(false); insertion.current = undefined; generation.current++;
    const poll = async () => {
      if (pending || lifetime.signal.aborted) return; pending = true;
      try {
        const result = await remote.list(sessionId, AbortSignal.any([lifetime.signal, AbortSignal.timeout(6000)]));
        if (lifetime.signal.aborted) return;
        if (!result.ok) throw new Error(result.error.message);
        setRows(result.value); setListError(''); setSelected(previous => result.value.some(row => row.id === previous) ? previous : result.value[0]?.id ?? '');
      } catch (failure) {
        if (!lifetime.signal.aborted) { setListError(String(failure)); setRows(previous => previous.map(row => ({ ...row, stale: true }))); }
      } finally { pending = false; }
    };
    refresh.current = () => { void poll(); }; void poll();
    const timer = setInterval(() => { if (!document.hidden) void poll(); }, 1500);
    return () => { lifetime.abort(); clearInterval(timer); generation.current++; };
  }, [sessionId, remote, visible]);
  const capture = async () => {
    const revision = ++generation.current; setError(''); setNotice(''); setBusy(true);
    insertion.current = inputActions ? { actions: inputActions, span: inputActions.captureInsertion(), sessionId } : undefined;
    try {
      const result = await remote.context(sessionId, selected, AbortSignal.timeout(6000));
      if (revision !== generation.current) return;
      if (!result.ok) throw new Error(result.error.message); setPreview(result.value.text);
    } catch (failure) { if (revision === generation.current) setError(String(failure)); }
    finally { if (revision === generation.current) setBusy(false); }
  };
  const insert = () => {
    const target = insertion.current;
    if (!target || target.sessionId !== sessionId || target.actions !== inputActions || !target.actions.insertText(preview, target.span)) {
      setError('草稿已改变或输入框不可用，未覆盖任何内容。请复制片段，或重新预览后再插入。'); return;
    }
    insertion.current = undefined; setError(''); setNotice('已插入原会话草稿，未发送。');
  };
  const row = rows.find(item => item.id === selected);
  return <section aria-label="SSH 终端状态" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, height: '100%', overflow: 'auto', minWidth: 0 }}>
    <strong>终端状态</strong>
    <details><summary>状态感知说明</summary><small>仅观察新建的受支持 Bash / Zsh，已有终端不注入。命令行返回不代表后台任务结束；嵌套 SSH、tmux 内部状态未知。不自动发送消息或更改 Agent 目录。</small></details>
    <Button size="sm" onClick={() => refresh.current()}>刷新状态</Button>
    {listError && <div role="alert">状态读取失败，旧结果已标记过期：{listError}</div>}
    {!rows.length && <p>当前会话尚无终端。请使用侧边栏的“新建终端”。</p>}
    {rows.length > 0 && <label>当前会话终端<select aria-label="当前会话终端" value={selected} onChange={event => { setSelected(event.target.value); setPreview(''); insertion.current = undefined; generation.current++; setBusy(false); }}>
      {rows.map(item => <option key={item.id} value={item.id}>{item.title} · {item.alias} · {labels[item.state]}{item.stale ? '（过期）' : ''}</option>)}
    </select></label>}
    {row && <>
      <div role="status" style={{ padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, display: 'grid', gap: 6 }}><strong>{labels[row.state]}{row.stale ? ' · 过期' : ''}</strong><code style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{row.cwd ?? '当前目录未知'}</code>{row.reason && <small>{row.reason}</small>}</div>
      {row.current && <div>{row.state === 'running' && !row.stale ? '运行中' : '未确认结束的命令'}：{row.current.command ?? '命令文本未知（历史配置未提供）'}</div>}
      <ol style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 10 }}>{row.recent.map((command, index) => <li key={`${command.startedAt}-${index}`} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
        {command.command ?? '命令文本未知'}<br />退出码：{command.exitCode ?? '未知'} · {command.elapsedMs ?? '未知'} ms{command.uncertain ? ' · 事件不完整' : ''}
      </li>)}</ol>
      <Button size="sm" disabled={busy} onClick={() => void capture()}>预览终端上下文</Button>
    </>}
    {preview && <>
      <label>拟插入片段（可删除不需要的内容；先检查其中是否含密钥等敏感信息）
        <textarea aria-label="终端上下文预览" rows={14} value={preview} onChange={event => setPreview(event.target.value)} style={{ width: '100%', fontFamily: 'monospace' }} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={insert}>插入原会话草稿</Button>
        <Button onClick={() => void navigator.clipboard.writeText(preview).then(() => setNotice('已复制，未发送。'), () => setError('剪贴板不可用，请在预览框内手动选择复制。'))}>复制片段</Button>
      </div>
    </>}
    {error && <div role="alert">{error}</div>}{notice && <div role="status">{notice}</div>}
  </section>;
}
