import { t } from './locale.js';
import { mountWorkbenchSection, usePageVisible, type Workbench } from './workbench.js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { Button, Input, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import { panelStyle, cardStyle, PanelHeader } from './presentation.js';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { TransferFile, TransferRemote, TransferSummary } from './transfer-types.js';
import { TransferModel } from './transfer-model.js';
import { canPickLocalDirectory, directoryFiles, pickLocalDirectory, selectedFiles, type LocalDirectory, type LocalFile, type LocalFileHandle } from './transfer-local.js';
const ID = 'dsh-ssh-remote.transfers';
export function mountTransfers(ctx: Context, workbench: Workbench): () => Promise<void> {
    const fiber = ctx.inject(['remote.sshRemoteTransfers', 'slots', 'sidebarRight', 'sidebarRightTabs'], scope => {
        if (!scope.sidebarRightTabs || typeof scope.remote.sshRemoteTransfers?.list !== 'function')
            return () => { };
        const models = new Map<string, TransferModel>();
        const getModel = (sessionId: string) => {
            let model = models.get(sessionId);
            if (!model) {
                if (models.size >= 8) {
                    const idle = [...models].find(([, value]) => !value.snapshot().active);
                    if (!idle)
                        throw new Error(t('已有八个会话传输模型，请先停止其中一个。'));
                    void idle[1].dispose();
                    models.delete(idle[0]);
                }
                model = new TransferModel(sessionId, scope.remote.sshRemoteTransfers as TransferRemote);
                models.set(sessionId, model);
            }
            return model;
        };
        const body = mountWorkbenchSection(scope, workbench, ID, 'ssh-transfers', 'transfers', props => <TransferPane {...props} getModel={getModel}/>);
        return async () => { body(); await Promise.all([...models.values()].map(model => model.dispose())); };
    });
    return async () => { await fiber.dispose(); };
}
export const transferSize = (n: number) => n >= 2 ** 40 ? `${(n / 2 ** 40).toFixed(2)} TiB` : n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(2)} GiB` : n >= 2 ** 20 ? `${(n / 2 ** 20).toFixed(2)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`;
const labels = (): Record<TransferSummary['state'], string> => ({ preparing: t('清单未完成'), ready: t('等待确认开始'), running: t('传输中'), paused: t('已暂停'), complete: t('已完成'), cancelled: t('已取消'), 'cleanup-pending': t('停止/清理待确认'), expired: t('已到期') });
const fileLabels = (): Record<TransferFile['state'], string> => ({
    queued: t('排队中'), verifying: t('校验中'), transferring: t('传输中'), complete: t('已完成'),
    paused: t('已暂停'), failed: t('失败'), unknown: t('未知'), skipped: t('已跳过'),
});
export function TransferPane({ sessionId, getModel, active = true }: {
    active?: boolean;
    sessionId: string;
    getModel: (sessionId: string) => TransferModel;
}) {
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
    const directoriesAvailable = canPickLocalDirectory();
    return <section aria-label={t('SSH 文件传输')} style={panelStyle}>
    <PanelHeader title={t('文件传输')}><Button size="sm" variant="ghost" onClick={() => void model.refresh()}>{t('刷新任务')}</Button></PanelHeader>
    {!directoriesAvailable && <small role="note">{t('当前浏览器不支持目录授权。可以上传文件；目录上传和下载请使用支持 File System Access 的 Desktop / Chromium 安全页面。')}</small>}
    <div role="group" aria-label={t('传输方向')} style={{ display: 'flex', gap: 8 }}><Button size="sm" variant={direction === 'upload' ? 'primary' : 'outline'} aria-pressed={direction === 'upload'} onClick={() => setDirection('upload')}>{t('上传')}</Button><Button size="sm" variant={direction === 'download' ? 'primary' : 'outline'} aria-pressed={direction === 'download'} onClick={() => setDirection('download')}>{t('下载')}</Button></div>
    <small>{t('① 选择')}{direction === 'upload' ? t('本地文件') : t('远端路径')}{t('② 核对清单 ③ 确认开始')}</small>
    <label style={{ display: 'grid', gap: 6 }}>{direction === 'upload' ? t('上传到远端目录') : t('下载远端文件或目录')}
      {direction === 'upload' ? <Input aria-label={t('传输远端相对路径')} value={target} onChange={event => setTarget(event.target.value)} placeholder={t('工作区内目录，留空为根目录')}/>
            : <textarea aria-label={t('传输远端相对路径')} value={target} onChange={event => setTarget(event.target.value)} placeholder={t('每行一个相对路径，留空为工作区')} rows={3} style={{ width: '100%', resize: 'vertical' }}/>}</label>
    {direction === 'upload' && <div onDragOver={event => event.preventDefault()} onDrop={event => {
                event.preventDefault();
                const items = Array.from(event.dataTransfer.items);
                // Capture handle promises during the drop event; browsers invalidate the drag store later.
                const handles = items.filter(item => item.kind === 'file').map(item => {
                    const get = (item as DataTransferItem & {
                        getAsFileSystemHandle?: () => Promise<LocalDirectory | LocalFileHandle | null>;
                    }).getAsFileSystemHandle;
                    return get ? get.call(item) : Promise.resolve(item.getAsFile());
                });
                run(async () => {
                    const files: LocalFile[] = [];
                    for (const pending of handles) {
                        const handle = await pending;
                        if (!handle)
                            throw new Error(t('无法访问拖拽项目，请用选择文件/目录。'));
                        if ('kind' in handle && handle.kind === 'directory')
                            files.push(...await directoryFiles(handle));
                        else if ('kind' in handle) {
                            const file = await handle.getFile();
                            files.push(...selectedFiles([file]));
                        }
                        else
                            files.push(...selectedFiles([handle]));
                    }
                    model.select(files);
                    setSelectionPage(0);
                });
            }} style={{ border: '1px dashed var(--dsw-alias-border-l2)', padding: 10, borderRadius: 8 }}>
      <div>{t('拖拽文件或目录到这里，或选择：')}</div>
      <input ref={input} type="file" multiple aria-label={t('选择上传文件')} hidden onChange={event => {
                try {
                    model.select(selectedFiles(Array.from(event.target.files ?? [])));
                    setSelectionPage(0);
                }
                catch (error) {
                    model.report(error);
                }
                event.target.value = '';
            }}/>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}><Button size="sm" variant="outline" disabled={!!state.active} onClick={() => input.current?.click()}>{t('选择文件')}</Button><Button size="sm" variant="outline" disabled={!!state.active || !directoriesAvailable} onClick={chooseFolder}>{t('选择上传目录')}</Button></div>
    </div>}
    {direction === 'upload' && state.selected.length > 0 && <details open><summary>{t('本地选择：')}{state.selected.length}{t('项（含排除项）')}</summary>
      {selected.map(file => <div key={file.entry.path} style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{file.entry.kind === 'excluded' ? t('排除') : file.entry.kind === 'directory' ? t('目录') : transferSize(file.entry.size!)} · {file.entry.path}{file.entry.reason ? ` — ${file.entry.reason}` : ''}</div>)}
      {selectionPage > 0 && <Button size="sm" onClick={() => setSelectionPage(Math.max(0, selectionPage - 100))}>{t('选择清单上一页')}</Button>}
      {selectionPage + 100 < state.selected.length && <Button size="sm" onClick={() => setSelectionPage(selectionPage + 100)}>{t('选择清单下一页')}</Button>}
    </details>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="primary" disabled={state.busy || !!state.active || (direction === 'upload' && !state.selected.length)} onClick={() => void model.plan(direction, target)}>{state.busy ? t('读取清单…') : direction === 'upload' ? t('建立上传计划') : t('预览下载清单')}</Button>
    </div>
    <Checkbox checked={replace} onChange={setReplace} label={t('允许替换同名文件（开始前校验版本）')}/>
    <details><summary>{t('传输与恢复说明')}</summary><small>{t('单文件 / 单批最多 1 TiB、10,000 项，两个文件并发。关闭面板不停止传输，重启后需重新授权。默认排除凭据、.env、密钥、.git 和缓存，不跟随符号链接。下载保存到授权的本机目录；其他程序的并发写入仍可能冲突。')}</small></details>
    {[state.error, state.listError].filter(Boolean).map(message => <div key={message} role="alert" style={{ overflowWrap: 'anywhere' }}>{message}</div>)}
    {state.notice && <div role="status" style={{ overflowWrap: 'anywhere' }}>{state.notice}</div>}
    {state.failures?.map(file => <div key={file.path} role="alert"><strong>{t('未完成：')}{file.path}</strong><div>{file.message}</div></div>)}
    <div role="list" aria-label={t('传输任务')} style={{ display: 'grid', gap: 10 }}>
      {state.jobs.map(job => <article role="listitem" key={job.id} style={{ ...cardStyle, overflowWrap: 'anywhere' }}>
        <strong>{job.direction === 'upload' ? t('上传') : t('下载')} · {job.alias} · {job.sources?.join('、') || job.target || t('工作区根目录')}</strong>
        <div>{job.count}{t('项 /')}{transferSize(job.totalBytes)} · {labels()[job.state]}{job.state === 'running' && !job.live ? t('（上次记录；当前未运行，需重新授权恢复）') : ''}</div>
        {state.active === job.id && <>
          <div role="status"><div>{t('总进度 ·')}{transferSize(state.transferredBytes ?? 0)} / {transferSize(state.totalBytes ?? 0)}</div><progress max={state.totalBytes || 1} value={state.transferredBytes ?? 0}/></div>
          {state.progress?.map(file => <div key={file.path} role="status" style={{ fontSize: 12 }}><span>{file.phase} · {file.path}</span><div>{transferSize(file.bytes)} / {transferSize(file.size)}</div><progress max={file.size || 1} value={file.bytes}/></div>)}
        </>}
        <details><summary>{t('任务详情')}</summary><small>{t('任务')}{job.id.slice(0, 8)}{t('· 暂停七天后到期，本地暂存清理需授权。')}</small></details>
        {job.error && <div role="alert">{job.error}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {!done(job) && job.state !== 'preparing' && state.active !== job.id && <Button variant="primary" size="sm" disabled={!!state.active || (job.direction === 'download' && !directoriesAvailable)} onClick={() => start(job)}>{job.direction === 'download' ? t('授权目录并开始 / 继续') : t('用当前选择开始 / 继续')}</Button>}
          {state.active === job.id && <Button size="sm" variant="primary" onClick={() => run(() => model.pause())}>{t('暂停')}</Button>}
          <Button size="sm" variant="ghost" onClick={() => void model.page(job.id)}>{t('查看清单')}</Button>
          {!done(job) && <Button size="sm" variant="ghost" onClick={() => run(() => model.cancel(job))}>{t('取消并清理暂存')}</Button>}
          {done(job) && <Button size="sm" onClick={() => run(async () => {
                    const folder = job.direction === 'download' ? await pickLocalDirectory('readwrite') : undefined;
                    await model.forget(job, folder);
                })}>{t('清理暂存及任务记录')}</Button>}
        </div>
      </article>)}
    </div>
    {page && <details open><summary>{t('任务清单（')}{page.job.id.slice(0, 8)}{t('，当前')}{page.entries.length}{t('项）')}</summary>
      {page.entries.map(file => <div key={file.id} style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', padding: '6px 0', overflowWrap: 'anywhere', fontSize: 12 }}>
        <span>{file.path} · {file.kind === 'excluded' ? t('排除') : file.kind === 'directory' ? t('目录') : `${transferSize(file.offset)} / ${transferSize(file.size!)}`} · {fileLabels()[file.state]}</span>
        {(file.reason || file.error) && <div>{file.reason || file.error}</div>}
        {['failed', 'unknown', 'paused'].includes(file.state) && !done(page.job) && <Button size="sm" disabled={!!state.active} onClick={() => start(page.job, file.index)}>{t('重试此项')}</Button>}
      </div>)}
      {page.entries[0]?.index > 0 && <Button size="sm" onClick={() => void model.page(page.job.id, Math.max(0, page.entries[0].index - 200))}>{t('清单上一页')}</Button>}
      {!page.done && <Button size="sm" onClick={() => void model.page(page.job.id, page.next)}>{t('清单下一页')}</Button>}
    </details>}
  </section>;
}
