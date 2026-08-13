import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export declare const name = "dsh-ssh-remote-client";
export declare const inject: string[];
/**
 * v0.1 sidebar scaffold. The host-side `ssh_remote` tool is the primary
 * interface today; this registers a sidebar entry that renders remote
 * workspaces with a connection status dot. The exact sidebar owner contract
 * (`store`/`inject`/`locale` sharing) is intentionally left for runtime
 * iteration against the composed shell — see README "Client UI status".
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map