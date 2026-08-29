import { z } from 'zod';
const string = z.string();
const helperStatus = z.object({
    status: z.enum(['disconnected', 'installing', 'connecting', 'connected', 'degraded', 'reconnecting', 'error']),
    version: string,
    sessionId: string,
    capabilities: z.record(z.string(), z.unknown()),
    error: string,
});
const host = z.object({
    alias: string,
    host: string,
    port: z.number(),
    user: string,
    identityFile: string,
    proxyJump: string,
    proxyCommand: string,
    helper: helperStatus,
});
const config = z.object({
    configPath: string,
    configExists: z.boolean(),
    hosts: z.array(host),
    legacyHostCount: z.number(),
});
const directoryEntry = z.object({ name: string, path: string, hidden: z.boolean() });
const directoryListing = z.object({
    path: string,
    home: string,
    crumbs: z.array(directoryEntry),
    entries: z.array(directoryEntry),
    truncated: z.boolean(),
});
const workspaceAnchor = z.object({
    anchorPath: string,
    uri: string,
    alias: string,
    remotePath: string,
    title: string,
    createdAt: z.number(),
});
const diagnostics = helperStatus.extend({
    alias: string,
    helperSha256: string,
    lastConnectedAt: z.number(),
    lastHealthAt: z.number(),
    nextRetryAt: z.number(),
    stderr: string,
    assetPath: string,
});
function parameter(name) {
    return {
        name,
        wire: name,
        source: 'json',
        codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#${name}`, schema: string },
    };
}
function invocation(method, parameters, schema, typeSymbol) {
    return {
        id: `dsh-ssh-remote#sshRemote/${method}`,
        service: 'sshRemote',
        namespace: 'sshRemote',
        method,
        invocation: { kind: 'direct' },
        parameters,
        result: { mode: 'strict', typeSymbol, schema },
        sourceLocation: { file: 'src/registry.ts', line: 1, column: 1 },
    };
}
/** Deterministic host-face descriptor discovered through package export ./typert. */
export const TYPERT = {
    package: 'dsh-ssh-remote',
    face: 'host',
    schemas: [],
    invocations: [
        invocation('config', [], config, 'dsh-ssh-remote#SshConfig'),
        invocation('statuses', [], z.record(z.string(), helperStatus), 'dsh-ssh-remote#HelperHostStatuses'),
        invocation('browse', [parameter('alias'), parameter('path')], directoryListing, 'dsh-ssh-remote#RemoteDirectoryListing'),
        invocation('createDirectory', [parameter('alias'), parameter('parent'), parameter('name')], string, 'string'),
        invocation('materializeWorkspace', [parameter('alias'), parameter('remotePath')], workspaceAnchor, 'dsh-ssh-remote#SshWorkspaceAnchor'),
        invocation('connectHost', [parameter('alias')], helperStatus, 'dsh-ssh-remote#HelperHostStatus'),
        invocation('disconnectHost', [parameter('alias')], helperStatus, 'dsh-ssh-remote#HelperHostStatus'),
        invocation('retryHost', [parameter('alias')], helperStatus, 'dsh-ssh-remote#HelperHostStatus'),
        invocation('diagnostics', [parameter('alias')], diagnostics, 'dsh-ssh-remote#HelperHostDiagnostics'),
    ],
    model: { services: [], events: [], objects: [] },
};
//# sourceMappingURL=typert.host.js.map