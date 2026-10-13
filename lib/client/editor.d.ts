import type { Context } from '@deepseek-ai/cordis';
import { EditorModel } from './editor-model.js';
import './editor-schema.js';
import type { EditorBridge } from './file-search-types.js';
export declare function mountRemoteEditor(ctx: Context, bridge?: EditorBridge): () => Promise<void>;
export declare function RemoteEditorPane({ model }: {
    model: EditorModel;
}): import("react").JSX.Element;
//# sourceMappingURL=editor.d.ts.map