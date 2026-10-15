import type { ShellSnapshot } from './terminal-state.js';
export const shellSnapshotSchema: { parse(value: unknown): ShellSnapshot };
export const terminalStateInvocations: any[];
