import type { Context } from '@deepseek-ai/cordis';
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl, SkillProviderObservation, SkillSource } from '@deepseek-ai/dsh-skill';
import { posix } from 'node:path';
import { parse } from 'yaml';
import { HelperRemoteFileSystem, type RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
import { formatSshUri, parseSshUri } from './types.js';

const SKILL_MAX_BYTES = 256 * 1024;
const CATALOG_MAX_BYTES = 8 * 1024 * 1024;
const CATALOG_MAX_FILES = 1_000;
const CATALOG_TTL_MS = 60_000;
type Files = Pick<HelperRemoteFileSystem, 'resolve' | 'lstat' | 'listDir' | 'readSnapshot'>;
interface Root { path: string; source: SkillSource; rank: number; skipSystem?: boolean }
interface Locator { workspace: string; uri: string; directory: string }
type ParsedSkill = Pick<SkillDefinition, 'name' | 'description' | 'whenToUse' | 'invocation' | 'content' | 'metadata'>;

/** A provider, not a replacement for the host's local/bundled skill registry. */
export class RemoteSkillsProvider implements SkillProvider {
  readonly name = 'ssh-remote-filesystem';
  private timer?: ReturnType<typeof setTimeout>;
  private revision = 0;

  constructor(private readonly files: Files, private readonly resolveRemotePath: RemotePathResolver,
    private readonly home: (uri: string, signal: AbortSignal) => Promise<string>,
    private readonly control: SkillProviderControl, private readonly warn: (message: string) => void) {
    control.signal.addEventListener('abort', () => clearTimeout(this.timer), { once: true });
  }

  invalidate() {
    this.revision += 1; clearTimeout(this.timer); this.timer = undefined;
    if (!this.control.signal.aborted) this.control.invalidate();
  }

  private workspace(cwd: string | undefined) {
    if (!cwd) return undefined;
    const uri = cwd.startsWith('ssh://') ? cwd : this.resolveRemotePath(cwd);
    if (!uri) return undefined;
    const parsed = parseSshUri(uri);
    return formatSshUri({ ...parsed, path: posix.normalize(parsed.path) });
  }

  private signal(options: SkillLookupOptions) {
    return options.signal ? AbortSignal.any([options.signal, this.control.signal]) : this.control.signal;
  }

  async list(options: SkillLookupOptions): Promise<SkillProviderObservation> {
    const workspace = this.workspace(options.cwd);
    if (!workspace) return { candidates: [], complete: true };
    const signal = this.signal(options); signal.throwIfAborted();
    const revision = this.revision, identity = parseSshUri(workspace);
    const uri = (path: string) => formatSshUri({ ...identity, path });
    const home = await this.home(workspace, signal);
    if (!posix.isAbsolute(home)) throw new Error('remote helper did not report an absolute home directory');
    let project = identity.path;
    while (true) {
      if (await this.files.lstat(uri(posix.join(project, '.git')), undefined, signal)) break;
      const parent = posix.dirname(project);
      if (parent === project) { project = identity.path; break; }
      project = parent;
    }
    // Same category precedence as DSH, with the remote source winning a tie
    // against a local source only for this remote workspace.
    const roots: Root[] = [
      { path: posix.join(project, '.dsh/skills'), source: 'project-dsh', rank: 99 },
      { path: posix.join(project, '.agents/skills'), source: 'project-agents', rank: 199 },
      { path: posix.join(home, '.dsh/skills'), source: 'user-dsh', rank: 399, skipSystem: true },
      { path: posix.join(home, '.agents/skills'), source: 'user-agents', rank: 499 },
    ];
    const candidates: SkillCandidate[] = [];
    let complete = true, bytes = 0, count = 0;
    discovery: for (const root of roots) {
      signal.throwIfAborted();
      try {
        if (!await this.files.lstat(uri(root.path), undefined, signal)) continue;
        const target = await this.files.resolve(uri(root.path), { signal });
        const entries = await this.files.listDir(target, signal);
        const paths = entries.flatMap(entry => {
          if (root.skipSystem && entry.name === '.system') return [];
          const directory = entry.type === 'directory' ? posix.join(root.path, entry.name) : root.path;
          const path = entry.type === 'directory' ? posix.join(directory, 'SKILL.md')
            : entry.type === 'file' && entry.name.endsWith('.md') ? posix.join(root.path, entry.name) : undefined;
          return path ? [{ path, directory }] : [];
        });
        for (let offset = 0; offset < paths.length;) {
          if (count >= CATALOG_MAX_FILES || bytes >= CATALOG_MAX_BYTES) {
            complete = false; this.warn('remote skill catalog exceeds its 1000-file / 8 MiB discovery budget'); break discovery;
          }
          const remaining = CATALOG_MAX_BYTES - bytes;
          const lanes = Math.min(4, CATALOG_MAX_FILES - count, Math.max(1, Math.floor(remaining / SKILL_MAX_BYTES)));
          const batch = paths.slice(offset, offset + lanes); offset += batch.length; count += batch.length;
          // Small parallel reads amortize SSH latency. Reserve worst-case bytes
          // for the whole batch, and retain listing order rather than completion order.
          const results = await Promise.allSettled(batch.map(item => this.read(uri(item.path), signal, Math.min(SKILL_MAX_BYTES, remaining))));
          signal.throwIfAborted();
          for (const [index, result] of results.entries()) {
            const { path, directory } = batch[index];
            if (result.status === 'rejected') { complete = false; this.warn(`remote skill ${uri(path)}: ${String(result.reason)}`); continue; }
            const loaded = result.value;
            if (!loaded) continue;
            bytes += loaded.bytes;
            const { parsed } = loaded;
            if (!parsed) continue;
            candidates.push({ name: parsed.name, description: parsed.description, invocation: parsed.invocation,
              ...(parsed.whenToUse ? { whenToUse: parsed.whenToUse } : {}),
              ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
              provider: this.name, source: root.source, rank: root.rank, path,
              resourceBase: { kind: 'directory', path: directory },
              locator: { workspace, uri: uri(path), directory } satisfies Locator });
          }
        }
      } catch (error) {
        signal.throwIfAborted(); complete = false;
        this.warn(`remote skills ${uri(root.path)}: ${String(error)}`);
      }
    }
    signal.throwIfAborted();
    // The remote has no local Chokidar watcher. Expire the public registry's
    // completed catalog once, without polling SSH or keeping Node alive.
    if (!this.timer) { this.timer = setTimeout(() => this.invalidate(), CATALOG_TTL_MS); this.timer.unref?.(); }
    return { candidates, complete: complete && revision === this.revision };
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as Locator | undefined;
    if (!locator || candidate.provider !== this.name || locator.workspace !== this.workspace(options.cwd)) return undefined;
    const loaded = await this.read(locator.uri, this.signal(options));
    if (!loaded?.parsed || loaded.parsed.name !== candidate.name) { this.invalidate(); return undefined; }
    return { ...loaded.parsed, source: candidate.source, provider: this.name,
      path: parseSshUri(locator.uri).path, resourceBase: { kind: 'directory', path: locator.directory } };
  }

  private async read(uri: string, signal: AbortSignal, maxBytes = SKILL_MAX_BYTES): Promise<{ parsed?: ParsedSkill; bytes: number } | undefined> {
    try {
      const target = await this.files.resolve(uri, { signal });
      const result = await this.files.readSnapshot(target, maxBytes, signal);
      signal.throwIfAborted();
      let parsed: ParsedSkill | undefined;
      try { parsed = parseRemoteSkill(new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)); }
      catch (error) { this.warn(`remote skill ${uri} ignored: ${String(error)}`); }
      if (!parsed) this.warn(`remote skill ${uri} ignored: invalid or missing skill frontmatter`);
      return { parsed, bytes: result.bytes.length };
    } catch (error) {
      signal.throwIfAborted();
      if (typeof error === 'object' && error && 'code' in error && ['FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(String(error.code))) return undefined;
      throw error;
    }
  }
}

/** Match the public DSH filesystem skill frontmatter and invocation policy. */
export function parseRemoteSkill(raw: string): ParsedSkill | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(raw);
  if (!match) return undefined;
  const data: unknown = parse(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const fields = data as Record<string, unknown>;
  if (typeof fields.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(fields.name)
    || typeof fields.description !== 'string' || !fields.description) return undefined;
  for (const key of ['disableModelInvocation', 'modelInvocable', 'userInvocable']) {
    if (Object.hasOwn(fields, key)) throw new Error(`unsupported legacy invocation field ${key}`);
  }
  const boolean = (key: string): boolean | undefined => {
    if (!Object.hasOwn(fields, key)) return undefined;
    const value = fields[key];
    if (value === true || value === 1 || typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true;
    if (value === false || value === 0 || typeof value === 'string' && ['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false;
    throw new Error(`skill frontmatter ${key} must be a boolean`);
  };
  return { name: fields.name, description: fields.description, content: match[2].trim(),
    invocation: { modelInvocable: boolean('disable-model-invocation') !== true, userInvocable: boolean('user-invocable') !== false },
    ...(typeof fields.whenToUse === 'string' && fields.whenToUse ? { whenToUse: fields.whenToUse } : {}),
    ...(fields.metadata && typeof fields.metadata === 'object' && !Array.isArray(fields.metadata) ? { metadata: fields.metadata as Record<string, unknown> } : {}) };
}

export function mountRemoteSkills(ctx: Context, helpers: RemoteHelperProvider, resolveRemotePath: RemotePathResolver) {
  let provider: RemoteSkillsProvider | undefined;
  const fiber = ctx.inject(['skills'], scope => {
    let owned!: RemoteSkillsProvider;
    const unregister = scope.skills.registerProvider(control => owned = new RemoteSkillsProvider(
      new HelperRemoteFileSystem(helpers, resolveRemotePath), resolveRemotePath, async (uri, signal) => {
        const client = await helpers.client(uri, signal);
        return client.hello.platform.home ?? (await client.call<{ home: string }>('health/status', {}, { signal })).home;
      }, control, message => scope.logger.warn(message)));
    provider = owned;
    scope.on('fs/observed', (target, _observation, actor) => {
      const name = actor && 'name' in actor ? actor.name : undefined;
      if ((name === 'write' || name === 'edit') && String(target.targetKey).startsWith('ssh://')) owned.invalidate();
    });
    return () => { unregister(); if (provider === owned) provider = undefined; };
  });
  return { invalidate: () => provider?.invalidate(), dispose: () => fiber.dispose() };
}
