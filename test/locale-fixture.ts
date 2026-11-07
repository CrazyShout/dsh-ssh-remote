import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
export function localeFixture() {
  let revision = 0, active = 'zh';
  const listeners = new Set<() => void>();
  const dictionaries = new Map<string, Record<string, Record<string, string>>>();
  const locale = {
    register(namespace: string, valuesOrLanguage: Record<string, Record<string, string>> | string, single?: Record<string, string>) {
      if (typeof valuesOrLanguage === 'string') {
        const current = dictionaries.get(namespace) ?? {};
        current[valuesOrLanguage] = single ?? {};
        dictionaries.set(namespace, current);
      }
      else
        dictionaries.set(namespace, valuesOrLanguage);
      return () => { dictionaries.delete(namespace); };
    },
    bind(namespace: string) {
      return (key: string, params?: Record<string, unknown>) => {
        const text = dictionaries.get(namespace)?.[active]?.[key] ?? key;
        return text.replace(/\{(\w+)\}/gu, (placeholder, name: string) => params?.[name] === undefined ? placeholder : String(params[name]));
      };
    },
    getSnapshot: () => ({ revision, active }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  } as unknown as LocaleRuntime;
  return { locale, listeners, dictionaries, change(language: 'zh' | 'en' | 'ru') {
    active = language; revision++; for (const listener of listeners) listener();
  } };
}
