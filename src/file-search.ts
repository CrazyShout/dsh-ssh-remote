import { Context } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import { RemoteFileIndex, type FileIndexResult, type FileIndexStatus } from './file-index.js';

declare module '@deepseek-ai/cordis' {
  interface Context { sshRemoteFiles: SshRemoteFiles }
}
/** All public calls use the official session lookup; the caller cannot choose a host/root. */
export class SshRemoteFiles extends TypertRemoteService {
  constructor(ctx: Context, private readonly index: RemoteFileIndex) { super(ctx, 'sshRemoteFiles'); }
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
