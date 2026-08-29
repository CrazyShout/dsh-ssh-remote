import { z } from 'zod';
/** Deterministic host-face descriptor discovered through package export ./typert. */
export declare const TYPERT: {
    package: string;
    face: string;
    schemas: never[];
    invocations: {
        id: string;
        service: string;
        namespace: string;
        method: string;
        invocation: {
            kind: string;
        };
        parameters: unknown[];
        result: {
            mode: string;
            typeSymbol: string;
            schema: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
        };
        sourceLocation: {
            file: string;
            line: number;
            column: number;
        };
    }[];
    model: {
        services: never[];
        events: never[];
        objects: never[];
    };
};
//# sourceMappingURL=typert.host.d.ts.map