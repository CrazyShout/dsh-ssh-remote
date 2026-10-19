import type { Context } from '@deepseek-ai/cordis';
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl, SkillProviderObservation } from '@deepseek-ai/dsh-skill';
import { HelperRemoteFileSystem, type RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
type Files = Pick<HelperRemoteFileSystem, 'resolve' | 'lstat' | 'listDir' | 'readSnapshot'>;
type ParsedSkill = Pick<SkillDefinition, 'name' | 'description' | 'whenToUse' | 'invocation' | 'content' | 'metadata'>;
/** A provider, not a replacement for the host's local/bundled skill registry. */
export declare class RemoteSkillsProvider implements SkillProvider {
    private readonly files;
    private readonly resolveRemotePath;
    private readonly home;
    private readonly control;
    private readonly warn;
    readonly name = "ssh-remote-filesystem";
    private timer?;
    private revision;
    constructor(files: Files, resolveRemotePath: RemotePathResolver, home: (uri: string, signal: AbortSignal) => Promise<string>, control: SkillProviderControl, warn: (message: string) => void);
    invalidate(): void;
    private workspace;
    private signal;
    list(options: SkillLookupOptions): Promise<SkillProviderObservation>;
    get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined>;
    private read;
}
/** Match the public DSH filesystem skill frontmatter and invocation policy. */
export declare function parseRemoteSkill(raw: string): ParsedSkill | undefined;
export declare function mountRemoteSkills(ctx: Context, helpers: RemoteHelperProvider, resolveRemotePath: RemotePathResolver): {
    invalidate: () => void | undefined;
    dispose: () => Promise<void>;
};
export {};
//# sourceMappingURL=remote-skills.d.ts.map