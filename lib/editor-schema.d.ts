import { z } from 'zod';
export declare const editorInvocations: {
    result: {
        mode: string;
        typeSymbol: string;
        create: () => z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
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