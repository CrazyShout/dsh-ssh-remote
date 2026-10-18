import { type ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export declare const sections: readonly [{
    readonly id: "files";
    readonly title: "快速打开";
}, {
    readonly id: "transfers";
    readonly title: "文件传输";
}, {
    readonly id: "ports";
    readonly title: "端口转发";
}, {
    readonly id: "terminals";
    readonly title: "终端状态";
}];
export type WorkbenchSection = typeof sections[number]['id'];
declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
    interface SidebarRightTabParamsMap {
        'ssh-tools': {
            section: WorkbenchSection;
        };
    }
}
export type WorkbenchProps = PropsRuntime<'sidebar.right.pane.tab'> & {
    active: boolean;
};
export declare class Workbench {
    private version;
    private readonly listeners;
    private readonly renderers;
    private readonly last;
    snapshot: () => number;
    subscribe: (listener: () => void) => () => void;
    private changed;
    register(section: WorkbenchSection, render: (props: WorkbenchProps) => ReactNode): () => void;
    selected(session: string): WorkbenchSection;
    select(session: string, section: WorkbenchSection): void;
    render(section: WorkbenchSection, props: WorkbenchProps): string | number | boolean | import("react").JSX.Element | Iterable<ReactNode>;
}
/** A persisted legacy tab is replaced through the public navigator, never by editing layout files. */
export declare function mountWorkbenchSection(scope: Context, workbench: Workbench, id: string, kind: string, section: WorkbenchSection, render: (props: WorkbenchProps) => ReactNode): () => void;
export declare function openWorkbench(scope: Context, workbench: Workbench, sessionId: string, section: WorkbenchSection): void;
/** Mount lifetime is not visibility: native tabs remain mounted in hidden panes. */
export declare function usePageVisible(active?: boolean): boolean;
//# sourceMappingURL=workbench.d.ts.map