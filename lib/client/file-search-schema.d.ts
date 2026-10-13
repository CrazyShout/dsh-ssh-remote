import type { FileSearchRemote } from './file-search-types.js';
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        sshRemoteFiles: FileSearchRemote;
    }
}
export declare const fileSearchInvocations: {
    id: string;
    service: string;
    namespace: string;
    method: string;
    invocation: {
        kind: string;
    };
    parameters: unknown[];
    cancellation: {
        parameter: string;
    };
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
}[];
//# sourceMappingURL=file-search-schema.d.ts.map