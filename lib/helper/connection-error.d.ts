export interface ConnectionFailure {
    errorCode: string;
    retryable: boolean;
    hint: string;
}
/** Unknown failures are deliberately manual-retry, never an install loop. */
export declare function classifyConnectionError(error: unknown, stderr?: string, established?: boolean): ConnectionFailure;
//# sourceMappingURL=connection-error.d.ts.map