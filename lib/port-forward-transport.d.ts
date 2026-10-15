import { spawn } from 'node:child_process';
export interface ForwardSpec {
    alias: string;
    localPort: number;
    remotePort: number;
}
export interface ForwardProbe {
    state: 'reachable' | 'unreachable' | 'unknown';
    message: string;
}
export declare function validateForwardSpec(spec: ForwardSpec): void;
export declare function masterArguments(spec: ForwardSpec, socket: string, modern: boolean): string[];
export declare function controlArguments(socket: string, operation: 'check' | 'forward', spec: ForwardSpec): string[];
export declare function probeArguments(socket: string, spec: ForwardSpec): string[];
/** Runs in a child guardian: parent IPC disconnect disposes this entire owner. */
export declare class OpenSshForward {
    private readonly spec;
    private readonly onFailure;
    private readonly ssh;
    private readonly spawnProcess;
    private directory?;
    private master?;
    private readonly children;
    private diagnostics;
    private stopped;
    private startTask?;
    private stopTask?;
    private readonly lifetime;
    private probeTask?;
    onNotice?: (message: string) => void;
    private lastNotice;
    constructor(spec: ForwardSpec, onFailure: (message: string) => void, ssh?: string, spawnProcess?: typeof spawn);
    start(): Promise<void>;
    private startOnce;
    probe(): Promise<ForwardProbe>;
    private probeOnce;
    stop(): Promise<void>;
    private stopOnce;
    /** Synchronous last-resort fallback on guardian exit; never signal a numeric PID. */
    killOnExit(): void;
    private get socket();
    private checkActive;
    private spawn;
    private command;
    private killOwned;
}
export declare function bounded<T>(promise: Promise<T>, timeout: number): Promise<T>;
//# sourceMappingURL=port-forward-transport.d.ts.map