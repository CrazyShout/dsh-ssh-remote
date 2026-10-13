import { Context } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import { RemoteFileIndex, type FileIndexResult, type FileIndexStatus } from './file-index.js';
import { representable } from './file-index.js';
import { HelperRemoteFileSystem, type RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
import { posix } from 'node:path';
import { formatSshUri, parseSshUri } from './types.js';

declare module '@deepseek-ai/cordis' {
  interface Context { sshRemoteFiles: SshRemoteFiles }
}
/** All public calls use the official session lookup; the caller cannot choose a host/root. */
export class SshRemoteFiles extends TypertRemoteService {
  private readonly fs: HelperRemoteFileSystem;
  constructor(ctx: Context, private readonly index: RemoteFileIndex, helpers: RemoteHelperProvider, resolve: RemotePathResolver) {
    super(ctx, 'sshRemoteFiles'); this.fs = new HelperRemoteFileSystem(helpers, resolve);
  }
  @Remote
  async preview(scope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<{ sessionId: string; path: string }> {
    signal.throwIfAborted();
    const rootUri = this.index.root(scope), root = parseSshUri(rootUri);
    if (!path || !representable(path) || path.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/iu.test(path)) {
      throw new Error('路径不能安全表示；不改写文件名，也不允许上级跳转。');
    }
    const absolute = posix.resolve(root.path, path);
    if (!absolute.startsWith(`${root.path.replace(/\/+$/u, '')}/`)) throw new Error('文件不属于此会话的远程工作区。');
    const uri = formatSshUri({ ...root, path: absolute });
    const target = await this.fs.resolve(uri, { signal });
    if (String(target.targetKey) !== uri) throw new Error('不支持符号链接或目标身份变化。');
    const info = await this.fs.stat(target, signal);
    if (info?.type !== 'file') throw new Error('完整路径没有指向可预览的普通文件。');
    if (this.index.root(scope) !== rootUri) throw new Error('会话工作区已改变，请重新打开。');
    return { sessionId: scope.sessionId, path: posix.relative(root.path, absolute) };
  }
  @Remote
  query(scope: WorkspaceFileScope, query: string, includeIgnored: boolean, signal: AbortSignal): Promise<FileIndexResult> {
    return this.index.query(scope, query, includeIgnored, signal);
  }
  @Remote
  async status(scope: WorkspaceFileScope, includeIgnored: boolean, signal: AbortSignal): Promise<FileIndexStatus> {
    signal.throwIfAborted(); return this.index.status(scope, includeIgnored);
  }
  @Remote
  async refresh(scope: WorkspaceFileScope, includeIgnored: boolean, signal: AbortSignal): Promise<FileIndexStatus> {
    signal.throwIfAborted(); this.index.root(scope);
    this.index.invalidate(scope.workspaceRoot, includeIgnored);
    return this.index.status(scope, includeIgnored);
  }
}
