import { z } from 'zod';
const identity = z.string().regex(/^[a-zA-Z0-9-]{16,80}$/u);
const input = z.object({ id: identity, localPort: z.number().int().min(1024).max(65535),
    remotePort: z.number().int().min(1).max(65535), protocol: z.enum(['http', 'https']) });
const view = input.extend({ alias: z.string(), state: z.enum(['starting', 'listening', 'stopping', 'stopped', 'error']),
    probe: z.object({ state: z.enum(['reachable', 'unreachable', 'unknown']), message: z.string() }), error: z.string(), createdAt: z.number(), canRetry: z.boolean() });
// Stop-before-create tombstones intentionally do not have allocated ports.
const stopped = view.extend({ localPort: z.number().int().min(0).max(65535), remotePort: z.number().int().min(0).max(65535) });
const scope = { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope',
    codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => z.string() } };
const parameter = (name, schema) => ({ name, wire: name, source: 'json',
    codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#ports/${name}`, create: () => schema } });
function invocation(method, parameters, schema, cancel = false) {
    return { id: `dsh-ssh-remote#sshRemotePorts/${method}`, service: 'sshRemotePorts', namespace: 'sshRemotePorts', method,
        invocation: { kind: 'direct' }, parameters: [scope, ...parameters], ...(cancel ? { cancellation: { parameter: 'signal' } } : {}),
        result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#ports/${method}Result`, create: () => schema },
        sourceLocation: { file: 'src/port-forwards.ts', line: 1, column: 1 } };
}
export const portForwardInvocations = [
    invocation('list', [], z.object({ host: z.string(), alias: z.string(), supported: z.boolean(), items: z.array(view).max(32) }), true),
    invocation('create', [parameter('input', input)], view),
    invocation('stop', [parameter('id', identity)], stopped),
    invocation('probe', [parameter('id', identity)], view),
];
//# sourceMappingURL=port-forward-schema.js.map