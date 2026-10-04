import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { parseSshUri } from './types.js';
const READ_BYTES = 64 * 1024;
const INPUT_CHUNK_BYTES = 64 * 1024;
const MAX_QUEUED_INPUT = 1024 * 1024;
const READ_WAIT_MS = 500;
/** The router retains this retryable owner when unpublished cleanup fails. */
export class RemoteUserTerminalAllocationError extends AggregateError {
    retryCleanup;
    constructor(spawnError, cleanupError, retryCleanup) {
        super([spawnError, cleanupError], 'remote user terminal allocation cleanup failed');
        this.retryCleanup = retryCleanup;
        this.name = 'RemoteUserTerminalAllocationError';
    }
}
/** Human terminals deliberately use the SSH user's permissions, like DSH's local user terminal. */
export async function openRemoteUserTerminal(uri, spec, helpers, onClosed = () => { }) {
    validateSpawn(spec);
    spec.signal?.throwIfAborted();
    const parsed = parseSshUri(uri);
    const client = await helpers.client(uri, spec.signal);
    const allocation = { uri, workspaceId: randomUUID(), processId: randomUUID(), sessionId: client.sessionId };
    let attempted = false;
    try {
        attempted = true;
        await client.call('workspace/open', {
            path: '/', access: 'danger-full-access', workspaceId: allocation.workspaceId,
            operationId: allocation.workspaceId,
        }, { signal: spec.signal, timeoutMs: 20_000, mutation: true });
        spec.signal?.throwIfAborted();
        const started = await client.call('process/start', {
            workspaceId: allocation.workspaceId, processId: allocation.processId, operationId: allocation.processId,
            cwd: parsed.path.replace(/^\/+/, ''), argv: [...spec.argv],
            env: { ...spec.env, TERM: spec.terminalType }, stdin: 'pipe',
            tty: { rows: spec.rows, cols: spec.cols, term: spec.terminalType },
        }, { signal: spec.signal, timeoutMs: 30_000, mutation: true });
        if (started.processId !== allocation.processId || !Number.isSafeInteger(started.pid) || started.pid <= 0) {
            throw new Error('remote helper returned an invalid user terminal process');
        }
        spec.signal?.throwIfAborted();
        await closeWorkspace(client, allocation.workspaceId);
        spec.signal?.throwIfAborted();
        return new RemoteUserTerminal(helpers, allocation, started, spec.graceMs, onClosed);
    }
    catch (error) {
        if (!attempted)
            throw error;
        try {
            await rollback(helpers, allocation);
        }
        catch (cleanupError) {
            throw new RemoteUserTerminalAllocationError(error, cleanupError, () => rollback(helpers, allocation));
        }
        throw error;
    }
}
/**
 * Raw helper PTY handle consumed by the OFFICIAL human TerminalController.
 * That controller owns session authorization, exclusive input attachments,
 * xterm screen recovery, UI retention, and input limits; this owns remote I/O.
 */
export class RemoteUserTerminal {
    helpers;
    allocation;
    graceMs;
    onClosed;
    output = new PassThrough({ highWaterMark: READ_BYTES });
    done;
    pid;
    pumpLifetime = new AbortController();
    operationLifetime = new AbortController();
    statusLifetime = new AbortController();
    operations = new Set();
    pump;
    outcomeWatch;
    inputTail = Promise.resolve();
    queuedInputBytes = 0;
    cursor = '0';
    revision = 0;
    closing = false;
    quiescent = false;
    outcomeSettled = false;
    cleanup;
    resolveOutcome;
    rejectOutcome;
    constructor(helpers, allocation, started, graceMs, onClosed) {
        this.helpers = helpers;
        this.allocation = allocation;
        this.graceMs = graceMs;
        this.onClosed = onClosed;
        this.pid = started.pid;
        this.done = new Promise((resolve, reject) => { this.resolveOutcome = resolve; this.rejectOutcome = reject; });
        // Consumers attach immediately after spawn; failures can still precede
        // their first microtask, so never emit an unhandled stream/promise error.
        this.output.on('error', () => { });
        void this.done.catch(() => { });
        if (!started.running)
            this.observeOutcome(started);
        this.pump = this.pumpOutput();
        this.outcomeWatch = this.watchOutcome();
    }
    write(data) {
        this.assertOpen();
        if (typeof data !== 'string')
            return Promise.reject(new TypeError('terminal input must be text'));
        const bytes = Buffer.byteLength(data, 'utf8');
        if (bytes + this.queuedInputBytes > MAX_QUEUED_INPUT) {
            return Promise.reject(new Error('remote terminal queued input exceeds 1 MiB'));
        }
        this.queuedInputBytes += bytes;
        this.revision += 1;
        const operation = this.inputTail.catch(() => { }).then(async () => {
            this.assertOpen();
            const buffer = Buffer.from(data, 'utf8');
            for (let offset = 0; offset < buffer.length; offset += INPUT_CHUNK_BYTES) {
                this.assertOpen();
                const chunk = buffer.subarray(offset, offset + INPUT_CHUNK_BYTES);
                const result = await this.call('process/write', {
                    processId: this.allocation.processId, operationId: randomUUID(), encoding: 'base64', data: chunk.toString('base64'),
                }, { mutation: true, signal: this.operationLifetime.signal, timeoutMs: 10_000 });
                if (result.written !== chunk.length)
                    throw new Error('remote helper accepted incomplete terminal input');
            }
        }).finally(() => { this.queuedInputBytes -= bytes; });
        this.inputTail = operation;
        return this.track(operation);
    }
    resize(cols, rows) {
        this.assertOpen();
        validateDimensions(cols, rows);
        this.revision += 1;
        return this.track(this.call('process/resize', {
            processId: this.allocation.processId, operationId: randomUUID(), cols, rows,
        }, { mutation: true, signal: this.operationLifetime.signal, timeoutMs: 5_000 }).then(() => { }));
    }
    inspectForeground() {
        this.assertOpen();
        return this.track(this.call('process/inspectForeground', {
            processId: this.allocation.processId,
        }, { signal: this.operationLifetime.signal, timeoutMs: 5_000 }).then(result => {
            if (result.verified !== true || !Number.isSafeInteger(result.pgid) || result.pgid <= 1)
                return undefined;
            // Silence is not proof of waiting for input. Native prompt observation
            // is intentionally not invented from the remote shell's output.
            return { processGroupId: result.pgid, inputWaiting: false };
        }));
    }
    async inspectActivity() {
        return { state: this.quiescent ? 'idle' : 'unknown', revision: this.revision };
    }
    signalForeground(signal) {
        this.assertOpen();
        this.revision += 1;
        return this.track((async () => {
            const result = await this.call('process/signal', {
                processId: this.allocation.processId, operationId: randomUUID(), signal, target: 'foreground', denyOwnShellKill: true,
            }, { mutation: true, signal: this.operationLifetime.signal, timeoutMs: 5_000 });
            if (result.delivered !== true || result.verified !== true || !Number.isSafeInteger(result.targetPgid) || result.targetPgid <= 1) {
                throw new Error('remote terminal foreground signal delivery was not confirmed');
            }
            return result.targetPgid;
        })());
    }
    terminate() {
        if (this.quiescent)
            return Promise.resolve();
        if (this.cleanup !== undefined)
            return this.cleanup;
        this.closing = true;
        this.operationLifetime.abort(new Error('remote user terminal is closing'));
        const cleanup = this.cleanupOnce().catch(error => {
            if (this.cleanup === cleanup)
                this.cleanup = undefined;
            this.failOutcome(error);
            this.output.destroy(asError(error));
            throw error;
        });
        this.cleanup = cleanup;
        return cleanup;
    }
    async cleanupOnce() {
        await Promise.allSettled([...this.operations]);
        let unknown = false;
        try {
            await this.call('process/terminate', {
                processId: this.allocation.processId, operationId: `user-terminate:${this.allocation.processId}`,
                force: false, graceMs: this.graceMs,
            }, { timeoutMs: 5_000, mutation: true });
        }
        catch (error) {
            if (!isUnknownProcess(error))
                throw error;
            unknown = true;
        }
        if (!unknown) {
            await delay(this.graceMs);
            await this.call('process/terminate', {
                processId: this.allocation.processId, operationId: `user-force:${this.allocation.processId}`, force: true,
            }, { timeoutMs: 5_000, mutation: true });
            const deadline = Date.now() + 2_000;
            while (!this.outcomeSettled && Date.now() < deadline) {
                const status = await this.call('process/status', {
                    processId: this.allocation.processId,
                }, { timeoutMs: 2_000 });
                if (!status.running)
                    this.observeOutcome(status);
                else
                    await delay(20);
            }
            // Keep pumping through TERM traps and final output. Backpressure cannot
            // hold cleanup forever; exceeding this drain bound is an explicit loss,
            // never a successful, silently truncated terminal stream.
            const drained = await bounded(this.pump, 2_000);
            if (!drained) {
                this.pumpLifetime.abort(new Error('remote terminal final output drain timed out'));
                await this.pump;
                this.output.destroy(new Error('remote terminal output could not be fully drained before cleanup'));
            }
            await this.call('process/release', {
                processId: this.allocation.processId, operationId: `user-release:${this.allocation.processId}`,
            }, { timeoutMs: 8_000, mutation: true });
        }
        if (unknown) {
            this.pumpLifetime.abort(new Error('remote terminal process no longer exists'));
            await this.pump;
        }
        const client = await this.client();
        await closeWorkspace(client, this.allocation.workspaceId);
        if (!this.outcomeSettled)
            this.failOutcome(new Error('remote terminal ended without a confirmed process outcome'));
        await this.outcomeWatch;
        this.quiescent = true;
        this.revision += 1;
        if (!this.output.destroyed)
            this.output.end();
        this.onClosed(this);
    }
    async pumpOutput() {
        try {
            for (;;) {
                this.pumpLifetime.signal.throwIfAborted();
                const result = await this.call('process/read', {
                    processId: this.allocation.processId, afterSeq: this.cursor, maxBytes: READ_BYTES, waitMs: READ_WAIT_MS,
                }, { signal: this.pumpLifetime.signal, timeoutMs: 6_000 });
                if (result.truncated)
                    throw new Error('remote terminal output buffer overflowed during disconnection; reopen this terminal');
                if (!Array.isArray(result.chunks) || typeof result.nextSeq !== 'string')
                    throw new Error('invalid remote terminal output');
                this.cursor = result.nextSeq;
                // Outcome is independent of output backpressure. The controller still
                // drains the output stream before publishing its final screen state.
                if (result.exitCode !== null || result.signal !== null)
                    this.observeOutcome(result);
                for (const chunk of result.chunks) {
                    const data = Buffer.from(chunk.data, 'base64');
                    if (data.length === 0)
                        continue;
                    this.revision += 1;
                    if (!this.output.write(data))
                        await waitForDrain(this.output, this.pumpLifetime.signal);
                }
                if (result.exited) {
                    this.observeOutcome(result);
                    this.output.end();
                    // The pump must settle before cleanup joins it; schedule the owned
                    // release outside its own continuation, without a self-await cycle.
                    queueMicrotask(() => { void this.terminate().catch(() => { }); });
                    return;
                }
            }
        }
        catch (error) {
            if (this.pumpLifetime.signal.aborted && this.closing)
                return;
            this.failOutcome(error);
            this.output.destroy(asError(error));
            queueMicrotask(() => { void this.terminate().catch(() => { }); });
        }
    }
    /** Exit facts must remain observable even while a slow consumer applies backpressure. */
    async watchOutcome() {
        try {
            while (!this.outcomeSettled) {
                const status = await this.call('process/status', { processId: this.allocation.processId }, {
                    signal: this.statusLifetime.signal, timeoutMs: 3_000,
                });
                if (!status.running) {
                    this.observeOutcome(status);
                    return;
                }
                await abortableDelay(250, this.statusLifetime.signal);
            }
        }
        catch (error) {
            if (this.outcomeSettled || this.statusLifetime.signal.aborted)
                return;
            this.failOutcome(error);
            this.output.destroy(asError(error));
            queueMicrotask(() => { void this.terminate().catch(() => { }); });
        }
    }
    async client(signal) {
        const client = await this.helpers.client(this.allocation.uri, signal);
        if (client.sessionId !== this.allocation.sessionId) {
            throw new Error('remote helper session expired; this terminal cannot be silently recreated');
        }
        return client;
    }
    async call(method, params, options = {}) {
        const client = await this.client(options.signal);
        return client.call(method, params, options);
    }
    track(operation) {
        this.operations.add(operation);
        void operation.then(() => this.operations.delete(operation), () => this.operations.delete(operation));
        return operation;
    }
    assertOpen() {
        if (this.closing || this.quiescent)
            throw new Error('remote user terminal is closing or closed');
    }
    observeOutcome(result) {
        if (this.outcomeSettled)
            return;
        this.outcomeSettled = true;
        this.statusLifetime.abort();
        this.resolveOutcome({ exitCode: result.exitCode, signal: normalizeSignal(result.signal) });
    }
    failOutcome(error) {
        if (this.outcomeSettled)
            return;
        this.outcomeSettled = true;
        this.rejectOutcome(error);
        this.statusLifetime.abort();
    }
}
async function rollback(helpers, allocation) {
    const client = await helpers.client(allocation.uri);
    if (client.sessionId !== allocation.sessionId)
        throw new Error('cannot confirm cleanup after remote helper session replacement');
    const failures = [];
    for (const [method, operationId] of [
        ['process/terminate', `rollback-terminate:${allocation.processId}`],
        ['process/release', `rollback-release:${allocation.processId}`],
    ]) {
        const deadline = Date.now() + 20_000;
        for (;;) {
            try {
                await client.call(method, { processId: allocation.processId, operationId, force: true }, { timeoutMs: 8_000, mutation: true });
                break;
            }
            catch (error) {
                if (isUnknownProcess(error))
                    break;
                if (isStartingProcess(error) && Date.now() < deadline) {
                    await delay(100);
                    continue;
                }
                failures.push(error);
                break;
            }
        }
    }
    try {
        await closeWorkspace(client, allocation.workspaceId);
    }
    catch (error) {
        failures.push(error);
    }
    if (failures.length)
        throw new AggregateError(failures, 'remote terminal rollback was not confirmed');
}
async function closeWorkspace(client, workspaceId) {
    await client.call('workspace/close', { workspaceId, operationId: `close:${workspaceId}` }, { timeoutMs: 5_000, mutation: true });
}
function validateSpawn(spec) {
    validateDimensions(spec.cols, spec.rows);
    if (!Array.isArray(spec.argv) || spec.argv.length === 0 || spec.argv.some(value => typeof value !== 'string' || value.includes('\0')) || !spec.argv[0]) {
        throw new TypeError('terminal argv must contain a non-empty executable and NUL-free strings');
    }
    if (!Number.isSafeInteger(spec.graceMs) || spec.graceMs <= 0 || spec.graceMs > 30_000) {
        throw new RangeError('remote terminal graceMs must be between 1 and 30000');
    }
    if (typeof spec.terminalType !== 'string' || !spec.terminalType || spec.terminalType.includes('\0'))
        throw new TypeError('invalid terminal type');
}
function validateDimensions(cols, rows) {
    if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows) || cols < 1 || rows < 1 || cols > 10_000 || rows > 10_000) {
        throw new RangeError('terminal dimensions must be integers between 1 and 10000');
    }
}
function normalizeSignal(signal) {
    if (typeof signal === 'string')
        return (signal.startsWith('SIG') ? signal : `SIG${signal}`);
    const known = { 1: 'SIGHUP', 2: 'SIGINT', 3: 'SIGQUIT', 9: 'SIGKILL', 15: 'SIGTERM' };
    return signal === null ? null : known[signal] ?? null;
}
function isUnknownProcess(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'E_UNKNOWN_PROCESS';
}
function isStartingProcess(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'E_PROCESS_STARTING';
}
function asError(error) { return error instanceof Error ? error : new Error(String(error)); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function abortableDelay(ms, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
    });
}
function bounded(operation, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        void operation.then(() => { clearTimeout(timer); resolve(true); }, error => { clearTimeout(timer); reject(error); });
    });
}
function waitForDrain(stream, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const finish = (error) => {
            stream.off('drain', drained);
            stream.off('error', failed);
            stream.off('close', closed);
            signal.removeEventListener('abort', aborted);
            if (error === undefined)
                resolve();
            else
                reject(error);
        };
        const drained = () => finish();
        const failed = (error) => finish(error);
        const closed = () => finish(new Error('remote terminal output closed'));
        const aborted = () => finish(signal.reason);
        stream.once('drain', drained);
        stream.once('error', failed);
        stream.once('close', closed);
        signal.addEventListener('abort', aborted, { once: true });
    });
}
//# sourceMappingURL=user-pty.js.map