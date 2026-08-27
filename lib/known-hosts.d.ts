/** OpenSSH host-key policy values normalized for the ssh2 verifier. */
export type StrictHostKeyPolicy = 'yes' | 'ask' | 'accept-new' | 'no';
/** Effective OpenSSH facts needed to verify an ssh2 server key. */
export interface OpenSshTrustConfig {
    hostName?: string;
    port?: number;
    user?: string;
    hostKeyAlias?: string;
    strictHostKeyChecking?: string;
    userKnownHostsFiles?: string[];
    globalKnownHostsFiles?: string[];
}
export interface SshKeygenResult {
    code: number;
    stdout: string;
    stderr: string;
}
export type SshKeygenRunner = (lookup: string, file: string) => Promise<SshKeygenResult>;
/** Parsed trust material for one effective OpenSSH destination. */
export interface OpenSshHostTrust {
    lookup: string;
    policy: StrictHostKeyPolicy;
    trustedKeys: ReadonlySet<string>;
    revokedKeys: ReadonlySet<string>;
    certificateAuthorities: number;
    files: readonly string[];
}
/**
 * Resolve the exact known_hosts entries OpenSSH uses for one target. `ssh-keygen
 * -F` performs pattern and hashed-host matching, so this code never attempts to
 * reimplement OpenSSH's hostname matcher.
 */
export declare function loadOpenSshHostTrust(config: OpenSshTrustConfig | undefined, fallbackHost: string, fallbackPort: number, runner?: SshKeygenRunner): Promise<OpenSshHostTrust>;
/** Parse `ssh-keygen -F` output into raw SSH key blobs (base64 wire keys). */
export declare function parseSshKeygenOutput(output: string): {
    trustedKeys: Set<string>;
    revokedKeys: Set<string>;
    certificateAuthorities: number;
};
/** Build the fail-closed ssh2 verifier for already trusted OpenSSH keys. */
export declare function createHostVerifier(trust: OpenSshHostTrust): (key: Buffer) => boolean;
/**
 * Unknown keys require the operator to establish trust with OpenSSH first.
 * This intentionally refuses to implement an invisible TOFU prompt in a Web
 * request; `ssh <alias>` owns confirmation and writes known_hosts atomically.
 */
export declare function assertHostTrustReady(trust: OpenSshHostTrust, alias: string): void;
export declare function normalizeStrictHostKeyChecking(value: string | undefined): StrictHostKeyPolicy;
//# sourceMappingURL=known-hosts.d.ts.map