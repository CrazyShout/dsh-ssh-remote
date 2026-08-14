/* Typert host manifest for dsh-ssh-remote (format matches @deepseek-ai/dsh-typert-generator output). */
import { z } from 'zod';

const _ssh_host_entry$schema = z.object({
  name: z.string().readonly(),
  host: z.string().readonly(),
  port: z.number().readonly(),
  user: z.string().readonly(),
  identityFile: z.string().readonly(),
  proxyJump: z.string().readonly(),
}).readonly();

// config result: { hosts }
const _sshRemote_config_result$schema = z.object({
  hosts: z.array(_ssh_host_entry$schema).readonly(),
}).readonly();

// saveConfig request: { hosts } (structurally the same as the config result,
// but a dedicated parameter schema as the generator would emit)
const _sshRemote_saveConfig_parameter_0$schema = z.object({
  hosts: z.array(_ssh_host_entry$schema).readonly(),
}).readonly();

// saveConfig result: { ok }
const _sshRemote_saveConfig_result$schema = z.object({
  ok: z.boolean().readonly(),
}).readonly();

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
      sourceLocation: { file: 'src/registry.ts', line: 100, column: 3 },
    },
    {
      id: 'dsh-ssh-remote#sshRemote/saveConfig',
      service: 'sshRemote',
      namespace: 'sshRemote',
      method: 'saveConfig',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-ssh-remote#SaveConfigRequest',
            schema: _sshRemote_saveConfig_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-remote#SaveConfigResult',
        schema: _sshRemote_saveConfig_result$schema,
      },
      sourceLocation: { file: 'src/registry.ts', line: 106, column: 3 },
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
};
