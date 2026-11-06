import { AsyncLocalStorage } from 'node:async_hooks';
import { posix } from 'node:path';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type FileSystem from '@deepseek-ai/dsh-fs';
import type { RemotePathResolver } from './runtime-router.js';
import { formatSshUri, parseSshUri } from './types.js';

/** Optional public service introduced after the oldest supported DSH SDK. */
export interface WorkingDirectory {
  ensure(agent: Agent, signal?: AbortSignal): Promise<string>;
  set(agent: Agent, path: string, signal?: AbortSignal): Promise<string>;
}

/**
 * DSH canonicalizes child/cd directories with fs.processPath(). That is a
 * remote POSIX path, not an identity on a Windows/macOS Host. Keep the official
 * validation, serialization, change events and notices, but project directories
 * to registered anchors inside these two calls only. Ordinary file results and
 * process arguments still use the real remote path.
 */
export function installRemoteWorkingDirectoryRouter(
  directories: WorkingDirectory, fs: FileSystem, resolve: RemotePathResolver,
  executionPath: (uri: string) => Promise<string>,
): { dispose(): Promise<void> } {
  const current = new AsyncLocalStorage<{ root: string; paths: Map<string, string> } | undefined>();
  const original = { ensure: directories.ensure, set: directories.set,
    resolve: fs.resolve, stat: fs.stat, processPath: fs.processPath };
  const lifetime = new AbortController();
  const pending = new Set<Promise<string>>();
  let disposal: Promise<void> | undefined;
  const mapped = (path: string) => path.startsWith('ssh://') ? path : resolve(path);
  const qualify = (path: string, root: string): string => {
    const identity = parseSshUri(root);
    const uri = mapped(path);
    if (uri !== undefined) {
      const target = parseSshUri(uri);
      if (target.host !== identity.host || target.port !== identity.port || target.user !== identity.user) {
        throw new Error('SSH working directory belongs to a different host; switch workspaces instead.');
      }
      return uri;
    }
    return posix.isAbsolute(path) ? formatSshUri({ ...identity, path }) : path;
  };
  fs.resolve = function (path, options) {
    const route = current.getStore();
    if (route === undefined) return original.resolve.call(this, path, options);
    return original.resolve.call(this, qualify(path, route.root), {
      ...options, cwd: options?.cwd === undefined ? route.root : qualify(options.cwd, route.root),
    });
  };
  fs.stat = async function (target, signal) {
    const route = current.getStore();
    const info = await original.stat.call(this, target, signal);
    if (route !== undefined && info?.type === 'directory' && String(target.targetKey).startsWith('ssh://')) {
      signal?.throwIfAborted();
      route.paths.set(String(target.targetKey), await executionPath(String(target.targetKey)));
    }
    return info;
  };
  fs.processPath = function (target) {
    return current.getStore()?.paths.get(String(target.targetKey)) ?? original.processPath.call(this, target);
  };
  const run = (agent: Agent, signal: AbortSignal | undefined, path?: string) => {
    const origin = agent.session.header.cwd;
    const root = origin === undefined ? undefined : mapped(origin);
    if (root === undefined) {
      if (path !== undefined && mapped(path) !== undefined) {
        return Promise.reject(new Error('Cannot change a local Session into an SSH workspace; open the remote workspace first.'));
      }
      return current.run(undefined, () => path === undefined
        ? original.ensure.call(directories, agent, signal) : original.set.call(directories, agent, path, signal));
    }
    const control = signal === undefined ? lifetime.signal : AbortSignal.any([signal, lifetime.signal]);
    const result = current.run({ root, paths: new Map() }, async () => {
      control.throwIfAborted();
      const value = path === undefined ? await original.ensure.call(directories, agent, control)
        : await original.set.call(directories, agent, qualify(path, root), control);
      control.throwIfAborted();
      if (mapped(value) !== undefined) return value;
      // Repair previously persisted POSIX-only state via the public setter,
      // not by rewriting the session log or guessing a host from its path.
      return original.set.call(directories, agent, qualify(value, root), control);
    });
    pending.add(result);
    void result.then(() => pending.delete(result), () => pending.delete(result));
    return result;
  };
  directories.ensure = (agent, signal) => run(agent, signal);
  directories.set = (agent, path, signal) => run(agent, signal, path);
  return { dispose() { return disposal ??= (async () => {
    lifetime.abort(new Error('SSH working-directory router disposed'));
    await Promise.allSettled(pending);
    directories.ensure = original.ensure; directories.set = original.set;
    fs.resolve = original.resolve; fs.stat = original.stat; fs.processPath = original.processPath;
  })(); } };
}
