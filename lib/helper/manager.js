import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { HELPER_STDERR_MAX_BYTES, RemoteHelperInstaller, assertSshAlias, buildHelperConnectCommand, buildSystemSshArgs, redactHelperDiagnostic, } from './installer.js';
import { RemoteHelperCallInterruptedError, RemoteHelperRpcClient, RemoteHelperRpcError, } from './rpc-client.js';
import { parseSshUri } from '../types.js';
/** Host-scoped, single-flight controller for managed helper SSH sessions. */
export class RemoteHelperManager {
    installer;
    entries = new Map();
    listeners = new Set();
    spawnProcess;
    sshBinary;
    reconnectBaseMs;
    reconnectMaxMs;
    healthIntervalMs;
    healthTimeoutMs;
    initializeTimeoutMs;
    clientName;
    clientVersion;
    retentionMs;
    aliasValidator;
    random;
    now;
    disposed = false;
    constructor(options = {}) {
        this.installer = new RemoteHelperInstaller(options);
        this.spawnProcess = options.spawnProcess ?? spawn;
        this.sshBinary = options.sshBinary ?? 'ssh';
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
    async client(uriOrAlias, signal) {
        this.assertActive();
        const alias = normalizeAlias(uriOrAlias);
        const entry = this.entry(alias);
        entry.wanted = true;
        const raw = await this.rawClient(entry, signal);
        const facade = entry.facade ??= new ManagedRemoteHelperFacade(alias, nextSignal => this.rawClient(entry, nextSignal), (previous, nextSignal) => this.resumeAfterDisconnect(entry, previous, nextSignal), () => { void this.close(alias); });
        facade.bind(raw);
        return facade;
    }
    async rawClient(entry, signal) {
        signal?.throwIfAborted();
        if (entry.client !== undefined && entry.client.closeReason === undefined)
            return entry.client;
        if (entry.pending === undefined) {
            this.clearRetry(entry);
            const generation = entry.generation;
            const pending = this.connect(entry, generation).finally(() => {
                if (entry.pending === pending)
                    entry.pending = undefined;
            });
            entry.pending = pending;
        }
        return raceSignal(entry.pending, signal);
    }
    status(uriOrAlias) {
        const alias = normalizeAlias(uriOrAlias);
        const entry = this.entries.get(alias);
        return entry === undefined
            ? { alias, state: 'disconnected', attempt: 0, helperSha256: this.installer.asset.sha256 }
            : this.snapshot(entry);
    }
    diagnostics(uriOrAlias) {
        const alias = normalizeAlias(uriOrAlias);
        const entry = this.entries.get(alias);
        return {
            ...(entry === undefined
                ? { alias, state: 'disconnected', attempt: 0, helperSha256: this.installer.asset.sha256 }
                : this.snapshot(entry)),
            assetPath: this.installer.asset.path,
            stderr: entry?.stderr ?? '',
            ...(entry?.hello === undefined ? {} : { hello: entry.hello }),
        };
    }
    onStatus(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    onStatusChange(listener) {
        return this.onStatus(listener);
    }
    /** Force one fresh install/connection attempt, preserving the resume token. */
    async retry(uriOrAlias, signal) {
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
        const facade = entry.facade ??= new ManagedRemoteHelperFacade(alias, nextSignal => this.rawClient(entry, nextSignal), (previous, nextSignal) => this.resumeAfterDisconnect(entry, previous, nextSignal), () => { void this.close(alias); });
        facade.bind(raw);
        return facade;
    }
    async close(uriOrAlias) {
        const alias = normalizeAlias(uriOrAlias);
        const entry = this.entries.get(alias);
        if (entry === undefined)
            return;
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
    async dispose() {
        if (this.disposed)
            return;
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
    async connect(entry, generation) {
        let child;
        let client;
        try {
            this.assertAliasConfigured(entry.alias);
            this.assertCurrent(entry, generation);
            this.setState(entry, entry.attempt === 0 ? 'installing' : 'reconnecting');
            await this.installer.install(entry.alias);
            this.assertCurrent(entry, generation);
            this.setState(entry, 'connecting');
            const args = buildSystemSshArgs(entry.alias, buildHelperConnectCommand(this.installer.asset.sha256));
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
            child.stderr.on('data', (chunk) => {
                if (this.isCurrent(entry, generation)) {
                    entry.stderr = appendDiagnostic(entry.stderr, String(chunk));
                }
            });
            client = new RemoteHelperRpcClient({
                readable: child.stdout,
                writable: child.stdin,
                closeTransport: () => terminateChildNow(child),
                helloTimeoutMs: this.initializeTimeoutMs,
            });
            entry.client = client;
            child.on('error', (error) => client?.transportClosed(error));
            child.once('close', (code, signal) => {
                client?.transportClosed(new Error(`system SSH helper transport exited with code ${String(code)}, signal ${String(signal)}`));
            });
            client.onClose((reason) => this.onClientClosed(entry, generation, client, reason));
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
        }
        catch (error) {
            const restartWithFreshSession = error instanceof RemoteHelperRpcError
                && error.code === 'E_RESUME_DENIED'
                && entry.resumeToken !== undefined
                && this.isCurrent(entry, generation);
            if (client !== undefined) {
                if (entry.client === client)
                    entry.client = undefined;
                client.close('helper setup failed');
            }
            if (child !== undefined) {
                if (entry.child === child)
                    entry.child = undefined;
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
    onClientClosed(entry, generation, client, reason) {
        if (!this.isCurrent(entry, generation, client))
            return;
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
    async resumeAfterDisconnect(entry, previous, signal) {
        this.assertActive();
        signal?.throwIfAborted();
        if (!entry.wanted)
            throw new Error(`remote helper host ${entry.alias} is closed`);
        if (entry.client !== undefined
            && entry.client !== previous
            && entry.client.closeReason === undefined)
            return entry.client;
        this.clearRetry(entry);
        if (entry.pending === undefined) {
            const generation = entry.generation;
            const pending = this.connect(entry, generation).finally(() => {
                if (entry.pending === pending)
                    entry.pending = undefined;
            });
            entry.pending = pending;
        }
        return raceSignal(entry.pending, signal);
    }
    scheduleReconnect(entry, generation) {
        if (!entry.wanted || this.disposed || entry.retryTimer !== undefined)
            return;
        const ceiling = Math.min(this.reconnectMaxMs, this.reconnectBaseMs * (2 ** Math.min(Math.max(entry.attempt - 1, 0), 20)));
        const delay = Math.floor(clampRandom(this.random()) * ceiling);
        entry.nextRetryAt = this.now() + delay;
        this.setState(entry, 'reconnecting');
        entry.retryTimer = setTimeout(() => {
            entry.retryTimer = undefined;
            entry.nextRetryAt = undefined;
            if (!this.isCurrent(entry, generation) || !entry.wanted)
                return;
            const pending = this.connect(entry, generation).finally(() => {
                if (entry.pending === pending)
                    entry.pending = undefined;
            });
            entry.pending = pending;
            void pending.catch(() => { });
        }, delay);
    }
    scheduleHealth(entry, generation, client) {
        this.clearHealth(entry);
        if (this.healthIntervalMs <= 0)
            return;
        entry.healthTimer = setTimeout(() => {
            entry.healthTimer = undefined;
            if (!this.isCurrent(entry, generation, client))
                return;
            void client.call('health/ping', { nonce: randomUUID() }, {
                timeoutMs: this.healthTimeoutMs,
            }).then(() => {
                if (!this.isCurrent(entry, generation, client))
                    return;
                entry.lastHealthAt = this.now();
                this.emit(entry);
                this.scheduleHealth(entry, generation, client);
            }, (error) => {
                if (!this.isCurrent(entry, generation, client))
                    return;
                client.transportClosed(new Error(`helper health check failed: ${messageOf(error)}`));
                terminateChildNow(entry.child);
            });
        }, this.healthIntervalMs);
    }
    async retireTransport(entry, reason) {
        const client = entry.client;
        const child = entry.child;
        entry.client = undefined;
        entry.child = undefined;
        client?.close(reason);
        if (child !== undefined)
            await terminateChild(child);
    }
    async closeRemoteSessionBestEffort(entry) {
        const client = entry.client;
        if (client === undefined || client.closeReason !== undefined)
            return;
        try {
            await client.call('session/close', {}, { timeoutMs: 5_000, mutation: true });
        }
        catch (error) {
            entry.lastError = `remote session cleanup was not confirmed: ${messageOf(error)}`;
        }
    }
    entry(alias) {
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
    setState(entry, state) {
        entry.state = state;
        this.emit(entry);
    }
    emit(entry) {
        const snapshot = this.snapshot(entry);
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            }
            catch { /* observers cannot break connection state */ }
        }
    }
    snapshot(entry) {
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
    assertCurrent(entry, generation, client) {
        if (!this.isCurrent(entry, generation, client))
            throw new Error('stale remote helper connection attempt');
    }
    isCurrent(entry, generation, client) {
        return !this.disposed
            && entry.wanted
            && entry.generation === generation
            && this.entries.get(entry.alias) === entry
            && (client === undefined || entry.client === client);
    }
    clearRetry(entry) {
        if (entry.retryTimer !== undefined)
            clearTimeout(entry.retryTimer);
        entry.retryTimer = undefined;
        entry.nextRetryAt = undefined;
    }
    clearHealth(entry) {
        if (entry.healthTimer !== undefined)
            clearTimeout(entry.healthTimer);
        entry.healthTimer = undefined;
    }
    assertActive() {
        if (this.disposed)
            throw new Error('remote helper manager is disposed');
    }
    assertAliasConfigured(alias) {
        if (this.aliasValidator?.(alias) === false) {
            throw new Error(`SSH Host alias "${alias}" is no longer present in ~/.ssh/config; refresh the workspace mapping`);
        }
    }
}
/** Stable host-level view that can swap one failed connector for a resumed one. */
class ManagedRemoteHelperFacade {
    alias;
    acquire;
    resume;
    closeHost;
    closed;
    current;
    detachNotification;
    notificationListeners = new Set();
    closeListeners = new Set();
    closeReasonValue;
    resolveClosed;
    constructor(alias, acquire, resume, closeHost) {
        this.alias = alias;
        this.acquire = acquire;
        this.resume = resume;
        this.closeHost = closeHost;
        this.closed = new Promise((resolve) => { this.resolveClosed = resolve; });
    }
    get hello() {
        return this.expectCurrent().hello;
    }
    get capabilities() {
        return this.expectCurrent().capabilities;
    }
    get limits() {
        return this.expectCurrent().limits;
    }
    get sessionId() {
        return this.expectCurrent().sessionId;
    }
    get session() {
        return this.expectCurrent().session;
    }
    get closeReason() {
        return this.closeReasonValue;
    }
    bind(client) {
        if (this.current === client)
            return;
        this.detachNotification?.();
        this.current = client;
        this.detachNotification = client.onNotification((notification) => {
            for (const listener of this.notificationListeners) {
                try {
                    listener(notification);
                }
                catch { /* isolate consumers */ }
            }
        });
    }
    async call(method, params = {}, options = {}) {
        if (this.closeReasonValue !== undefined)
            throw this.closeReasonValue;
        const mutation = options.mutation === true || !READ_ONLY_METHODS.has(method);
        const effectiveOptions = mutation && options.mutation !== true
            ? { ...options, mutation: true }
            : options;
        const first = await this.acquire(options.signal);
        this.bind(first);
        try {
            return await first.call(method, params, effectiveOptions);
        }
        catch (error) {
            if (!(error instanceof RemoteHelperCallInterruptedError)
                || error.kind !== 'disconnect'
                || options.signal?.aborted === true)
                throw error;
            let resumed;
            try {
                resumed = await this.resume(first, options.signal);
            }
            catch {
                throw error;
            }
            this.bind(resumed);
            if (resumed.sessionId !== first.sessionId || resumed.session.resumed !== true)
                throw error;
            if (mutation
                && (typeof params.operationId !== 'string' || params.operationId.trim().length === 0)) {
                throw error;
            }
            // Exactly one replay. A second interruption is returned directly.
            return resumed.call(method, params, effectiveOptions);
        }
    }
    async notify(method, params = {}) {
        if (this.closeReasonValue !== undefined)
            throw this.closeReasonValue;
        const client = await this.acquire();
        this.bind(client);
        return client.notify(method, params);
    }
    notification(method, params = {}) {
        return this.notify(method, params);
    }
    onNotification(listener) {
        this.notificationListeners.add(listener);
        return () => this.notificationListeners.delete(listener);
    }
    onClose(listener) {
        if (this.closeReasonValue !== undefined) {
            listener(this.closeReasonValue);
            return () => { };
        }
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }
    close() {
        this.closeHost();
    }
    markClosed(reason) {
        if (this.closeReasonValue !== undefined)
            return;
        this.closeReasonValue = reason;
        this.detachNotification?.();
        this.detachNotification = undefined;
        for (const listener of this.closeListeners) {
            try {
                listener(reason);
            }
            catch { /* isolate consumers */ }
        }
        this.closeListeners.clear();
        this.notificationListeners.clear();
        this.resolveClosed();
    }
    expectCurrent() {
        if (this.current === undefined)
            throw new Error(`remote helper ${this.alias} is not connected`);
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
function normalizeAlias(uriOrAlias) {
    let alias = uriOrAlias;
    if (uriOrAlias.startsWith('ssh://')) {
        const parsed = parseSshUri(uriOrAlias);
        if (parsed.user !== '' || parsed.port !== 22) {
            throw new Error('remote helper requires a concrete OpenSSH Host alias; encode User and Port in ~/.ssh/config');
        }
        alias = parsed.host;
    }
    assertSshAlias(alias);
    return alias;
}
function waitForSpawn(child) {
    if (child.pid !== undefined)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        const onSpawn = () => {
            child.removeListener('error', onError);
            resolve();
        };
        const onError = (error) => {
            child.removeListener('spawn', onSpawn);
            reject(error);
        };
        child.once('spawn', onSpawn);
        child.once('error', onError);
    });
}
async function terminateChild(child) {
    if (child.exitCode !== null || child.signalCode !== null)
        return;
    terminateChildNow(child);
    const closed = new Promise((resolve) => child.once('close', () => resolve()));
    const graceful = await Promise.race([
        closed.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    if (graceful)
        return;
    try {
        child.kill('SIGKILL');
    }
    catch { /* already gone */ }
    await Promise.race([
        closed,
        new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]);
}
function terminateChildNow(child) {
    if (child === undefined || child.exitCode !== null || child.signalCode !== null)
        return;
    try {
        child.kill('SIGTERM');
    }
    catch { /* already gone */ }
}
function appendDiagnostic(current, chunk) {
    const sanitized = redactHelperDiagnostic(`${current}${chunk}`);
    const bytes = Buffer.from(sanitized, 'utf8');
    if (bytes.length <= HELPER_STDERR_MAX_BYTES)
        return sanitized;
    let start = bytes.length - HELPER_STDERR_MAX_BYTES;
    while (start < bytes.length && (bytes[start] & 0xc0) === 0x80)
        start += 1;
    return bytes.subarray(start).toString('utf8');
}
function clampRandom(value) {
    if (!Number.isFinite(value))
        return 0.5;
    return Math.min(Math.max(value, 0), 0.999999999999);
}
function isDegraded(capabilities) {
    const session = asCapabilityObject(capabilities.session);
    const pty = asCapabilityObject(capabilities.pty);
    const process = asCapabilityObject(capabilities.process);
    return session?.resume !== true
        || pty?.supported !== true
        || process?.restrictedFailClosed !== true
        || process?.sandbox === 'none';
}
function asCapabilityObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function raceSignal(operation, signal) {
    if (signal === undefined)
        return operation;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (run) => {
            if (settled)
                return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            run();
        };
        const onAbort = () => finish(() => reject(signal.reason ?? new Error('remote helper wait aborted')));
        signal.addEventListener('abort', onAbort, { once: true });
        operation.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    });
}
function messageOf(reason) {
    return reason instanceof Error ? reason.message : String(reason);
}
//# sourceMappingURL=manager.js.map