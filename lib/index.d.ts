import { Context } from '@deepseek-ai/cordis';
export type { DiscoveredSshHost, HelperHostDiagnostics, HelperHostStatus, HelperHostStatuses, RemoteDirectoryEntry, RemoteDirectoryListing, SshConfig, SshHostEntry, SshWorkspaceAnchor, } from './registry.js';
export { LegacySsh2RemoteTerminalBackend, Ssh2RemoteTerminalBackend } from './terminal.js';
export declare const name = "dsh-ssh-remote";
export declare const inject: string[];
export declare function apply(ctx: Context): () => Promise<void>;
//# sourceMappingURL=index.d.ts.map