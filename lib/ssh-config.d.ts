/** A minimal parsed SSH config host entry. */
export interface SshConfigHost {
    host: string;
    hostName?: string;
    user?: string;
    port?: number;
    identityFile?: string;
}
/**
 * Parse a `~/.ssh/config`-style file. Only concrete `Host <alias>` blocks are
 * returned; `Host *` wildcards and `Match` blocks are ignored (mirrors Codex's
 * behavior of resolving concrete aliases only).
 */
export declare function parseSshConfig(text: string): SshConfigHost[];
/** Expand a leading `~` against the OS home directory. */
export declare function expandHome(p: string): string;
/** Read and parse `~/.ssh/config`, returning an empty list when absent. */
export declare function loadUserSshConfig(): SshConfigHost[];
/**
 * Resolve an alias (or bare hostname) against parsed SSH config entries.
 * Returns `undefined` when no entry matches; the caller then uses the input
 * directly as a hostname.
 */
export declare function resolveSshAlias(alias: string, config: SshConfigHost[]): SshConfigHost | undefined;
//# sourceMappingURL=ssh-config.d.ts.map