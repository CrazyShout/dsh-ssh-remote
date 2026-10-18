import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import { TerminalBackendCleanupError } from '@deepseek-ai/dsh-terminal';
import { parseSshUri } from './types.js';
/** Output silence before a send is considered idle. */
const IDLE_MS = 3_000;
/** Hard deadline for one send (matches the local backend's timeout shape). */
const TIMEOUT_MS = 30_000;
/** Bounded retained scrollback and per-send output, measured as UTF-8 bytes. */
const OUTPUT_MAX_BYTES = 64 * 1024;
/** Graceful channel-close bound before force-destroying the SSH channel. */
const CLOSE_DEADLINE_MS = 3_000;
/** Short final join after destroy; a transport that never closes then fails loud. */
const DESTROY_JOIN_MS = 1_000;
/** Long-poll duration used by the helper output pump. */
const HELPER_READ_WAIT_MS = 1_000;
/** Transport deadline around a helper long-poll. */
const HELPER_READ_TIMEOUT_MS = 6_000;
/** Safe retries for an interrupted, non-mutating output read. */
const HELPER_READ_RETRIES = 5;
const HELPER_RETRY_DELAY_MS = 100;
/** Bound for ordinary helper mutations. */
const HELPER_MUTATION_TIMEOUT_MS = 30_000;
const HELPER_INPUT_CHUNK_BYTES = 192 * 1024;
/** Default terminal geometry until DSH exposes resize in its terminal seam. */
const DEFAULT_ROWS = 24;
const DEFAULT_COLS = 80;
function asError(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
}
/** Keep a valid UTF-8 tail no larger than maxBytes. */
function utf8Tail(text, maxBytes) {
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length <= maxBytes)
        return { text, truncated: false };
    let start = bytes.length - maxBytes;
    // Never decode from the middle of a multi-byte code point.
    while (start < bytes.length && (bytes[start] & 0xc0) === 0x80)
        start += 1;
    return { text: bytes.subarray(start).toString('utf8'), truncated: true };
}
class BoundedTextBuffer {
    maxBytes;
    value = '';
    dropped = false;
    constructor(maxBytes) {
        this.maxBytes = maxBytes;
    }
    append(text) {
        if (text.length === 0)
            return;
        const bounded = utf8Tail(this.value + text, this.maxBytes);
        this.value = bounded.text;
        this.dropped ||= bounded.truncated;
    }
    markTruncated() {
        this.dropped = true;
    }
    snapshot() {
        return { text: this.value, truncated: this.dropped };
    }
    consume() {
        const snapshot = this.snapshot();
        this.value = '';
        this.dropped = false;
        return snapshot;
    }
}
function waitBounded(operation, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            resolve(false);
        }, timeoutMs);
        void operation.then(() => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(true);
        });
    });
}
function abortableDelay(ms, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
/** One live send over the helper output pump. */
class RemoteSendOperation {
    onCancel;
    onSettle;
    getSessionStatus;
    done;
    viewport = new BoundedTextBuffer(OUTPUT_MAX_BYTES);
    unread = new BoundedTextBuffer(OUTPUT_MAX_BYTES);
    settled = false;
    idleTimer;
    deadlineTimer;
    removeAbort;
    idleArmed = false;
    resolveDone;
    rejectDone;
    constructor(onCancel, onSettle, getSessionStatus, signal) {
        this.onCancel = onCancel;
        this.onSettle = onSettle;
        this.getSessionStatus = getSessionStatus;
        signal?.throwIfAborted();
        this.done = new Promise((resolve, reject) => {
            this.resolveDone = resolve;
            this.rejectDone = reject;
        });
        if (signal !== undefined) {
            const onAbort = () => { this.cancel(); };
            signal.addEventListener('abort', onAbort, { once: true });
            this.removeAbort = () => signal.removeEventListener('abort', onAbort);
        }
        this.deadlineTimer = setTimeout(() => this.settle('timeout'), TIMEOUT_MS);
    }
    armIdle() {
        if (this.settled || this.idleArmed)
            return;
        this.idleArmed = true;
        this.resetIdle();
    }
    markTruncated() {
        if (this.settled)
            return;
        this.viewport.markTruncated();
        this.unread.markTruncated();
    }
    append(text) {
        if (this.settled)
            return;
        this.viewport.append(text);
        this.unread.append(text);
        if (this.idleArmed)
            this.resetIdle();
    }
    resetIdle() {
        if (this.idleTimer !== undefined)
            clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.settle('inferred_idle'), IDLE_MS);
    }
    readOutput() {
        const read = this.unread.consume();
        return { delta: read.text, truncated: read.truncated };
    }
    settle(waitReason) {
        if (!this.finish())
            return;
        const output = this.viewport.snapshot();
        this.resolveDone({
            viewport: output.text,
            waitReason,
            sessionStatus: this.getSessionStatus(),
            truncated: output.truncated,
        });
    }
    fail(reason) {
        if (!this.finish())
            return;
        this.rejectDone(asError(reason));
    }
    cancel() {
        if (this.settled)
            return false;
        try {
            this.onCancel();
        }
        catch (error) {
            this.fail(error);
        }
        return true;
    }
    finish() {
        if (this.settled)
            return false;
        this.settled = true;
        if (this.idleTimer !== undefined)
            clearTimeout(this.idleTimer);
        if (this.deadlineTimer !== undefined)
            clearTimeout(this.deadlineTimer);
        this.idleTimer = undefined;
        this.deadlineTimer = undefined;
        this.removeAbort?.();
        this.removeAbort = undefined;
        this.onSettle();
        return true;
    }
}
function normalizeExitSignal(signal) {
    if (!signal)
        return null;
    return (signal.startsWith('SIG') ? signal : `SIG${signal}`);
}
function helperTerminalIds(sessionId) {
    const digest = createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
    return {
        workspaceId: `term-ws-${digest}`,
        processId: `term-proc-${digest}`,
        workspaceOpenOperationId: `term-ws-open-${digest}`,
        workspaceCloseOperationId: `term-ws-close-${digest}`,
        processStartOperationId: `term-start-${digest}`,
    };
}
function stableHelperOperationId(kind, identity) {
    const digest = createHash('sha256').update(`${kind}\0${identity}`).digest('hex').slice(0, 32);
    return `term-${kind}-${digest}`;
}
function assertNonEmptyHelperId(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`remote helper returned an invalid ${label}`);
    }
}
function isAlreadyCleanHelperError(error) {
    if (typeof error !== 'object' || error === null)
        return false;
    const code = error.code;
    return code === 'E_UNKNOWN_PROCESS' || code === 'E_UNKNOWN_WORKSPACE';
}
function recordCleanupFailure(failures, error) {
    if (!isAlreadyCleanHelperError(error))
        failures.push(asError(error));
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function isRemoteDescendant(root, child) {
    const relative = posix.relative(root, child);
    return {
        contained: relative === ''
            || (relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative)),
        relative: relative || '.',
    };
}
function sameSshAuthority(left, right) {
    return left.host === right.host && left.port === right.port && left.user === right.user;
}
function readStatus(result) {
    return {
        kind: 'exited',
        exitCode: typeof result.exitCode === 'number' ? result.exitCode : null,
        signal: normalizeExitSignal(result.signal ?? undefined),
    };
}
function decodeHelperChunk(chunk) {
    if (typeof chunk !== 'object' || chunk === null || typeof chunk.data !== 'string') {
        throw new Error('remote helper returned a malformed process output chunk');
    }
    if (chunk.stream !== 'pty' && chunk.stream !== 'stdout' && chunk.stream !== 'stderr') {
        throw new Error(`remote helper returned an invalid process output stream: ${String(chunk.stream)}`);
    }
    return Buffer.from(chunk.data, 'base64');
}
/** A helper-owned PTY process with a continuously drained bounded output tail. */
export class RemoteHelperTerminalBackendSession {
    helpers;
    uri;
    workspaceId;
    workspaceCloseOperationId;
    processId;
    onClosed;
    motd = '';
    pid;
    scrollback = new BoundedTextBuffer(OUTPUT_MAX_BYTES);
    pumpController = new AbortController();
    pumpDone;
    statusValue;
    active;
    afterSeq;
    closing = false;
    closePromise;
    pumpFailure;
    remoteExited;
    decoder = new TextDecoder();
    mutationSequence = 0;
    constructor(helpers, uri, workspaceId, workspaceCloseOperationId, processId, started, onClosed = () => { }) {
        this.helpers = helpers;
        this.uri = uri;
        this.workspaceId = workspaceId;
        this.workspaceCloseOperationId = workspaceCloseOperationId;
        this.processId = processId;
        this.onClosed = onClosed;
        assertNonEmptyHelperId(processId, 'process id');
        if (!Number.isSafeInteger(started.pid) || started.pid <= 0) {
            throw new Error(`remote helper returned an invalid terminal pid: ${String(started.pid)}`);
        }
        this.pid = started.pid;
        // A newly published session owns the complete retained helper stream,
        // including prompt bytes emitted before process/start returned.
        this.afterSeq = undefined;
        this.statusValue = started.running
            ? { kind: 'running' }
            : readStatus(started);
        this.remoteExited = !started.running;
        this.pumpDone = this.pumpOutput();
    }
    startSend(request) {
        if (this.closing || this.statusValue.kind === 'exited')
            throw new Error('PTY session has exited');
        if (this.pumpFailure !== undefined)
            throw this.pumpFailure;
        if (this.active !== undefined)
            throw new Error('PTY session already has an active send');
        request.signal?.throwIfAborted();
        let operation;
        operation = new RemoteSendOperation(() => {
            void this.signalForeground('SIGINT').catch((error) => operation.fail(error));
        }, () => {
            if (this.active === operation)
                this.active = undefined;
        }, () => this.statusValue, request.signal);
        this.active = operation;
        // The helper owns a real POSIX PTY, whose line discipline consumes LF as
        // the portable Enter sequence. A bare CR worked with ssh2's channel
        // translation but can leave a helper shell waiting without executing.
        const data = `${request.text}${request.submit ? '\n' : ''}`;
        if (data.length > 0) {
            void this.writeInput(data, request.signal).then(() => operation.armIdle(), (error) => {
                operation.armIdle();
                if (request.signal?.aborted !== true)
                    operation.fail(error);
            });
        }
        else
            operation.armIdle();
        return operation;
    }
    read(request) {
        const offset = request.offset ?? 0;
        const count = request.count ?? 500;
        if (!Number.isSafeInteger(offset) || offset < 0) {
            throw new Error('PTY read offset must be a non-negative safe integer');
        }
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error('PTY read count must be a positive safe integer');
        }
        const snapshot = this.scrollback.snapshot();
        const lines = snapshot.text.length === 0 ? [] : snapshot.text.split('\n');
        const totalLines = lines.length;
        if (offset >= totalLines) {
            return { text: '', totalLines, lineBegin: offset, lineEnd: offset, truncated: snapshot.truncated };
        }
        const end = totalLines - offset;
        const start = Math.max(0, end - count);
        const text = lines.slice(start, end).join('\n');
        const returnedLines = text.length === 0 ? 0 : text.split('\n').length;
        return {
            text,
            totalLines,
            lineBegin: offset,
            lineEnd: offset + returnedLines,
            truncated: snapshot.truncated,
        };
    }
    async signal(signal) {
        if (this.closing || this.statusValue.kind === 'exited')
            throw new Error('PTY session has exited');
        const targetPgid = await this.signalForeground(signal);
        return { delivered: true, targetPgid };
    }
    status() {
        return this.statusValue;
    }
    /** Helper support exists ahead of the rc.2 terminal seam's model-facing resize verb. */
    async resize(rows, cols) {
        if (!Number.isSafeInteger(rows) || rows <= 0 || !Number.isSafeInteger(cols) || cols <= 0) {
            throw new Error('PTY dimensions must be positive safe integers');
        }
        if (this.closing || this.statusValue.kind === 'exited')
            throw new Error('PTY session has exited');
        await this.call('process/resize', { processId: this.processId, operationId: this.nextOperationId('resize'), rows, cols }, { timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true });
    }
    close(_reason) {
        if (this.closePromise !== undefined)
            return this.closePromise;
        this.closing = true;
        this.pumpController.abort(new Error('remote terminal is closing'));
        if (this.statusValue.kind === 'running') {
            this.statusValue = { kind: 'exited', exitCode: null, signal: null };
        }
        this.active?.settle('session_exit');
        const closing = this.closeOnce()
            .finally(() => this.onClosed())
            .catch((error) => {
            if (this.closePromise === closing)
                this.closePromise = undefined;
            throw error;
        });
        this.closePromise = closing;
        return closing;
    }
    async signalForeground(signal) {
        const foreground = await this.call('process/inspectForeground', { processId: this.processId }, { timeoutMs: HELPER_MUTATION_TIMEOUT_MS });
        if (foreground.verified !== true
            || !Number.isSafeInteger(foreground.pgid)
            || foreground.pgid <= 1) {
            throw new Error(`remote helper cannot verify a foreground process group for ${signal}`);
        }
        await this.call('process/signal', {
            processId: this.processId,
            operationId: this.nextOperationId('signal'),
            signal,
            target: 'foreground',
        }, { timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true });
        return foreground.pgid;
    }
    async writeInput(text, signal) {
        const data = Buffer.from(text, 'utf8');
        for (let offset = 0; offset < data.length; offset += HELPER_INPUT_CHUNK_BYTES) {
            signal?.throwIfAborted();
            const chunk = data.subarray(offset, Math.min(data.length, offset + HELPER_INPUT_CHUNK_BYTES));
            const result = await this.call('process/write', {
                processId: this.processId,
                operationId: this.nextOperationId('write'),
                data: chunk.toString('base64'),
                encoding: 'base64',
            }, { signal, timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true });
            if (result.written !== chunk.length) {
                throw new Error(`remote helper accepted ${result.written} of ${chunk.length} terminal input bytes`);
            }
        }
    }
    async pumpOutput() {
        try {
            let consecutiveFailures = 0;
            // Even a process that exited before publication can have multiple
            // unread output pages. Only the helper's drained EOF ends this pump.
            while (!this.pumpController.signal.aborted) {
                let result;
                try {
                    result = await this.call('process/read', {
                        processId: this.processId,
                        ...(this.afterSeq === undefined ? {} : { afterSeq: this.afterSeq }),
                        maxBytes: OUTPUT_MAX_BYTES,
                        waitMs: HELPER_READ_WAIT_MS,
                    }, { signal: this.pumpController.signal, timeoutMs: HELPER_READ_TIMEOUT_MS });
                    consecutiveFailures = 0;
                }
                catch (error) {
                    if (this.pumpController.signal.aborted)
                        throw error;
                    consecutiveFailures += 1;
                    if (consecutiveFailures > HELPER_READ_RETRIES)
                        throw error;
                    await abortableDelay(HELPER_RETRY_DELAY_MS * consecutiveFailures, this.pumpController.signal);
                    continue;
                }
                if (!Array.isArray(result.chunks) || typeof result.nextSeq !== 'string') {
                    throw new Error('remote helper returned a malformed process/read result');
                }
                this.afterSeq = result.nextSeq;
                if (result.truncated) {
                    this.appendOutput(this.decoder.decode());
                    this.decoder = new TextDecoder();
                    this.scrollback.markTruncated();
                    this.active?.markTruncated();
                }
                for (const chunk of result.chunks) {
                    this.appendOutput(this.decoder.decode(decodeHelperChunk(chunk), { stream: true }));
                }
                if (result.exited) {
                    this.appendOutput(this.decoder.decode());
                    this.remoteExited = true;
                    this.statusValue = readStatus(result);
                    this.active?.settle('session_exit');
                    return;
                }
            }
        }
        catch (error) {
            if (this.closing && this.pumpController.signal.aborted)
                return;
            const failure = asError(error);
            this.pumpFailure = failure;
            this.statusValue = { kind: 'exited', exitCode: null, signal: null };
            this.active?.fail(failure);
        }
    }
    async closeOnce() {
        const failures = [];
        if (!await waitBounded(this.pumpDone, DESTROY_JOIN_MS)) {
            failures.push(new Error('remote helper terminal output pump did not stop after cancellation'));
        }
        let terminated = this.remoteExited;
        if (!terminated) {
            try {
                const requested = await this.call('process/terminate', {
                    processId: this.processId,
                    operationId: stableHelperOperationId('terminate-grace', this.processId),
                    force: false,
                    graceMs: CLOSE_DEADLINE_MS,
                }, { timeoutMs: CLOSE_DEADLINE_MS, mutation: true });
                terminated = requested.running === false || await this.waitForRemoteExit(CLOSE_DEADLINE_MS);
            }
            catch (error) {
                terminated = isAlreadyCleanHelperError(error);
                this.remoteExited ||= terminated;
            }
            if (!terminated) {
                try {
                    await this.call('process/terminate', {
                        processId: this.processId,
                        operationId: stableHelperOperationId('terminate-force', this.processId),
                        force: true,
                    }, { timeoutMs: CLOSE_DEADLINE_MS, mutation: true });
                    terminated = true;
                    this.remoteExited = true;
                }
                catch (error) {
                    failures.push(asError(error));
                }
            }
        }
        let released = false;
        if (terminated) {
            try {
                await this.call('process/release', {
                    processId: this.processId,
                    operationId: stableHelperOperationId('release', this.processId),
                }, { timeoutMs: CLOSE_DEADLINE_MS, mutation: true });
                released = true;
            }
            catch (error) {
                if (isAlreadyCleanHelperError(error))
                    released = true;
                else
                    failures.push(asError(error));
            }
        }
        if (released) {
            try {
                await this.call('workspace/close', { workspaceId: this.workspaceId, operationId: this.workspaceCloseOperationId }, { timeoutMs: CLOSE_DEADLINE_MS, mutation: true });
            }
            catch (error) {
                recordCleanupFailure(failures, error);
            }
        }
        if (failures.length === 1)
            throw failures[0];
        if (failures.length > 1)
            throw new AggregateError(failures, 'remote helper terminal cleanup failed');
    }
    async call(method, params, options) {
        const client = await this.helpers.client(this.uri, options.signal);
        return client.call(method, params, options);
    }
    appendOutput(text) {
        if (text.length === 0)
            return;
        this.scrollback.append(text);
        this.active?.append(text);
    }
    async waitForRemoteExit(timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const status = await this.call('process/status', { processId: this.processId }, { timeoutMs: Math.max(1, Math.min(HELPER_READ_TIMEOUT_MS, deadline - Date.now())) });
            if (status.running !== true) {
                this.remoteExited = true;
                this.statusValue = readStatus(status);
                return true;
            }
            await delay(Math.min(100, Math.max(1, deadline - Date.now())));
        }
        return false;
    }
    nextOperationId(kind) {
        this.mutationSequence += 1;
        return stableHelperOperationId(`${kind}-${this.mutationSequence}`, this.processId);
    }
}
/** Helper-backed `ssh` backend used by default. */
export class RemoteTerminalBackend {
    type = 'ssh';
    sessions = new Set();
    helpers;
    resolveRemotePath;
    sandboxPolicy;
    constructor(helpers, resolveRemotePath, sandboxPolicy) {
        this.helpers = helpers;
        this.resolveRemotePath = resolveRemotePath;
        this.sandboxPolicy = sandboxPolicy;
    }
    async spawn(spec) {
        spec.signal?.throwIfAborted();
        if (this.sandboxPolicy === undefined || typeof this.helpers.client !== 'function') {
            throw new Error('remote terminal helper backend is not wired');
        }
        const cwdUri = this.remoteUri(spec.cwd);
        if (cwdUri === undefined)
            throw new Error('remote terminal requires an SSH cwd');
        const policy = this.sandboxPolicy.resolve({ session: spec.owner.session });
        const workspaceUri = this.remoteUri(policy.workspaceRoot);
        if (workspaceUri === undefined) {
            throw new Error('remote terminal sandbox root is not mapped to an SSH workspace');
        }
        const cwd = parseSshUri(cwdUri);
        const workspace = parseSshUri(workspaceUri);
        if (!sameSshAuthority(cwd, workspace)) {
            throw new Error('remote terminal cwd and sandbox root belong to different SSH hosts');
        }
        const containment = isRemoteDescendant(workspace.path, cwd.path);
        if (!containment.contained) {
            throw new Error('remote terminal cwd lies outside its sandbox workspace');
        }
        const ids = helperTerminalIds(String(spec.sessionId));
        let workspaceOpenAttempted = false;
        let openedWorkspaceId = ids.workspaceId;
        let started;
        try {
            const client = await this.helpers.client(cwdUri, spec.signal);
            spec.signal?.throwIfAborted();
            const loginShell = client.hello?.platform?.shell;
            const terminalArgv = typeof loginShell === 'string' && loginShell.startsWith('/')
                ? [loginShell, '-l']
                : ['/bin/sh', '-i'];
            workspaceOpenAttempted = true;
            const opened = await client.call('workspace/open', {
                path: workspace.path,
                access: policy.mode,
                workspaceId: ids.workspaceId,
                operationId: ids.workspaceOpenOperationId,
            }, { signal: spec.signal, timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true });
            assertNonEmptyHelperId(opened.workspaceId, 'workspace id');
            openedWorkspaceId = opened.workspaceId;
            started = await client.call('process/start', {
                workspaceId: openedWorkspaceId,
                cwd: containment.relative,
                argv: terminalArgv,
                env: { TERM: 'xterm-256color' },
                processId: ids.processId,
                operationId: ids.processStartOperationId,
                tty: { rows: DEFAULT_ROWS, cols: DEFAULT_COLS, term: 'xterm-256color' },
            }, { signal: spec.signal, timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true });
            assertNonEmptyHelperId(started.processId, 'process id');
            spec.signal?.throwIfAborted();
            let session;
            session = new RemoteHelperTerminalBackendSession(this.helpers, cwdUri, openedWorkspaceId, ids.workspaceCloseOperationId, started.processId, started, () => this.sessions.delete(session));
            this.sessions.add(session);
            return session;
        }
        catch (error) {
            if (!workspaceOpenAttempted)
                throw error;
            try {
                await rollbackHelperProcess(this.helpers, cwdUri, openedWorkspaceId, ids.workspaceCloseOperationId, started?.processId && started.processId.length > 0 ? started.processId : ids.processId);
            }
            catch (cleanupError) {
                throw new TerminalBackendCleanupError(error, cleanupError);
            }
            throw error;
        }
    }
    remoteUri(path) {
        if (path === undefined)
            return undefined;
        return path.startsWith('ssh://') ? path : this.resolveRemotePath(path);
    }
    async dispose() {
        const sessions = [...this.sessions];
        const results = await Promise.allSettled(sessions.map(session => session.close('remote backend disposed')));
        this.sessions.clear();
        const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
        if (failures.length === 1)
            throw failures[0];
        if (failures.length > 1)
            throw new AggregateError(failures, 'remote terminal backend cleanup failed');
    }
}
async function rollbackHelperProcess(helpers, uri, workspaceId, workspaceCloseOperationId, processId) {
    const failures = [];
    try {
        const client = await helpers.client(uri);
        await client.call('process/terminate', { processId, operationId: stableHelperOperationId('rollback-terminate', processId), force: true }, { timeoutMs: CLOSE_DEADLINE_MS, mutation: true });
    }
    catch (error) {
        recordCleanupFailure(failures, error);
    }
    try {
        const client = await helpers.client(uri);
        await client.call('process/release', { processId, operationId: stableHelperOperationId('rollback-release', processId) }, { timeoutMs: CLOSE_DEADLINE_MS, mutation: true });
    }
    catch (error) {
        recordCleanupFailure(failures, error);
    }
    try {
        const client = await helpers.client(uri);
        await client.call('workspace/close', { workspaceId, operationId: workspaceCloseOperationId }, { timeoutMs: CLOSE_DEADLINE_MS, mutation: true });
    }
    catch (error) {
        recordCleanupFailure(failures, error);
    }
    if (failures.length === 1)
        throw failures[0];
    if (failures.length > 1)
        throw new AggregateError(failures, 'remote helper terminal rollback failed');
}
//# sourceMappingURL=terminal.js.map