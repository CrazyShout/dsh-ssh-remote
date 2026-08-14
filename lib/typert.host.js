/* Typert host manifest for dsh-ssh-remote. */
import { z } from 'zod';

const _discovered_ssh_host$schema = z.object({
  alias: z.string().readonly(),
  host: z.string().readonly(),
  port: z.number().readonly(),
  user: z.string().readonly(),
  identityFile: z.string().readonly(),
  proxyJump: z.string().readonly(),
  proxyCommand: z.string().readonly(),
}).readonly();

const _sshRemote_config_result$schema = z.object({
  configPath: z.string().readonly(),
  configExists: z.boolean().readonly(),
  hosts: z.array(_discovered_ssh_host$schema).readonly(),
  legacyHostCount: z.number().readonly(),
}).readonly();

const _string$schema = z.string();
const _remote_directory_entry$schema = z.object({
  name: z.string().readonly(),
  path: z.string().readonly(),
  hidden: z.boolean().readonly(),
}).readonly();
const _sshRemote_browse_result$schema = z.object({
  path: z.string().readonly(),
  home: z.string().readonly(),
  crumbs: z.array(_remote_directory_entry$schema).readonly(),
  entries: z.array(_remote_directory_entry$schema).readonly(),
  truncated: z.boolean().readonly(),
}).readonly();
const _ssh_workspace_anchor$schema = z.object({
  anchorPath: z.string().readonly(),
  uri: z.string().readonly(),
  alias: z.string().readonly(),
  remotePath: z.string().readonly(),
  title: z.string().readonly(),
  createdAt: z.number().readonly(),
}).readonly();

function parameter(name, schema) {
  return {
    name,
    wire: name,
    source: 'json',
    codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#${name}`, schema },
  };
}

export const TYPERT = {
  package: 'dsh-ssh-remote',
  face: 'host',
  schemas: [],
  invocations: [
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
        schema: _sshRemote_config_result$schema,
      },
      sourceLocation: { file: 'src/registry.ts', line: 132, column: 3 },
    },
    {
      id: 'dsh-ssh-remote#sshRemote/browse',
      service: 'sshRemote',
      namespace: 'sshRemote',
      method: 'browse',
      invocation: { kind: 'direct' },
      parameters: [parameter('alias', _string$schema), parameter('path', _string$schema)],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-remote#RemoteDirectoryListing',
        schema: _sshRemote_browse_result$schema,
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
        parameter('alias', _string$schema),
        parameter('parent', _string$schema),
        parameter('name', _string$schema),
      ],
      result: { mode: 'strict', typeSymbol: 'string', schema: _string$schema },
      sourceLocation: { file: 'src/registry.ts', line: 219, column: 3 },
    },
    {
      id: 'dsh-ssh-remote#sshRemote/materializeWorkspace',
      service: 'sshRemote',
      namespace: 'sshRemote',
      method: 'materializeWorkspace',
      invocation: { kind: 'direct' },
      parameters: [parameter('alias', _string$schema), parameter('remotePath', _string$schema)],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-remote#SshWorkspaceAnchor',
        schema: _ssh_workspace_anchor$schema,
      },
      sourceLocation: { file: 'src/registry.ts', line: 244, column: 3 },
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
};
