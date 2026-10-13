import type { EditorRemote } from './editor-types.js';
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        sshRemoteEditor: EditorRemote;
    }
}
export declare const editorInvocations: {
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
//# sourceMappingURL=editor-schema.d.ts.map