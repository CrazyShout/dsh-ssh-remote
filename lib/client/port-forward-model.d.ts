import type { PortForwardInput, PortForwardList, PortForwardRemote, PortForwardView } from './port-forward-types.js';
interface State {
    list?: PortForwardList;
    error: string;
    listError: string;
    pending?: PortForwardInput;
    busy: Set<string>;
}
export declare class PortForwardModel {
    readonly sessionId: string;
    private readonly remote;
    private state;
    private readonly stoppedRequests;
    private readonly listeners;
    private reader?;
    private timer?;
    private disposed;
    private revision;
    constructor(sessionId: string, remote: PortForwardRemote);
    snapshot: () => State;
    subscribe: (fn: () => void) => () => void;
    private update;
    refresh(): Promise<void>;
    create(input: Omit<PortForwardInput, 'id'>): Promise<void>;
    stop(id: string): Promise<void>;
    probe(id: string): Promise<void>;
    private put;
    dispose(): void;
}
export declare function browserIsOnHost(location: Pick<Location, 'protocol' | 'hostname'>): boolean;
export declare function forwardUrl(row: Pick<PortForwardView, 'protocol' | 'localPort'>): string;
export {};
//# sourceMappingURL=port-forward-model.d.ts.map