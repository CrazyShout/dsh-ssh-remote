import { z } from 'zod';

const text = z.string().max(256 * 1024);
const save = z.object({ rootUri: z.string().max(8192), path: z.string().max(4096), version: z.string().max(8192),
  text, bom: z.boolean(), newline: z.enum(['lf', 'crlf']), operationId: z.string().max(80) });
const document = save.omit({ operationId: true }).extend({ sessionId: z.string(), alias: z.string(), maxBytes: z.number() });
const result = z.object({ state: z.enum(['pending', 'saved', 'conflict', 'failed', 'unknown']),
  version: z.string().optional(), message: z.string().optional() });
const parameter = (name: string, schema: z.ZodType = z.string()) => ({ name, wire: name, source: 'json',
  codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#editor/${name}`, create: () => schema } });
const scope = { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope',
  codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => z.string() } };
function invocation(method: string, parameters: unknown[], schema: z.ZodType, cancellable = true) {
  return { id: `dsh-ssh-remote#sshRemoteEditor/${method}`, service: 'sshRemoteEditor', namespace: 'sshRemoteEditor', method,
    invocation: { kind: 'direct' }, parameters: [scope, ...parameters],
    ...(cancellable ? { cancellation: { parameter: 'signal' } } : {}),
    result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#editor/${method}Result`, create: () => schema },
    sourceLocation: { file: 'src/editor.ts', line: 1, column: 1 } };
}
export const editorInvocations = [
  invocation('read', [parameter('path', z.string().max(4096))], document),
  invocation('save', [parameter('request', save)], result, false),
  invocation('status', [parameter('operationId', z.string().max(80))], result),
];
