import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { FileReferenceCandidate, FileReferenceService } from '@deepseek-ai/dsh-file-reference';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemoteHelperClient, RemoteHelperSessionCallOptions } from './helper/rpc-client.js';
import type { RemotePathResolver } from './runtime-router.js';
import { parseSshUri } from './types.js';

export interface FileIndexStatus {
  generation: number;
  state: 'idle' | 'building' | 'ready' | 'partial' | 'error';
  stale: boolean;
  complete: boolean;
  count: number;
  pathBytes: number;
  unsupported: number;
  message: string;
}
export interface FileIndexResult extends FileIndexStatus {
  sessionId: string;
  rootUri: string;
  candidates: FileReferenceCandidate[];
}
interface Snapshot {
  entries: FileReferenceCandidate[];
  complete: boolean;
  pathBytes: number;
  unsupported: number;
  message: string;
  time: number;
}
interface Entry {
  key: string; rootUri: string; ignored: boolean; client: RemoteHelperClient; session: string;
  snapshot?: Snapshot; generation: number; invalidated: boolean; revision: number;
  error?: string; build?: Promise<void>; controller?: AbortController;
  cleanup?: () => Promise<void>;
  waiters: number; lastUsed: number; abandon?: ReturnType<typeof setTimeout>;
}
const MAX_ENTRIES = 50_000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const idle = (): FileIndexStatus => ({ generation: 0, state: 'idle', stale: false, complete: false,
  count: 0, pathBytes: 0, unsupported: 0, message: '远程索引尚未建立。' });

/** Resource ownership is separate from individual completion RPC cancellation. */
export class RemoteFileIndex {
  private readonly entries = new Map<string, Entry>();
  private readonly activeRoots = new Set<string>();
  private active = 0;
  private generation = 0;
  private disposed = false;
  constructor(private readonly helpers: RemoteHelperProvider, private readonly resolve: RemotePathResolver,
    private readonly now = Date.now) {}

  root(scope: WorkspaceFileScope): string {
    if (!scope?.sessionId || !scope.workspaceRoot) throw new Error('需要有效会话。');
    const root = this.resolve(scope.workspaceRoot);
    if (root === undefined) throw new Error('文件索引只支持已注册的 SSH 工作区。');
    const uri = parseSshUri(root);
    if (uri.path !== posix.normalize(uri.path)) throw new Error('远程工作区不是规范路径。');
    return root;
  }

  status(scope: WorkspaceFileScope, ignored: boolean): FileIndexStatus {
    const rootUri = this.root(scope);
    const entry = [...this.entries.values()].filter(e => e.rootUri === rootUri && e.ignored === ignored).sort((a, b) => b.lastUsed - a.lastUsed)[0];
    return entry ? this.describe(entry) : idle();
  }

  invalidate(workspaceRoot: string, ignored?: boolean): void {
    const rootUri = this.resolve(workspaceRoot);
    if (!rootUri) return;
    for (const entry of this.entries.values()) if (entry.rootUri === rootUri && (ignored === undefined || entry.ignored === ignored)) {
      entry.invalidated = true; entry.revision++; entry.error = undefined;
    }
  }

  async query(scope: WorkspaceFileScope, query: string, ignored: boolean, signal: AbortSignal): Promise<FileIndexResult> {
    if (this.disposed) throw new Error('远程文件索引已关闭。');
    signal.throwIfAborted();
    const rootUri = this.root(scope);
    validateQuery(query);
    const client = await this.helpers.client(rootUri, signal);
    signal.throwIfAborted();
    if (this.disposed) throw new Error('远程文件索引已关闭。');
    const key = JSON.stringify([rootUri, client.hello.serverInstanceId, client.sessionId, ignored]);
    // A different helper identity never reuses the previous helper's paths.
    for (const [oldKey, old] of this.entries) if (old.rootUri === rootUri && old.ignored === ignored && oldKey !== key) {
      old.controller?.abort(); clearTimeout(old.abandon);
      if (old.build) await waitFor(old.build, signal);
      if (!old.cleanup) this.entries.delete(oldKey);
      else old.snapshot = undefined;
    }
    let entry = this.entries.get(key);
    if (!entry) {
      this.makeRoom();
      entry = { key, rootUri, ignored, client, session: client.sessionId, generation: 0,
        invalidated: true, revision: 0, waiters: 0, lastUsed: this.now() };
      this.entries.set(key, entry);
    }
    const current = entry;
    current.lastUsed = this.now(); current.waiters++; clearTimeout(current.abandon);
    try {
      // A new consumer can arrive while the previous last-consumer cleanup is
      // still in flight. Join that cleanup, then start a fresh allocation.
      if (current.build && current.controller?.signal.aborted) await waitFor(current.build, signal);
      signal.throwIfAborted();
      if (current.cleanup) { await waitFor(current.cleanup(), signal); current.cleanup = undefined; }
      if (!current.build && (current.invalidated || !current.snapshot || this.now() - current.snapshot.time >= 60_000)) {
        current.controller = new AbortController();
        const revision = current.revision;
        current.error = undefined;
        current.build = this.build(current, current.controller.signal).then(snapshot => {
          if (current.controller?.signal.aborted || this.entries.get(key) !== current) return;
          // Failed rebuilds preserve the previous known snapshot, even if the
          // failed scanner returned a valid-looking empty page.
          current.snapshot = snapshot;
          current.invalidated = current.revision !== revision;
          current.generation = ++this.generation;
          this.trimBytes(current);
        }, error => {
          if (!current.controller?.signal.aborted || current.cleanup) current.error = error instanceof Error ? error.message : String(error);
        }).finally(() => { current.build = undefined; current.controller = undefined; });
      }
      if (current.build) await waitFor(current.build, signal);
      signal.throwIfAborted();
      if (this.root(scope) !== rootUri || client.sessionId !== current.session) throw new Error('工作区或远程连接身份已改变，请重新搜索。');
      return { ...this.describe(current), sessionId: scope.sessionId, rootUri,
        candidates: rankCandidates(current.snapshot?.entries ?? [], query, 50, ignored) };
    } finally {
      current.waiters--;
      if (!current.waiters && current.build) {
        // Allow a debounced replacement query to join the same scan. Closing
        // the last consumer still reclaims it, independent of RPC delivery.
        current.abandon = setTimeout(() => { if (!current.waiters) current.controller?.abort(); }, 200);
        current.abandon.unref?.();
      }
    }
  }

  private describe(entry: Entry): FileIndexStatus {
    const data = entry.snapshot;
    const disconnected = entry.client.closeReason !== undefined || entry.client.sessionId !== entry.session;
    const stale = !!data && (entry.invalidated || disconnected || this.now() - data.time >= 60_000);
    return { generation: entry.generation,
      state: entry.build ? 'building' : entry.error || disconnected ? 'error' : !data ? 'idle' : data.complete ? 'ready' : 'partial',
      stale, complete: !!data?.complete && !stale, count: data?.entries.length ?? 0,
      pathBytes: data?.pathBytes ?? 0, unsupported: data?.unsupported ?? 0,
      message: disconnected ? '远程连接已断开；不会使用本机文件作为候选。' : entry.error ?? (entry.build
        ? (data ? '索引正在更新，显示的旧结果可能已过期。' : '正在建立远程文件索引…')
        : data?.message ?? '远程索引尚未建立。') };
  }

  private makeRoom(): void {
    if (this.entries.size < 8) return;
    const victim = [...this.entries.values()].filter(e => !e.build && !e.waiters && !e.cleanup).sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (!victim) throw new Error('远程索引繁忙（最多八个工作区缓存），请稍后重试。');
    clearTimeout(victim.abandon); this.entries.delete(victim.key);
  }
  private trimBytes(keep: Entry): void {
    const total = () => [...this.entries.values()].reduce((sum, e) => sum + (e.snapshot?.pathBytes ?? 0), 0);
    for (const victim of [...this.entries.values()].filter(e => e !== keep).sort((a, b) => a.lastUsed - b.lastUsed)) {
      if (total() <= MAX_CACHE_BYTES) break;
      victim.snapshot = undefined; victim.invalidated = true;
      if (!victim.build && !victim.waiters && !victim.cleanup) this.entries.delete(victim.key);
    }
  }

  private async build(entry: Entry, signal: AbortSignal): Promise<Snapshot> {
    while (this.active >= 2 || this.activeRoots.has(entry.rootUri)) await delay(25, undefined, { signal });
    signal.throwIfAborted(); this.active++; this.activeRoots.add(entry.rootUri);
    const workspaceId = randomUUID(), discoveryId = randomUUID();
    const call = <T>(method: string, params: Record<string, unknown>, options: RemoteHelperSessionCallOptions = {}) => {
      if (entry.client.callInSession) return entry.client.callInSession<T>(entry.session, method, params, options);
      if (entry.client.sessionId !== entry.session) throw new Error('远程 helper 会话已改变。');
      return entry.client.call<T>(method, params, options);
    };
    let allocated = false;
    try {
      const fs = entry.client.capabilities.filesystem as Record<string, unknown> | undefined;
      if (!(fs?.discovery as { version?: number } | undefined)?.version) throw new Error('此远程 helper 不支持文件发现；请重新连接更新 helper。');
      allocated = true;
      const workspace = await call<{ workspaceId: string; path: string; access: string }>('workspace/open', {
        workspaceId, operationId: workspaceId, path: parseSshUri(entry.rootUri).path, access: 'read-only',
      }, { signal, mutation: true, timeoutMs: 20_000 });
      if (workspace.workspaceId !== workspaceId || workspace.access !== 'read-only' || workspace.path !== parseSshUri(entry.rootUri).path) {
        throw new Error('远程工作区身份或规范目录不一致。');
      }
      await call('fs/discoverOpen', { workspaceId, discoveryId, operationId: discoveryId, includeIgnored: entry.ignored },
        { signal, mutation: true, timeoutMs: 5_000 });
      let cursor = 0, bytes = 0, unsupported = 0;
      const entries: FileReferenceCandidate[] = [];
      const seen = new Set<string>();
      const deadline = this.now() + 20_000;
      while (true) {
        const page = await call<DiscoveryPage>('fs/discoverRead', { discoveryId, cursor, limit: 500 }, { signal, timeoutMs: 5_000 });
        if (!Array.isArray(page.entries) || page.entries.length > 500 || page.cursor !== cursor + page.entries.length
          || typeof page.complete !== 'boolean' || typeof page.eof !== 'boolean') throw new Error('远端文件发现响应无效。');
        if (Buffer.byteLength(JSON.stringify(page.entries)) > 131_072) throw new Error('远端文件发现分页超过字节限制。');
        for (const candidate of page.entries) {
          validateCandidate(candidate);
          bytes += Buffer.byteLength(candidate.path);
          if (entries.length >= MAX_ENTRIES || bytes > MAX_BYTES || seen.has(candidate.path)) throw new Error('远端文件发现超出协议容量或路径重复。');
          seen.add(candidate.path); entries.push(candidate);
          if (!representable(candidate.path)) unsupported++;
        }
        cursor = page.cursor;
        if (page.eof) {
          if (page.error) throw new Error(`${page.error.code}: ${page.error.message}`);
          return { entries, pathBytes: bytes, unsupported, complete: page.complete, time: this.now(),
            message: page.complete ? (unsupported ? `${unsupported} 个文件名不能安全表示为 DSH 引用或预览地址。` : '')
              : `索引不完整（${page.reason === 'timeout' ? '扫描超时' : '达到容量上限'}）；未找到不代表文件不存在，可输入完整路径直接打开。` };
        }
        if (this.now() >= deadline) throw new Error('远程索引超时。已保留上次结果，可输入完整路径。');
        if (!page.entries.length) await delay(75, undefined, { signal });
      }
    } finally {
      try {
        if (allocated) {
          const cleanup = async () => {
          const outcomes = await Promise.allSettled([
            call<{ closed?: boolean; cancelled?: boolean }>('fs/discoverClose', { discoveryId, operationId: `close:${discoveryId}` }, { mutation: true, timeoutMs: 5_000 }),
            call<{ closed?: boolean; cancelled?: boolean }>('workspace/close', { workspaceId, operationId: `close:${workspaceId}` }, { mutation: true, timeoutMs: 5_000 }),
          ]);
          if (outcomes.some(r => r.status === 'rejected' || (!r.value.closed && !r.value.cancelled))) {
            throw new Error('远程索引资源释放未确认；已保留清理责任，请重试或重新连接。');
          }
          };
          entry.cleanup = cleanup;
          await cleanup();
          entry.cleanup = undefined;
        }
      } finally { this.active--; this.activeRoots.delete(entry.rootUri); }
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const entry of this.entries.values()) { clearTimeout(entry.abandon); entry.controller?.abort(); }
    await Promise.allSettled([...this.entries.values()].map(e => e.build));
    const results = await Promise.allSettled([...this.entries.values()].filter(e => e.cleanup).map(e => e.cleanup!()));
    const failures = results.flatMap(r => r.status === 'rejected' ? [r.reason] : []);
    if (failures.length) throw new AggregateError(failures, 'remote index cleanup remains unconfirmed');
    this.entries.clear();
  }
}
interface DiscoveryPage {
  entries: FileReferenceCandidate[]; cursor: number; eof: boolean; complete: boolean;
  reason: string | null; error: { code: string; message: string } | null;
}
export function representable(path: string): boolean { return path.length <= 4096 && !/[\\"\u0000-\u001f\u007f-\u009f]/u.test(path); }
function validateCandidate(candidate: FileReferenceCandidate) {
  if (!candidate || typeof candidate.path !== 'string' || !candidate.path || candidate.path.startsWith('/')
    || candidate.path.includes('\0') || /\p{Surrogate}/u.test(candidate.path)
    || candidate.path.split('/').some(p => !p || ['.', '..', '.git'].includes(p)) || !['file', 'directory'].includes(candidate.kind)) {
    throw new Error('远端文件发现包含无效或越界路径。');
  }
}
function validateQuery(query: string) {
  if (typeof query !== 'string' || query.length > 4096 || query.includes('\0') || query.split('/').includes('..')) throw new Error('搜索路径无效或包含上级跳转。');
}
/** Shared deterministic matching for native completion and quick open. */
export function rankCandidates(entries: FileReferenceCandidate[], input: string, limit = 50, includeHidden = false): FileReferenceCandidate[] {
  const query = input.toLocaleLowerCase();
  const hidden = includeHidden || query.startsWith('.') || query.includes('/.');
  const rows = entries.filter(row => hidden || !row.path.split('/').some(p => p.startsWith('.'))).map(row => {
    const path = row.path.toLocaleLowerCase(), name = path.split('/').pop()!;
    let score = !query ? (path.includes('/') ? 0 : 100) : name === query ? 1000 : name.startsWith(query) ? 900
      : name.includes(query) ? 700 : path.includes(query) ? 500 : 0;
    if (!score && query) { let at = 0; for (const ch of path) if (ch === query[at]) at++; if (at === query.length) score = 300; }
    return { row, score: score + (score && row.kind === 'directory' ? 25 : 0) };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.row.path.length - b.row.path.length
    || (a.row.path < b.row.path ? -1 : a.row.path > b.row.path ? 1 : 0));
  return rows.slice(0, limit).map(x => x.row);
}
function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export function installRemoteFileReferencesRouter(service: Pick<FileReferenceService, 'list'>, index: RemoteFileIndex,
  resolve: RemotePathResolver): () => void {
  const original = service.list;
  service.list = async function (agent, query, signal) {
    const cwd = agent.session.header.cwd;
    if (!cwd || resolve(cwd) === undefined) return original.call(this, agent, query, signal);
    await delay(150, undefined, { signal });
    const result = await index.query({ sessionId: agent.session.id, workspaceRoot: cwd }, query, false, signal);
    return result.candidates.filter(row => representable(row.path)).slice(0, 20);
  };
  return () => { service.list = original; };
}
