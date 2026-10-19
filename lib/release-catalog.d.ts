import type { ReleaseCheck, ReleaseTarget } from '../shared/updates.js';
export declare const RELEASE_REPOSITORY = "CrazyShout/dsh-ssh-remote";
export declare function releaseTarget(release: unknown, manifest: unknown): ReleaseTarget;
/** Only fixed public GitHub endpoints; no credentials, workspace paths or Session contents leave the Host. */
export declare class ReleaseCatalog {
    private readonly request;
    private readonly now;
    private cached?;
    private pending?;
    private readonly lifetime;
    constructor(request?: typeof fetch, now?: () => number);
    check(force: boolean): Promise<ReleaseCheck>;
    dispose(): void;
    private json;
    private load;
}
//# sourceMappingURL=release-catalog.d.ts.map