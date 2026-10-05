import { useEffect, useMemo, useReducer, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote';
import type {} from '@deepseek-ai/dsh-client-resources/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { imageFilePath, SessionImageCache, type ReadImageBytes } from './markdown-images.js';

const MARKDOWN_BODY = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown';
const en = { copy: 'Copy', copied: 'Copied', code: 'Code', wrap: 'Wrap', unwrap: 'Unwrap', footnotes: 'Footnotes', failed: 'Some images could not be loaded in this session.' };
const zh = { copy: '复制', copied: '已复制', code: '代码', wrap: '自动换行', unwrap: '取消自动换行', footnotes: '脚注', failed: '部分图片无法在此会话中加载。' };
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sshRemoteMarkdown: keyof typeof en }
}
type PreviewProps = DocumentPreviewProps & PropsLocale<'sshRemoteMarkdown'> & { readImageBytes: ReadImageBytes };

/** Keep the built-in document owner, metadata and Markdown primitive; replace only its unsafe image transport. */
export function mountSessionMarkdownImages(ctx: Context): () => Promise<void> {
  const fiber = ctx.inject(['slots', 'locale', 'remote.workspaceFiles'], scope => {
    if (typeof scope.remote.workspaceFiles?.readBytes !== 'function') return () => {};
    const readImageBytes: ReadImageBytes = (sessionId, path, options, signal) =>
      scope.remote.workspaceFiles.readBytes(sessionId as SessionId, path, options, signal);
    const dictionary = scope.locale.register('sshRemoteMarkdown', { en, zh });
    try {
      const slot = scope.slots.inject('sidebar.right.tab.document', () => scope.slots.register({
        name: 'sidebar.right.tab.document', key: MARKDOWN_BODY, priority: -100, locale: 'sshRemoteMarkdown',
        inject: () => ({ readImageBytes }),
      }, SessionMarkdownPreview));
      return () => { slot(); dictionary(); };
    } catch (error) { dictionary(); throw error; }
  });
  return async () => { await fiber.dispose(); };
}

export function SessionMarkdownPreview(props: PreviewProps) {
  const metadata = props.useResource<'file'>(props.resourceAddress);
  // A resource may explicitly name another Session. Never substitute the
  // current UI Session, a raw absolute pathname, or the local Host URL route.
  const [source, setSource] = useState({ address: props.resourceAddress, version: metadata.value?.version, content: props.content, revision: 0 });
  let current = source;
  if (source.address !== props.resourceAddress || source.version !== metadata.value?.version || source.content !== props.content) {
    const append = source.content.kind === 'text' && props.content.kind === 'text' && !source.content.eof
      && props.content.text.startsWith(source.content.text);
    current = { address: props.resourceAddress, version: metadata.value?.version, content: props.content,
      revision: source.revision + (source.address === props.resourceAddress && source.version === metadata.value?.version && append ? 0 : 1) };
    // React's previous-props state pattern: no document text is copied into a
    // key, appending a page keeps its cache, and a reload's new completed
    // content snapshot invalidates even if the Host stat token stayed equal.
    setSource(current);
  }
  return <MarkdownImageBody key={current.revision} {...props} />;
}

function MarkdownImageBody({ content, resourceAddress, readImageBytes, setResources, t }: PreviewProps) {
  const [, render] = useReducer(value => value + 1, 0);
  const [cache, setCache] = useState<SessionImageCache>();
  useEffect(() => {
    const dependencies = new Set<string>();
    // This is the public renderer-owned dependency seat. The document owner
    // retains its source resource separately when it applies this snapshot.
    setResources([]);
    const current = new SessionImageCache(resourceAddress, readImageBytes, render, address => {
      dependencies.add(address); setResources([...dependencies]);
    });
    setCache(current);
    return () => { current.dispose(); setResources([]); };
  }, [resourceAddress, readImageBytes, setResources]);
  const requested = new Map<string, string>();
  // This pass only records destinations in a render-local set. I/O starts in
  // the effect after MarkdownText has rendered, including reference images.
  const pathImages = { resolve: (value: string) => {
    const path = imageFilePath(value);
    if (path !== undefined && requested.size < (cache?.limits.entries ?? 64) + 1) requested.set(path, value);
    return cache?.get(value);
  } };
  useEffect(() => { cache?.request(requested.values()); });
  const labels = useMemo(() => ({ code: {
    copyLabel: t('copy'), copiedLabel: t('copied'),
    toolbarLabels: { codeLabel: t('code'), wrapLabel: t('wrap'), unwrapLabel: t('unwrap') },
  }, footnotes: t('footnotes') }), [t]);
  if (content.kind !== 'text') return null;
  return <div data-document-markdown style={{ minWidth: 0, fontFamily: 'var(--dsw-font,inherit)', whiteSpace: 'normal', padding: '10px 12px' }}>
    <MarkdownText text={content.text} streaming={!content.eof} labels={labels} pathImages={pathImages} />
    {cache?.failed && <small role="status">{t('failed')}</small>}
  </div>;
}
