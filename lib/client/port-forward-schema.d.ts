import type { PortForwardRemote } from './port-forward-types.js';
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        sshRemotePorts: PortForwardRemote;
    }
}
export declare const portForwardInvocations: {
    result: {
        mode: string;
        typeSymbol: string;
        create: () => {
            parse(value: unknown): unknown;
        };
    };
    sourceLocation: {
        file: string;
        line: number;
        column: number;
    };
    cancellation?: {
        parameter: string;
    } | undefined;
    id: string;
    service: string;
    namespace: string;
    method: string;
    invocation: {
        kind: string;
    };
    parameters: unknown[];
}[];
//# sourceMappingURL=port-forward-schema.d.ts.map