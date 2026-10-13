import type { EditorDocument, EditorRemote, EditorSaveResult } from './editor-types.js';
export interface EditorState {
    document?: EditorDocument;
    draft: string;
    message: string;
    reading: boolean;
    saving: boolean;
    outcome?: EditorSaveResult['state'];
    remoteText?: string;
    confirmation?: 'discard' | 'close';
}
/** The buffer belongs to an explicit Session, never to the current selection. */
export declare class EditorModel {
    readonly sessionId: string;
    private readonly remote;
    private readonly timeoutMs;
    private state;
    private readonly listeners;
    private generation;
    private reader?;
    private attempt?;
    private confirmedAction?;
    constructor(sessionId: string, remote: EditorRemote, timeoutMs?: number);
    snapshot: () => EditorState;
    subscribe: (listener: () => void) => () => boolean;
    get dirty(): boolean;
    get unsettled(): boolean;
    get needsProtection(): boolean;
    edit(text: string): void;
    notice(message: string): void;
    requestOpen(path: string): void;
    requestClose(close: () => void): boolean;
    confirm(accept: boolean): void;
    private ask;
    open(path: string, discard?: boolean): Promise<void>;
    save(): Promise<void>;
    verify(): Promise<void>;
    compare(): Promise<void>;
    dispose(): void;
    private accept;
    private update;
}
//# sourceMappingURL=editor-model.d.ts.map