/** Shared wire identity, with independent Host/client validation. No validation runtime is bundled. */
export function sshInvocations(schemas) {
  const methods = [
    ['config', [], 'SshConfig'], ['statuses', [], 'HelperHostStatuses'],
    ['workspaceInfo', ['path'], 'RemoteWorkspaceInfo'], ['browse', ['alias', 'path'], 'RemoteDirectoryListing'],
    ['createDirectory', ['alias', 'parent', 'name'], 'string'],
    ['materializeWorkspace', ['alias', 'remotePath'], 'SshWorkspaceAnchor'],
    ['connectHost', ['alias'], 'HelperHostStatus'], ['disconnectHost', ['alias'], 'HelperHostStatus'],
    ['retryHost', ['alias'], 'HelperHostStatus'], ['diagnostics', ['alias'], 'HelperHostDiagnostics'],
    ['migrationPreview', ['selections'], 'MigrationPreview'], ['migrationApply', ['token'], 'MigrationResult'],
    ['migrationRollback', ['id'], 'boolean'],
  ];
  return methods.map(([method, parameters, result]) => ({
    id: `dsh-ssh-remote#sshRemote/${method}`, service: 'sshRemote', namespace: 'sshRemote', method,
    invocation: { kind: 'direct' }, parameters: parameters.map(name => ({ name, wire: name, source: 'json',
      codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#${name}`, create: () => schemas[name] ?? schemas.string } })),
    result: { mode: 'strict', typeSymbol: result === 'string' || result === 'boolean' ? result : `dsh-ssh-remote#${result}`, create: () => schemas[result] },
    sourceLocation: { file: 'src/registry.ts', line: 1, column: 1 },
  }));
}
