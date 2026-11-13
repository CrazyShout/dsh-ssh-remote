/**
 * Workspace titles derived from a remote path. The first candidate matches the
 * compact title used by the SSH anchor; each later candidate adds one more
 * parent directory so equal basenames under different parents remain usable.
 */
export declare function remoteWorkspaceTitleCandidates(remotePath: string, host: string): string[];
/**
 * Recognize the rename name-conflict through the current Workspace client
 * error, while also accepting a structured RPC code when one is available.
 */
export declare function isWorkspaceNameConflict(reason: unknown): boolean;
//# sourceMappingURL=workspace-title.d.ts.map