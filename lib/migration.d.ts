import { type SshGRunner } from './ssh-config.js';
import type { LegacyHost, MigrationPreview, MigrationResult, MigrationSelection } from '../shared/migration.js';
/** Explicit management operation only. Construction and startup never write SSH config. */
export declare class SshMigration {
    readonly configPath: string;
    private readonly stateDir;
    private readonly hosts;
    private readonly verify;
    private readonly restoreMappings;
    private readonly runner?;
    readonly fragmentPath: string;
    private previews;
    private active;
    constructor(configPath: string, stateDir: string, hosts: readonly LegacyHost[], verify: (alias: string) => Promise<void>, restoreMappings: (aliases: Record<string, string>) => Promise<void>, runner?: SshGRunner | undefined);
    preview(selections?: MigrationSelection[]): Promise<MigrationPreview>;
    private replace;
    private save;
    private locked;
    apply(token: string): Promise<MigrationResult>;
    private restore;
    rollback(id: string): Promise<void>;
}
//# sourceMappingURL=migration.d.ts.map