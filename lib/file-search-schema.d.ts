import { z } from 'zod';
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
        create: () => z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
    };
    sourceLocation: {
        file: string;
        line: number;
        column: number;
    };
}[];
//# sourceMappingURL=file-search-schema.d.ts.map