import { createElement as h } from 'react';
/** Browser-only native primitives are represented by their public DOM contracts. */
export const nativeControls = {
  Checkbox: ({ checked, onChange, label, disabled, title }: any) =>
    h('label', { title }, h('input', { type: 'checkbox', checked, disabled,
      onChange: (event: any) => onChange(event.currentTarget.checked) }), label),
  PathLabel: ({ path, ...props }: any) => h('span', { ...props, title: path }, path),
  writeClipboard: async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  },
};
