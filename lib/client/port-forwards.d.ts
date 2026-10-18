import { type Workbench } from './workbench.js';
import type { Context } from '@deepseek-ai/cordis';
import type { PortForwardRemote } from './port-forward-types.js';
import './port-forward-schema.js';
export declare function mountPortForwards(ctx: Context, workbench: Workbench): () => Promise<void>;
export declare function PortForwardPane({ sessionId, remote, active }: {
    active?: boolean;
    sessionId: string;
    remote: PortForwardRemote;
}): import("react").JSX.Element;
//# sourceMappingURL=port-forwards.d.ts.map