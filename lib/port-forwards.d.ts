import { type ChildProcess } from 'node:child_process';
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import type { RemotePathResolver } from './runtime-router.js';
import { type ForwardProbe } from './port-forward-transport.js';
export interface PortForwardInput {
    id: string;
    localPort: number;
    remotePort: number;
    protocol: 'http' | 'https';
}
export interface PortForwardView extends PortForwardInput {
    alias: string;
    state: 'starting' | 'listening' | 'stopping' | 'stopped' | 'error';
    probe: ForwardProbe;
    error: string;
    createdAt: number;
    canRetry: boolean;
}
export interface PortForwardList {
    host: string;
    alias: string;
    supported: boolean;
    items: PortForwardView[];
}
interface Options {
    forkWorker?: () => ChildProcess;
    now?: () => number;
    aliasValidator?: (alias: string) => boolean;
}
/** A Host owns listeners; authenticated Sessions can manage only their workspace's records. */
export declare class PortForwardManager {
    private readonly resolve;
    private readonly options;
    private readonly records;
    private readonly ports;
    private disposed;
    private readonly now;
    constructor(resolve: RemotePathResolver, options?: Options);
    private identity;
    list(scope: WorkspaceFileScope): PortForwardList;
    create(scope: WorkspaceFileScope, input: PortForwardInput): PortForwardView;
    stop(scope: WorkspaceFileScope, id: string): Promise<PortForwardView>;
    probe(scope: WorkspaceFileScope, id: string): PortForwardView;
    private sendProbe;
    private stopEntry;
    private view;
    private prune;
    dispose(): Promise<void>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        sshRemotePorts: SshRemotePorts;
    }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface RemoteErrorDetailsMap {
        'ssh-ports/refused': {
            reason: string;
        };
    }
}
export declare class SshRemotePorts extends TypertRemoteService {
    private readonly manager;
    constructor(ctx: Context, manager: PortForwardManager);
    list(scope: WorkspaceFileScope, signal: AbortSignal): Promise<PortForwardList>;
    create(scope: WorkspaceFileScope, input: PortForwardInput): Promise<PortForwardView>;
    stop(scope: WorkspaceFileScope, id: string): Promise<PortForwardView>;
    probe(scope: WorkspaceFileScope, id: string): Promise<PortForwardView>;
}
export {};
//# sourceMappingURL=port-forwards.d.ts.map