import type { Context } from '@deepseek-ai/cordis';
import { EditorModel } from './editor-model.js';
import './editor-schema.js';
export declare function mountRemoteEditor(ctx: Context): () => Promise<void>;
export declare function RemoteEditorPane({ model }: {
    model: EditorModel;
}): import("react").JSX.Element;
//# sourceMappingURL=editor.d.ts.map