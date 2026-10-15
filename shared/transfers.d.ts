import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
export interface TransferEntry {
  path: string; kind: 'file' | 'directory' | 'excluded'; size?: number; version?: string; reason?: string;
}
export interface TransferFile extends TransferEntry {
  index: number; id: string; state: 'queued' | 'verifying' | 'transferring' | 'complete' | 'paused' | 'failed' | 'unknown' | 'skipped';
  offset: number; sha256?: string; error?: string; replaceVersion?: string | null;
}
export interface TransferSummary {
  id: string; direction: 'upload' | 'download'; rootUri: string; alias: string; target: string; sources?: string[];
  state: 'preparing' | 'ready' | 'running' | 'paused' | 'complete' | 'cancelled' | 'cleanup-pending' | 'expired';
  count: number; appended: number; totalBytes: number; created: number; updated: number; error?: string; live: boolean; nonce: string;
}
export interface TransferPage { job: TransferSummary; entries: TransferFile[]; next: number; done: boolean; run?: string; }
export interface TransferPlan { id: string; direction: 'upload' | 'download'; target: string; sources?: string[]; count?: number; totalBytes?: number; }
export interface TransferAppend { id: string; after: number; entries: TransferEntry[]; }
export interface TransferControl { id: string; action: 'resume' | 'pause' | 'cancel' | 'heartbeat' | 'forget'; run: string; }
export interface TransferFileRequest {
  id: string; index: number; run: string; action: 'begin' | 'verify' | 'finish' | 'skip' | 'retry';
  sha256?: string; offset?: number; replace?: boolean;
}
export interface TransferFileResult { file: TransferFile; state?: string; verifyOffset?: number; prefix?: string; }
export interface TransferRemote {
  list(sessionId: string, signal: AbortSignal): Promise<RemoteResult<TransferSummary[]>>;
  plan(sessionId: string, request: TransferPlan): Promise<RemoteResult<TransferPage>>;
  append(sessionId: string, request: TransferAppend): Promise<RemoteResult<TransferPage>>;
  page(sessionId: string, id: string, cursor: number, signal: AbortSignal): Promise<RemoteResult<TransferPage>>;
  control(sessionId: string, request: TransferControl): Promise<RemoteResult<TransferPage>>;
  file(sessionId: string, request: TransferFileRequest): Promise<RemoteResult<TransferFileResult>>;
}
