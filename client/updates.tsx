import { useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import { Button, Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ReleaseTarget } from 'dsh-ssh-remote/updates';
import { UpdateStore, browserStorage } from './update-store.js';
import { usePageVisible } from './workbench.js';

interface Injected { updates: UpdateStore; openUpdates: () => void }
type DetailProps = PropsRuntime<'plugins.detail.section'> & Injected;
const mine = (props: Pick<DetailProps, 'subject'>) => props.subject.kind === 'bundle' && props.subject.pkg.name === 'dsh-ssh-remote';
const hint = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 };

export function UpdateSection(props: DetailProps) {
  const state = useSyncExternalStore(props.updates.subscribe, props.updates.getSnapshot, props.updates.getSnapshot);
  const [confirm, setConfirm] = useState<ReleaseTarget>();
  if (!mine(props)) return null;
  const { info, release, operation } = state, available = props.updates.available();
  const busy = props.updates.busy(), failure = state.error || release?.error;
  const latest = release?.latest;
  return <section aria-label="SSH 插件版本更新" style={{ marginTop: 24, display: 'grid', gap: 12, minWidth: 0, fontSize: 13 }}>
    <h4 style={{ margin: 0 }}>版本更新</h4>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      <span>当前运行 {info?.runningVersion || '正在读取…'}</span>
      {available && <strong>可更新至 {available.version}</strong>}
      {!available && latest && info && !failure && <span style={hint}>{info.installedVersion === latest.version ? '已是最新稳定版' : `最新稳定版 ${latest.version}`}</span>}
      {state.checking && <span role="status" style={hint}>正在检查…</span>}
    </div>
    {info && info.runningVersion !== info.installedVersion && <p role="status" style={{ margin: 0 }}>已安装 {info.installedVersion}，重新加载或重启后生效。</p>}
    {failure && <p role="alert" style={{ color: 'var(--dsw-alias-label-error)', margin: 0, overflowWrap: 'anywhere' }}>{failure}</p>}
    {info?.sourceKind === 'development' && <p style={{ ...hint, margin: 0 }}>当前使用源码链接，请使用 Git 同步。此处不会用安装包覆盖你的开发目录。</p>}
    {info?.sourceKind === 'unsupported' && <p style={{ ...hint, margin: 0 }}>此安装来源不支持直接更新，请使用官方插件页安装固定版本。</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {available && info?.sourceKind === 'release' && <Button variant="primary" disabled={busy} onClick={() => setConfirm(available)}>更新到 {available.version}</Button>}
      {latest && <a href={latest.url} target="_blank" rel="noreferrer" style={{ ...hint, color: 'var(--dsw-alias-label-link)' }}>更新说明</a>}
    </div>
    {operation && <div role={operation.phase === 'failed' ? 'alert' : 'status'} aria-live="polite" style={{ display: 'grid', gap: 8, overflowWrap: 'anywhere', color: operation.phase === 'failed' ? 'var(--dsw-alias-label-error)' : undefined }}>
      <span>{operation.message}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {operation.phase === 'installing' && operation.requestId && <Button size="sm" variant="outline" onClick={() => void props.updates.cancel()}>取消安装</Button>}
        {['unknown', 'restart'].includes(operation.phase) && <Button size="sm" variant="outline" onClick={() => void props.updates.reconcile()}>重新确认结果</Button>}
      </div>
    </div>}
    <label style={{ ...hint, display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={state.automatic} onChange={event => props.updates.setAutomatic(event.currentTarget.checked)} />
      自动检查稳定版更新（每 6 小时）
    </label>
    {release?.checkedAt && <span style={hint}>上次检查：{new Date(release.checkedAt).toLocaleString()}</span>}
    <details style={{ ...hint, overflowWrap: 'anywhere' }}>
      <summary style={{ cursor: 'pointer' }}>安装来源与更新说明</summary>
      <p>只查询本项目的 GitHub Release，不上传会话、SSH 配置或项目内容。安装、依赖审批和是否需要重启由 DSH 判断。</p>
      <p>来源：{info?.source || '不可用'}</p>
      {latest && <><p>已验收 DSH：{latest.testedDshVersions.join(' / ')}</p><p>发布方 SHA-256：<code>{latest.sha256}</code></p></>}
      <p>源码链接不自动替换；本次打开的应用与其他 Web/Desktop profile 分别管理。</p>
    </details>
    <Modal open={Boolean(confirm)} onClose={() => setConfirm(undefined)} closeLabel="取消更新" title={`更新 dsh-ssh-remote 至 ${confirm?.version ?? ''}`}
      description="更新会重载 SSH 插件，可能结束远程终端、端口转发或中断传输。请先保存编辑草稿并暂停传输。不会自动重启 DSH。"
      footer={<><Button variant="outline" data-modal-autofocus onClick={() => setConfirm(undefined)}>暂不更新</Button><Button variant="primary" onClick={() => { const target = confirm; setConfirm(undefined); if (target) void props.updates.install(target); }}>确认更新</Button></>}>
      <p style={{ ...hint, overflowWrap: 'anywhere' }}>{confirm?.packageUrl}</p>
    </Modal>
  </section>;
}
export function UpdateAction(props: PropsRuntime<'plugins.detail.actions'> & Injected) {
  const state = useSyncExternalStore(props.updates.subscribe, props.updates.getSnapshot, props.updates.getSnapshot);
  return mine(props) ? <Button disabled={state.checking || !state.info || props.updates.busy()} onClick={() => void props.updates.check(true)}>检查更新</Button> : null;
}
export function UpdateBadge(props: PropsRuntime<'plugins.detail.badge'> & Injected) {
  useSyncExternalStore(props.updates.subscribe, props.updates.getSnapshot, props.updates.getSnapshot);
  return mine(props) && props.updates.available() ? <span style={{ fontSize: 12, borderRadius: 6, padding: '2px 6px', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-link)' }}>有可用更新</span> : null;
}
export function UpdateNotice({ updates, openUpdates }: Injected) {
  const state = useSyncExternalStore(updates.subscribe, updates.getSnapshot, updates.getSnapshot);
  const visible = usePageVisible(), target = updates.available();
  if (!visible || !state.automatic || !target || state.dismissed === target.version || updates.busy()) return null;
  return <Toast key={target.version} text={`SSH 插件 ${target.version} 可用。`} holdMs={12_000}
    actions={[{ label: '查看更新', onClick: () => { updates.dismiss(); openUpdates(); } }, { label: '稍后', onClick: () => updates.dismiss() }]}
    onDone={() => updates.dismiss()} />;
}

/** Add controls to the existing official detail page; no replacement plugin manager or private store imports. */
export function mountPluginUpdates(ctx: Context) {
  const fiber = ctx.inject(['remote.sshRemoteUpdates', 'remote.pluginManager', 'slots', 'pluginNavigation'], scope => {
    if (!scope.remote.sshRemoteUpdates || !scope.remote.pluginManager) return () => {};
    const updates = new UpdateStore(scope.remote.sshRemoteUpdates, scope.remote.pluginManager, browserStorage('localStorage'), browserStorage('sessionStorage'));
    const inject = () => ({ updates, openUpdates: () => scope.pluginNavigation.openBundle('dsh-ssh-remote') });
    const registrations = [
      scope.slots.inject('plugins.detail.actions', () => scope.slots.register({ name: 'plugins.detail.actions', id: 'ssh-updates.action', order: 50, inject }, UpdateAction)),
      scope.slots.inject('plugins.detail.badge', () => scope.slots.register({ name: 'plugins.detail.badge', id: 'ssh-updates.badge', order: 50, inject }, UpdateBadge)),
      scope.slots.inject('plugins.detail.section', () => scope.slots.register({ name: 'plugins.detail.section', id: 'ssh-updates.section', order: 50, inject }, UpdateSection)),
      scope.slots.inject('shell.overlay', () => scope.slots.register({ name: 'shell.overlay', id: 'ssh-updates.notice', inject }, UpdateNotice)),
      scope.remote.$on('plugin-manager/install-state', event => updates.progress(event.requestId, event.phase)),
      scope.on('connection/reset', () => { void updates.start(); }),
    ];
    const visibility = () => updates.setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility); visibility(); void updates.start();
    return () => { updates.dispose(); document.removeEventListener('visibilitychange', visibility); for (const dispose of registrations) dispose(); };
  });
  return async () => { await fiber.dispose(); };
}
