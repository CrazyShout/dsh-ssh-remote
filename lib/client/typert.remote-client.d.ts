import type { SshRemote } from 'dsh-ssh-remote/ssh';
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TerminalStateRemote } from 'dsh-ssh-remote/terminal-state';
export interface RemoteWorkspaceInfo {
    alias: string;
    remotePath: string;
    uri: string;
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        sshRemoteTerminalState: TerminalStateRemote;
        sshRemote: SshRemote;
    }
}
export declare const TYPERT_REMOTE: TypertRemoteContribution;
export default TYPERT_REMOTE;
//# sourceMappingURL=typert.remote-client.d.ts.map