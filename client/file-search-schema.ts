import type { FileSearchRemote } from './file-search-types.js';
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap { sshRemoteFiles: FileSearchRemote }
}
const string = { parse(value: unknown) { if (typeof value !== 'string') throw new Error('expected string'); return value; } };
const bool = { parse(value: unknown) { if (typeof value !== 'boolean') throw new Error('expected boolean'); return value; } };
const status = { parse(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('invalid index status');
  const row = value as Record<string, unknown>;
  if (!['idle', 'building', 'ready', 'partial', 'error'].includes(String(row.state))) throw new Error('invalid index state');
  for (const key of ['generation', 'count', 'pathBytes', 'unsupported']) if (typeof row[key] !== 'number' || !Number.isSafeInteger(row[key]) || Number(row[key]) < 0) throw new Error('invalid index number');
  bool.parse(row.stale); bool.parse(row.complete); string.parse(row.message); return value;
} };
const result = { parse(value: unknown) {
  status.parse(value); const row = value as Record<string, unknown>;
  string.parse(row.sessionId); string.parse(row.rootUri);
  if (!Array.isArray(row.candidates) || row.candidates.length > 50) throw new Error('invalid file candidates');
  for (const item of row.candidates) { string.parse(item.path); if (!['file', 'directory'].includes(item.kind)) throw new Error('invalid candidate kind'); }
  return value;
} };
const parameter = (name: string, schema: { parse(value: unknown): unknown }) => ({ name, wire: name, source: 'json',
  codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#file-search/${name}`, create: () => schema } });
const scope = { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope',
  codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => string } };
function invocation(method: string, parameters: unknown[], schema: { parse(value: unknown): unknown }) {
  return { id: `dsh-ssh-remote#sshRemoteFiles/${method}`, service: 'sshRemoteFiles', namespace: 'sshRemoteFiles', method,
    invocation: { kind: 'direct' }, parameters: [scope, ...parameters], cancellation: { parameter: 'signal' },
    result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#file-search/${method}Result`, create: () => schema },
    sourceLocation: { file: 'src/file-search.ts', line: 1, column: 1 } };
}
export const fileSearchInvocations = [
  invocation('query', [parameter('query', string), parameter('includeIgnored', bool)], result),
  invocation('status', [parameter('includeIgnored', bool)], status),
  invocation('refresh', [parameter('includeIgnored', bool)], status),
];
