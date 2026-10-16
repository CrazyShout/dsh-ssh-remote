import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
export interface ObservedCommand {
  command: string | null; cwd: string | null; startedAt: number; elapsedMs: number | null; exitCode: number | null; uncertain: boolean;
}
export interface ShellSnapshot {
  instance: string; sequence: string; revision: number;
  state: 'starting' | 'prompt' | 'running' | 'unsupported' | 'unknown' | 'exited';
  reason: string; cwd: string | null; current: ObservedCommand | null; recent: ObservedCommand[];
}
export interface TerminalObservation extends ShellSnapshot { id: string; title: string; alias: string; stale: boolean; observedAt: number }
export interface TerminalContext { terminal: TerminalObservation; text: string; truncated: boolean }
export interface TerminalStateRemote {
  list(sessionId: string, signal: AbortSignal): Promise<RemoteResult<TerminalObservation[]>>;
  context(sessionId: string, id: string, signal: AbortSignal): Promise<RemoteResult<TerminalContext>>;
}
