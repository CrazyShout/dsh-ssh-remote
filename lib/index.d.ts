import { Context } from '@deepseek-ai/cordis';
import { type LegacySshConfig } from './registry.js';
export type { DiscoveredSshHost, HelperHostDiagnostics, HelperHostStatus, HelperHostStatuses, RemoteDirectoryEntry, RemoteDirectoryListing, SshConfig, SshHostEntry, SshWorkspaceAnchor, } from './registry.js';
export { LegacySsh2RemoteTerminalBackend, Ssh2RemoteTerminalBackend } from './terminal.js';
export declare const name = "dsh-ssh-remote";
export declare const inject: string[];
/** Legacy SSH host fallback consumed through the standard Cordis Config. */
export declare const Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
    hosts: import("@deepseek-ai/schemastery").default<({
        name?: string | null | undefined;
        host?: string | null | undefined;
        port?: number | null | undefined;
        user?: string | null | undefined;
        identityFile?: string | null | undefined;
        proxyJump?: string | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        name: import("@deepseek-ai/schemastery").default<string, string, "plain">;
        host: import("@deepseek-ai/schemastery").default<string, string, "plain">;
        port: import("@deepseek-ai/schemastery").default<number, number, "defined">;
        user: import("@deepseek-ai/schemastery").default<string, string, "defined">;
        identityFile: import("@deepseek-ai/schemastery").default<string, string, "defined">;
        proxyJump: import("@deepseek-ai/schemastery").default<string, string, "defined">;
    }>>[], "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    hosts: import("@deepseek-ai/schemastery").default<({
        name?: string | null | undefined;
        host?: string | null | undefined;
        port?: number | null | undefined;
        user?: string | null | undefined;
        identityFile?: string | null | undefined;
        proxyJump?: string | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        name: import("@deepseek-ai/schemastery").default<string, string, "plain">;
        host: import("@deepseek-ai/schemastery").default<string, string, "plain">;
        port: import("@deepseek-ai/schemastery").default<number, number, "defined">;
        user: import("@deepseek-ai/schemastery").default<string, string, "defined">;
        identityFile: import("@deepseek-ai/schemastery").default<string, string, "defined">;
        proxyJump: import("@deepseek-ai/schemastery").default<string, string, "defined">;
    }>>[], "defined">;
}>>, "plain">;
export declare function apply(ctx: Context, config: LegacySshConfig): () => Promise<void>;
//# sourceMappingURL=index.d.ts.map