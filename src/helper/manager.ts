import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  HELPER_STDERR_MAX_BYTES,
  RemoteHelperInstaller,
  assertSshAlias,
  buildHelperConnectCommand,
  buildSystemSshArgs,
  detectSshCapabilities,
  redactHelperDiagnostic,
  type RemoteHelperInstallerOptions,
  type SshCapabilities,
} from './installer.js';
import {
  RemoteHelperCallInterruptedError,
  RemoteHelperRpcClient,
  RemoteHelperRpcError,
  type RemoteHelperCallOptions,
  type RemoteHelperClient,
} from './rpc-client.js';
import type {
  HelperCapabilities,
  HelperLimits,
  HelperNotificationListener,
  HelperSession,
  ServerHello,
} from './protocol.js';
import { parseSshUri } from '../types.js';

export type RemoteHelperConnectionState =
  | 'disconnected'
  | 'installing'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'reconnecting'
  | 'error';

export interface RemoteHelperStatus {
  alias: string;
  state: RemoteHelperConnectionState;
  attempt: number;
  helperSha256?: string;
  helperVersion?: string;
  sessionId?: string;
  capabilities?: HelperCapabilities;
  limits?: HelperLimits;
  lastError?: string;
  lastConnectedAt?: number;
  lastHealthAt?: number;
  nextRetryAt?: number;
}

export interface RemoteHelperDiagnostics extends RemoteHelperStatus {
  assetPath: string;
  stderr: string;
  hello?: ServerHello;
}

export type RemoteHelperStatusListener = (status: RemoteHelperStatus) => void;

export interface RemoteHelperManagerOptions extends RemoteHelperInstallerOptions {
  aliasValidator?: (alias: string) => boolean;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  healthIntervalMs?: number;
  healthTimeoutMs?: number;
  initializeTimeoutMs?: number;
  clientName?: string;
  clientVersion?: string;
  retentionMs?: number;
  random?: () => number;
  now?: () => number;
}

interface ManagedHelper {
  alias: string;
  state: RemoteHelperConnectionState;
  attempt: number;
  generation: number;
  wanted: boolean;
  clientId: string;
  resumeToken?: string;
  client?: RemoteHelperRpcClient;
  facade?: ManagedRemoteHelperFacade;
  child?: ChildProcess;
  pending?: Promise<RemoteHelperRpcClient>;
  retryTimer?: ReturnType<typeof setTimeout>;
  healthTimer?: ReturnType<typeof setTimeout>;
  stderr: string;
  helperVersion?: string;
  sessionId?: string;
  capabilities?: HelperCapabilities;
  limits?: HelperLimits;
  hello?: ServerHello;
  lastError?: string;
  lastConnectedAt?: number;
  lastHealthAt?: number;
  nextRetryAt?: number;
}

/** Host-scoped, single-flight controller for managed helper SSH sessions. */
export class RemoteHelperManager {
  private readonly installer: RemoteHelperInstaller;
  private readonly entries = new Map<string, ManagedHelper>();
  private readonly listeners = new Set<RemoteHelperStatusListener>();
  private readonly spawnProcess: typeof spawn;
  private readonly sshBinary: string;
  private readonly capabilities?: SshCapabilities;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly healthIntervalMs: number;
  private readonly healthTimeoutMs: number;
  private readonly initializeTimeoutMs: number;
  private readonly clientName: string;
  private readonly clientVersion: string;
  private readonly retentionMs: number;
  private readonly aliasValidator: ((alias: string) => boolean) | undefined;
  private readonly random: () => number;
  private readonly now: () => number;
  private disposed = false;

  constructor(options: RemoteHelperManagerOptions = {}) {
    this.installer = new RemoteHelperInstaller(options);
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.sshBinary = options.sshBinary ?? 'ssh';
    this.capabilities = options.capabilities;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1_000;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30_000;
    this.healthIntervalMs = options.healthIntervalMs ?? 20_000;
    this.healthTimeoutMs = options.healthTimeoutMs ?? 5_000;
    this.initializeTimeoutMs = options.initializeTimeoutMs ?? 20_000;
    this.clientName = options.clientName ?? 'dsh-ssh-remote';
    this.clientVersion = options.clientVersion ?? '0.3.0';
    this.retentionMs = options.retentionMs ?? 120_000;
    this.aliasValidator = options.aliasValidator;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    if (this.reconnectBaseMs <= 0 || this.reconnectMaxMs < this.reconnectBaseMs) {
      throw new Error('invalid reconnect delay bounds');
    }
  }

  /** Get or establish the one helper client owned by the original SSH alias. */
  async client(uriOrAlias: string, signal?: AbortSignal): Promise<RemoteHelperClient> {
    this.assertActive();
    const alias = normalizeAlias(uriOrAlias);
    const entry = this.entry(alias);
    entry.wanted = true;
    const raw = await this.rawClient(entry, signal);
    const facade = entry.facade ??= new ManagedRemoteHelperFacade(
      alias,
      nextSignal => this.rawClient(entry, nextSignal),
      (previous, nextSignal) => this.resumeAfterDisconnect(entry, previous, nextSignal),
      () => { void this.close(alias); },
    );
    facade.bind(raw);
    return facade;
  }

  private async rawClient(entry: ManagedHelper, signal?: AbortSignal): Promise<RemoteHelperRpcClient> {
    signal?.throwIfAborted();
    if (entry.client !== undefined && entry.client.closeReason === undefined) return entry.client;
    if (entry.pending === undefined) {
      this.clearRetry(entry);
      const generation = entry.generation;
      const pending = this.connect(entry, generation).finally(() => {
        if (entry.pending === pending) entry.pending = undefined;
      });
      entry.pending = pending;
    }
    return raceSignal(entry.pending, signal);
  }

  status(uriOrAlias: string): RemoteHelperStatus {
    const alias = normalizeAlias(uriOrAlias);
    const entry = this.entries.get(alias);
    return entry === undefined
      ? { alias, state: 'disconnected', attempt: 0, helperSha256: this.installer.asset.sha256 }
      : this.snapshot(entry);
  }

  diagnostics(uriOrAlias: string): RemoteHelperDiagnostics {
    const alias = normalizeAlias(uriOrAlias);
    const entry = this.entries.get(alias);
    return {
      ...(entry === undefined
        ? { alias, state: 'disconnected' as const, attempt: 0, helperSha256: this.installer.asset.sha256 }
        : this.snapshot(entry)),
      assetPath: this.installer.asset.path,
      stderr: entry?.stderr ?? '',
      ...(entry?.hello === undefined ? {} : { hello: entry.hello }),
    };
  }

  onStatus(listener: RemoteHelperStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatusChange(listener: RemoteHelperStatusListener): () => void {
    return this.onStatus(listener);
  }

  /** Force one fresh install/connection attempt, preserving the resume token. */
  async retry(uriOrAlias: string, signal?: AbortSignal): Promise<RemoteHelperClient> {
    this.assertActive();
    const alias = normalizeAlias(uriOrAlias);
    const entry = this.entry(alias);
    entry.wanted = true;
    entry.generation += 1;
    this.clearRetry(entry);
    this.clearHealth(entry);
    await this.retireTransport(entry, 'manual retry');
    entry.pending = undefined;
    const raw = await this.rawClient(entry, signal);
    const facade = entry.facade ??= new ManagedRemoteHelperFacade(
      alias,
      nextSignal => this.rawClient(entry, nextSignal),
      (previous, nextSignal) => this.resumeAfterDisconnect(entry, previous, nextSignal),
      () => { void this.close(alias); },
    );
    facade.bind(raw);
    return facade;
  }

  async close(uriOrAlias: string): Promise<void> {
    const alias = normalizeAlias(uriOrAlias);
    const entry = this.entries.get(alias);
    if (entry === undefined) return;
    entry.wanted = false;
    entry.generation += 1;
    this.clearRetry(entry);
    this.clearHealth(entry);
    await this.closeRemoteSessionBestEffort(entry);
    entry.facade?.markClosed(new Error('remote helper host closed'));
    entry.facade = undefined;
    await this.retireTransport(entry, 'closed');
    entry.clientId = randomUUID();
    entry.resumeToken = undefined;
    entry.sessionId = undefined;
    entry.pending = undefined;
    entry.attempt = 0;
    entry.nextRetryAt = undefined;
    this.setState(entry, 'disconnected');
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await Promise.allSettled([...this.entries.values()].map(async (entry) => {
      entry.wanted = false;
      entry.generation += 1;
      this.clearRetry(entry);
      this.clearHealth(entry);
      await this.closeRemoteSessionBestEffort(entry);
      entry.facade?.markClosed(new Error('remote helper manager disposed'));
      entry.facade = undefined;
      await this.retireTransport(entry, 'manager disposed');
    }));
    this.entries.clear();
    this.listeners.clear();
  }

  private async connect(entry: ManagedHelper, generation: number): Promise<RemoteHelperRpcClient> {
    let child: ChildProcess | undefined;
    let client: RemoteHelperRpcClient | undefined;
    try {
      this.assertAliasConfigured(entry.alias);
      this.assertCurrent(entry, generation);
      this.setState(entry, entry.attempt === 0 ? 'installing' : 'reconnecting');
      await this.installer.install(entry.alias);
      this.assertCurrent(entry, generation);
      this.setState(entry, 'connecting');

      const capabilities = this.capabilities ?? await detectSshCapabilities(this.sshBinary);
      this.assertCurrent(entry, generation);
      const args = buildSystemSshArgs(
        entry.alias,
        buildHelperConnectCommand(this.installer.asset.sha256),
        capabilities,
      );
      child = this.spawnProcess(this.sshBinary, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      entry.child = child;
      await waitForSpawn(child);
      this.assertCurrent(entry, generation);
      if (child.stdin === null || child.stdout === null || child.stderr === null) {
        throw new Error('helper SSH transport did not expose piped stdio');
      }
      child.stderr.on('data', (chunk: Buffer | string) => {
        if (this.isCurrent(entry, generation)) {
          entry.stderr = appendDiagnostic(entry.stderr, String(chunk));
        }
      });
      client = new RemoteHelperRpcClient({
        readable: child.stdout,
        writable: child.stdin,
        closeTransport: () => terminateChildNow(child as ChildProcess),
        helloTimeoutMs: this.initializeTimeoutMs,
      });
      entry.client = client;
      child.on('error', (error) => client?.transportClosed(error));
      child.once('close', (code, signal) => {
        client?.transportClosed(new Error(
          `system SSH helper transport exited with code ${String(code)}, signal ${String(signal)}`,
        ));
      });
      client.onClose((reason) => this.onClientClosed(entry, generation, client as RemoteHelperRpcClient, reason));
      await client.initialize({
        clientId: entry.clientId,
        clientName: this.clientName,
        clientVersion: this.clientVersion,
        ...(entry.resumeToken === undefined ? {} : { resumeToken: entry.resumeToken }),
        retentionMs: this.retentionMs,
      }, { timeoutMs: this.initializeTimeoutMs });
      this.assertCurrent(entry, generation, client);
      await client.call('health/ping', { nonce: randomUUID() }, { timeoutMs: this.healthTimeoutMs });
      this.assertCurrent(entry, generation, client);

      entry.resumeToken = client.session.resumeToken;
      entry.helperVersion = client.hello.helperVersion;
      entry.sessionId = client.sessionId;
      entry.capabilities = client.capabilities;
      entry.limits = client.limits;
      entry.hello = client.hello;
      entry.lastError = undefined;
      entry.lastConnectedAt = this.now();
      entry.lastHealthAt = this.now();
      entry.nextRetryAt = undefined;
      entry.attempt = 0;
      this.setState(entry, isDegraded(client.capabilities) ? 'degraded' : 'connected');
      entry.facade?.bind(client);
      this.scheduleHealth(entry, generation, client);
      return client;
    } catch (error) {
      const restartWithFreshSession = error instanceof RemoteHelperRpcError
        && error.code === 'E_RESUME_DENIED'
        && entry.resumeToken !== undefined
        && this.isCurrent(entry, generation);
      if (client !== undefined) {
        if (entry.client === client) entry.client = undefined;
        client.close('helper setup failed');
      }
      if (child !== undefined) {
        if (entry.child === child) entry.child = undefined;
        terminateChildNow(child);
      }
      if (restartWithFreshSession) {
        entry.resumeToken = undefined;
        entry.clientId = randomUUID();
        entry.sessionId = undefined;
        entry.capabilities = undefined;
        entry.limits = undefined;
        entry.hello = undefined;
        entry.lastError = 'remote helper session expired; starting a fresh session';
        return this.connect(entry, generation);
      }
      if (this.isCurrent(entry, generation)) {
        entry.client = undefined;
        entry.child = undefined;
        entry.lastError = messageOf(error);
        entry.attempt += 1;
        this.setState(entry, 'error');
        this.scheduleReconnect(entry, generation);
      }
      throw error;
    }
  }

  private onClientClosed(
    entry: ManagedHelper,
    generation: number,
    client: RemoteHelperRpcClient,
    reason: Error,
  ): void {
    if (!this.isCurrent(entry, generation, client)) return;
    this.clearHealth(entry);
    const child = entry.child;
    entry.client = undefined;
    entry.child = undefined;
    terminateChildNow(child);
    entry.lastError = reason.message;
    entry.attempt += 1;
    this.setState(entry, 'error');
    this.scheduleReconnect(entry, generation);
  }

  private async resumeAfterDisconnect(
    entry: ManagedHelper,
    previous: RemoteHelperRpcClient,
    signal?: AbortSignal,
  ): Promise<RemoteHelperRpcClient> {
    this.assertActive();
    signal?.throwIfAborted();
    if (!entry.wanted) throw new Error(`remote helper host ${entry.alias} is closed`);
    if (entry.client !== undefined
      && entry.client !== previous
      && entry.client.closeReason === undefined) return entry.client;
    this.clearRetry(entry);
    if (entry.pending === undefined) {
      const generation = entry.generation;
      const pending = this.connect(entry, generation).finally(() => {
        if (entry.pending === pending) entry.pending = undefined;
      });
      entry.pending = pending;
    }
    return raceSignal(entry.pending, signal);
  }

  private scheduleReconnect(entry: ManagedHelper, generation: number): void {
    if (!entry.wanted || this.disposed || entry.retryTimer !== undefined) return;
    const ceiling = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * (2 ** Math.min(Math.max(entry.attempt - 1, 0), 20)),
    );
    const delay = Math.floor(clampRandom(this.random()) * ceiling);
    entry.nextRetryAt = this.now() + delay;
    this.setState(entry, 'reconnecting');
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = undefined;
      entry.nextRetryAt = undefined;
      if (!this.isCurrent(entry, generation) || !entry.wanted) return;
      const pending = this.connect(entry, generation).finally(() => {
        if (entry.pending === pending) entry.pending = undefined;
      });
      entry.pending = pending;
      void pending.catch(() => {});
    }, delay);
  }

  private scheduleHealth(entry: ManagedHelper, generation: number, client: RemoteHelperRpcClient): void {
    this.clearHealth(entry);
    if (this.healthIntervalMs <= 0) return;
    entry.healthTimer = setTimeout(() => {
      entry.healthTimer = undefined;
      if (!this.isCurrent(entry, generation, client)) return;
      void client.call('health/ping', { nonce: randomUUID() }, {
        timeoutMs: this.healthTimeoutMs,
      }).then(() => {
        if (!this.isCurrent(entry, generation, client)) return;
        entry.lastHealthAt = this.now();
        this.emit(entry);
        this.scheduleHealth(entry, generation, client);
      }, (error) => {
        if (!this.isCurrent(entry, generation, client)) return;
        client.transportClosed(new Error(`helper health check failed: ${messageOf(error)}`));
        terminateChildNow(entry.child);
      });
    }, this.healthIntervalMs);
  }

  private async retireTransport(entry: ManagedHelper, reason: string): Promise<void> {
    const client = entry.client;
    const child = entry.child;
    entry.client = undefined;
    entry.child = undefined;
    client?.close(reason);
    if (child !== undefined) await terminateChild(child);
  }

  private async closeRemoteSessionBestEffort(entry: ManagedHelper): Promise<void> {
    const client = entry.client;
    if (client === undefined || client.closeReason !== undefined) return;
    try {
      await client.call('session/close', {}, { timeoutMs: 5_000, mutation: true });
    } catch (error) {
      entry.lastError = `remote session cleanup was not confirmed: ${messageOf(error)}`;
    }
  }

  private entry(alias: string): ManagedHelper {
    let entry = this.entries.get(alias);
    if (entry === undefined) {
      entry = {
        alias,
        state: 'disconnected',
        attempt: 0,
        generation: 0,
        wanted: false,
        clientId: randomUUID(),
        stderr: '',
      };
      this.entries.set(alias, entry);
    }
    return entry;
  }

  private setState(entry: ManagedHelper, state: RemoteHelperConnectionState): void {
    entry.state = state;
    this.emit(entry);
  }

  private emit(entry: ManagedHelper): void {
    const snapshot = this.snapshot(entry);
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch { /* observers cannot break connection state */ }
    }
  }

  private snapshot(entry: ManagedHelper): RemoteHelperStatus {
    return {
      alias: entry.alias,
      state: entry.state,
      attempt: entry.attempt,
      helperSha256: this.installer.asset.sha256,
      ...(entry.helperVersion === undefined ? {} : { helperVersion: entry.helperVersion }),
      ...(entry.sessionId === undefined ? {} : { sessionId: entry.sessionId }),
      ...(entry.capabilities === undefined ? {} : { capabilities: entry.capabilities }),
      ...(entry.limits === undefined ? {} : { limits: entry.limits }),
      ...(entry.lastError === undefined ? {} : { lastError: entry.lastError }),
      ...(entry.lastConnectedAt === undefined ? {} : { lastConnectedAt: entry.lastConnectedAt }),
      ...(entry.lastHealthAt === undefined ? {} : { lastHealthAt: entry.lastHealthAt }),
      ...(entry.nextRetryAt === undefined ? {} : { nextRetryAt: entry.nextRetryAt }),
    };
  }

  private assertCurrent(entry: ManagedHelper, generation: number, client?: RemoteHelperRpcClient): void {
    if (!this.isCurrent(entry, generation, client)) throw new Error('stale remote helper connection attempt');
  }

  private isCurrent(entry: ManagedHelper, generation: number, client?: RemoteHelperRpcClient): boolean {
    return !this.disposed
      && entry.wanted
      && entry.generation === generation
      && this.entries.get(entry.alias) === entry
      && (client === undefined || entry.client === client);
  }

  private clearRetry(entry: ManagedHelper): void {
    if (entry.retryTimer !== undefined) clearTimeout(entry.retryTimer);
    entry.retryTimer = undefined;
    entry.nextRetryAt = undefined;
  }

  private clearHealth(entry: ManagedHelper): void {
    if (entry.healthTimer !== undefined) clearTimeout(entry.healthTimer);
    entry.healthTimer = undefined;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('remote helper manager is disposed');
  }

  private assertAliasConfigured(alias: string): void {
    if (this.aliasValidator?.(alias) === false) {
      throw new Error(
        `SSH Host alias "${alias}" is no longer present in ~/.ssh/config; refresh the workspace mapping`,
      );
    }
  }
}

/** Stable host-level view that can swap one failed connector for a resumed one. */
class ManagedRemoteHelperFacade implements RemoteHelperClient {
  readonly closed: Promise<void>;
  private current?: RemoteHelperRpcClient;
  private detachNotification?: () => void;
  private readonly notificationListeners = new Set<HelperNotificationListener>();
  private readonly closeListeners = new Set<(reason: Error) => void>();
  private closeReasonValue?: Error;
  private resolveClosed!: () => void;

  constructor(
    readonly alias: string,
    private readonly acquire: (signal?: AbortSignal) => Promise<RemoteHelperRpcClient>,
    private readonly resume: (
      previous: RemoteHelperRpcClient,
      signal?: AbortSignal,
    ) => Promise<RemoteHelperRpcClient>,
    private readonly closeHost: () => void,
  ) {
    this.closed = new Promise<void>((resolve) => { this.resolveClosed = resolve; });
  }

  get hello(): ServerHello {
    return this.expectCurrent().hello;
  }

  get capabilities(): HelperCapabilities {
    return this.expectCurrent().capabilities;
  }

  get limits(): HelperLimits {
    return this.expectCurrent().limits;
  }

  get sessionId(): string {
    return this.expectCurrent().sessionId;
  }

  get session(): HelperSession {
    return this.expectCurrent().session;
  }

  get closeReason(): Error | undefined {
    return this.closeReasonValue;
  }

  bind(client: RemoteHelperRpcClient): void {
    if (this.current === client) return;
    this.detachNotification?.();
    this.current = client;
    this.detachNotification = client.onNotification((notification) => {
      for (const listener of this.notificationListeners) {
        try { listener(notification); } catch { /* isolate consumers */ }
      }
    });
  }

  async call<T>(
    method: string,
    params: Record<string, unknown> = {},
    options: RemoteHelperCallOptions = {},
  ): Promise<T> {
    if (this.closeReasonValue !== undefined) throw this.closeReasonValue;
    const mutation = options.mutation === true || !READ_ONLY_METHODS.has(method);
    const effectiveOptions = mutation && options.mutation !== true
      ? { ...options, mutation: true }
      : options;
    const first = await this.acquire(options.signal);
    this.bind(first);
    try {
      return await first.call<T>(method, params, effectiveOptions);
    } catch (error) {
      if (!(error instanceof RemoteHelperCallInterruptedError)
        || error.kind !== 'disconnect'
        || options.signal?.aborted === true) throw error;

      let resumed: RemoteHelperRpcClient;
      try {
        resumed = await this.resume(first, options.signal);
      } catch {
        throw error;
      }
      this.bind(resumed);
      if (resumed.sessionId !== first.sessionId || resumed.session.resumed !== true) throw error;
      if (mutation
        && (typeof params.operationId !== 'string' || params.operationId.trim().length === 0)) {
        throw error;
      }
      // Exactly one replay. A second interruption is returned directly.
      return resumed.call<T>(method, params, effectiveOptions);
    }
  }

  async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    if (this.closeReasonValue !== undefined) throw this.closeReasonValue;
    const client = await this.acquire();
    this.bind(client);
    return client.notify(method, params);
  }

  notification(method: string, params: Record<string, unknown> = {}): Promise<void> {
    return this.notify(method, params);
  }

  onNotification(listener: HelperNotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onClose(listener: (reason: Error) => void): () => void {
    if (this.closeReasonValue !== undefined) {
      listener(this.closeReasonValue);
      return () => {};
    }
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(): void {
    this.closeHost();
  }

  markClosed(reason: Error): void {
    if (this.closeReasonValue !== undefined) return;
    this.closeReasonValue = reason;
    this.detachNotification?.();
    this.detachNotification = undefined;
    for (const listener of this.closeListeners) {
      try { listener(reason); } catch { /* isolate consumers */ }
    }
    this.closeListeners.clear();
    this.notificationListeners.clear();
    this.resolveClosed();
  }

  private expectCurrent(): RemoteHelperRpcClient {
    if (this.current === undefined) throw new Error(`remote helper ${this.alias} is not connected`);
    return this.current;
  }
}

const READ_ONLY_METHODS = new Set([
  'health/ping',
  'health/status',
  'fs/canonicalize',
  'fs/stat',
  'fs/list',
  'fs/read',
  'fs/readNext',
  'process/read',
  'process/status',
  'process/inspectForeground',
]);

function normalizeAlias(uriOrAlias: string): string {
  let alias = uriOrAlias;
  if (uriOrAlias.startsWith('ssh://')) {
    const parsed = parseSshUri(uriOrAlias);
    if (parsed.user !== '' || parsed.port !== 22) {
      throw new Error(
        'remote helper requires a concrete OpenSSH Host alias; encode User and Port in ~/.ssh/config',
      );
    }
    alias = parsed.host;
  }
  assertSshAlias(alias);
  return alias;
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  if (child.pid !== undefined) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onSpawn = (): void => {
      child.removeListener('error', onError);
      resolve();
    };
    const onError = (error: Error): void => {
      child.removeListener('spawn', onSpawn);
      reject(error);
    };
    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  terminateChildNow(child);
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const graceful = await Promise.race([
    closed.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 2_000)),
  ]);
  if (graceful) return;
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
  await Promise.race([
    closed,
    new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
  ]);
}

function terminateChildNow(child: ChildProcess | undefined): void {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
}

function appendDiagnostic(current: string, chunk: string): string {
  const sanitized = redactHelperDiagnostic(`${current}${chunk}`);
  const bytes = Buffer.from(sanitized, 'utf8');
  if (bytes.length <= HELPER_STDERR_MAX_BYTES) return sanitized;
  let start = bytes.length - HELPER_STDERR_MAX_BYTES;
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
  return bytes.subarray(start).toString('utf8');
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(Math.max(value, 0), 0.999999999999);
}

function isDegraded(capabilities: HelperCapabilities): boolean {
  const session = asCapabilityObject(capabilities.session);
  const pty = asCapabilityObject(capabilities.pty);
  const process = asCapabilityObject(capabilities.process);
  return session?.resume !== true
    || pty?.supported !== true
    || process?.restrictedFailClosed !== true
    || process?.sandbox === 'none';
}

function asCapabilityObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function raceSignal<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      run();
    };
    const onAbort = (): void => finish(() => reject(signal.reason ?? new Error('remote helper wait aborted')));
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    );
  });
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
