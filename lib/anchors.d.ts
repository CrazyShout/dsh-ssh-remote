import type { SshWorkspaceAnchor } from '../shared/ssh.js';
export type { SshWorkspaceAnchor } from '../shared/ssh.js';
/** Resolve the existing prefix only: new file paths must work too. */
export declare function canonicalPath(value: string): string;
/** Owns only durable path identities, not connection or UI lifecycle. */
export declare class AnchorRegistry {
    private readonly file;
    private readonly entries;
    private queue;
    readonly root: string;
    private readonly spellings;
    constructor(file: string, root: string);
    materialize(uri: string): Promise<SshWorkspaceAnchor>;
    resolve(localPath: string): string | undefined;
    migrateAliases(aliases: Record<string, string>): Promise<void>;
    private save;
    dispose(): Promise<void>;
}
//# sourceMappingURL=anchors.d.ts.map