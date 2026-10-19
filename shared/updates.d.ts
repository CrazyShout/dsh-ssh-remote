import type { RemoteResult } from './ssh.js';

export interface UpdateInfo {
  /** Opaque profile identity; prevents cross-profile preference and receipt reuse. */
  profileId: string;
  runningVersion: string;
  installedVersion: string;
  source: string;
  sourceKind: 'release' | 'development' | 'unsupported';
  enabled: boolean;
}
export interface ReleaseTarget {
  version: string;
  url: string;
  packageUrl: string;
  publishedAt: string;
  sha256: string;
  testedDshVersions: string[];
}
export interface ReleaseCheck {
  checkedAt: number;
  latest: ReleaseTarget | null;
  error: string;
}
export interface UpdatesRemote {
  info(): Promise<RemoteResult<UpdateInfo>>;
  check(force: boolean): Promise<RemoteResult<ReleaseCheck>>;
}
