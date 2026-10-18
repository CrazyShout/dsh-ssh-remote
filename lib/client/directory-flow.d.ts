import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-remotes/client';
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client';
import type { SshRemote, RemoteDirectoryListing } from 'dsh-ssh-remote/ssh';
type SshDirectoryFlowProps = DirectoryFlowOwnerProps & {
    ssh: SshRemote;
    pickLocal: (signal?: AbortSignal) => Promise<string | null>;
    /** One local directory level via the composed picker's browse capability. */
    listLocal: (path?: string) => Promise<RemoteDirectoryListing>;
    /** Create one child directory under an existing local parent. */
    createLocalDirectory: (path: string, name: string) => Promise<string>;
    createWorkspace: (input: {
        path: string;
    }) => Promise<WorkspaceView>;
    renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<WorkspaceView>;
};
export declare function SshDirectoryFlow({ open, busy, onPicked, onCancel, onError, ssh, pickLocal, listLocal, createLocalDirectory, createWorkspace, renameWorkspace, }: SshDirectoryFlowProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=directory-flow.d.ts.map