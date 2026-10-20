import { createElement, useSyncExternalStore, type ReactNode } from 'react';
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import { en, zh, type MessageKey } from './messages.js';

export const LOCALE_NAMESPACE = 'sshRemote';
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sshRemote: MessageKey }
}

// One client module is loaded per browser application. This is a binding to
// DSH's locale service, not a second language preference/store. Source copy is
// used by standalone model/component tests before plugin activation.
const source: Translate<MessageKey> = (key, params) =>
  key.replace(/\{(\w+)\}/gu, (placeholder, name: string) => params?.[name] === undefined ? placeholder : String(params[name]));
const idle = { translate: source, subscribe: (_listener: () => void) => () => {}, snapshot: () => 0, language: () => 'zh' };
let binding = idle;

export const t: Translate<MessageKey> = (key, params) => binding.translate(key, params);
export const formatDateTime = (value: number) => new Intl.DateTimeFormat(binding.language(), {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

export function installLocale(locale: LocaleRuntime): () => void {
  const unregister = locale.register(LOCALE_NAMESPACE, { en, zh });
  const current = {
    translate: locale.bind(LOCALE_NAMESPACE),
    subscribe: (listener: () => void) => locale.subscribe(listener),
    snapshot: () => locale.getSnapshot().revision,
    language: () => locale.getSnapshot().active,
  };
  binding = current;
  return () => { unregister(); if (binding === current) binding = idle; };
}

/** Re-render a slot subtree on the official locale revision, without remounting it. */
export function localized<P extends object>(Component: (props: P) => ReactNode) {
  return function Localized(props: P) {
    useSyncExternalStore(binding.subscribe, binding.snapshot, binding.snapshot);
    return createElement(Component, props);
  };
}
