import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { RemoteWorkspaceInfo } from './typert.remote-client.js';
type InfoResult = {
    ok: true;
    value: RemoteWorkspaceInfo | null;
} | {
    ok: false;
    error: {
        message: string;
    };
};
type PanelKind = 'files' | 'terminal';
interface NativePanelInjected {
    workspaceInfo(path: string): Promise<InfoResult>;
    openPanel(kind: PanelKind): void;
    availablePanels(): number;
    subscribePanels(listener: () => void): () => void;
}
type NativePanelProps = PropsRuntime<'conversation.session.header.utilities'> & NativePanelInjected & {
    presentation?: 'header' | 'dock';
};
type BlankNativePanelProps = PropsRuntime<'conversation.input.dock'> & NativePanelInjected;
/** Additive optional integration: no sidebar/conversation composition is required at boot. */
export declare function mountNativePanels(ctx: Context): () => Promise<void>;
/** The official header hides its utilities while a real Session is still blank. */
export declare function BlankNativePanelActions(props: BlankNativePanelProps): import("react").JSX.Element | null;
/** Session identity comes from the SDK; SSH identity comes only from the Host's saved mapping. */
export declare function NativePanelActions({ sessionId, useSessions, workspaceInfo, openPanel, availablePanels, subscribePanels, presentation, }: NativePanelProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=native-panels.d.ts.map