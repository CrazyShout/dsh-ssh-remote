import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
export interface FileIndexStatus {
  generation: number; state: 'idle' | 'building' | 'ready' | 'partial' | 'error'; stale: boolean; complete: boolean;
  count: number; pathBytes: number; unsupported: number; message: string;
}
export interface FileCandidate { path: string; kind: 'file' | 'directory' }
export interface FileIndexResult extends FileIndexStatus { sessionId: string; rootUri: string; candidates: FileCandidate[] }
export interface FileSearchRemote {
  preview(sessionId: string, path: string, signal: AbortSignal): Promise<RemoteResult<{ sessionId: string; path: string }>>;
  query(sessionId: string, query: string, includeIgnored: boolean, signal: AbortSignal): Promise<RemoteResult<FileIndexResult>>;
  status(sessionId: string, includeIgnored: boolean, signal: AbortSignal): Promise<RemoteResult<FileIndexStatus>>;
  refresh(sessionId: string, includeIgnored: boolean, signal: AbortSignal): Promise<RemoteResult<FileIndexStatus>>;
}
export interface EditorBridge { open?: (sessionId: string, path: string) => void }
