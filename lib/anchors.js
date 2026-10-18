import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { formatSshUri, parseSshUri } from './types.js';
/** Resolve the existing prefix only: new file paths must work too. */
export function canonicalPath(value) {
    const absolute = resolve(value);
    if (existsSync(absolute))
        return realpathSync(absolute);
    const parent = dirname(absolute);
    return parent === absolute ? absolute : join(canonicalPath(parent), basename(absolute));
}
/** Owns only durable path identities, not connection or UI lifecycle. */
export class AnchorRegistry {
    file;
    entries = new Map();
    queue = Promise.resolve();
    root;
    spellings;
    constructor(file, root) {
        this.file = file;
        this.root = canonicalPath(root);
        this.spellings = [...new Set([resolve(root), this.root])];
        if (!existsSync(file))
            return;
        try {
            const rows = JSON.parse(readFileSync(file, 'utf8'));
            if (!Array.isArray(rows))
                throw new Error('expected an array');
            for (const row of rows) {
                if (!row || typeof row.anchorPath !== 'string' || typeof row.uri !== 'string')
                    throw new Error('invalid entry');
                const anchorPath = canonicalPath(row.anchorPath);
                if (dirname(anchorPath) !== this.root)
                    throw new Error(`anchor outside registry: ${row.anchorPath}`);
                const uri = parseSshUri(row.uri);
                this.entries.set(anchorPath, { ...row, anchorPath, alias: uri.host, remotePath: uri.path });
            }
            for (const entry of this.entries.values())
                mkdirSync(entry.anchorPath, { recursive: true, mode: 0o700 });
        }
        catch (cause) {
            // Never silently turn a broken remote mapping into a local workspace.
            throw new Error(`Cannot restore SSH workspace mappings from ${file}; restore the mapping backup before opening these workspaces`, { cause });
        }
    }
    async materialize(uri) {
        const existing = [...this.entries.values()].find(entry => entry.uri === uri);
        if (existing) {
            await this.save();
            return existing;
        }
        const remote = parseSshUri(uri);
        const title = `${posix.basename(remote.path) || 'root'} · ${remote.host}`;
        const safe = title.replace(/[/:]/g, '-').replace(/\s+/g, ' ').trim();
        const digest = createHash('sha256').update(uri).digest('hex').slice(0, 8);
        const anchorPath = join(this.root, `${safe} [${digest}]`);
        mkdirSync(anchorPath, { recursive: true, mode: 0o700 });
        const entry = { anchorPath, uri, alias: remote.host, remotePath: remote.path, title, createdAt: Date.now() };
        this.entries.set(anchorPath, entry);
        await this.save();
        return entry;
    }
    resolve(localPath) {
        // Anchors are direct children of one canonical root. No per-call sorting.
        const absolute = resolve(localPath);
        const spelling = this.spellings.find(root => absolute.startsWith(`${root}${sep}`));
        if (!spelling)
            return undefined;
        // Never resolve local symlinks below an anchor. Its contents are remote,
        // including paths which do not exist in the empty local anchor directory.
        const suffix = relative(spelling, absolute).split(sep);
        const entry = this.entries.get(join(this.root, suffix[0] ?? ''));
        if (!entry || suffix.some(part => part === '..'))
            return undefined;
        return formatSshUri({ ...parseSshUri(entry.uri), path: posix.join(entry.remotePath, ...suffix.slice(1)) });
    }
    async migrateAliases(aliases) {
        for (const [path, entry] of this.entries) {
            const alias = aliases[entry.alias];
            if (!alias || alias === entry.alias)
                continue;
            this.entries.set(path, { ...entry, alias, uri: formatSshUri({ ...parseSshUri(entry.uri), host: alias }) });
        }
        await this.save();
    }
    save() {
        const data = JSON.stringify([...this.entries.values()], null, 2);
        const pending = this.queue.then(() => writeFileAtomic(this.file, data, { mode: 0o600, dirMode: 0o700 }));
        this.queue = pending.catch(() => { });
        return pending;
    }
    async dispose() { await this.queue; this.entries.clear(); }
}
//# sourceMappingURL=anchors.js.map