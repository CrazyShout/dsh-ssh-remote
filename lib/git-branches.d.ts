import type { BranchListing, BranchMutation } from '../shared/branch-switch.js';
/** Complete output of one Git command that exited with an allowed code. */
export interface GitOutput {
    stdout: string;
    stderr: string;
    exitCode: number;
}
/** Runs one Git subcommand with optional command-local configuration. */
export type GitRunner = (name: string, args: readonly string[], allowedExitCodes?: readonly number[], configOverrides?: Readonly<Record<string, string>>, timeoutMs?: number) => Promise<GitOutput>;
/** Stable branch operation failure shown by the Client. */
export declare class GitBranchError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: ErrorOptions);
}
/** Redact credentials that a remote URL may echo in a Git diagnostic. */
export declare function redactGitText(value: string): string;
/** Build the browser payload from the current branch and Git ref names. */
export declare function branchPayload(current: string | null, commit: string | null, localRefs: readonly string[], remoteRefs: readonly string[], limit?: number): Omit<BranchListing, 'fetched' | 'warning'>;
/**
 * Search local branches first. When no local branch matches, ask the preferred
 * remote and fetch only matching heads into remote-tracking namespaces.
 */
export declare function searchBranches(git: GitRunner, { query, fetchMissing, includeRemote, limit }?: {
    query?: string;
    fetchMissing?: boolean;
    includeRemote?: boolean;
    limit?: number;
}): Promise<BranchListing>;
/** Switch to one verified local branch, or create a local tracking branch from a remote ref. */
export declare function switchBranch(git: GitRunner, ref: string): Promise<BranchMutation>;
/** Create a new local branch from HEAD and switch to it. */
export declare function createBranch(git: GitRunner, name: string): Promise<BranchMutation>;
//# sourceMappingURL=git-branches.d.ts.map