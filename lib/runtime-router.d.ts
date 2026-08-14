import type FileSystem from '@deepseek-ai/dsh-fs';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { SshConnectionManager } from './connection.js';
/** Resolve a registered local anchor or descendant to an SSH URI. */
export type RemotePathResolver = (path: string) => string | undefined;
/**
 * Add exact SSH URI routing to DSH's filesystem service. Local paths always
 * call the original provider; only direct SSH URIs and paths beneath a
 * persisted remote Workspace anchor use SFTP.
 */
export declare function installRemoteFileSystemRouter(fs: FileSystem, connections: SshConnectionManager, resolveRemotePath: RemotePathResolver): () => void;
/** Build the local OpenSSH argv used for a remote process or terminal. */
export declare function buildRemoteSshInvocation(cwd: string, argv: readonly string[], env: NodeJS.ProcessEnv | undefined, terminal: boolean): readonly string[];
/**
 * Route process execution by Workspace cwd. The stock local provider still
 * owns stream collection, PTY behavior, cancellation and teardown; for a
 * mapped cwd its managed child is the system OpenSSH client.
 */
export declare function installRemoteSubprocessRouter(subprocess: SubprocessRuntime, resolveRemotePath: RemotePathResolver): () => void;
//# sourceMappingURL=runtime-router.d.ts.map