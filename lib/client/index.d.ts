import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export declare const name = "dsh-ssh-remote-client";
export declare const inject: string[];
/**
 * v0.2 client half: self-register the `sshRemote` Remote face so
 * `ctx.remote.sshRemote.config()` / `.saveConfig()` become callable in the
 * browser, then inject the workspace-picker UI (next milestone).
 */
export declare function apply(ctx: ClientContext): Promise<() => void>;
//# sourceMappingURL=index.d.ts.map