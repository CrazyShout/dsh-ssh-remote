import { z } from 'zod';
const status = z.object({ generation: z.number(), state: z.enum(['idle', 'building', 'ready', 'partial', 'error']),
    stale: z.boolean(), complete: z.boolean(), count: z.number(), pathBytes: z.number(), unsupported: z.number(), message: z.string() });
const result = status.extend({ sessionId: z.string(), rootUri: z.string(),
    candidates: z.array(z.object({ path: z.string(), kind: z.enum(['file', 'directory']) })).max(50) });
const parameter = (name, schema) => ({ name, wire: name, source: 'json',
    codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#file-search/${name}`, create: () => schema } });
const scope = { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope',
    codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => z.string() } };
function invocation(method, parameters, schema) {
    return { id: `dsh-ssh-remote#sshRemoteFiles/${method}`, service: 'sshRemoteFiles', namespace: 'sshRemoteFiles', method,
        invocation: { kind: 'direct' }, parameters: [scope, ...parameters], cancellation: { parameter: 'signal' },
        result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#file-search/${method}Result`, create: () => schema },
        sourceLocation: { file: 'src/file-search.ts', line: 1, column: 1 } };
}
export const fileSearchInvocations = [
    invocation('preview', [parameter('path', z.string().max(4096))], z.object({ sessionId: z.string(), path: z.string() })),
    invocation('query', [parameter('query', z.string().max(4096)), parameter('includeIgnored', z.boolean())], result),
    invocation('status', [parameter('includeIgnored', z.boolean())], status),
    invocation('refresh', [parameter('includeIgnored', z.boolean())], status),
];
//# sourceMappingURL=file-search-schema.js.map