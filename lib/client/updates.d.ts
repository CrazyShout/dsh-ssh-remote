import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ReleaseCheck } from 'dsh-ssh-remote/updates';
import { UpdateStore } from './update-store.js';
interface Injected {
    updates: UpdateStore;
    openUpdates: () => void;
}
type DetailProps = PropsRuntime<'plugins.detail.section'> & Injected;
export declare function updateFailureText(release: ReleaseCheck | undefined): string;
export declare function UpdateSection(props: DetailProps): import("react").JSX.Element | null;
export declare function UpdateAction(props: PropsRuntime<'plugins.detail.actions'> & Injected): import("react").JSX.Element | null;
export declare function UpdateBadge(props: PropsRuntime<'plugins.detail.badge'> & Injected): import("react").JSX.Element | null;
export declare function UpdateNotice({ updates, openUpdates }: Injected): import("react").JSX.Element | null;
/** Add controls to the existing official detail page; no replacement plugin manager or private store imports. */
export declare function mountPluginUpdates(ctx: Context): () => Promise<void>;
export {};
//# sourceMappingURL=updates.d.ts.map