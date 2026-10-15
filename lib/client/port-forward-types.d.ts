import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface RemoteErrorDetailsMap {
        'ssh-ports/refused': {
            reason: string;
        };
    }
}
export interface PortForwardInput {
    id: string;
    localPort: number;
    remotePort: number;
    protocol: 'http' | 'https';
}
export interface PortForwardView extends PortForwardInput {
    alias: string;
    state: 'starting' | 'listening' | 'stopping' | 'stopped' | 'error';
    probe: {
        state: 'reachable' | 'unreachable' | 'unknown';
        message: string;
    };
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
export interface PortForwardRemote {
    list(sessionId: string, signal: AbortSignal): Promise<RemoteResult<PortForwardList>>;
    create(sessionId: string, input: PortForwardInput): Promise<RemoteResult<PortForwardView>>;
    stop(sessionId: string, id: string): Promise<RemoteResult<PortForwardView>>;
    probe(sessionId: string, id: string): Promise<RemoteResult<PortForwardView>>;
}
//# sourceMappingURL=port-forward-types.d.ts.map