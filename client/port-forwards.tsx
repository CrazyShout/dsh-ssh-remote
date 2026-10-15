import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { PortForwardRemote, PortForwardView } from './port-forward-types.js';
import { PortForwardModel, browserIsOnHost, forwardUrl } from './port-forward-model.js';
import './port-forward-schema.js';
const ID = 'dsh-ssh-remote.ports';
export function mountPortForwards(ctx: Context): () => Promise<void> {
  const fiber = ctx.inject(['remote.sshRemotePorts', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
    if (!scope.sidebarRightTabs || typeof scope.remote.sshRemotePorts?.list !== 'function') return () => {};
    const unregister = scope.sidebarRightTabs.register({ id: ID, kind: 'ssh-ports', title: () => '端口转发', guide: [] });
    const body = scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab', key: ID,
      inject: () => ({ remote: scope.remote.sshRemotePorts }) }, PortForwardPane));
    return () => { body(); unregister(); };
  });
  return async () => { await fiber.dispose(); };
}
const labels: Record<PortForwardView['state'], string> = { starting: '正在连接', listening: '本机监听已建立', stopping: '正在停止', stopped: '已停止', error: '转发失败' };
export function PortForwardPane({ sessionId, remote }: { sessionId: string; remote: PortForwardRemote }) {
  const model = useMemo(() => new PortForwardModel(sessionId, remote), [sessionId, remote]);
  const state = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
  const [local, setLocal] = useState('16006'), [target, setTarget] = useState('6006');
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [notice, setNotice] = useState('');
  const [confirmedHost, setConfirmedHost] = useState('');
  useEffect(() => { void model.refresh(); return () => model.dispose(); }, [model]);
  const nativeHost = browserIsOnHost(window.location);
  const sameHost = nativeHost || (!!state.list?.host && confirmedHost === state.list.host);
  const valid = /^\d+$/u.test(local) && /^\d+$/u.test(target) && Number(local) >= 1024 && Number(local) <= 65535 && Number(target) >= 1 && Number(target) <= 65535;
  return <section aria-label="SSH 端口转发" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, height: '100%', overflow: 'auto', minWidth: 0 }}>
    <strong>SSH · {state.list?.alias ?? '读取中…'}</strong>
    <small>本机指 DSH 宿主 {state.list?.host ?? ''}；仅监听 127.0.0.1，目标也是该 SSH 主机的 127.0.0.1。不自动启动远端服务。</small>
    <form onSubmit={event => { event.preventDefault(); if (valid) void model.create({ localPort: Number(local), remotePort: Number(target), protocol }); }}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, alignItems: 'end' }}>
      <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>本机端口<Input style={{ width: '100%', minWidth: 0 }} aria-label="转发本机端口" inputMode="numeric" value={local} onChange={e => setLocal(e.target.value)} /></label>
      <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>远端端口<Input style={{ width: '100%', minWidth: 0 }} aria-label="转发远端端口" inputMode="numeric" value={target} onChange={e => setTarget(e.target.value)} /></label>
      <label style={{ display: 'grid', gap: 4 }}>打开协议<select style={{ minHeight: 32 }} aria-label="转发打开协议" value={protocol} onChange={e => setProtocol(e.target.value as 'http' | 'https')}><option value="http">HTTP</option><option value="https">HTTPS</option></select></label>
      <Button type="submit" disabled={!valid || !state.list?.supported || !!state.pending}>建立转发</Button>
    </form>
    <small>关闭面板不停止转发；手动停止、插件卸载或 DSH 退出时释放。断线不会自动重连。首版不保存转发，也不保存含 token 的网址。</small>
    {!nativeHost && state.list && <label style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
      <input type="checkbox" checked={sameHost} onChange={event => setConfirmedHost(event.target.checked ? state.list!.host : '')} />
      我确认浏览器就在 DSH 宿主 {state.list.host} 上（仅启用打开网页，不改变监听范围）
    </label>}
    {!sameHost && <div role="note">浏览器与 DSH 宿主可能不在同一台机器；已禁用“打开网页”。请在宿主浏览器打开所复制的地址，不会改为对外监听。</div>}
    {state.list && !state.list.supported && <div role="alert">首版端口转发只支持 macOS / Linux DSH Host。</div>}
    {[state.error, state.listError, notice].filter(Boolean).map(message => <div key={message} role="alert" style={{ overflowWrap: 'anywhere' }}>{message}</div>)}
    {state.pending && <div role="status">请求 {state.pending.localPort} → {state.pending.remotePort} 正在建立或等待确认。
      <Button onClick={() => void model.stop(state.pending!.id)}>停止此请求</Button></div>}
    <Button size="sm" onClick={() => void model.refresh()}>刷新转发状态</Button>
    <div role="list" aria-label="本工作区的端口转发" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {state.list?.items.map(row => <article role="listitem" key={row.id} style={{ border: '1px solid var(--dsw-alias-border-primary,#bbb)', borderRadius: 8, padding: 10, overflowWrap: 'anywhere' }}>
        <div>{row.localPort} → {row.alias}:127.0.0.1:{row.remotePort}</div>
        <div role="status">{labels[row.state]}</div>
        {row.state === 'listening' && <small>{row.probe.message}</small>}
        {row.error && <div role="alert">{row.error}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {row.state === 'listening' && <>
            {sameHost ? <a href={forwardUrl(row)} target="_blank" rel="noopener noreferrer" aria-label={`打开转发网页 ${row.localPort}`}>打开网页</a> : <Button disabled>打开网页</Button>}
            <Button size="sm" onClick={() => void navigator.clipboard.writeText(forwardUrl(row)).then(() => setNotice('已复制 DSH 宿主的回环地址。'), () => setNotice(`请复制：${forwardUrl(row)}`))}>复制地址</Button>
            <Button size="sm" onClick={() => void model.probe(row.id)}>检查远端端口</Button>
          </>}
          {row.state !== 'stopped' && <Button size="sm" disabled={state.busy.has(row.id)} onClick={() => void model.stop(row.id)}>停止</Button>}
          {row.canRetry && <Button size="sm" disabled={!!state.pending} onClick={() => void model.create({ localPort: row.localPort, remotePort: row.remotePort, protocol: row.protocol })}>重新建立</Button>}
        </div>
      </article>)}
      {state.list?.items.length === 0 && <p>此工作区尚未建立转发。</p>}
    </div>
  </section>;
}
