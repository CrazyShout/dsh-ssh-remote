/* Typert remote-client descriptors for dsh-ssh-remote.
 *
 * NOTE: zod is deliberately NOT imported here. The CLIENT-side typert registry
 * only requires each strict codec's schema to expose a `parse()` function; the
 * `_zod` marker is required only by the HOST-side typert-loader, which reads
 * lib/typert.host.js (not bundled into the browser). Keeping zod out of this
 * file keeps the client bundle small (~KBs instead of ~500KB).
 */

function parseObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected an object');
  }
  return value;
}

const hostEntrySchema = {
  parse(value) {
    parseObject(value);
    return value;
  },
};

const configSchema = {
  parse(value) {
    parseObject(value);
    if (!Array.isArray(value.hosts)) throw new Error('hosts must be an array');
    for (const host of value.hosts) hostEntrySchema.parse(host);
    return value;
  },
};

const okResultSchema = {
  parse(value) {
    parseObject(value);
    if (typeof value.ok !== 'boolean') throw new Error('ok must be a boolean');
    return value;
  },
};

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
            schema: configSchema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-remote#SaveConfigResult',
        schema: okResultSchema,
      },
      sourceLocation: { file: 'src/registry.ts', line: 106, column: 3 },
    },
  ],
};

export default TYPERT_REMOTE;
