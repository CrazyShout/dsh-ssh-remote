import type { Context } from '@deepseek-ai/cordis';
import { TransferModel } from './transfer-model.js';
export declare function mountTransfers(ctx: Context): () => Promise<void>;
export declare const transferSize: (n: number) => string;
export declare function TransferPane({ sessionId, getModel }: {
    sessionId: string;
    getModel: (sessionId: string) => TransferModel;
}): import("react").JSX.Element;
//# sourceMappingURL=transfers.d.ts.map