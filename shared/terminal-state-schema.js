import * as z from 'zod/mini';
const str = z.string(), nullable = schema => z.nullable(schema), bounded = (schema, max) => z.array(schema).check(z.maxLength(max));
const command = z.object({ command: nullable(str), cwd: nullable(str), startedAt: z.number(), elapsedMs: nullable(z.number()), exitCode: nullable(z.number()), uncertain: z.boolean() });
export const shellSnapshotSchema = z.object({ instance: str, sequence: str, revision: z.number(),
  state: z.enum(['starting', 'prompt', 'running', 'unsupported', 'unknown', 'exited']), reason: str, cwd: nullable(str), current: nullable(command), recent: bounded(command, 16) });
const view = z.extend(shellSnapshotSchema, { id: str, title: str, alias: str, stale: z.boolean(), observedAt: z.number() });
const scope = { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope',
  codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => str } };
const invocation = (method, parameters, result) => ({ id: `dsh-ssh-remote#sshRemoteTerminalState/${method}`, service: 'sshRemoteTerminalState', namespace: 'sshRemoteTerminalState', method,
  invocation: { kind: 'direct' }, parameters: [scope, ...parameters], cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#terminalState/${method}`, create: () => result }, sourceLocation: { file: 'src/terminal-state.ts', line: 1, column: 1 } });
export const terminalStateInvocations = [invocation('list', [], bounded(view, 64)), invocation('context', [{ name: 'id', wire: 'id', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', create: () => str } }],
  z.object({ terminal: view, text: str.check(z.maxLength(65536)), truncated: z.boolean(), output: z.optional(str.check(z.maxLength(65536))) }))];
