import { type Workbench } from './workbench.js';
import { ConnectionStatusStore } from './connection-status.js';
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
declare const tools: readonly [{
    readonly kind: "ssh-quick-open";
    readonly bit: 2;
    readonly title: "快速打开";
    readonly description: "查找并预览远端文件";
}, {
    readonly kind: "ssh-transfers";
    readonly bit: 4;
    readonly title: "文件传输";
    readonly description: "上传和下载文件或目录";
}, {
    readonly kind: "ssh-ports";
    readonly bit: 8;
    readonly title: "端口转发";
    readonly description: "访问远端运行的网页服务";
}];
type PanelKind = 'ssh-tools' | typeof tools[number]['kind'];
interface NativePanelInjected {
    workbench: Workbench;
    connectionStatus: ConnectionStatusStore;
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
export declare function mountNativePanels(ctx: Context, workbench: Workbench): () => Promise<void>;
/** The official header hides its utilities while a real Session is still blank. */
export declare function BlankNativePanelActions(props: BlankNativePanelProps): import("react").JSX.Element | null;
export declare function NativePanelActions(props: NativePanelProps): import("react").JSX.Element | null;
export declare function RemoteToolsPane(props: PropsRuntime<'sidebar.right.pane.tab'> & NativePanelInjected): import("react").JSX.Element;
export {};
//# sourceMappingURL=native-panels.d.ts.map