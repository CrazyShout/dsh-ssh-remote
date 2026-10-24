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
  /** Sanitized transport diagnostics; never raw URLs, proxy credentials or response bodies. */
  failure?: {
    kind: 'network' | 'timeout' | 'rate-limit' | 'http' | 'invalid-response';
    stage: 'release' | 'manifest';
    code?: string;
    httpStatus?: number;
  };
}
export interface UpdatesRemote {
  info(): Promise<RemoteResult<UpdateInfo>>;
  check(force: boolean): Promise<RemoteResult<ReleaseCheck>>;
}
