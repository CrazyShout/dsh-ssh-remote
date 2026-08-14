/** Type declaration for the hand-written Typert remote-client descriptors. */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type {
  RemoteDirectoryListing,
  SshConfig,
  SshWorkspaceAnchor,
} from './registry.js';

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    sshRemote: {
      config: () => Promise<RemoteResult<SshConfig>>;
      browse: (alias: string, path: string) => Promise<RemoteResult<RemoteDirectoryListing>>;
      createDirectory: (alias: string, parent: string, name: string) => Promise<RemoteResult<string>>;
      materializeWorkspace: (
        alias: string,
        remotePath: string,
      ) => Promise<RemoteResult<SshWorkspaceAnchor>>;
    };
  }
}

declare const TYPERT_REMOTE: TypertRemoteContribution;

export default TYPERT_REMOTE;
export { TYPERT_REMOTE };
