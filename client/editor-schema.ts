import type { EditorRemote } from './editor-types.js';
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap { sshRemoteEditor: EditorRemote }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid editor object');
  return value as Record<string, unknown>;
}
const string = { parse(value: unknown) { if (typeof value !== 'string') throw new Error('expected string'); return value; } };
const save = { parse(value: unknown) {
  const row = object(value);
  for (const key of ['rootUri', 'path', 'version', 'text', 'operationId']) string.parse(row[key]);
  if (typeof row.bom !== 'boolean' || !['lf', 'crlf'].includes(String(row.newline))) throw new Error('invalid editor encoding');
  return value;
} };
const document = { parse(value: unknown) {
  const row = object(value); save.parse({ ...row, operationId: '' });
  for (const key of ['sessionId', 'alias']) string.parse(row[key]);
  if (typeof row.maxBytes !== 'number' || row.maxBytes <= 0) throw new Error('invalid editor limit');
  return value;
} };
const result = { parse(value: unknown) {
  const row = object(value);
  if (!['pending', 'saved', 'conflict', 'failed', 'unknown'].includes(String(row.state))) throw new Error('invalid editor state');
  for (const key of ['version', 'message']) if (row[key] !== undefined) string.parse(row[key]);
  if (row.state === 'saved') string.parse(row.version);
  return value;
} };
const parameter = (name: string, schema: { parse(value: unknown): unknown } = string) => ({ name, wire: name, source: 'json',
  codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#editor/${name}`, create: () => schema } });
const scope = { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope',
  codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => string } };
function invocation(method: string, parameters: unknown[], schema: { parse(value: unknown): unknown }, cancellable = true) {
  return { id: `dsh-ssh-remote#sshRemoteEditor/${method}`, service: 'sshRemoteEditor', namespace: 'sshRemoteEditor', method,
    invocation: { kind: 'direct' }, parameters: [scope, ...parameters],
    ...(cancellable ? { cancellation: { parameter: 'signal' } } : {}),
    result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#editor/${method}Result`, create: () => schema },
    sourceLocation: { file: 'src/editor.ts', line: 1, column: 1 } };
}
export const editorInvocations = [
  invocation('read', [parameter('path')], document),
  invocation('save', [parameter('request', save)], result, false),
  invocation('status', [parameter('operationId')], result),
];
