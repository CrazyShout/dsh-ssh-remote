import { mountWorkbenchSection, usePageVisible, type Workbench } from './workbench.js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { TransferRemote, TransferSummary } from './transfer-types.js';
import { TransferModel } from './transfer-model.js';
import { directoryFiles, pickLocalDirectory, selectedFiles, type LocalDirectory, type LocalFile, type LocalFileHandle } from './transfer-local.js';

const ID = 'dsh-ssh-remote.transfers';
export function mountTransfers(ctx: Context, workbench: Workbench): () => Promise<void> {
  const fiber = ctx.inject(['remote.sshRemoteTransfers', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
    if (!scope.sidebarRightTabs || typeof scope.remote.sshRemoteTransfers?.list !== 'function') return () => {};
    const models = new Map<string, TransferModel>();
    const getModel = (sessionId: string) => {
      let model = models.get(sessionId);
      if (!model) {
        if (models.size >= 8) {
          const idle = [...models].find(([, value]) => !value.snapshot().active);
          if (!idle) throw new Error('已有八个会话传输模型，请先停止其中一个。');
          void idle[1].dispose(); models.delete(idle[0]);
        }
        model = new TransferModel(sessionId, scope.remote.sshRemoteTransfers as TransferRemote); models.set(sessionId, model);
      }
      return model;
    };
    const body = mountWorkbenchSection(scope, workbench, ID, 'ssh-transfers', 'transfers', props => <TransferPane {...props} getModel={getModel} />);
    return async () => { body(); await Promise.all([...models.values()].map(model => model.dispose())); };
  });
  return async () => { await fiber.dispose(); };
}
export const transferSize = (n: number) => n >= 2 ** 40 ? `${(n / 2 ** 40).toFixed(2)} TiB` : n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(2)} GiB` : n >= 2 ** 20 ? `${(n / 2 ** 20).toFixed(2)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`;
const labels: Record<TransferSummary['state'], string> = { preparing: '清单未完成', ready: '等待确认开始', running: '传输中', paused: '已暂停', complete: '已完成', cancelled: '已取消', 'cleanup-pending': '停止/清理待确认', expired: '已到期' };
export function TransferPane({ sessionId, getModel, active = true }: { active?: boolean; sessionId: string; getModel: (sessionId: string) => TransferModel }) {
  const visible = usePageVisible(active);
  const model = getModel(sessionId), state = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
  const [direction, setDirection] = useState<'upload' | 'download'>('upload');
  const [uploadTarget, setUploadTarget] = useState(''), [downloadTarget, setDownloadTarget] = useState('');
  const target = direction === 'upload' ? uploadTarget : downloadTarget;
  const setTarget = direction === 'upload' ? setUploadTarget : setDownloadTarget;
  const [replace, setReplace] = useState(false), [selectionPage, setSelectionPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => model.observeView(visible), [model, visible]);
  const run = (operation: () => Promise<unknown>) => { void operation().catch(error => model.report(error)); };
  const chooseFolder = () => run(async () => { const folder = await pickLocalDirectory('read'); model.select(await directoryFiles(folder)); setSelectionPage(0); });
  const start = (job: TransferSummary, index?: number) => run(async () => {
    // The permission prompt must be called in the click gesture, before a Remote round trip.
    const folder = job.direction === 'download' ? await pickLocalDirectory('readwrite') : undefined;
    await model.start(job, replace, folder, index);
  });
  const done = (job: TransferSummary) => ['complete', 'cancelled', 'expired'].includes(job.state);
  const page = state.page, selected = state.selected.slice(selectionPage, selectionPage + 100);
  return <section aria-label="SSH 文件传输" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, height: '100%', overflow: 'auto', minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><strong>文件传输</strong><Button size="sm" variant="ghost" onClick={() => void model.refresh()}>刷新任务</Button></div>
    <div role="group" aria-label="传输方向" style={{ display: 'flex', gap: 8 }}><Button size="sm" variant={direction === 'upload' ? 'primary' : 'outline'} aria-pressed={direction === 'upload'} onClick={() => setDirection('upload')}>上传</Button><Button size="sm" variant={direction === 'download' ? 'primary' : 'outline'} aria-pressed={direction === 'download'} onClick={() => setDirection('download')}>下载</Button></div>
    <small>① 选择{direction === 'upload' ? '本地文件' : '远端路径'}　② 核对清单　③ 确认开始</small>
    <label style={{ display: 'grid', gap: 6 }}>{direction === 'upload' ? '上传到远端目录' : '下载远端文件或目录'}
      {direction === 'upload' ? <Input aria-label="传输远端相对路径" value={target} onChange={event => setTarget(event.target.value)} placeholder="工作区内目录，留空为根目录" />
        : <textarea aria-label="传输远端相对路径" value={target} onChange={event => setTarget(event.target.value)} placeholder="每行一个相对路径，留空为工作区" rows={3} style={{ width: '100%', resize: 'vertical' }} />}</label>
    {direction === 'upload' && <div onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault(); const items = Array.from(event.dataTransfer.items);
      // Capture handle promises during the drop event; browsers invalidate the drag store later.
      const handles = items.filter(item => item.kind === 'file').map(item => {
        const get = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<LocalDirectory | LocalFileHandle | null> }).getAsFileSystemHandle;
        return get ? get.call(item) : Promise.resolve(item.getAsFile());
      });
      run(async () => {
        const files: LocalFile[] = [];
        for (const pending of handles) {
          const handle = await pending; if (!handle) throw new Error('无法访问拖拽项目，请用选择文件/目录。');
          if ('kind' in handle && handle.kind === 'directory') files.push(...await directoryFiles(handle));
          else if ('kind' in handle) { const file = await handle.getFile(); files.push(...selectedFiles([file])); }
          else files.push(...selectedFiles([handle]));
        }
        model.select(files); setSelectionPage(0);
      });
    }} style={{ border: '1px dashed var(--dsw-alias-border-l2)', padding: 10, borderRadius: 8 }}>
      <div>拖拽文件或目录到这里，或选择：</div>
      <input ref={input} type="file" multiple aria-label="选择上传文件" hidden onChange={event => {
        try { model.select(selectedFiles(Array.from(event.target.files ?? []))); setSelectionPage(0); } catch (error) { model.report(error); }
        event.target.value = '';
      }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><Button size="sm" variant="outline" disabled={!!state.active} onClick={() => input.current?.click()}>选择文件</Button><Button size="sm" variant="outline" disabled={!!state.active} onClick={chooseFolder}>选择上传目录</Button></div>
    </div>
    }
    {direction === 'upload' && state.selected.length > 0 && <details open><summary>本地选择：{state.selected.length} 项（含排除项）</summary>
      {selected.map(file => <div key={file.entry.path} style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{file.entry.kind === 'excluded' ? '排除' : file.entry.kind === 'directory' ? '目录' : transferSize(file.entry.size!)} · {file.entry.path}{file.entry.reason ? ` — ${file.entry.reason}` : ''}</div>)}
      {selectionPage > 0 && <Button size="sm" onClick={() => setSelectionPage(Math.max(0, selectionPage - 100))}>选择清单上一页</Button>}
      {selectionPage + 100 < state.selected.length && <Button size="sm" onClick={() => setSelectionPage(selectionPage + 100)}>选择清单下一页</Button>}
    </details>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="primary" disabled={state.busy || !!state.active || (direction === 'upload' && !state.selected.length)} onClick={() => void model.plan(direction, target)}>{state.busy ? '读取清单…' : direction === 'upload' ? '建立上传计划' : '预览下载清单'}</Button>
    </div>
    <label><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} /> 允许替换同名文件（开始前校验版本）</label>
    <details><summary>传输与恢复说明</summary><small>单文件 / 单批最多 1 TiB、10,000 项，两个文件并发。关闭面板不停止传输，重启后需重新授权。默认排除凭据、.env、密钥、.git 和缓存，不跟随符号链接。下载保存到授权的本机目录；其他程序的并发写入仍可能冲突。</small></details>
    {[state.error, state.listError].filter(Boolean).map(message => <div key={message} role="alert" style={{ overflowWrap: 'anywhere' }}>{message}</div>)}
    {state.notice && <div role="status" style={{ overflowWrap: 'anywhere' }}>{state.notice}</div>}
    {state.failures?.map(file => <div key={file.path} role="alert"><strong>未完成：{file.path}</strong><div>{file.message}</div></div>)}
    {state.active && <div role="status"><div>总进度 · {transferSize(state.transferredBytes ?? 0)} / {transferSize(state.totalBytes ?? 0)}</div><progress max={state.totalBytes || 1} value={state.transferredBytes ?? 0} /></div>}
    {state.progress?.map((file, slot) => <div key={slot} role="status" style={{ overflowWrap: 'anywhere', fontSize: 12 }}><span>{file.phase} · {file.path}</span><div>{transferSize(file.bytes)} / {transferSize(file.size)}</div><progress max={file.size || 1} value={file.bytes} /></div>)}
    <div role="list" aria-label="传输任务" style={{ display: 'grid', gap: 10 }}>
      {state.jobs.map(job => <article role="listitem" key={job.id} style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 10, overflowWrap: 'anywhere' }}>
        <strong>{job.direction === 'upload' ? '上传' : '下载'} · {job.alias} · {job.sources?.join('、') || job.target || '工作区根目录'}</strong>
        <div>{job.count} 项 / {transferSize(job.totalBytes)} · {labels[job.state]}{job.state === 'running' && !job.live ? '（上次记录；当前未运行，需重新授权恢复）' : ''}</div>
        <details><summary>任务详情</summary><small>任务 {job.id.slice(0, 8)} · 暂停七天后到期，本地暂存清理需授权。</small></details>
        {job.error && <div role="alert">{job.error}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <Button size="sm" onClick={() => void model.page(job.id)}>查看清单</Button>
          {!done(job) && job.state !== 'preparing' && <Button size="sm" disabled={!!state.active} onClick={() => start(job)}>{job.direction === 'download' ? '授权目录并开始 / 继续' : '用当前选择开始 / 继续'}</Button>}
          {state.active === job.id && <Button size="sm" onClick={() => run(() => model.pause())}>暂停</Button>}
          {!done(job) && <Button size="sm" onClick={() => run(() => model.cancel(job))}>取消并清理暂存</Button>}
          {done(job) && <Button size="sm" onClick={() => run(async () => {
            const folder = job.direction === 'download' ? await pickLocalDirectory('readwrite') : undefined; await model.forget(job, folder);
          })}>清理暂存及任务记录</Button>}
        </div>
      </article>)}
    </div>
    {page && <details open><summary>任务清单（{page.job.id.slice(0, 8)}，当前 {page.entries.length} 项）</summary>
      {page.entries.map(file => <div key={file.id} style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', padding: '6px 0', overflowWrap: 'anywhere', fontSize: 12 }}>
        <span>{file.path} · {file.kind === 'excluded' ? '排除' : file.kind === 'directory' ? '目录' : `${transferSize(file.offset)} / ${transferSize(file.size!)}`} · {file.state}</span>
        {(file.reason || file.error) && <div>{file.reason || file.error}</div>}
        {['failed', 'unknown', 'paused'].includes(file.state) && !done(page.job) && <Button size="sm" disabled={!!state.active} onClick={() => start(page.job, file.index)}>重试此项</Button>}
      </div>)}
      {page.entries[0]?.index > 0 && <Button size="sm" onClick={() => void model.page(page.job.id, Math.max(0, page.entries[0].index - 200))}>清单上一页</Button>}
      {!page.done && <Button size="sm" onClick={() => void model.page(page.job.id, page.next)}>清单下一页</Button>}
    </details>}
  </section>;
}
