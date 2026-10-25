import { sshInvocations } from 'dsh-ssh-remote/ssh-schema';
import type { SshRemote } from 'dsh-ssh-remote/ssh';
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { editorInvocations } from './editor-schema.js';
import { fileSearchInvocations } from './file-search-schema.js';
import { portForwardInvocations } from './port-forward-schema.js';
import { transferInvocations } from 'dsh-ssh-remote/transfer-schema';
import { terminalStateInvocations } from 'dsh-ssh-remote/terminal-state-schema';
import type { TerminalStateRemote } from 'dsh-ssh-remote/terminal-state';
import type {} from './transfer-types.js';
import { updateInvocations } from 'dsh-ssh-remote/update-schema';
import type { UpdatesRemote } from 'dsh-ssh-remote/updates';

export interface RemoteWorkspaceInfo {
  alias: string;
  remotePath: string;
  uri: string;
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    sshRemoteUpdates: UpdatesRemote;
    sshRemoteTerminalState: TerminalStateRemote;
    sshRemote: SshRemote;
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

const stringSchema = { parse(value: unknown) { if (typeof value !== 'string') throw new Error('expected string'); return value; } };
const helperStatusSchema = {
  parse(value: unknown) {
    const row = object(value, 'helper status');
    for (const key of ['status', 'version', 'sessionId', 'error']) {
      if (typeof row[key] !== 'string') throw new Error(`helper.${key} must be a string`);
    }
    object(row.capabilities, 'helper capabilities');
    for (const key of ['errorCode', 'hint']) {
      if (row[key] !== undefined && typeof row[key] !== 'string') throw new Error(`helper.${key} must be a string`);
    }
    if (row.retryable !== undefined && typeof row.retryable !== 'boolean') throw new Error('helper.retryable must be boolean');
    if (row.environment !== undefined) {
      const environment = object(row.environment, 'helper environment');
      const search = object(environment.search, 'helper search');
      if (typeof search.available !== 'boolean') throw new Error('search.available must be boolean');
      for (const key of ['path', 'version', 'error']) {
        if (search[key] !== undefined && typeof search[key] !== 'string') throw new Error(`search.${key} must be a string`);
      }
    }
    return value;
  },
};
const configSchema = {
  parse(value: unknown) {
    const config = object(value, 'SSH config');
    if (typeof config.configPath !== 'string' || typeof config.configExists !== 'boolean') throw new Error('invalid SSH config');
    if (!Array.isArray(config.hosts) || typeof config.legacyHostCount !== 'number') throw new Error('invalid SSH hosts');
    for (const item of config.hosts) {
      const host = object(item, 'SSH host');
      for (const key of ['alias', 'host', 'user', 'identityFile', 'proxyJump', 'proxyCommand']) {
        if (typeof host[key] !== 'string') throw new Error(`host.${key} must be a string`);
      }
      if (typeof host.port !== 'number') throw new Error('host.port must be a number');
      helperStatusSchema.parse(host.helper);
    }
    return value;
  },
};
const statusesSchema = {
  parse(value: unknown) {
    const statuses = object(value, 'helper statuses');
    for (const status of Object.values(statuses)) helperStatusSchema.parse(status);
    return value;
  },
};
const directoryEntrySchema = {
  parse(value: unknown) {
    const entry = object(value, 'directory entry');
    if (typeof entry.name !== 'string' || typeof entry.path !== 'string' || typeof entry.hidden !== 'boolean') {
      throw new Error('invalid directory entry');
    }
    return value;
  },
};
const directoryListingSchema = {
  parse(value: unknown) {
    const listing = object(value, 'directory listing');
    if (typeof listing.path !== 'string' || typeof listing.home !== 'string' || typeof listing.truncated !== 'boolean') {
      throw new Error('invalid directory listing');
    }
    if (!Array.isArray(listing.crumbs) || !Array.isArray(listing.entries)) throw new Error('invalid directory rows');
    listing.crumbs.forEach(directoryEntrySchema.parse);
    listing.entries.forEach(directoryEntrySchema.parse);
    return value;
  },
};
const workspaceAnchorSchema = {
  parse(value: unknown) {
    const anchor = object(value, 'workspace anchor');
    for (const key of ['anchorPath', 'uri', 'alias', 'remotePath', 'title']) {
      if (typeof anchor[key] !== 'string') throw new Error(`anchor.${key} must be a string`);
    }
    if (typeof anchor.createdAt !== 'number') throw new Error('anchor.createdAt must be a number');
    return value;
  },
};
const workspaceInfoSchema = {
  parse(value: unknown) {
    if (value === null) return value;
    const info = object(value, 'remote workspace');
    for (const key of ['alias', 'remotePath', 'uri']) {
      if (typeof info[key] !== 'string') throw new Error(`remote workspace.${key} must be a string`);
    }
    return value;
  },
};
const diagnosticsSchema = {
  parse(value: unknown) {
    helperStatusSchema.parse(value);
    const details = object(value, 'helper diagnostics');
    for (const key of ['alias', 'helperSha256', 'stderr', 'assetPath']) {
      if (typeof details[key] !== 'string') throw new Error(`diagnostics.${key} must be a string`);
    }
    for (const key of ['lastConnectedAt', 'lastHealthAt', 'nextRetryAt']) {
      if (typeof details[key] !== 'number') throw new Error(`diagnostics.${key} must be a number`);
    }
    return value;
  },
};

const migrationObject = { parse(value: unknown) { return object(value, 'migration result'); } };
const booleanSchema = { parse(value: unknown) { if (typeof value !== 'boolean') throw new Error('expected boolean'); return value; } };
const selectionsSchema = { parse(value: unknown) { if (!Array.isArray(value)) throw new Error('expected selections'); return value; } };
const updateInfoSchema = { parse(value: unknown) {
  const row = object(value, 'update information');
  for (const key of ['profileId', 'runningVersion', 'installedVersion', 'source', 'sourceKind']) stringSchema.parse(row[key]);
  booleanSchema.parse(row.enabled); return value;
} };
const releaseCheckSchema = { parse(value: unknown) {
  const row = object(value, 'release check');
  if (typeof row.checkedAt !== 'number') throw new Error('invalid check timestamp');
  stringSchema.parse(row.error);
  if (row.failure !== undefined) {
    const failure = object(row.failure, 'release diagnostic');
    if (!['network', 'timeout', 'rate-limit', 'http', 'invalid-response'].includes(String(failure.kind))
      || !['release', 'manifest'].includes(String(failure.stage))) throw new Error('invalid release diagnostic');
    if (failure.code !== undefined) stringSchema.parse(failure.code);
    if (failure.httpStatus !== undefined && !Number.isInteger(failure.httpStatus)) throw new Error('invalid release HTTP status');
  }
  if (row.latest !== null) {
    const latest = object(row.latest, 'release');
    for (const key of ['version', 'url', 'packageUrl', 'publishedAt', 'sha256']) stringSchema.parse(latest[key]);
    if (!Array.isArray(latest.testedDshVersions)) throw new Error('invalid tested versions');
    latest.testedDshVersions.forEach(stringSchema.parse);
  }
  return value;
} };
export const TYPERT_REMOTE = {
  package: 'dsh-ssh-remote',
  descriptors: [
    ...sshInvocations({ string: stringSchema, boolean: booleanSchema, selections: selectionsSchema,
      SshConfig: configSchema, HelperHostStatuses: statusesSchema, RemoteWorkspaceInfo: workspaceInfoSchema,
      RemoteDirectoryListing: directoryListingSchema, SshWorkspaceAnchor: workspaceAnchorSchema, HelperHostStatus: helperStatusSchema,
      HelperHostDiagnostics: diagnosticsSchema, MigrationPreview: migrationObject, MigrationResult: migrationObject }),
    ...editorInvocations,
    ...fileSearchInvocations,
    ...portForwardInvocations,
    ...transferInvocations,
    ...terminalStateInvocations,
    ...updateInvocations({ boolean: booleanSchema, UpdateInfo: updateInfoSchema, ReleaseCheck: releaseCheckSchema }),
  ],
} as unknown as TypertRemoteContribution;

export default TYPERT_REMOTE;
