import type { PortForwardRemote } from './port-forward-types.js';
declare module '@deepseek-ai/dsh-typert-protocol' { interface TypertRemoteNamespaceMap { sshRemotePorts: PortForwardRemote } }
const string = { parse(value: unknown) { if (typeof value !== 'string') throw new Error('expected string'); return value; } };
const identity = { parse(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/u.test(value)) throw new Error('invalid forwarding identity');
  return value;
} };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid port forwarding object');
  return value as Record<string, unknown>;
}
function parsePorts(value: unknown, tombstone: boolean) {
  const row = object(value); identity.parse(row.id);
  if (!['http', 'https'].includes(String(row.protocol))) throw new Error('invalid forwarding protocol');
  for (const key of ['localPort', 'remotePort']) if (!Number.isInteger(row[key]) || Number(row[key]) < (tombstone ? 0 : key === 'localPort' ? 1024 : 1) || Number(row[key]) > 65535) throw new Error('invalid port');
  return value;
}
const input = { parse: (value: unknown) => parsePorts(value, false) };
const view = { parse(value: unknown) {
  parsePorts(value, true); const row = object(value);
  string.parse(row.alias); string.parse(row.error);
  if (!['starting', 'listening', 'stopping', 'stopped', 'error'].includes(String(row.state)) || typeof row.createdAt !== 'number' || typeof row.canRetry !== 'boolean') throw new Error('invalid forward state');
  const probe = object(row.probe); string.parse(probe.message);
  if (!['reachable', 'unreachable', 'unknown'].includes(String(probe.state))) throw new Error('invalid probe');
  return value;
} };
const list = { parse(value: unknown) {
  const row = object(value); string.parse(row.host); string.parse(row.alias);
  if (typeof row.supported !== 'boolean' || !Array.isArray(row.items) || row.items.length > 32) throw new Error('invalid forward list');
  for (const item of row.items) view.parse(item); return value;
} };
const scope = { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope',
  codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => string } };
const parameter = (name: string, schema: { parse(value: unknown): unknown }) => ({ name, wire: name, source: 'json',
  codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#ports/${name}`, create: () => schema } });
function invocation(method: string, parameters: unknown[], schema: { parse(value: unknown): unknown }, cancel = false) {
  return { id: `dsh-ssh-remote#sshRemotePorts/${method}`, service: 'sshRemotePorts', namespace: 'sshRemotePorts', method,
    invocation: { kind: 'direct' }, parameters: [scope, ...parameters], ...(cancel ? { cancellation: { parameter: 'signal' } } : {}),
    result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#ports/${method}Result`, create: () => schema },
    sourceLocation: { file: 'src/port-forwards.ts', line: 1, column: 1 } };
}
export const portForwardInvocations = [invocation('list', [], list, true),
  invocation('create', [parameter('input', input)], view), invocation('stop', [parameter('id', identity)], view), invocation('probe', [parameter('id', identity)], view)];
