import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { SshDirectoryFlow } from './directory-flow.js';
import { SshRemotePanel } from './connection-settings.js';
export { SshDirectoryFlow, SshRemotePanel };
export declare const name = "dsh-ssh-remote-client";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map