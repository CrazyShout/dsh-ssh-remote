import { type ReactNode } from 'react';
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import { type MessageKey } from './messages.js';
export declare const LOCALE_NAMESPACE = "sshRemote";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        sshRemote: MessageKey;
    }
}
export declare const t: Translate<MessageKey>;
export declare function installLocale(locale: LocaleRuntime): () => void;
/** Re-render a slot subtree on the official locale revision, without remounting it. */
export declare function localized<P extends object>(Component: (props: P) => ReactNode): (props: P) => import("react").FunctionComponentElement<P>;
//# sourceMappingURL=locale.d.ts.map