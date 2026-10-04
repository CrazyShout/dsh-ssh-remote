import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { scopeChainOf, scopeOf, type ScopeKey } from '@deepseek-ai/dsh-scope';
import {
  SubprocessExecutableNotFoundError,
  type SubprocessRuntime,
  type SubprocessSpawnSpec,
  type SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess';
import { posix } from 'node:path';
import type { RemoteHelperProvider } from './helper-fs.js';
import { RemoteHelperRpcError } from './helper/rpc-client.js';
import type { RemotePathResolver } from './runtime-router.js';
import { formatSshUri, parseSshUri } from './types.js';
import { openRemoteUserTerminal, RemoteUserTerminalAllocationError, type RemoteUserTerminal } from './user-pty.js';

interface AgentRoute {
  readonly agent: Agent;
  readonly key: ScopeKey;
  disposed: boolean;
}

/**
 * Complete the execution-world seam consumed by DSH's existing human terminal
 * controller. Cordis traces service calls through the calling Agent context;
 * no global "current host", forged Agent, or duplicate user-terminal API.
 */
export function installRemoteUserSubprocessRouter(
  ctx: Context,
  subprocess: SubprocessRuntime,
  helpers: RemoteHelperProvider,
  resolveRemotePath: RemotePathResolver,
): { dispose(): Promise<void> } {
  const originals = {
    spawn: subprocess.spawn,
    spawnTerminal: subprocess.spawnTerminal,
    terminalEnvironment: subprocess.terminalEnvironment,
    resolveExecutable: subprocess.resolveExecutable,
  };
  const routes = new WeakMap<ScopeKey, AgentRoute>();
  const activeRoutes = new Set<AgentRoute>();
  const terminals = new Set<RemoteUserTerminal>();
  const allocations = new Set<Promise<unknown>>();
  const failedAllocations = new Map<RemoteUserTerminalAllocationError, {
    timer?: ReturnType<typeof setTimeout>;
    pending?: Promise<void>;
  }>();
  const lifetime = new AbortController();
  let disposed = false;
  let disposal: Promise<void> | undefined;

  const retainFailedAllocation = (error: RemoteUserTerminalAllocationError): void => {
    if (failedAllocations.has(error)) return;
    const owner: { timer?: ReturnType<typeof setTimeout>; pending?: Promise<void> } = {};
    failedAllocations.set(error, owner);
    const schedule = (): void => {
      if (disposed) return;
      owner.timer = setTimeout(() => {
        owner.timer = undefined;
        owner.pending = error.retryCleanup();
        void owner.pending.then(() => {
          failedAllocations.delete(error);
        }, () => {
          ctx.logger.warn('Unpublished remote terminal cleanup is still pending; retaining its owned process identity for retry');
          schedule();
        });
      }, 5_000);
      owner.timer.unref?.();
    };
    schedule();
  };

  const register = (agent: Agent): void => {
    const key = scopeOf(agent.ctx);
    if (key === undefined) return;
    const previous = routes.get(key);
    if (previous?.agent === agent && !previous.disposed) return;
    const route: AgentRoute = { agent, key, disposed: false };
    routes.set(key, route); activeRoutes.add(route);
  };
  const unregister = (agent: Agent): void => {
    const key = scopeOf(agent.ctx);
    const route = key === undefined ? undefined : routes.get(key);
    if (route?.agent !== agent) return;
    route.disposed = true; activeRoutes.delete(route);
  };
  // The synchronous snapshot also covers calls between installation and the
  // optional agents fiber becoming active. Every agent, including LOCAL
  // children, is registered so a remote parent never leaks into its child.
  for (const agent of ctx.get('agents')?.list() ?? []) register(agent);
  const agentsFiber = ctx.inject(['agents'], (scope) => {
    for (const agent of scope.agents.list()) register(agent);
    scope.on('agent/created', ({ agent }) => { register(agent); return undefined; });
    scope.on('agent/disposed', ({ agent }) => { unregister(agent); });
    return () => {
      for (const route of activeRoutes) route.disposed = true;
      activeRoutes.clear();
    };
  });

  const assertActive = (): void => {
    if (disposed) throw new Error('remote user subprocess router is disposed');
  };
  const mapped = (path: string | undefined): string | undefined =>
    path === undefined ? undefined : path.startsWith('ssh://') ? path : resolveRemotePath(path);
  const scopedUri = (receiver: unknown): string | undefined => {
    assertActive();
    const caller = (receiver as { ctx?: Context } | undefined)?.ctx;
    if (!Context.is(caller)) return undefined;
    for (const key of scopeChainOf(scopeOf(caller))) {
      let route = routes.get(key);
      if (route === undefined && 'id' in key) {
        const live = ctx.get('agents')?.get((key as Agent).id);
        if (live === key) { register(live); route = routes.get(key); }
      }
      if (route === undefined) continue;
      if (route.disposed) throw new Error('remote user subprocess Agent scope is disposed');
      // Returning undefined here is intentional: the nearest local agent is
      // a routing boundary, not permission to try a remote ancestor.
      return mapped(route.agent.session.header.cwd);
    }
    return undefined;
  };
  const remoteCwd = (receiver: unknown, cwd: string): string | undefined => {
    const scoped = scopedUri(receiver);
    const direct = mapped(cwd);
    if (scoped === undefined) return direct;
    const owner = parseSshUri(scoped);
    if (direct !== undefined) {
      const target = parseSshUri(direct);
      if (owner.host !== target.host || owner.user !== target.user || owner.port !== target.port) {
        throw new Error('remote subprocess cwd belongs to another SSH host');
      }
      return direct;
    }
    if (!posix.isAbsolute(cwd) || cwd.includes('\0')) throw new Error('remote subprocess cwd must be absolute');
    return formatSshUri({ ...owner, path: posix.normalize(cwd) });
  };

  const spawn: SubprocessRuntime['spawn'] = function (this: SubprocessRuntime, spec: SubprocessSpawnSpec) {
    const uri = remoteCwd(this, spec.cwd);
    return originals.spawn.call(this, uri === undefined ? spec : { ...spec, cwd: uri });
  };
  const terminalEnvironment: SubprocessRuntime['terminalEnvironment'] = async function (this: SubprocessRuntime, signal) {
    const uri = scopedUri(this);
    if (uri === undefined) return originals.terminalEnvironment.call(this, signal);
    signal?.throwIfAborted();
    const client = await helpers.client(uri, signal);
    signal?.throwIfAborted();
    return { platform: 'posix', ...(client.hello.platform.shell === undefined ? {} : { defaultShell: client.hello.platform.shell }) };
  };
  const resolveExecutable: SubprocessRuntime['resolveExecutable'] = async function (this: SubprocessRuntime, command, env, signal) {
    const uri = scopedUri(this);
    if (uri === undefined) return originals.resolveExecutable.call(this, command, env, signal);
    const client = await helpers.client(uri, signal);
    const capability = client.capabilities.environment;
    if (capability === null || typeof capability !== 'object' || Array.isArray(capability) || capability.resolveExecutable !== true) {
      throw new Error('remote helper does not support executable discovery; reconnect with the current plugin');
    }
    const remoteCommand = normalizeRemoteExecutable(command);
    try {
      const result = await client.call<{ path: string }>('environment/resolveExecutable', {
        command: remoteCommand, ...(remoteCommand !== command ? { login: true } : {}), ...(env === undefined ? {} : { env }),
      }, { signal, timeoutMs: 20_000 });
      if (typeof result.path !== 'string' || !posix.isAbsolute(result.path) || result.path.includes('\0')) {
        throw new Error('remote helper returned an invalid executable path');
      }
      return result.path;
    } catch (error) {
      if (error instanceof RemoteHelperRpcError && error.code === 'E_EXECUTABLE_NOT_FOUND') {
        throw new SubprocessExecutableNotFoundError(`Executable ${remoteCommand} is not installed on the remote SSH host`, { cause: error });
      }
      throw error;
    }
  };
  const spawnTerminal: SubprocessRuntime['spawnTerminal'] = function (this: SubprocessRuntime, spec: SubprocessTerminalSpawnSpec) {
    const uri = remoteCwd(this, spec.cwd);
    if (uri === undefined) return originals.spawnTerminal.call(this, spec);
    const signal = spec.signal === undefined ? lifetime.signal : AbortSignal.any([lifetime.signal, spec.signal]);
    const allocation = openRemoteUserTerminal(uri, { ...spec, signal }, helpers, terminal => terminals.delete(terminal))
      .then(async (terminal) => {
        terminals.add(terminal);
        if (disposed || signal.aborted) {
          await terminal.terminate();
          throw signal.reason ?? new Error('remote terminal allocation cancelled');
        }
        return terminal;
      }).catch(error => {
        if (error instanceof RemoteUserTerminalAllocationError) retainFailedAllocation(error);
        throw error;
      });
    allocations.add(allocation);
    void allocation.then(() => allocations.delete(allocation), () => allocations.delete(allocation));
    return allocation;
  };
  subprocess.spawn = spawn;
  subprocess.spawnTerminal = spawnTerminal;
  subprocess.terminalEnvironment = terminalEnvironment;
  subprocess.resolveExecutable = resolveExecutable;

  return {
    dispose() {
      if (disposal !== undefined) return disposal;
      disposed = true; lifetime.abort(new Error('remote user subprocess router disposed'));
      for (const owner of failedAllocations.values()) if (owner.timer !== undefined) clearTimeout(owner.timer);
      for (const route of activeRoutes) route.disposed = true;
      disposal = (async () => {
        await Promise.allSettled([...allocations]);
        const closed = await Promise.allSettled([
          ...[...terminals].map(terminal => terminal.terminate()),
          ...[...failedAllocations].map(([error, owner]) => owner.pending?.catch(() => error.retryCleanup()) ?? error.retryCleanup()),
        ]);
        terminals.clear();
        failedAllocations.clear();
        await agentsFiber.dispose();
        // The caller unwinds this outer adapter before its base router.
        // Cordis returns traced method proxies, so equality with a stored
        // function is not a valid test of whether a wrapper is installed.
        subprocess.spawn = originals.spawn;
        subprocess.spawnTerminal = originals.spawnTerminal;
        subprocess.terminalEnvironment = originals.terminalEnvironment;
        subprocess.resolveExecutable = originals.resolveExecutable;
        const errors = closed.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
        if (errors.length > 0) throw new AggregateError(errors, 'remote user terminal cleanup failed');
      })();
      return disposal;
    },
  };
}

/** The existing search router already treats the bundled binary as remote rg. */
function normalizeRemoteExecutable(command: string): string {
  return /(?:^|\/)@vscode\/ripgrep(?:-[a-z0-9-]+)?\/bin\/rg(?:\.exe)?$/u.test(command.replaceAll('\\', '/'))
    ? 'rg' : command;
}
