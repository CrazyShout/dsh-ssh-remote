import { t } from './locale.js';
import { mountWorkbenchSection, usePageVisible, type Workbench } from './workbench.js';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { Button, Input, Checkbox, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { panelStyle, cardStyle, PanelHeader } from './presentation.js';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { PortForwardRemote, PortForwardView } from './port-forward-types.js';
import { PortForwardModel, browserIsOnHost, forwardUrl } from './port-forward-model.js';
import './port-forward-schema.js';
const ID = 'dsh-ssh-remote.ports';
export function mountPortForwards(ctx: Context, workbench: Workbench): () => Promise<void> {
    const fiber = ctx.inject(['remote.sshRemotePorts', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
        if (!scope.sidebarRightTabs || typeof scope.remote.sshRemotePorts?.list !== 'function')
            return () => { };
        const remote = scope.remote.sshRemotePorts;
        return mountWorkbenchSection(scope, workbench, ID, 'ssh-ports', 'ports', props => <PortForwardPane {...props} remote={remote}/>);
    });
    return async () => { await fiber.dispose(); };
}
const labels = (): Record<PortForwardView['state'], string> => ({ starting: t('正在连接'), listening: t('本机监听已建立'), stopping: t('正在停止'), stopped: t('已停止'), error: t('转发失败') });
export function PortForwardPane({ sessionId, remote, active = true }: {
    active?: boolean;
    sessionId: string;
    remote: PortForwardRemote;
}) {
    const visible = usePageVisible(active);
    const model = useMemo(() => new PortForwardModel(sessionId, remote), [sessionId, remote]);
    const state = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
    const [creating, setCreating] = useState(false);
    const [local, setLocal] = useState('16006'), [target, setTarget] = useState('6006');
    const [protocol, setProtocol] = useState<'http' | 'https'>('http');
    const [notice, setNotice] = useState('');
    const [confirmedHost, setConfirmedHost] = useState('');
    useEffect(() => () => model.dispose(), [model]);
    useEffect(() => { model.setVisible(visible); }, [model, visible]);
    const nativeHost = browserIsOnHost(window.location);
    const sameHost = nativeHost || (!!state.list?.host && confirmedHost === state.list.host);
    const needsBrowser = state.list?.items.some(row => row.state === 'listening');
    const valid = /^\d+$/u.test(local) && /^\d+$/u.test(target) && Number(local) >= 1024 && Number(local) <= 65535 && Number(target) >= 1 && Number(target) <= 65535;
    return <section aria-label={t('SSH 端口转发')} style={panelStyle}>
    <PanelHeader title={t('端口转发')}>
      <Button size="sm" variant="ghost" onClick={() => void model.refresh()}>{t('刷新转发状态')}</Button>
      <Button size="sm" variant="primary" aria-expanded={creating} onClick={() => setCreating(!creating)}>{creating ? t('收起') : t('新建转发')}</Button>
    </PanelHeader>
    {creating && <form onSubmit={event => {
                event.preventDefault();
                if (valid)
                    void model.create({ localPort: Number(local), remotePort: Number(target), protocol });
            }} style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, alignItems: 'end' }}>
      <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>{t('本机端口')}<Input style={{ width: '100%', minWidth: 0 }} aria-label={t('转发本机端口')} inputMode="numeric" value={local} onChange={e => setLocal(e.target.value)}/></label>
      <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>{t('远端端口')}<Input style={{ width: '100%', minWidth: 0 }} aria-label={t('转发远端端口')} inputMode="numeric" value={target} onChange={e => setTarget(e.target.value)}/></label>
      <label style={{ display: 'grid', gap: 4 }}>{t('打开协议')}<select style={{ minHeight: 32 }} aria-label={t('转发打开协议')} value={protocol} onChange={e => setProtocol(e.target.value as 'http' | 'https')}><option value="http">HTTP</option><option value="https">HTTPS</option></select></label>
      <Button variant="primary" type="submit" disabled={!valid || !state.list?.supported || !!state.pending}>{t('建立转发')}</Button>
    </form>}
    <details><summary>{t('转发说明')}</summary><small>{t('本机指 DSH 宿主')}{state.list?.host ?? ''}{t('。仅监听宿主 127.0.0.1，目标也是该 SSH 主机的 127.0.0.1；不自动启动远端服务。关闭面板不停止转发；手动停止、插件卸载或退出时释放。断线不自动重连。')}</small></details>
    {!nativeHost && state.list && needsBrowser && <Checkbox checked={sameHost} onChange={checked => setConfirmedHost(checked ? state.list!.host : '')} label={t('我确认浏览器就在 DSH 宿主 {value1} 上（仅启用打开网页，不改变监听范围）', { value1: state.list.host })}/>}
    {!sameHost && needsBrowser && <small role="note">{t('确认浏览器位于 DSH 宿主后才可打开网页；否则请复制地址到宿主浏览器。')}</small>}
    {state.list && !state.list.supported && <div role="alert">{t('首版端口转发只支持 macOS / Linux DSH Host。')}</div>}
    {[state.error, state.listError].filter(Boolean).map(message => <div key={message} role="alert" style={{ overflowWrap: 'anywhere' }}>{message}</div>)}
    {notice && <div role="status">{notice}</div>}
    {state.pending && <div role="status">{t('请求')}{state.pending.localPort} → {state.pending.remotePort}{t('正在建立或等待确认。')}<Button onClick={() => void model.stop(state.pending!.id)}>{t('停止此请求')}</Button></div>}
    <div role="list" aria-label={t('本工作区的端口转发')} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {state.list?.items.map(row => <article role="listitem" key={row.id} style={{ ...cardStyle, overflowWrap: 'anywhere' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}><strong>127.0.0.1:{row.localPort} → :{row.remotePort}</strong><small role="status">{labels()[row.state]}</small></div>
        {row.state === 'listening' && row.probe.state !== 'reachable' && <>
          <small>{row.probe.state === 'unreachable' ? t('远端端口暂不可达，请确认服务已启动。') : t('远端端口状态尚未确认。')}</small>
          {row.probe.message && <details><summary>{t('检查详情')}</summary><small>{row.probe.message}</small></details>}
        </>}
        {row.error && <div role="alert">{row.error}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {row.state === 'listening' && <>
            {sameHost ? <a href={forwardUrl(row)} target="_blank" rel="noopener noreferrer" aria-label={t('打开转发网页 {value1}', { value1: row.localPort })}>{t('打开网页')}</a> : <Button disabled>{t('打开网页')}</Button>}
            <Button size="sm" variant="ghost" onClick={() => void writeClipboard(forwardUrl(row)).then(ok => setNotice(ok ? t('已复制 DSH 宿主的回环地址。') : t('请复制：{value1}', { value1: forwardUrl(row) })))}>{t('复制地址')}</Button>
            <Button size="sm" variant="ghost" onClick={() => void model.probe(row.id)}>{t('检查远端端口')}</Button>
          </>}
          {row.state !== 'stopped' && <Button size="sm" disabled={state.busy.has(row.id)} onClick={() => void model.stop(row.id)}>{t('停止')}</Button>}
          {row.canRetry && <Button size="sm" disabled={!!state.pending} onClick={() => void model.create({ localPort: row.localPort, remotePort: row.remotePort, protocol: row.protocol })}>{t('重新建立')}</Button>}
        </div>
      </article>)}
      {state.list?.items.length === 0 && <p>{t('此工作区尚未建立转发。')}</p>}
    </div>
  </section>;
}
