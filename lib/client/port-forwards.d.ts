import type { Context } from '@deepseek-ai/cordis';
import type { PortForwardRemote } from './port-forward-types.js';
import './port-forward-schema.js';
export declare function mountPortForwards(ctx: Context): () => Promise<void>;
export declare function PortForwardPane({ sessionId, remote }: {
    sessionId: string;
    remote: PortForwardRemote;
}): import("react").JSX.Element;
//# sourceMappingURL=port-forwards.d.ts.map