/** An effective SSH target resolved by the local OpenSSH client. */
export interface SshConfigHost {
    /** Concrete `Host` alias from the user's SSH config. */
    host: string;
    hostName?: string;
    user?: string;
    port?: number;
    identityFile?: string;
    identityFiles?: string[];
    proxyJump?: string;
    proxyCommand?: string;
}
export interface SshGResult {
    code: number;
    stdout: string;
    stderr: string;
}
export type SshGRunner = (configPath: string, alias: string) => Promise<SshGResult>;
/** The same local OpenSSH entrypoint Codex Remote documents and discovers. */
export declare function userSshConfigPath(): string;
/**
 * Parse one SSH config document without resolving OpenSSH precedence. This is
 * intentionally useful only for discovery and tests; connection settings are
 * resolved with `ssh -G`, not with this partial parser.
 */
export declare function parseSshConfig(text: string): SshConfigHost[];
/**
 * Discover concrete aliases from `~/.ssh/config` and recursively referenced
 * `Include` files. Pattern-only Host blocks are not returned.
 */
export declare function collectSshAliases(configPath?: string): string[];
export declare function hasConcreteSshAlias(alias: string, configPath?: string): boolean;
/** Resolve one alias through the user's actual OpenSSH implementation. */
export declare function resolveOpenSshHost(alias: string, configPath?: string, runner?: SshGRunner): Promise<SshConfigHost | undefined>;
/** Discover aliases, then resolve effective HostName/User/Port/etc with `ssh -G`. */
export declare function discoverSshHosts(configPath?: string, runner?: SshGRunner): Promise<SshConfigHost[]>;
/** Parse the normalized, effective configuration emitted by `ssh -G`. */
export declare function parseOpenSshResolvedConfig(alias: string, text: string): SshConfigHost | undefined;
/** Expand common home-directory spellings emitted by OpenSSH. */
export declare function expandHome(path: string): string;
/** Compatibility helper for callers/tests that already have parsed entries. */
export declare function resolveSshAlias(alias: string, config: SshConfigHost[]): SshConfigHost | undefined;
//# sourceMappingURL=ssh-config.d.ts.map