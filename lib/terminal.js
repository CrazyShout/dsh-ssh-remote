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
function posixShellQuote(value) {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}
/** Race one unpublished setup operation against its owner signal. */
function raceAbort(operation, signal) {
    if (signal === undefined)
        return operation;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (settle) => {
            if (settled)
                return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            settle();
        };
        const onAbort = () => {
            finish(() => reject(signal.reason ?? new Error('remote terminal setup aborted')));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        operation.then(value => finish(() => resolve(value)), reason => finish(() => reject(reason)));
    });
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
/**
 * An allocated channel that never became a session still needs the same
 * bounded graceful-close/destroy lifecycle as a published terminal. Keep an
 * error listener installed while retiring it so a late transport error cannot
 * become an unhandled EventEmitter error.
 */
async function retireUnpublishedChannel(channel) {
    let closeObserved = false;
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    const onClose = () => {
        if (closeObserved)
            return;
        closeObserved = true;
        resolveClosed();
    };
    const onError = () => {
        // Cleanup is best effort; the setup/cancellation error remains primary.
    };
    channel.on('close', onClose);
    channel.on('error', onError);
    let endFailed = false;
    try {
        try {
            channel.end();
        }
        catch {
            endFailed = true;
        }
        if (!endFailed && await waitBounded(closed, CLOSE_DEADLINE_MS))
            return;
        try {
            channel.destroy();
        }
        catch {
            return;
        }
        await waitBounded(closed, DESTROY_JOIN_MS);
    }
    finally {
        channel.removeListener('close', onClose);
        channel.removeListener('error', onError);
    }
}
/** One live send over the ssh2 shell channel. */
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
        this.resetIdle();
    }
    append(text) {
        if (this.settled)
            return;
        this.viewport.append(text);
        this.unread.append(text);
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
/** Backend-owned ssh2 PTY session. */
class RemoteTerminalBackendSession {
    channel;
    motd = '';
    pid = undefined;
    scrollback = new BoundedTextBuffer(OUTPUT_MAX_BYTES);
    statusValue = { kind: 'running' };
    active;
    closing = false;
    closeObserved = false;
    closePromise;
    closed;
    resolveClosed;
    constructor(channel) {
        this.channel = channel;
        this.closed = new Promise((resolve) => { this.resolveClosed = resolve; });
        channel.on('data', this.onData);
        channel.on('exit', this.onExit);
        channel.on('close', this.onClose);
        channel.on('error', this.onError);
    }
    /** Queue the initial cwd change after all channel listeners are installed. */
    enterDirectory(path) {
        if (!path.startsWith('/'))
            throw new Error(`remote terminal cwd must be absolute: ${path}`);
        this.channel.write(`cd ${posixShellQuote(path)} || exit $?\r`);
    }
    onData = (data) => {
        const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
        this.scrollback.append(text);
        this.active?.append(text);
    };
    onExit = (code, signal) => {
        this.statusValue = typeof code === 'number'
            ? { kind: 'exited', exitCode: code, signal: null }
            : { kind: 'exited', exitCode: null, signal: normalizeExitSignal(signal) };
    };
    onError = (error) => {
        if (this.statusValue.kind === 'running') {
            this.statusValue = { kind: 'exited', exitCode: null, signal: null };
        }
        this.closing = true;
        this.active?.fail(error);
    };
    onClose = () => {
        if (this.closeObserved)
            return;
        this.closeObserved = true;
        this.closing = true;
        if (this.statusValue.kind === 'running') {
            this.statusValue = { kind: 'exited', exitCode: null, signal: null };
        }
        this.active?.settle('session_exit');
        this.resolveClosed();
        this.channel.removeListener('data', this.onData);
        this.channel.removeListener('exit', this.onExit);
        this.channel.removeListener('close', this.onClose);
        this.channel.removeListener('error', this.onError);
    };
    startSend(request) {
        if (this.closing || this.statusValue.kind === 'exited')
            throw new Error('PTY session has exited');
        if (this.active !== undefined)
            throw new Error('PTY session already has an active send');
        request.signal?.throwIfAborted();
        const operation = new RemoteSendOperation(() => this.channel.signal('INT'), () => {
            if (this.active === operation)
                this.active = undefined;
        }, () => this.statusValue, request.signal);
        this.active = operation;
        try {
            if (request.text)
                this.channel.write(request.text);
            if (request.submit)
                this.channel.write('\r');
        }
        catch (error) {
            operation.fail(error);
        }
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
        throw new Error(`remote SSH PTY cannot verify a foreground process group for ${signal}; `
            + 'explicit terminal_signal requires the Phase 2 remote helper');
    }
    status() {
        return this.statusValue;
    }
    close(_reason) {
        if (this.closeObserved)
            return Promise.resolve();
        if (this.closePromise !== undefined)
            return this.closePromise;
        this.closing = true;
        if (this.statusValue.kind === 'running') {
            this.statusValue = { kind: 'exited', exitCode: null, signal: null };
        }
        const closing = this.closeOnce().catch((error) => {
            if (this.closePromise === closing)
                this.closePromise = undefined;
            throw error;
        });
        this.closePromise = closing;
        return closing;
    }
    async closeOnce() {
        try {
            this.channel.end();
        }
        catch (error) {
            this.active?.fail(error);
            this.channel.destroy();
            throw error;
        }
        if (await this.waitForClose(CLOSE_DEADLINE_MS))
            return;
        this.channel.destroy();
        if (await this.waitForClose(DESTROY_JOIN_MS))
            return;
        const error = new Error(`remote PTY channel did not close within ${CLOSE_DEADLINE_MS + DESTROY_JOIN_MS}ms`);
        this.active?.fail(error);
        throw error;
    }
    waitForClose(timeoutMs) {
        if (this.closeObserved)
            return Promise.resolve(true);
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                resolve(false);
            }, timeoutMs);
            void this.closed.then(() => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                resolve(true);
            });
        });
    }
}
/** Replaceable `ssh` PTY backend registered on `ctx.terminals`. */
export class RemoteTerminalBackend {
    connections;
    resolveRemotePath;
    type = 'ssh';
    constructor(connections, resolveRemotePath) {
        this.connections = connections;
        this.resolveRemotePath = resolveRemotePath;
    }
    async spawn(spec) {
        spec.signal?.throwIfAborted();
        const cwd = spec.cwd;
        const uri = cwd !== undefined && cwd.startsWith('ssh://')
            ? cwd
            : cwd !== undefined
                ? this.resolveRemotePath(cwd)
                : undefined;
        if (uri === undefined)
            throw new Error('remote terminal requires an SSH cwd');
        const parsed = parseSshUri(uri);
        const transport = await raceAbort(this.connections.transport(uri), spec.signal);
        spec.signal?.throwIfAborted();
        const shell = transport.shell({ cols: 80, rows: 24 });
        let channel;
        try {
            channel = await raceAbort(shell, spec.signal);
        }
        catch (error) {
            // Allocation may finish after cancellation won the race; retire that
            // unpublished channel instead of leaking it into the transport pool.
            if (spec.signal?.aborted === true) {
                void shell.then((lateChannel) => {
                    void retireUnpublishedChannel(lateChannel);
                }, () => { });
            }
            throw error;
        }
        try {
            spec.signal?.throwIfAborted();
            const session = new RemoteTerminalBackendSession(channel);
            session.enterDirectory(parsed.path);
            return session;
        }
        catch (error) {
            await retireUnpublishedChannel(channel);
            throw error;
        }
    }
}
//# sourceMappingURL=terminal.js.map