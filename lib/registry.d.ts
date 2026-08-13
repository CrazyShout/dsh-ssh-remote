import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { SshConnectionManager } from './connection.js';
import type { RemoteWorkspace, SshConnectionStatus } from './types.js';
export interface SshHostEntry {
    name: string;
    host: string;
    port: number;
    user: string;
    identityFile: string;
    proxyJump: string;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** SSH remote workspaces service (this plugin). */
        sshRemote: SshRemoteService;
    }
}
type StatusListener = (change: {
    workspaceId: string;
    status: SshConnectionStatus;
    reason?: string;
}) => void;
/**
 * The `ctx.sshRemote` service: registers remote workspaces, owns their SSH
 * connections and status, and exposes workspace + host-config operations to
 * both the model tool and (through `@Remote` methods) the Web client.
 */
export declare class SshRemoteService extends TypertRemoteService {
    readonly connections: SshConnectionManager;
    private readonly workspaces;
    private readonly listeners;
    private readonly hostResolver?;
    constructor(ctx: Context);
    private get settings();
    private registerSettings;
    private readKey;
    /** Read the configured hosts (Web Remote). */
    config(): {
        hosts: SshHostEntry[];
    };
    /** Replace the configured hosts (Web Remote). */
    saveConfig(args: {
        hosts: SshHostEntry[];
    }): Promise<{
        ok: boolean;
    }>;
    onStatus(listener: StatusListener): () => void;
    list(): RemoteWorkspace[];
    get(id: string): RemoteWorkspace | undefined;
    add(uri: string, title?: string): RemoteWorkspace;
    remove(id: string): boolean;
    connect(id: string): Promise<void>;
    disconnect(id: string): Promise<void>;
    exec(id: string, command: string): Promise<{
        code: number;
        stdout: string;
        stderr: string;
    }>;
    stat(id: string, path: string): Promise<{
        type: string;
        size: number;
    } | undefined>;
    listDir(id: string, path: string): Promise<Array<{
        name: string;
        type: string;
        size: number;
    }>>;
    readText(id: string, path: string): Promise<string>;
    writeText(id: string, path: string, content: string): Promise<void>;
    dispose(): Promise<void>;
    private require;
    private keyOf;
    private remotePath;
    private emit;
    private load;
    private save;
}
export {};
//# sourceMappingURL=registry.d.ts.map