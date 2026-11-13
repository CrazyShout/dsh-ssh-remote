/**
 * Workspace titles derived from a remote path. The first candidate matches the
 * compact title used by the SSH anchor; each later candidate adds one more
 * parent directory so equal basenames under different parents remain usable.
 */
export function remoteWorkspaceTitleCandidates(remotePath: string, host: string): string[] {
  const components = remotePath.split('/').filter(component => component.length > 0);
  const labels = components.length === 0 ? ['root'] : components;
  return labels.map((_, index) =>
    `${labels.slice(-(index + 1)).join(' · ')} · ${host}`);
}

/**
 * Recognize the rename name-conflict through the current Workspace client
 * error, while also accepting a structured RPC code when one is available.
 */
export function isWorkspaceNameConflict(reason: unknown): boolean {
  if (typeof reason === 'object' && reason !== null) {
    const code = (reason as { rpcError?: { code?: unknown } }).rpcError?.code;
    if (code === 'workspace/name-conflict') return true;
  }
  return reason instanceof Error
    && reason.message.startsWith('workspace rename failed: workspace/name-conflict:');
}
