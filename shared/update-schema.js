/** Read-only authenticated management facade. Installation belongs to DSH's pluginManager. */
export function updateInvocations(schemas) {
  return [['info', [], 'UpdateInfo'], ['check', ['force'], 'ReleaseCheck']].map(([method, parameters, result]) => ({
    id: `dsh-ssh-remote#sshRemoteUpdates/${method}`, service: 'sshRemoteUpdates', namespace: 'sshRemoteUpdates', method,
    invocation: { kind: 'direct' },
    parameters: parameters.map(name => ({ name, wire: name, source: 'json',
      codec: { mode: 'strict', typeSymbol: 'boolean', create: () => schemas.boolean } })),
    result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#${result}`, create: () => schemas[result] },
    sourceLocation: { file: 'src/updates.ts', line: 1, column: 1 },
  }));
}
