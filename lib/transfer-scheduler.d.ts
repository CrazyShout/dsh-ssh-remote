/** Per-file ordering with task barriers. A queued control closes admission
 * immediately; it drains earlier data before pause/cancel may release resources. */
export declare class TransferScheduler {
    private readonly jobs;
    private state;
    control<T>(id: string, action: () => Promise<T>, stopQueued?: boolean): Promise<T>;
    file<T>(id: string, index: number, action: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=transfer-scheduler.d.ts.map