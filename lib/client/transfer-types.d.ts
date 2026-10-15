import type { TransferRemote } from 'dsh-ssh-remote/transfers';
export type * from 'dsh-ssh-remote/transfers';
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        sshRemoteTransfers: TransferRemote;
    }
}
//# sourceMappingURL=transfer-types.d.ts.map