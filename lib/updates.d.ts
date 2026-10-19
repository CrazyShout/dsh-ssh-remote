import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { UpdateInfo } from '../shared/updates.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        sshRemoteUpdates: SshRemoteUpdates;
    }
}
export declare function updateSource(source: string): UpdateInfo['sourceKind'];
/** Observation only. DSH's independent pluginManager owns all package writes and activation. */
export declare class SshRemoteUpdates extends TypertRemoteService {
    private readonly owner;
    private readonly catalog;
    private readonly profileId;
    constructor(owner: Context);
    info(): Promise<UpdateInfo>;
    check(force: boolean): Promise<import("../shared/updates.js").ReleaseCheck>;
}
//# sourceMappingURL=updates.d.ts.map