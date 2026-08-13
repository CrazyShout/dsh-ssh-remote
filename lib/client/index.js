import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const name = 'dsh-ssh-remote-client';
export const inject = ['slots'];
/**
 * v0.1 sidebar scaffold. The host-side `ssh_remote` tool is the primary
 * interface today; this registers a sidebar entry that renders remote
 * workspaces with a connection status dot. The exact sidebar owner contract
 * (`store`/`inject`/`locale` sharing) is intentionally left for runtime
 * iteration against the composed shell — see README "Client UI status".
 */
export function apply(ctx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slots = ctx.slots;
    slots.inject('sidebar.workspaces', () => slots.register({
        name: 'ssh-remote-sidebar',
        children: {},
    }, SshRemoteSidebar));
}
const STATUS_COLOR = {
    connected: '#22c55e',
    connecting: '#eab308',
    reconnecting: '#eab308',
    disconnected: '#ef4444',
    error: '#ef4444',
};
function SshRemoteSidebar(props) {
    const list = props.workspaces ?? [];
    if (list.length === 0) {
        return (_jsx("div", { style: { padding: '8px 12px', color: 'var(--text-muted, #888)' }, children: "No SSH workspaces. Ask the agent to run ssh_remote add." }));
    }
    return (_jsx("div", { style: { padding: '4px 0' }, children: list.map((ws) => (_jsxs("div", { title: ws.lastError ?? ws.uri, style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                fontSize: '13px',
            }, children: [_jsx("span", { style: {
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: STATUS_COLOR[ws.status] ?? '#888',
                        display: 'inline-block',
                        flexShrink: 0,
                    } }), _jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: ws.title })] }, ws.id))) }));
}
//# sourceMappingURL=index.js.map