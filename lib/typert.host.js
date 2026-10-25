import { sshInvocations } from '../shared/ssh-schema.js';
import { z } from 'zod';
import { editorInvocations } from './editor-schema.js';
import { fileSearchInvocations } from './file-search-schema.js';
import { portForwardInvocations } from './port-forward-schema.js';
import { transferInvocations } from '../shared/transfer-schema.js';
import { terminalStateInvocations } from '../shared/terminal-state-schema.js';
import { updateInvocations } from '../shared/update-schema.js';
const string = z.string();
const helperStatus = z.object({
    status: z.enum(['disconnected', 'installing', 'connecting', 'connected', 'degraded', 'reconnecting', 'error']),
    version: string,
    sessionId: string,
    capabilities: z.record(z.string(), z.unknown()),
    error: string,
    errorCode: string.optional(),
    retryable: z.boolean().optional(),
    hint: string.optional(),
    environment: z.object({ search: z.object({
            available: z.boolean(), path: string.optional(), version: string.optional(), error: string.optional(),
        }) }).optional(),
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
const workspaceInfo = z.object({ alias: string, remotePath: string, uri: string }).nullable();
const diagnostics = helperStatus.extend({
    alias: string,
    helperSha256: string,
    lastConnectedAt: z.number(),
    lastHealthAt: z.number(),
    nextRetryAt: z.number(),
    stderr: string,
    assetPath: string,
});
const selections = z.array(z.object({ name: string.max(256), alias: string.max(128) })).max(200);
const legacyHost = z.object({ name: string, alias: string, host: string, port: z.number(), user: string, identityFile: string, proxyJump: string, error: string.optional() });
const configPair = z.object({ config: string, fragment: string });
const migrationPreview = z.object({ token: string, configPath: string, fragmentPath: string, before: configPair, after: configPair, hosts: z.array(legacyHost), ready: z.boolean() });
const migrationResult = z.object({ id: string, aliases: z.record(string, string), verified: z.array(string), errors: z.record(string, string) });
const updateInfo = z.object({ profileId: string, runningVersion: string, installedVersion: string, source: string,
    sourceKind: z.enum(['release', 'development', 'unsupported']), enabled: z.boolean() });
const releaseTarget = z.object({ version: string, url: string, packageUrl: string, publishedAt: string,
    sha256: string, testedDshVersions: z.array(string) });
const releaseCheck = z.object({ checkedAt: z.number(), latest: releaseTarget.nullable(), error: string,
    failure: z.object({ kind: z.enum(['network', 'timeout', 'rate-limit', 'http', 'invalid-response']),
        stage: z.enum(['release', 'manifest']), code: string.optional(), httpStatus: z.number().optional() }).optional() });
/** Deterministic host-face descriptor discovered through package export ./typert. */
export const TYPERT = {
    package: 'dsh-ssh-remote',
    face: 'host',
    schemas: [],
    invocations: [
        ...sshInvocations({ string, boolean: z.boolean(), selections, token: string.uuid(), id: string.uuid(),
            SshConfig: config, HelperHostStatuses: z.record(string, helperStatus), RemoteWorkspaceInfo: workspaceInfo,
            RemoteDirectoryListing: directoryListing, SshWorkspaceAnchor: workspaceAnchor, HelperHostStatus: helperStatus,
            HelperHostDiagnostics: diagnostics, MigrationPreview: migrationPreview, MigrationResult: migrationResult }),
        ...editorInvocations,
        ...fileSearchInvocations,
        ...portForwardInvocations,
        ...transferInvocations,
        ...terminalStateInvocations,
        ...updateInvocations({ boolean: z.boolean(), UpdateInfo: updateInfo, ReleaseCheck: releaseCheck }),
    ],
    model: { services: [], events: [], objects: [] },
};
//# sourceMappingURL=typert.host.js.map