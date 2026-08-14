/* Typert remote-client descriptors for dsh-ssh-remote.
 *
 * The browser only reads aliases discovered by the host from ~/.ssh/config.
 * It cannot write connection credentials or duplicate OpenSSH configuration.
 */

function parseObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected an object');
  }
  return value;
}

const discoveredHostSchema = {
  parse(value) {
    parseObject(value);
    for (const key of ['alias', 'host', 'user', 'identityFile', 'proxyJump', 'proxyCommand']) {
      if (typeof value[key] !== 'string') throw new Error(`host.${key} must be a string`);
    }
    if (typeof value.port !== 'number') throw new Error('host.port must be a number');
    return value;
  },
};

const configSchema = {
  parse(value) {
    parseObject(value);
    if (typeof value.configPath !== 'string') throw new Error('configPath must be a string');
    if (typeof value.configExists !== 'boolean') throw new Error('configExists must be a boolean');
    if (!Array.isArray(value.hosts)) throw new Error('hosts must be an array');
    for (const host of value.hosts) discoveredHostSchema.parse(host);
    if (typeof value.legacyHostCount !== 'number') throw new Error('legacyHostCount must be a number');
    return value;
  },
};

const stringSchema = {
  parse(value) {
    if (typeof value !== 'string') throw new Error('expected a string');
    return value;
  },
};

const directoryEntrySchema = {
  parse(value) {
    parseObject(value);
    if (typeof value.name !== 'string' || typeof value.path !== 'string' || typeof value.hidden !== 'boolean') {
      throw new Error('invalid remote directory entry');
    }
    return value;
  },
};

const directoryListingSchema = {
  parse(value) {
    parseObject(value);
    if (typeof value.path !== 'string' || typeof value.home !== 'string' || typeof value.truncated !== 'boolean') {
      throw new Error('invalid remote directory listing');
    }
    if (!Array.isArray(value.crumbs) || !Array.isArray(value.entries)) {
      throw new Error('remote directory listing rows must be arrays');
    }
    value.crumbs.forEach((entry) => directoryEntrySchema.parse(entry));
    value.entries.forEach((entry) => directoryEntrySchema.parse(entry));
    return value;
  },
};

const workspaceAnchorSchema = {
  parse(value) {
    parseObject(value);
    for (const key of ['anchorPath', 'uri', 'alias', 'remotePath', 'title']) {
      if (typeof value[key] !== 'string') throw new Error(`anchor.${key} must be a string`);
    }
    if (typeof value.createdAt !== 'number') throw new Error('anchor.createdAt must be a number');
    return value;
  },
};

function parameter(name, schema) {
  return {
    name,
    wire: name,
    source: 'json',
    codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#${name}`, schema },
  };
}

export const TYPERT_REMOTE = {
  package: 'dsh-ssh-remote',
  descriptors: [
    {
      id: 'dsh-ssh-remote#sshRemote/config',
      service: 'sshRemote',
      namespace: 'sshRemote',
      method: 'config',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-remote#SshConfig',
        schema: configSchema,
      },
      sourceLocation: { file: 'src/registry.ts', line: 132, column: 3 },
    },
    {
      id: 'dsh-ssh-remote#sshRemote/browse',
      service: 'sshRemote',
      namespace: 'sshRemote',
      method: 'browse',
      invocation: { kind: 'direct' },
      parameters: [parameter('alias', stringSchema), parameter('path', stringSchema)],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-remote#RemoteDirectoryListing',
        schema: directoryListingSchema,
      },
      sourceLocation: { file: 'src/registry.ts', line: 175, column: 3 },
    },
    {
      id: 'dsh-ssh-remote#sshRemote/createDirectory',
      service: 'sshRemote',
      namespace: 'sshRemote',
      method: 'createDirectory',
      invocation: { kind: 'direct' },
      parameters: [
        parameter('alias', stringSchema),
        parameter('parent', stringSchema),
        parameter('name', stringSchema),
      ],
      result: { mode: 'strict', typeSymbol: 'string', schema: stringSchema },
      sourceLocation: { file: 'src/registry.ts', line: 219, column: 3 },
    },
    {
      id: 'dsh-ssh-remote#sshRemote/materializeWorkspace',
      service: 'sshRemote',
      namespace: 'sshRemote',
      method: 'materializeWorkspace',
      invocation: { kind: 'direct' },
      parameters: [parameter('alias', stringSchema), parameter('remotePath', stringSchema)],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-remote#SshWorkspaceAnchor',
        schema: workspaceAnchorSchema,
      },
      sourceLocation: { file: 'src/registry.ts', line: 244, column: 3 },
    },
  ],
};

export default TYPERT_REMOTE;
