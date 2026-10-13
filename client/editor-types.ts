import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
export interface EditorDocument {
  sessionId: string; rootUri: string; path: string; alias: string; version: string;
  text: string; bom: boolean; newline: 'lf' | 'crlf'; maxBytes: number;
}
export interface EditorSave {
  rootUri: string; path: string; version: string; text: string;
  bom: boolean; newline: 'lf' | 'crlf'; operationId: string;
}
export interface EditorSaveResult {
  state: 'pending' | 'saved' | 'conflict' | 'failed' | 'unknown'; version?: string; message?: string;
}
export interface EditorRemote {
  read(sessionId: string, path: string, signal: AbortSignal): Promise<RemoteResult<EditorDocument>>;
  save(sessionId: string, request: EditorSave): Promise<RemoteResult<EditorSaveResult>>;
  status(sessionId: string, operationId: string, signal: AbortSignal): Promise<RemoteResult<EditorSaveResult>>;
}
