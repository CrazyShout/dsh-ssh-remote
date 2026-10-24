import type { CSSProperties, ReactNode } from 'react';

/** Layout only; controls, icons and theme tokens remain owned by DSH. */
export const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 16, padding: 16,
  height: '100%', overflow: 'auto', minWidth: 0, fontSize: 13, lineHeight: 1.5,
};
export const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 };
export const cardStyle: CSSProperties = {
  display: 'grid', gap: 10, padding: 12, minWidth: 0,
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12,
};
export const mutedStyle: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, overflowWrap: 'anywhere' };

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <header style={{ ...rowStyle, justifyContent: 'space-between' }}>
    <strong style={{ fontWeight: 600 }}>{title}</strong>
    {children && <div style={rowStyle}>{children}</div>}
  </header>;
}
