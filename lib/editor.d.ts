import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import { type RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
export declare const EDITOR_MAX_BYTES: number;
export interface EditorDocument {
    sessionId: string;
    rootUri: string;
    path: string;
    alias: string;
    version: string;
    text: string;
    bom: boolean;
    newline: 'lf' | 'crlf';
    maxBytes: number;
}
export interface EditorSave {
    rootUri: string;
    path: string;
    version: string;
    text: string;
    bom: boolean;
    newline: 'lf' | 'crlf';
    operationId: string;
}
export interface EditorSaveResult {
    state: 'pending' | 'saved' | 'conflict' | 'failed' | 'unknown';
    version?: string;
    message?: string;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        sshRemoteEditor: SshRemoteEditor;
    }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface RemoteErrorDetailsMap {
        'ssh-editor/refused': {
            reason: string;
        };
    }
}
/** Human-only writes: authenticated Session lookup, never a caller-supplied SSH host. */
export declare class SshRemoteEditor extends TypertRemoteService {
    private readonly resolvePath;
    private readonly invalidate?;
    private readonly fs;
    private readonly receipts;
    private reads;
    constructor(ctx: Context, helpers: RemoteHelperProvider, resolvePath: RemotePathResolver, invalidate?: ((workspaceRoot: string) => void) | undefined);
    read(scope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<EditorDocument>;
    save(scope: WorkspaceFileScope, request: EditorSave): Promise<EditorSaveResult>;
    status(scope: WorkspaceFileScope, operationId: string, signal: AbortSignal): Promise<EditorSaveResult>;
    private identity;
}
export declare function decodeEditorText(bytes: Buffer): Pick<EditorDocument, 'text' | 'bom' | 'newline'>;
//# sourceMappingURL=editor.d.ts.map