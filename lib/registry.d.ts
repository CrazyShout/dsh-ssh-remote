import { Context, Service } from '@deepseek-ai/cordis';
import { SshConnectionManager } from './connection.js';
import type { RemoteWorkspace, SshConnectionStatus } from './types.js';
/** A remote `ssh://` filesystem provider keyed by a workspace uri. */
export interface RemoteFsProvider {
    readonly uri: string;
    stat(path: string): Promise<{
        type: string;
        size: number;
    } | undefined>;
    listDir(path: string): Promise<Array<{
        name: string;
        type: string;
        size: number;
    }>>;
    readText(path: string): Promise<string>;
    writeText(path: string, content: string): Promise<void>;
}
type StatusListener = (change: {
    workspaceId: string;
    status: SshConnectionStatus;
    reason?: string;
}) => void;
/**
 * The `ctx.sshRemote` service: registers remote workspaces, owns their SSH
 * connections and status, and exposes file/exec operations for the model tool
 * and (later) the transparent filesystem routing.
 */
export declare class SshRemoteService extends Service {
    readonly connections: SshConnectionManager;
    private readonly workspaces;
    private readonly listeners;
    constructor(ctx: Context);
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