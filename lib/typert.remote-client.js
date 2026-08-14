/* Typert remote-client descriptors for dsh-ssh-remote.
 *
 * Validation split (deliberate):
 * - CLIENT-side (this file): lightweight shape checks on each strict codec's
 *   schema.parse() — enough to catch an obviously malformed request/response
 *   early (e.g. a form bug sending a missing field). The client typert registry
 *   only requires schema.parse() to be a function; it does NOT require zod.
 * - HOST-side (authoritative): `saveConfig` routes through ctx.settings.update,
 *   which validates the resolved candidate against the schemastery
 *   `SshRemoteSettingsSchema` (name/host strings, port number, etc.) and
 *   REJECTS before persisting. So structural guarantees come from the host.
 *
 * zod is deliberately not imported here: the `_zod` marker is required only by
 * the HOST-side typert-loader (lib/typert.host.js), which is not bundled into
 * the browser. Keeping zod out keeps the client bundle small (~KBs vs ~500KB).
 */

function parseObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected an object');
  }
  return value;
}

function isStr(v) {
  return typeof v === 'string';
}

function isNum(v) {
  return typeof v === 'number';
}

// Optionality matches the host schemastery schema: `name` and `host` are
// required; `port`/`user`/`identityFile`/`proxyJump` carry defaults (22 / '' /
// '' / '') and may be omitted from a saveConfig request.
const hostEntrySchema = {
  parse(value) {
    parseObject(value);
    if (!isStr(value.name)) throw new Error('host.name must be a string');
    if (!isStr(value.host)) throw new Error('host.host must be a string');
    if (value.port !== undefined && !isNum(value.port)) throw new Error('host.port must be a number');
    if (value.user !== undefined && !isStr(value.user)) throw new Error('host.user must be a string');
    if (value.identityFile !== undefined && !isStr(value.identityFile)) throw new Error('host.identityFile must be a string');
    if (value.proxyJump !== undefined && !isStr(value.proxyJump)) throw new Error('host.proxyJump must be a string');
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
