import { spawn } from 'node:child_process';
export declare const HELPER_REMOTE_ROOT = ".local/share/dsh-remote-helper";
export declare const HELPER_STDERR_MAX_BYTES: number;
export interface HelperAsset {
    path: string;
    content: Buffer;
    sha256: string;
    remotePath: string;
}
export interface RemoteHelperInstallerOptions {
    assetPath?: string;
    sshBinary?: string;
    spawnProcess?: typeof spawn;
    timeoutMs?: number;
    /**
     * Pre-resolved local OpenSSH capabilities. When omitted, the installer probes
     * `ssh -G` once (cached) without loading user config. Inject in tests for
     * hermetic runs.
     */
    capabilities?: SshCapabilities;
}
export interface RemoteHelperInstallResult {
    alias: string;
    sha256: string;
    remotePath: string;
}
export declare class RemoteHelperInstallError extends Error {
    readonly stderr: string;
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    constructor(message: string, details?: {
        stderr?: string;
        exitCode?: number | null;
        signal?: NodeJS.Signals | null;
    }, options?: ErrorOptions);
}
/** Locate the source asset both before and after TypeScript compilation. */
export declare function resolveHelperAssetPath(assetPath?: string): string;
export declare function loadHelperAsset(assetPath?: string): HelperAsset;
export declare function helperRemotePath(sha256: string): string;
export declare function buildHelperConnectCommand(sha256: string): string;
/**
 * Local OpenSSH transport options. RemoteCommand is present in 8.2;
 * SessionType and StdinNull appear in 8.7. Probe the actual binary since
 * vendors may backport features independently of the version banner.
 */
export interface SshCapabilities {
    readonly sessionTypeSupported: boolean;
}
/** Conservative default: assume a modern client (the original hard-coded behaviour). */
export declare const MODERN_SSH_CAPABILITIES: SshCapabilities;
/** Probe supported transport options without connecting to a host. */
export declare function detectSshCapabilities(sshBinary?: string, probeOptions?: (binary: string) => Promise<boolean>): Promise<SshCapabilities>;
/** Test-only: clear the cached capability probe between isolated runs. */
export declare function resetSshCapabilityCache(): void;
export declare function buildSystemSshArgs(alias: string, remoteCommand: string, capabilities?: SshCapabilities): string[];
/**
 * Redact credential-shaped diagnostics before retaining or publishing them.
 * This is deliberately conservative: diagnostics are for classification, not
 * a byte-perfect copy of a user's SSH environment.
 */
export declare function redactHelperDiagnostic(value: string): string;
export declare class RemoteHelperInstaller {
    readonly asset: HelperAsset;
    private readonly sshBinary;
    private readonly spawnProcess;
    private readonly timeoutMs;
    private readonly capabilities?;
    constructor(options?: RemoteHelperInstallerOptions);
    install(alias: string, signal?: AbortSignal): Promise<RemoteHelperInstallResult>;
}
export declare function assertSshAlias(alias: string): void;
//# sourceMappingURL=installer.d.ts.map