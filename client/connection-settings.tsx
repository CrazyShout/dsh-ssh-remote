import { useEffect, useRef, useState } from 'react';
import { Button, Pill } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SshRemote, SshConfig, HelperHostStatus, HelperHostDiagnostics, RemoteResult } from 'dsh-ssh-remote/ssh';
import { withReadDeadline, withMutationDeadline, messageOf, subtleText, dimmedText, helperStateLabel, helperCapabilitySummary, searchSummary } from './connection-ui.js';
import { MigrationWizard } from './migration.js';
type HostAction = 'connect' | 'disconnect' | 'retry' | 'diagnostics';

export function SshRemotePanel({ ssh }: { ssh: SshRemote }) {
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
  const polling = useRef<Promise<RemoteResult<Record<string, HelperHostStatus>>> | null>(null);

  async function load(showLoading = true) {
    const request = ++epoch.current;
    const revision = statusRevision.current;
    if (showLoading) setLoading(true);
    try {
      const result = await withReadDeadline(ssh.config(), 'SSH 配置读取');
      if (!mounted.current || epoch.current !== request) return;
      if (result.ok) {
        setConfig(current => revision === statusRevision.current || current === null ? result.value : {
          ...result.value,
          hosts: result.value.hosts.map(host => ({
            ...host,
            helper: current.hosts.find(previous => previous.alias === host.alias)?.helper ?? host.helper,
          })),
        });
        setError('');
      } else setError(result.error.message);
    } catch (reason) {
      if (mounted.current && epoch.current === request) setError(messageOf(reason));
    } finally {
      if (mounted.current && showLoading && epoch.current === request) setLoading(false);
    }
  }

  async function loadStatuses() {
    if (!mounted.current || polling.current !== null) return;
    const lifecycle = epoch.current;
    const revision = statusRevision.current;
    const operation = Promise.resolve().then(() => ssh.statuses());
    polling.current = operation;
    // Do not accumulate unresolved RPCs when the UI-side timeout fires.
    void operation.finally(() => {
      if (polling.current === operation) polling.current = null;
    }).catch(() => {});
    try {
      const result = await withReadDeadline(operation, '连接状态读取');
      if (!mounted.current || epoch.current !== lifecycle || statusRevision.current !== revision || !result.ok) return;
      setConfig(current => current === null ? current : {
        ...current,
        hosts: current.hosts.map(host => ({
          ...host,
          helper: actionEpochs.current.has(host.alias) ? host.helper : result.value[host.alias] ?? host.helper,
        })),
      });
    } catch {
      // The full refresh button remains the explicit diagnostic surface.
    }
  }

  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = setInterval(() => { void loadStatuses(); }, 5_000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      epoch.current += 1;
      statusRevision.current += 1;
      actionEpochs.current.clear();
      polling.current = null;
    };
  }, [ssh]);

  async function runHostAction(
    alias: string,
    action: HostAction,
  ): Promise<void> {
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
        ? withReadDeadline(operation, '连接诊断')
        : withMutationDeadline(operation, '主机操作'));
      if (!isCurrent()) return;
      if (!result.ok) setHostErrors(current => ({ ...current, [alias]: result.error.message }));
      else {
        if (action === 'diagnostics') setDetails(result.value as HelperHostDiagnostics);
        setConfig(current => current === null ? current : {
          ...current,
          hosts: current.hosts.map(host => host.alias === alias ? { ...host, helper: result.value } : host),
        });
      }
    } catch (reason) {
      if (isCurrent()) setHostErrors(current => ({ ...current, [alias]: messageOf(reason) }));
    } finally {
      if (isCurrent()) {
        actionEpochs.current.delete(alias);
        statusRevision.current += 1;
        setActions(current => ({ ...current, [alias]: undefined }));
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12, maxWidth: 760 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0 }}>SSH Connections</h3>
          <div style={{ marginTop: 4, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
            连接由本机 OpenSSH 建立；版本化 helper 统一远端文件、进程和 PTY。显式断开会停止该 helper session 管理的远端进程。
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          {loading ? '刷新中…' : '刷新'}
        </Button>
      </div>

      {config && (
        <div style={{ padding: 10, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }}>
          <div style={subtleText}>SSH config</div>
          <code style={{ fontSize: 12 }}>{config.configPath}</code>
          {!config.configExists && <div style={{ marginTop: 6, ...subtleText }}>请创建该文件并添加具体 Host 后刷新。</div>}
        </div>
      )}

      {config?.hosts.length === 0 && config.configExists && <div style={subtleText}>没有发现具体 SSH Host alias。</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {config?.hosts.map((host) => {
          const action = actions[host.alias];
          const busy = action !== undefined;
          const canStop = action === 'connect' || action === 'retry'
            || ['connected', 'degraded', 'installing', 'connecting', 'reconnecting'].includes(host.helper.status);
          return (
            <div key={host.alias} role="group" aria-label={`SSH 主机 ${host.alias}`} style={{ padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{host.alias}</div>
                <span style={{ ...dimmedText, color: host.helper.status === 'error' ? 'var(--dsw-alias-label-error)' : undefined }}>
                  {helperStateLabel(host.helper.status)}
                </span>
              </div>
              <div style={{ ...subtleText, overflowWrap: 'anywhere' }}>
                {host.user ? `${host.user}@` : ''}{host.host}:{host.port}
              </div>
              <div style={{ marginTop: 6, ...dimmedText }}>
                Helper {host.helper.version || '尚未握手'} · {helperCapabilitySummary(host.helper.capabilities)}
              </div>
              <div style={{ marginTop: 6, ...subtleText }}>{searchSummary(host.helper)}</div>
              {(hostErrors[host.alias] || host.helper.error) && <div role="alert" style={{ marginTop: 6, color: 'var(--dsw-alias-label-error)', fontSize: 12 }}>{hostErrors[host.alias] || host.helper.error}</div>}
              {host.helper.hint && <div style={{ marginTop: 6, ...subtleText }}>{host.helper.hint}</div>}
              {(host.proxyJump || host.proxyCommand || host.identityFile) && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {host.proxyJump && <Pill>ProxyJump: {host.proxyJump}</Pill>}
                  {host.proxyCommand && <Pill>ProxyCommand</Pill>}
                  {host.identityFile && <Pill>Identity configured</Pill>}
                </div>
              )}
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {canStop ? (
                  <Button size="sm" variant="outline" disabled={action === 'disconnect'} onClick={() => void runHostAction(host.alias, 'disconnect')}>
                    {action === 'disconnect' ? '正在停止…' : '停止 / 断开'}
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void runHostAction(host.alias, 'connect')}>
                    {busy ? '处理中…' : '连接'}
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void runHostAction(host.alias, 'retry')}>重试</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runHostAction(host.alias, 'diagnostics')}>诊断</Button>
              </div>
            </div>
          );
        })}
      </div>

      {details && (
        <div style={{ padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{details.alias} · 诊断</strong>
            <Button size="sm" variant="ghost" onClick={() => setDetails(null)}>关闭</Button>
          </div>
          <pre style={{ margin: '8px 0 0', maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 11 }}>
            {JSON.stringify(details, null, 2)}
          </pre>
        </div>
      )}

      {config && config.legacyHostCount > 0 && (
        <MigrationWizard ssh={ssh} onComplete={() => void load()} />
      )}
      {error && <div role="alert" style={{ color: 'var(--dsw-alias-label-error)' }}>{error}</div>}
    </div>
  );
}
