import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-plugin-manager';
import type {} from '@deepseek-ai/dsh-app-boot';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdateInfo } from '../shared/updates.js';
import { ReleaseCatalog } from './release-catalog.js';

// Captured when this module loads: a changed manifest alone is not a running-code upgrade.
const runningVersion: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

declare module '@deepseek-ai/cordis' { interface Context { sshRemoteUpdates: SshRemoteUpdates } }

export function updateSource(source: string): UpdateInfo['sourceKind'] {
  if (/^(?:link:|workspace:)/u.test(source) || (/^(?:file:|\/|[A-Za-z]:[\\/])/u.test(source) && !/\.tgz$/u.test(source))) return 'development';
  if (/^(?:file:|\/|[A-Za-z]:[\\/]).*\.tgz$/u.test(source)
    || /^https:\/\/github\.com\/CrazyShout\/dsh-ssh-remote\/releases\/download\/v[^/]+\/dsh-ssh-remote-[^/]+\.tgz$/u.test(source)
    || /^(?:github:CrazyShout\/dsh-ssh-remote|git\+https:\/\/github\.com\/CrazyShout\/dsh-ssh-remote(?:\.git)?)#/u.test(source)) return 'release';
  return 'unsupported';
}

/** Observation only. DSH's independent pluginManager owns all package writes and activation. */
export class SshRemoteUpdates extends TypertRemoteService {
  private readonly catalog = new ReleaseCatalog();
  private readonly profileId: string;
  constructor(private readonly owner: Context) {
    super(owner, 'sshRemoteUpdates');
    this.profileId = createHash('sha256').update(realpathSync(owner.profileContext.dir)).digest('hex').slice(0, 24);
    owner.effect(() => () => this.catalog.dispose());
  }
  @Remote('info')
  async info(): Promise<UpdateInfo> {
    const bundle = (await this.owner.pluginManager.listBundles()).find(row => row.name === 'dsh-ssh-remote');
    // DSH 0.2.0 does not include source in BundleInfo. Read the current public
    // profile manifest, never infer a package's source from its resolved path.
    const manifest = JSON.parse(readFileSync(join(this.owner.profileContext.dir, 'package.json'), 'utf8'));
    const recorded = manifest.dependencies?.['dsh-ssh-remote'];
    const source = typeof recorded === 'string' ? recorded.replace(/^((?:git\+)?https?:\/\/)[^/]*@/u, '$1') : '';
    return { profileId: this.profileId, runningVersion, installedVersion: bundle?.version ?? '', source,
      sourceKind: bundle?.installed ? updateSource(source) : 'unsupported', enabled: bundle?.enabled ?? false };
  }
  @Remote('check')
  check(force: boolean) { return this.catalog.check(force); }
}
