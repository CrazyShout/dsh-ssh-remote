import type { Context } from '@deepseek-ai/cordis';
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { EditorBridge, FileIndexStatus, FileSearchRemote } from './file-search-types.js';
import './file-search-schema.js';
export declare function safePreviewPath(path: string): string;
export declare function mountQuickOpen(ctx: Context, editor: EditorBridge): () => Promise<void>;
interface PaneProps {
    sessionId: string;
    remote: FileSearchRemote;
    open(path: string, editing: boolean, signal: AbortSignal): void | Promise<void>;
}
export declare function QuickOpenPane({ sessionId, remote, open }: PaneProps): import("react").JSX.Element;
/** Only the public menu refresh API is called: never mutate input/caret or reopen. */
export declare class IndexMenuRefresh {
    private generation;
    private stale;
    update(status: FileIndexStatus, controller: Pick<InputTriggerController, 'menu' | 'refreshOpenMenu'> | undefined): void;
}
export {};
//# sourceMappingURL=quick-open.d.ts.map