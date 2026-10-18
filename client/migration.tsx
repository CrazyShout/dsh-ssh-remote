import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SshRemote } from 'dsh-ssh-remote/ssh';
import type { MigrationPreview, MigrationResult } from 'dsh-ssh-remote/migration';

export function MigrationWizard({ ssh, onComplete }: { ssh: SshRemote; onComplete(): void }) {
  const [preview, setPreview] = useState<MigrationPreview>();
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [result, setResult] = useState<MigrationResult>();
  const [recoveryId, setRecoveryId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, [ssh]);
  async function run(action: 'preview' | 'apply' | 'rollback') {
    const current = ++revision.current; setBusy(true); setError('');
    try {
      if (action === 'preview') {
        const response = await ssh.migrationPreview(Object.entries(aliases).map(([name, alias]) => ({ name, alias })));
        if (current !== revision.current) return;
        if (!response.ok) throw new Error(response.error.message);
        setPreview(response.value);
      } else if (action === 'apply' && preview?.ready) {
        const response = await ssh.migrationApply(preview.token);
        if (current !== revision.current) return;
        if (!response.ok) throw new Error(response.error.message);
        setResult(response.value); setPreview(undefined); onComplete();
      } else if (action === 'rollback' && (result || recoveryId)) {
        const response = await ssh.migrationRollback(result?.id ?? recoveryId.trim());
        if (current !== revision.current) return;
        if (!response.ok) throw new Error(response.error.message);
        setResult(undefined); setRecoveryId(''); onComplete();
      }
    } catch (reason) { if (current === revision.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (current === revision.current) setBusy(false); }
  }
  return <section aria-label="迁移旧 SSH 配置" style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: 14, display: 'grid', gap: 10 }}>
    <strong>迁移旧 SSH 配置</strong>
    <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>旧 SFTP 后端已移除。确认改动后迁入 OpenSSH，保留现有工作区与会话。</span>
    {preview?.hosts.map(host => <label key={host.name} style={{ display: 'grid', gap: 4 }}>
      <span>{host.name} → {host.user ? `${host.user}@` : ''}{host.host}:{host.port}</span>
      <Input aria-label={`${host.name} 的 SSH 别名`} value={aliases[host.name] ?? host.alias} disabled={busy} onChange={event => {
        setAliases(current => ({ ...current, [host.name]: event.target.value })); setPreview(current => current && { ...current, ready: false });
      }} />
      {host.error && <span role="alert">{host.error}</span>}
    </label>)}
    {preview && <details open><summary>核对写入差异（仅配置，不读取私钥）</summary>
      {(['config', 'fragment'] as const).map(key => <div key={key} style={{ minWidth: 0 }}>
        <code style={{ overflowWrap: 'anywhere' }}>{key === 'config' ? preview.configPath : preview.fragmentPath}</code>
        <div style={{ display: 'grid', gap: 8 }}>
          <details><summary>修改前</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{preview.before[key] || '（文件不存在）'}</pre></details>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 240, overflow: 'auto' }}>{preview.after[key]}</pre>
        </div>
      </div>)}
    </details>}
    {result && <div role="status">已验证：{result.verified.join('、') || '暂无'}
      {Object.entries(result.errors).map(([alias, message]) => <div role="alert" key={alias}>{alias}：{message}（配置已保留，工作区未重映射）</div>)}
      <div style={{ fontSize: 12 }}>迁移记录：{result.id}</div>
    </div>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('preview')}>{busy ? '处理中…' : preview ? '重新检查差异' : '检查旧配置'}</Button>
      {preview && <Button size="sm" variant="primary" disabled={busy || !preview.ready} onClick={() => void run('apply')}>确认、备份并迁移</Button>}
      {result && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('rollback')}>回滚本次迁移</Button>}
    </div>
    {!result && <details><summary>恢复或回滚已有迁移</summary>
      <p style={{ fontSize: 12 }}>输入之前保存的迁移记录 ID。配置有后续修改时会拒绝回滚，避免覆盖你的更改。</p>
      <Input aria-label="迁移记录 ID" value={recoveryId} onChange={event => setRecoveryId(event.target.value)} />
      <Button size="sm" variant="outline" disabled={busy || !recoveryId.trim()} onClick={() => void run('rollback')}>核对并回滚</Button>
    </details>}
    {error && <div role="alert" style={{ color: 'var(--dsw-alias-label-error)' }}>{error}</div>}
  </section>;
}
