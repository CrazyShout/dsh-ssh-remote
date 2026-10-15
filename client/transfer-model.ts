import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TransferFile, TransferFileResult, TransferPage, TransferRemote, TransferSummary } from './transfer-types.js';
import { CHUNK_BYTES, DownloadStaging, cleanupLocalStaging, downloadPath, hashFile, hexHash, localDirectory, readLocalChunk,
  validateLocalManifest, type LocalDirectory, type LocalFile } from './transfer-local.js';

interface State { jobs: TransferSummary[]; page?: TransferPage; selected: LocalFile[]; error: string; listError: string; notice: string; busy: boolean; active?: string; progress?: { path: string; bytes: number; size: number; phase: string } }
interface Execution { id: string; run: string; stop: AbortController; promise: Promise<void>; }
export async function transferResult<T>(promise: Promise<RemoteResult<T>>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  try {
    const result = await Promise.race([promise, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('请求结果待确认，请刷新记录；不会自动重建任务。')), 40_000); })]);
    if (!result.ok) throw new Error(result.error.message); return result.value;
  } finally { clearTimeout(timeout!); }
}
/** One model per Session survives pane close. Reload deliberately loses local file permissions. */
export class TransferModel {
  private state: State = { jobs: [], selected: [], error: '', listError: '', notice: '', busy: false };
  private readonly listeners = new Set<() => void>();
  private executor?: Execution;
  private disposed = false;
  private revision = 0;
  private readonly folders = new Map<string, LocalDirectory>();
  private readonly executionIds = new Map<string, string>();
  private readonly beforeUnload = (event: BeforeUnloadEvent) => { if (this.executor) { event.preventDefault(); event.returnValue = ''; } };
  constructor(readonly sessionId: string, private readonly remote: TransferRemote, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.beforeUnload);
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<State>) { if (this.disposed) return; this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn(); }
  report(error: unknown) { this.update({ error: error instanceof Error ? error.message : String(error) }); }
  select(files: LocalFile[]) { if (this.executor) throw new Error('请先暂停当前传输。'); validateLocalManifest(files); this.update({ selected: files, error: '', notice: '本地源已选择；请核对清单，然后建立计划或继续原任务。' }); }
  private put(page: TransferPage) {
    this.update({ jobs: [page.job, ...this.state.jobs.filter(job => job.id !== page.job.id)], page });
  }
  async refresh() {
    const revision = this.revision;
    try {
      const jobs = await transferResult(this.remote.list(this.sessionId, new AbortController().signal));
      if (revision === this.revision) this.update({ jobs, listError: '' });
    } catch (error) { if (revision === this.revision) this.update({ listError: String(error) }); }
  }
  async page(id: string, cursor = 0) {
    const revision = ++this.revision;
    try { const page = await transferResult(this.remote.page(this.sessionId, id, cursor, new AbortController().signal)); if (revision === this.revision) this.put(page); }
    catch (error) { if (revision === this.revision) this.report(error); }
  }
  async plan(direction: 'upload' | 'download', target: string) {
    if (this.state.busy || this.executor) return;
    const files = [...this.state.selected];
    this.revision++; this.update({ busy: true, error: '' });
    try {
      if (direction === 'upload' && !files.length) throw new Error('请先选择本地文件或目录。');
      const id = crypto.randomUUID(), count = files.length, totalBytes = files.reduce((n, f) => n + (f.entry.size ?? 0), 0);
      const paths = direction === 'download' ? target.split('\n').filter(path => path !== '') : [];
      if (direction === 'upload' && target.includes('\n')) throw new Error('上传目标只能是一个目录。');
      let page = await transferResult(this.remote.plan(this.sessionId, { id, direction, target: paths.length > 1 ? '' : target,
        ...(paths.length > 1 ? { sources: paths } : {}), ...(direction === 'upload' ? { count, totalBytes } : {}) }));
      this.put(page); // Keep even a partially appended plan visible and cancellable.
      for (let after = 0; direction === 'upload' && after < files.length; after += 200) {
        page = await transferResult(this.remote.append(this.sessionId, { id, after, entries: files.slice(after, after + 200).map(f => f.entry) }));
      }
      this.put(await transferResult(this.remote.page(this.sessionId, id, 0, new AbortController().signal)));
      this.update({ notice: '计划已建立，尚未传输。请核对实际清单及排除项，再点击开始。' });
    } catch (error) { this.report(error); }
    finally { this.update({ busy: false }); await this.refresh(); }
  }
  private async manifest(id: string, signal: AbortSignal): Promise<TransferPage & { entries: TransferFile[] }> {
    const first = await transferResult(this.remote.page(this.sessionId, id, 0, signal)), entries = [...first.entries]; let page = first;
    while (!page.done) {
      signal.throwIfAborted(); const next = await transferResult(this.remote.page(this.sessionId, id, page.next, signal));
      if (next.next <= page.next || entries.length + next.entries.length > 10000) throw new Error('传输清单分页无效。');
      entries.push(...next.entries); page = next;
    }
    return { ...first, entries };
  }
  async start(job: TransferSummary, replace: boolean, folder?: LocalDirectory, onlyIndex?: number): Promise<void> {
    if (this.executor || this.state.busy) throw new Error('此会话已有执行任务，请先暂停。');
    if (job.direction === 'download' && !folder) throw new Error('请选择并授权原下载目录。');
    if (folder) this.folders.set(job.id, folder);
    const stop = new AbortController(), run = crypto.randomUUID();
    const execution: Execution = { id: job.id, run, stop, promise: Promise.resolve() };
    this.executor = execution; this.revision++; this.update({ active: job.id, error: '', notice: '' });
    execution.promise = this.execute(execution, job, replace, folder, onlyIndex);
    return execution.promise;
  }
  private async execute(execution: Execution, job: TransferSummary, replace: boolean, folder?: LocalDirectory, onlyIndex?: number) {
    const { id, run, stop } = execution, signal = stop.signal;
    let claimed = false, heartbeat: ReturnType<typeof setInterval> | undefined, heartbeatPending = false;
    const send = (action: 'begin' | 'verify' | 'finish', index: number, extra: { sha256?: string; offset?: number; replace?: boolean } = {}) =>
      transferResult(this.remote.file(this.sessionId, { id, run, index, action, ...extra }));
    const notify = (file: TransferFile, bytes: number, phase: string) => this.update({ progress: { path: file.path, bytes, size: file.size ?? 0, phase } });
    try {
      const manifest = await this.manifest(id, signal), source = new Map(this.state.selected.map(file => [file.entry.path, file]));
      const pending = manifest.entries.filter(file => !['complete', 'skipped'].includes(file.state) && (onlyIndex === undefined || file.index === onlyIndex || file.kind === 'directory'));
      if (job.direction === 'upload') for (const file of pending) {
        const local = source.get(file.path);
        if (!local || local.entry.kind !== file.kind || local.entry.size !== file.size) throw new Error('重新选择的源文件清单不匹配：' + file.path);
      }
      signal.throwIfAborted();
      this.executionIds.set(id, run); claimed = true;
      this.put(await transferResult(this.remote.control(this.sessionId, { id, run, action: 'resume' })));
      heartbeat = setInterval(() => {
        if (heartbeatPending || signal.aborted) return; heartbeatPending = true;
        void transferResult(this.remote.control(this.sessionId, { id, run, action: 'heartbeat' })).catch(error => {
          if (!signal.aborted) { this.report(error); stop.abort(error); }
        }).finally(() => { heartbeatPending = false; });
      }, 10_000);
      // Parents are established before child files, independently of picker enumeration order.
      for (const file of pending.filter(f => f.kind === 'directory').sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
        signal.throwIfAborted();
        if (folder) await localDirectory(folder, downloadPath(job, file));
        await send('begin', file.index);
      }
      const files = pending.filter(file => file.kind === 'file'); let cursor = 0;
      const worker = async () => {
        while (cursor < files.length) {
          signal.throwIfAborted(); const file = files[cursor++]; let staging: DownloadStaging | undefined;
          try {
            let result: TransferFileResult, data: File | undefined, sha: string | undefined;
            if (job.direction === 'upload') {
              data = await source.get(file.path)!.getFile(); if (data.size !== file.size) throw new Error('源文件大小已改变：' + file.path);
              sha = await hashFile(data, signal, bytes => notify(file, bytes, '校验上传源'));
              if (file.sha256 && file.sha256 !== sha) throw new Error('源文件内容已改变，拒绝续传：' + file.path);
              result = await send('begin', file.index, { sha256: sha, replace });
            } else {
              staging = await DownloadStaging.open(folder!, job, file, replace, signal);
              result = await send('begin', file.index, { offset: staging.offset });
            }
            while (result.state === 'verifying') { signal.throwIfAborted(); notify(file, result.verifyOffset ?? 0, '校验续传前缀'); result = await send('verify', file.index); }
            if (result.file.state === 'complete') continue;
            if (staging && (result.file.offset !== staging.offset || result.prefix !== staging.digest)) throw new Error('远端与本地下载前缀不一致。');
            let offset = result.file.offset;
            while (offset < file.size!) {
              signal.throwIfAborted(); notify(file, offset, '传输');
              if (data) {
                const bytes = await readLocalChunk(data, offset, signal);
                const response = await this.chunk(execution, 'upload', file.index, offset, bytes);
                const receipt = await response.json() as TransferFile;
                if (receipt.id !== file.id || receipt.offset !== offset + bytes.length) throw new Error('上传确认偏移不匹配。');
                offset = receipt.offset;
              } else {
                const response = await this.chunk(execution, 'download', file.index, offset);
                const bytes = await boundedResponse(response, signal);
                if (!bytes.length || bytes.length > file.size! - offset || hexHash(bytes) !== response.headers.get('x-content-sha256')) throw new Error('下载分块长度或校验失败。');
                await staging!.append(bytes); offset += bytes.length;
              }
            }
            signal.throwIfAborted();
            if (staging) { notify(file, offset, '发布到本地文件夹'); await staging.publish(signal); sha = staging.digest; }
            await send('finish', file.index, { sha256: sha });
            notify(file, file.size!, '完成');
          } catch (error) {
            // Close durable chunks even on Pause. Never acknowledge an unclosed write stream.
            if (staging) await staging.checkpoint().catch(checkpointError => this.report(checkpointError));
            stop.abort(error); throw error;
          }
        }
      };
      const outcomes = await Promise.allSettled([worker(), worker()]);
      const failure = outcomes.find(outcome => outcome.status === 'rejected'); if (failure?.status === 'rejected') throw failure.reason;
      this.update({ notice: onlyIndex === undefined ? '所选任务已传输并完成 SHA-256 校验。' : '本次所选项已处理；其他未完成项保留。' });
    } catch (error) { if ((error as Error)?.name !== 'AbortError') this.report(error); }
    finally {
      clearInterval(heartbeat);
      if (claimed) {
        try {
          const page = await transferResult(this.remote.page(this.sessionId, id, 0, new AbortController().signal));
          if (page.job.live) this.put(await transferResult(this.remote.control(this.sessionId, { id, run, action: 'pause' })));
          else { this.put(page); this.executionIds.delete(id); }
        } catch (error) { this.report('停止结果待确认：' + String(error)); }
      }
      if (this.executor === execution) this.executor = undefined;
      this.update({ active: undefined, progress: undefined }); this.revision++; await this.refresh();
    }
  }
  private async chunk(execution: Execution, direction: string, index: number, offset: number, bytes?: Uint8Array) {
    const query = new URLSearchParams({ sessionId: this.sessionId, id: execution.id, index: String(index), offset: String(offset) });
    // A short transport outage can replay the same bounded chunk. Authorization/cursor failures never retry.
    for (let attempt = 0; ; attempt++) {
      execution.stop.signal.throwIfAborted();
      try {
        const response = await this.fetcher(`/api/ssh-transfers/${direction}?${query}`, { method: 'POST', credentials: 'same-origin',
          headers: { 'x-dsh-transfer-run': execution.run, ...(bytes ? { 'x-content-sha256': hexHash(bytes), 'content-type': 'application/octet-stream' } : {}) },
          body: bytes as BodyInit | undefined, signal: execution.stop.signal });
        if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? '传输被拒绝。'); }
        return response;
      } catch (error) {
        if (!(error instanceof TypeError) || attempt >= 2 || execution.stop.signal.aborted) throw error;
        await new Promise<void>((resolve, reject) => {
          const aborted = () => { clearTimeout(timer); reject(execution.stop.signal.reason); };
          const timer = setTimeout(() => { execution.stop.signal.removeEventListener('abort', aborted); resolve(); }, 500 * 2 ** attempt);
          execution.stop.signal.addEventListener('abort', aborted, { once: true });
        });
      }
    }
  }
  async pause() { const execution = this.executor; if (!execution) return; execution.stop.abort(new DOMException('用户暂停', 'AbortError')); await execution.promise; }
  async cancel(job: TransferSummary, folder?: LocalDirectory) {
    if (this.executor?.id === job.id) await this.pause();
    const page = await transferResult(this.remote.control(this.sessionId, { id: job.id, run: this.executionIds.get(job.id) ?? crypto.randomUUID(), action: 'cancel' })); this.put(page);
    if (page.job.state !== 'cancelled') throw new Error(page.job.error ?? '远端清理未确认。');
    this.executionIds.delete(job.id);
    const target = folder ?? this.folders.get(job.id);
    if (job.direction === 'download' && target) { await cleanupLocalStaging(target, job); this.folders.delete(job.id); }
    this.update({ notice: job.direction === 'download' && !target ? '远端取消已确认。仍需重新授权原本地目录以清理暂存；已完成文件保留。' : '已取消并清理已授权的未完成暂存，已完成文件保留。' });
  }
  async forget(job: TransferSummary, folder?: LocalDirectory) {
    if (job.direction === 'download') { if (!folder) throw new Error('请先授权原下载目录以清理暂存。'); await cleanupLocalStaging(folder, job); }
    await transferResult(this.remote.control(this.sessionId, { id: job.id, run: crypto.randomUUID(), action: 'forget' }));
    this.folders.delete(job.id); this.executionIds.delete(job.id); this.update({ jobs: this.state.jobs.filter(row => row.id !== job.id), page: undefined });
  }
  async dispose() { await this.pause(); this.disposed = true; if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.beforeUnload); this.listeners.clear(); this.folders.clear(); }
}
async function boundedResponse(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const reader = response.body?.getReader(); if (!reader) throw new Error('下载响应没有数据流。');
  const chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { signal.throwIfAborted(); const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > CHUNK_BYTES) throw new Error('下载分块超过上限。'); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const result = new Uint8Array(total); let offset = 0; for (const bytes of chunks) { result.set(bytes, offset); offset += bytes.length; } return result;
}
