import type { Context } from '@deepseek-ai/cordis';
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { type ReadImageBytes } from './markdown-images.js';
declare const en: {
    copy: string;
    copied: string;
    code: string;
    wrap: string;
    unwrap: string;
    footnotes: string;
    failed: string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        sshRemoteMarkdown: keyof typeof en;
    }
}
type PreviewProps = DocumentPreviewProps & PropsLocale<'sshRemoteMarkdown'> & {
    readImageBytes: ReadImageBytes;
};
/** Keep the built-in document owner, metadata and Markdown primitive; replace only its unsafe image transport. */
export declare function mountSessionMarkdownImages(ctx: Context): () => Promise<void>;
export declare function SessionMarkdownPreview(props: PreviewProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=markdown-preview.d.ts.map