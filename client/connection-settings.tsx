import { t } from './locale.js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Pill, PathLabel } from '@deepseek-ai/dsh-client-ui-primitives';
import { GettingStarted } from './start-guide.js';
import { cardStyle, PanelHeader } from './presentation.js';
import type { SshRemote, SshConfig, HelperHostDiagnostics } from 'dsh-ssh-remote/ssh';
import type { ConnectionStatusStore } from './connection-status.js';
import { usePageVisible } from './workbench.js';
import { withReadDeadline, withMutationDeadline, messageOf, subtleText, dimmedText, helperStateLabel, helperCapabilitySummary, searchSummary } from './connection-ui.js';
import { MigrationWizard } from './migration.js';
type HostAction = 'connect' | 'disconnect' | 'retry' | 'diagnostics';
export function SshRemotePanel({ ssh, connectionStatus }: {
    ssh: SshRemote;
    connectionStatus: ConnectionStatusStore;
}) {
    const [config, setConfig] = useState<SshConfig | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [actions, setActions] = useState<Record<string, HostAction | undefined>>({});
    const [hostErrors, setHostErrors] = useState<Record<string, string | undefined>>({});
    const [details, setDetails] = useState<HelperHostDiagnostics | null>(null);
    const epoch = useRef(0);
    const mounted = useRef(false);
    const actionEpochs = useRef(new Map<string, number>());
    // Any host action invalidates status/config snapshots already in flight.
    const statusRevision = useRef(0);
    const visible = usePageVisible();
    const snapshot = useSyncExternalStore(connectionStatus.subscribe, connectionStatus.getSnapshot, connectionStatus.getSnapshot);
    const aliases = config?.hosts.map(host => host.alias).join('\0') ?? '';
    useEffect(() => {
        if (!visible || !aliases)
            return;
        const releases = aliases.split('\0').map(alias => connectionStatus.retain(`settings\0${alias}`));
        return () => {
            for (const release of releases)
                release();
        };
    }, [connectionStatus, visible, aliases]);
    useEffect(() => {
        if (!visible)
            return;
        setConfig(current => current === null ? current : {
            ...current,
            hosts: current.hosts.map(host => ({
                ...host,
                helper: actionEpochs.current.has(host.alias) ? host.helper : snapshot.hosts[host.alias] ?? host.helper,
            })),
        });
        for (const alias of aliases.split('\0')) {
            if (snapshot.hosts[alias]?.environment?.search.available === false)
                void connectionStatus.recheckHost(alias);
        }
    }, [snapshot, connectionStatus, visible, aliases]);
    async function load(showLoading = true) {
        const request = ++epoch.current;
        const revision = statusRevision.current;
        if (showLoading)
            setLoading(true);
        try {
            const result = await withReadDeadline(ssh.config(), t('SSH 配置读取'));
            if (!mounted.current || epoch.current !== request)
                return;
            if (result.ok) {
                setConfig(current => revision === statusRevision.current || current === null ? result.value : {
                    ...result.value,
                    hosts: result.value.hosts.map(host => ({
                        ...host,
                        helper: current.hosts.find(previous => previous.alias === host.alias)?.helper ?? host.helper,
                    })),
                });
                setError('');
            }
            else
                setError(result.error.message);
        }
        catch (reason) {
            if (mounted.current && epoch.current === request)
                setError(messageOf(reason));
        }
        finally {
            if (mounted.current && showLoading && epoch.current === request)
                setLoading(false);
        }
    }
    useEffect(() => {
        mounted.current = true;
        void load();
        return () => {
            mounted.current = false;
            epoch.current += 1;
            statusRevision.current += 1;
            actionEpochs.current.clear();
        };
    }, [ssh]);
    async function runHostAction(alias: string, action: HostAction): Promise<void> {
        const request = ++statusRevision.current;
        actionEpochs.current.set(alias, request);
        const isCurrent = () => mounted.current && actionEpochs.current.get(alias) === request;
        setActions(current => ({ ...current, [alias]: action }));
        setHostErrors(current => ({ ...current, [alias]: undefined }));
        if (action === 'connect' || action === 'retry') {
            setConfig(current => current === null ? current : {
                ...current,
                hosts: current.hosts.map(host => host.alias === alias ? {
                    ...host,
                    helper: { ...host.helper, status: action === 'retry' ? 'reconnecting' : 'connecting', error: '' },
                } : host),
            });
        }
        try {
            const operation = action === 'connect'
                ? ssh.connectHost(alias)
                : action === 'disconnect'
                    ? ssh.disconnectHost(alias)
                    : action === 'retry'
                        ? ssh.retryHost(alias)
                        : ssh.diagnostics(alias);
            const result = await (action === 'diagnostics'
                ? withReadDeadline(operation, t('连接诊断'))
                : withMutationDeadline(operation, t('主机操作')));
            if (!isCurrent())
                return;
            if (!result.ok)
                setHostErrors(current => ({ ...current, [alias]: result.error.message }));
            else {
                if (action === 'diagnostics')
                    setDetails(result.value as HelperHostDiagnostics);
                setConfig(current => current === null ? current : {
                    ...current,
                    hosts: current.hosts.map(host => host.alias === alias ? { ...host, helper: result.value } : host),
                });
            }
        }
        catch (reason) {
            if (isCurrent())
                setHostErrors(current => ({ ...current, [alias]: messageOf(reason) }));
        }
        finally {
            if (isCurrent()) {
                actionEpochs.current.delete(alias);
                statusRevision.current += 1;
                setActions(current => ({ ...current, [alias]: undefined }));
                connectionStatus.refresh();
            }
        }
    }
    return (<div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12, maxWidth: 760 }}>
      <PanelHeader title={t('SSH 连接')}>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          {loading ? t('刷新中…') : t('刷新')}
        </Button>
      </PanelHeader>

      {config && (<div style={{ padding: 10, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }}>
          <div style={subtleText}>{t('SSH 配置文件')}</div>
          <PathLabel path={config.configPath} style={{ fontSize: 12 }}/>
          {!config.configExists && <div style={{ marginTop: 6, ...subtleText }}>{t('请创建该文件并添加具体 Host 后刷新。')}</div>}
        </div>)}

      {config?.hosts.length === 0 && config.configExists && <div style={subtleText}>{t('没有发现具体 SSH Host alias。')}</div>}
      <GettingStarted expanded={config?.hosts.length === 0}/>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {config?.hosts.map((host) => {
            const action = actions[host.alias];
            const busy = action !== undefined;
            const canStop = action === 'connect' || action === 'retry'
                || ['connected', 'degraded', 'installing', 'connecting', 'reconnecting'].includes(host.helper.status);
            return (<div key={host.alias} role="group" aria-label={t('SSH 主机 {value1}', { value1: host.alias })} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{host.alias}</div>
                <span style={{ ...dimmedText, color: host.helper.status === 'error' ? 'var(--dsw-alias-label-error)' : undefined }}>
                  {snapshot.unavailable && !busy ? t('状态未知') : helperStateLabel(host.helper.status)}
                </span>
              </div>
              <div style={{ ...subtleText, overflowWrap: 'anywhere' }}>
                {host.user ? `${host.user}@` : ''}{host.host}:{host.port}
              </div>
              {host.helper.environment?.search.available === false && <div style={subtleText}>{searchSummary(host.helper)}</div>}
              {(hostErrors[host.alias] || host.helper.error) && <div role="alert" style={{ marginTop: 6, color: 'var(--dsw-alias-label-error)', fontSize: 12 }}>{hostErrors[host.alias] || host.helper.error}</div>}
              {host.helper.hint && <div style={{ marginTop: 6, ...subtleText }}>{host.helper.hint}</div>}
              <details><summary style={subtleText}>{t('连接详情')}</summary>
                <div style={dimmedText}>Helper {host.helper.version || t('尚未握手')} · {helperCapabilitySummary(host.helper.capabilities)}</div>
                {host.helper.environment?.search.available !== false && <div style={subtleText}>{searchSummary(host.helper)}</div>}
              {(host.proxyJump || host.proxyCommand || host.identityFile) && (<div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {host.proxyJump && <Pill>ProxyJump: {host.proxyJump}</Pill>}
                  {host.proxyCommand && <Pill>ProxyCommand</Pill>}
                  {host.identityFile && <Pill>{t('已配置密钥路径')}</Pill>}
                </div>)}
              </details>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {canStop ? (<Button size="sm" variant="outline" disabled={action === 'disconnect'} onClick={() => void runHostAction(host.alias, 'disconnect')}>
                    {action === 'disconnect' ? t('正在停止…') : t('停止 / 断开')}
                  </Button>) : (<Button size="sm" variant="primary" disabled={busy} onClick={() => void runHostAction(host.alias, 'connect')}>
                    {busy ? t('处理中…') : t('连接')}
                  </Button>)}
                {(host.helper.status === 'error' || host.helper.status === 'reconnecting' || host.helper.status === 'connecting') &&
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void runHostAction(host.alias, 'retry')}>{t('重试')}</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runHostAction(host.alias, 'diagnostics')}>{t('诊断')}</Button>
              </div>
              {['connected', 'degraded'].includes(host.helper.status) &&
                    <small style={subtleText}>{t('断开会结束此连接管理的终端和转发，并中断传输。')}</small>}
            </div>);
        })}
      </div>

      {details && (<div style={{ padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{details.alias}{t('· 诊断')}</strong>
            <Button size="sm" variant="ghost" onClick={() => setDetails(null)}>{t('关闭')}</Button>
          </div>
          <pre style={{ margin: '8px 0 0', maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 11 }}>
            {JSON.stringify(details, null, 2)}
          </pre>
        </div>)}

      {config && config.legacyHostCount > 0 && (<MigrationWizard ssh={ssh} onComplete={() => void load()}/>)}
      {error && <div role="alert" style={{ color: 'var(--dsw-alias-label-error)' }}>{error}</div>}
    </div>);
}
