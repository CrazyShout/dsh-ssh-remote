import { chmod, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { collectSshAliases, expandHome, resolveOpenSshHost, type SshGRunner } from './ssh-config.js';
import type { LegacyHost, MigrationPreview, MigrationResult, MigrationSelection } from '../shared/migration.js';

const MARKER = '# Managed by dsh-ssh-remote migration; edit with care.\n';
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
type Snapshot = string | null;
interface Journal {
  version: 1; id: string; state: 'prepared' | 'applied' | 'rolled-back';
  before: { config: Snapshot; fragment: Snapshot }; after: { config: string; fragment: string };
  aliases: Record<string, string>;
  result?: MigrationResult;
}

async function snapshot(file: string): Promise<Snapshot> {
  try {
    const st = await lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 2 * 1024 * 1024) throw new Error(`Not a bounded regular configuration file: ${file}`);
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
function quote(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('SSH values cannot contain line breaks or NUL');
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Explicit management operation only. Construction and startup never write SSH config. */
export class SshMigration {
  readonly fragmentPath: string;
  private previews = new Map<string, { value: MigrationPreview; journal: Journal; expires: number }>();
  private active = false;
  constructor(
    readonly configPath: string,
    private readonly stateDir: string,
    private readonly hosts: readonly LegacyHost[],
    private readonly verify: (alias: string) => Promise<void>,
    private readonly restoreMappings: (aliases: Record<string, string>) => Promise<void>,
    private readonly runner?: SshGRunner,
  ) { this.fragmentPath = join(dirname(configPath), 'dsh-ssh-remote.conf'); }

  async preview(selections: MigrationSelection[] = []): Promise<MigrationPreview> {
    const before = { config: await snapshot(this.configPath), fragment: await snapshot(this.fragmentPath) };
    const existing = new Set(collectSshAliases(this.configPath).map(alias => alias.toLowerCase()));
    const names = new Set<string>();
    const hosts = this.hosts.map(host => {
      const alias = selections.find(row => row.name === host.name)?.alias ?? host.name;
      let error: string | undefined;
      if (!ALIAS.test(alias)) error = 'Choose an SSH alias containing letters, digits, dot, underscore or hyphen.';
      else if (existing.has(alias.toLowerCase()) || names.has(alias.toLowerCase())) error = 'Alias already exists. Choose a different alias; existing hosts will not be overwritten.';
      names.add(alias.toLowerCase());
      try {
        for (const value of [host.host, host.user, host.identityFile, host.proxyJump]) quote(value);
        if (!host.host || host.host.startsWith('-') || !Number.isInteger(host.port) || host.port < 1 || host.port > 65535) throw new Error('Invalid host or port');
      } catch (reason) { error = String(reason); }
      return { ...host, alias, ...(error ? { error } : {}) };
    });
    if (before.fragment !== null && !before.fragment.startsWith(MARKER)) throw new Error(`Refusing to replace an unmanaged file: ${this.fragmentPath}`);
    const fragment = (before.fragment ?? MARKER) + hosts.filter(host => !host.error).map(host =>
      `\nHost ${host.alias}\n  HostName ${quote(host.host)}\n  Port ${host.port}\n`
      + (host.user ? `  User ${quote(host.user)}\n` : '')
      + (host.identityFile ? `  IdentityFile ${quote(host.identityFile)}\n` : '')
      + (host.proxyJump ? `  ProxyJump ${quote(host.proxyJump)}\n` : '')).join('');
    const include = `Include ${quote(this.fragmentPath)}\n`;
    const config = (before.config ?? '').startsWith(include) ? before.config! : include + (before.config ?? '');
    const token = randomUUID();
    const value = { token, configPath: this.configPath, fragmentPath: this.fragmentPath,
      before: { config: before.config ?? '', fragment: before.fragment ?? '' }, after: { config, fragment }, hosts,
      ready: hosts.length > 0 && hosts.every(host => !host.error) };
    const aliases = Object.fromEntries(hosts.flatMap(host => [[host.name, host.alias], ...(host.host === host.name ? [] : [[host.host, host.alias]])]));
    for (const [id, plan] of this.previews) if (plan.expires < Date.now()) this.previews.delete(id);
    if (this.previews.size >= 8) this.previews.delete(this.previews.keys().next().value!);
    this.previews.set(token, { value, journal: { version: 1, id: token, state: 'prepared', before, after: value.after, aliases }, expires: Date.now() + 600_000 });
    return value;
  }

  private async replace(file: string, expected: Snapshot, next: Snapshot): Promise<void> {
    if (await snapshot(file) !== expected) throw new Error(`Configuration changed since preview; refusing to overwrite ${file}`);
    if (next === null) { if (expected !== null) await unlink(file); return; }
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(tmp, 'wx', 0o600);
      try { await handle.writeFile(next); await handle.sync(); } finally { await handle.close(); }
      if (await snapshot(file) !== expected) throw new Error(`Configuration changed while writing ${file}`);
      await rename(tmp, file);
      const directory = await open(dirname(file), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } finally { await unlink(tmp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  private async save(journal: Journal): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const directory = await lstat(this.stateDir);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Migration backup directory must be a private regular directory');
    await chmod(this.stateDir, 0o700);
    const file = join(this.stateDir, `${journal.id}.json`);
    await this.replace(file, await snapshot(file), JSON.stringify(journal, null, 2));
  }
  private async locked<T>(action: () => Promise<T>): Promise<T> {
    if (this.active) throw new Error('Another SSH migration is active');
    this.active = true;
    try { return await action(); } finally { this.active = false; }
  }

  async apply(token: string): Promise<MigrationResult> {
    return this.locked(async () => {
      if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error('Invalid migration ID');
      const saved = await snapshot(join(this.stateDir, `${token}.json`));
      if (saved !== null) {
        const previous = JSON.parse(saved) as Journal;
        if (previous.state === 'applied' && previous.result) return previous.result;
        if (previous.state !== 'prepared') throw new Error('Migration has already been rolled back');
      }
      const plan = this.previews.get(token);
      if (!plan || !plan.value.ready || plan.expires < Date.now()) throw new Error('Preview expired or contains conflicts. Preview again before applying.');
      const journal = plan.journal;
      // Check BOTH files before committing either, then retain a recovery journal.
      if (await snapshot(this.configPath) !== journal.before.config || await snapshot(this.fragmentPath) !== journal.before.fragment) throw new Error('SSH configuration changed since preview');
      await this.save(journal);
      try {
        await this.replace(this.fragmentPath, journal.before.fragment, journal.after.fragment);
        await this.replace(this.configPath, journal.before.config, journal.after.config);
        for (const host of plan.value.hosts) {
          const effective = await resolveOpenSshHost(host.alias, this.configPath, this.runner);
          if (!effective || effective.hostName !== host.host || effective.port !== host.port || (host.user && effective.user !== host.user)
            || (host.proxyJump && effective.proxyJump !== host.proxyJump)
            || (host.identityFile && !effective.identityFiles?.includes(expandHome(host.identityFile)))) throw new Error(`ssh -G did not resolve the expected target for ${host.alias}`);
        }
        journal.state = 'applied';
        await this.save(journal);
      } catch (cause) {
        try { await this.restore(journal); } catch (rollback) { throw new AggregateError([cause, rollback], `Migration interrupted. Recovery ID: ${journal.id}; configuration changed externally, manual recovery required.`); }
        throw cause;
      }
      this.previews.delete(token);
      const result: MigrationResult = { id: journal.id, aliases: journal.aliases, verified: [], errors: {} };
      // Failed connection validation leaves a recoverable config, but never remaps to an unverified target.
      for (const host of plan.value.hosts) {
        try { await this.verify(host.alias); result.verified.push(host.alias); }
        catch (error) { result.errors[host.alias] = error instanceof Error ? error.message : String(error); }
      }
      await this.restoreMappings(Object.fromEntries(Object.entries(journal.aliases).filter(([, alias]) => result.verified.includes(alias))));
      journal.result = result; await this.save(journal);
      return result;
    });
  }

  private async restore(journal: Journal): Promise<void> {
    // Check all files first: don't perform a half rollback over a user's later edits.
    for (const [key, file] of [['config', this.configPath], ['fragment', this.fragmentPath]] as const) {
      const current = await snapshot(file);
      if (current !== journal.before[key] && current !== journal.after[key]) throw new Error(`Cannot roll back ${file}: it has been edited since migration`);
    }
    for (const [key, file] of [['config', this.configPath], ['fragment', this.fragmentPath]] as const) {
      const current = await snapshot(file);
      if (current !== journal.before[key]) await this.replace(file, journal.after[key], journal.before[key]);
    }
    journal.state = 'rolled-back'; await this.save(journal);
  }
  async rollback(id: string): Promise<void> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid migration ID');
    await this.locked(async () => {
      const journal = JSON.parse(await readFile(join(this.stateDir, `${id}.json`), 'utf8')) as Journal;
      if (journal.version !== 1 || journal.id !== id) throw new Error('Unsupported migration journal');
      if (journal.state === 'rolled-back') return;
      await this.restore(journal);
      await this.restoreMappings(Object.fromEntries(Object.entries(journal.aliases).reverse().map(([before, after]) => [after, before])));
    });
  }
}
