import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { formatSshUri, parseSshUri } from './types.js';
const DEFAULT_OUTPUT_MAX_BYTES = 64 * 1024;
const PROCESS_INPUT_CHUNK_BYTES = 192 * 1024;
const SHELL_TIMEOUT_CODE = 'SSH_REMOTE_SHELL_TIMEOUT';
class RemoteShellTimeoutReason extends Error {
    timeoutMs;
    constructor(timeoutMs) {
        super(`${SHELL_TIMEOUT_CODE} after ${timeoutMs}ms`);
        this.timeoutMs = timeoutMs;
        this.name = 'RemoteShellTimeoutReason';
    }
}
function shellDeadline(upstream, timeoutMs, onExpiry) {
    const timer = new AbortController();
    if (onExpiry === 'none')
        return { signal: upstream ?? timer.signal, dispose: () => { } };
    const id = setTimeout(() => timer.abort(new RemoteShellTimeoutReason(timeoutMs)), timeoutMs);
    return {
        signal: upstream === undefined ? timer.signal : AbortSignal.any([upstream, timer.signal]),
        dispose: () => clearTimeout(id),
    };
}
/**
 * Route model-facing shell execution before local sandbox argv is materialized.
 * Newer DSH exposes a single `ShellExecutor.execute(spec)` returning a
 * `ShellExecution` (a `ShellProcess` with a `result()` projection); the older
 * `run`/`start` pair was removed. A remote workdir selects the helper-backed
 * remote process; local workdirs fall through to the stock executor untouched.
 */
export function installRemoteShellRouter(shell, helpers, resolveRemotePath, processes) {
    const originalExecute = shell.execute;
    shell.execute = async function (spec) {
        const uri = remoteUri(spec.workdir, resolveRemotePath);
        if (uri === undefined)
            return originalExecute.call(shell, spec);
        const process = new RemoteShellProcess(uri, spec, helpers, resolveRemotePath);
        processes?.track(process);
        await process.waitUntilPrepared();
        return process;
    };
    return () => {
        shell.execute = originalExecute;
    };
}
/** Owns helper background jobs across shell-provider reloads and plugin teardown. */
export class RemoteShellProcessTracker {
    processes = new Set();
    track(process) {
        this.processes.add(process);
        void process.done.finally(() => this.processes.delete(process));
        return process;
    }
    async dispose() {
        const active = [...this.processes];
        for (const process of active)
            process.kill();
        await Promise.allSettled(active.map(process => process.done));
        this.processes.clear();
    }
}
class RemoteShellProcess {
    status = 'running';
    exitCode = null;
    signal = null;
    sandbox;
    done;
    /** Offset readers over the same captured streams `readOutput` drains. */
    observed;
    unread = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
    stdout;
    stderr = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
    decoder;
    scope;
    process;
    killed = false;
    removeAbort;
    timedOut = false;
    aborted = false;
    timeoutMs;
    resultMemo;
    prepared;
    publish;
    failure;
    abortReason;
    constructor(uri, spec, helpers, resolveRemotePath) {
        this.timeoutMs = spec.timeoutMs;
        this.stdout = new BoundedOutput(spec.stdoutMaxBytes ?? DEFAULT_OUTPUT_MAX_BYTES);
        this.decoder = new ProcessOutputDecoder(this.stdout, this.stderr, value => this.unread.append(value), () => this.unread.markTruncated());
        this.prepared = new Promise(resolve => { this.publish = resolve; });
        this.observed = {
            stdout: new OutputOffsetReader(this.stdout),
            stderr: new OutputOffsetReader(this.stderr),
        };
        const deadline = shellDeadline(spec.signal, spec.timeoutMs, spec.onExpiry);
        if (spec.signal !== undefined) {
            const onAbort = () => { this.kill(); };
            spec.signal.addEventListener('abort', onAbort, { once: true });
            this.removeAbort = () => spec.signal?.removeEventListener('abort', onAbort);
        }
        deadline.signal.addEventListener('abort', () => { this.kill(); }, { once: true });
        if (deadline.signal.aborted)
            this.kill();
        this.done = this.run(uri, spec, helpers, resolveRemotePath, deadline);
    }
    async waitUntilPrepared() {
        await this.prepared;
        if (this.process !== undefined)
            return;
        if (this.failure !== undefined)
            throw this.failure.cause;
        if (this.aborted)
            throw this.abortReason;
    }
    readOutput() {
        const read = this.unread.consume();
        return { delta: read.text, lossy: read.truncated };
    }
    result() {
        if (this.resultMemo === undefined) {
            this.resultMemo = this.done.then(() => {
                if (this.failure !== undefined)
                    throw this.failure.cause;
                return {
                    exitCode: this.exitCode,
                    signal: this.signal,
                    timedOut: this.timedOut,
                    aborted: this.aborted,
                    timeoutMs: this.timeoutMs,
                    stdout: this.stdout.final(),
                    stderr: this.stderr.final(),
                    ...(this.sandbox === undefined ? {} : { sandbox: this.sandbox }),
                };
            });
        }
        return this.resultMemo;
    }
    kill() {
        if (this.status !== 'running' || this.killed)
            return false;
        this.killed = true;
        if (this.scope !== undefined && this.process !== undefined) {
            void terminateBestEffort(this.scope.client, this.process.processId);
        }
        return true;
    }
    async run(uri, spec, helpers, resolveRemotePath, deadline) {
        let cursor = '0';
        const ids = { workspaceId: randomUUID(), processId: randomUUID() };
        let rolledBack = false;
        let terminationRequested = false;
        let cancellationDrainDeadline;
        try {
            this.scope = await openProcessScope(uri, spec.sandboxPolicy, helpers, resolveRemotePath, deadline.signal, ids.workspaceId);
            try {
                this.process = await startProcess(this.scope, spec, deadline.signal, ids.processId);
            }
            finally {
                await closeWorkspaceBestEffort(this.scope);
            }
            this.publish();
            if (this.killed)
                await terminateBestEffort(this.scope.client, this.process.processId);
            if (spec.stdin !== undefined) {
                await writeAndCloseStdin(this.scope.client, this.process.processId, spec.stdin, deadline.signal);
            }
            for (;;) {
                if (!terminationRequested && (deadline.signal.aborted || this.killed)) {
                    terminationRequested = true;
                    this.timedOut = deadline.signal.reason instanceof RemoteShellTimeoutReason;
                    this.aborted = deadline.signal.aborted && !this.timedOut;
                    await terminateBestEffort(this.scope.client, this.process.processId);
                    cancellationDrainDeadline = Date.now() + 5_000;
                }
                if (cancellationDrainDeadline !== undefined && Date.now() >= cancellationDrainDeadline) {
                    throw new Error('remote process output did not close within 5s after cancellation');
                }
                const read = await this.scope.client.call('process/read', {
                    processId: this.process.processId,
                    afterSeq: cursor,
                    maxBytes: 192 * 1024,
                    waitMs: 1_000,
                }, { timeoutMs: 5_000 });
                cursor = read.nextSeq;
                this.decoder.append(read);
                if (read.exited) {
                    this.decoder.flush();
                    this.exitCode = read.exitCode;
                    this.signal = normalizeProcessSignal(read.signal);
                    this.status = this.killed || this.signal !== null ? 'killed' : 'completed';
                    // A timeout/abort kill surfaces here as an exit before the loop's
                    // own aborted-check runs; classify the first-cause now so `result()`
                    // reports timedOut/aborted rather than a clean completion.
                    if (!terminationRequested && deadline.signal.aborted) {
                        terminationRequested = true;
                        this.timedOut = deadline.signal.reason instanceof RemoteShellTimeoutReason;
                        this.aborted = !this.timedOut;
                    }
                    break;
                }
            }
            if (this.process.sandbox !== undefined) {
                this.sandbox = sandboxInfo(this.process.sandbox, this.stderr.snapshot());
            }
        }
        catch (error) {
            // An abort surfaces as a transport error (cancelled read/write) before
            // the loop's own aborted-check runs; classify it here so `result()`
            // reports aborted/timedOut rather than a bare spawn failure.
            if (deadline.signal.aborted && !terminationRequested) {
                this.timedOut = deadline.signal.reason instanceof RemoteShellTimeoutReason;
                this.aborted = !this.timedOut;
                this.abortReason = deadline.signal.reason;
            }
            this.status = 'killed';
            this.signal = this.process === undefined ? null : 'SIGKILL';
            this.decoder.flush();
            if (!deadline.signal.aborted) {
                this.failure = { cause: error };
                const note = `remote shell failed: ${messageOf(error)}\n`;
                this.stderr.append(note);
                this.unread.append(`[stderr]\n${note}`);
            }
            try {
                await rollbackShellAllocation(helpers, uri, ids);
                rolledBack = true;
            }
            catch (cleanupError) {
                this.unread.append(`[stderr]\ncleanup failed: ${messageOf(cleanupError)}\n`);
            }
        }
        finally {
            deadline.dispose();
            this.removeAbort?.();
            this.removeAbort = undefined;
            if (!rolledBack && this.scope !== undefined && this.process !== undefined) {
                await releaseBestEffort(this.scope.client, this.process.processId);
            }
            this.publish();
        }
    }
}
async function openProcessScope(uriString, policy, helpers, resolveRemotePath, signal, workspaceId = randomUUID()) {
    const uri = parseSshUri(uriString);
    const mode = policy?.mode ?? 'danger-full-access';
    let root = '/';
    if (mode !== 'danger-full-access') {
        if (policy === undefined)
            throw new Error('remote confined shell requires a sandbox policy');
        const mapped = resolveRemotePath(policy.workspaceRoot);
        if (mapped === undefined)
            throw new Error('remote sandbox workspace root is not mapped');
        const rootUri = parseSshUri(mapped);
        if (!sameHost(rootUri, uri))
            throw new Error('remote sandbox root belongs to another SSH host');
        root = rootUri.path;
        if (!containsPath(root, uri.path))
            throw new Error('remote shell cwd is outside sandbox workspace');
    }
    const client = await helpers.client(formatSshUri(uri), signal);
    const opened = await client.call('workspace/open', {
        path: root,
        access: mode,
        workspaceId,
        operationId: workspaceId,
    }, { signal, timeoutMs: 20_000, mutation: true });
    return {
        client,
        uri: formatSshUri(uri),
        workspaceId: opened.workspaceId,
        cwd: posix.relative(opened.path, uri.path),
        mode,
    };
}
async function startProcess(scope, spec, signal, processId = randomUUID()) {
    const environment = { ...spec.env, ...spec.dshEnv };
    return scope.client.call('process/start', {
        workspaceId: scope.workspaceId,
        cwd: scope.cwd,
        argv: ['bash', '-c', spec.command],
        env: environment,
        stdin: spec.stdin === undefined ? 'closed' : 'pipe',
        tty: null,
        processId,
        operationId: processId,
    }, { signal, timeoutMs: 30_000, mutation: true });
}
class ProcessOutputDecoder {
    stdout;
    stderr;
    mirror;
    markMirrorTruncated;
    stdoutDecoder = new TextDecoder();
    stderrDecoder = new TextDecoder();
    flushed = false;
    constructor(stdout, stderr, mirror, markMirrorTruncated) {
        this.stdout = stdout;
        this.stderr = stderr;
        this.mirror = mirror;
        this.markMirrorTruncated = markMirrorTruncated;
    }
    append(read) {
        for (const chunk of read.chunks) {
            const bytes = Buffer.from(chunk.data, 'base64');
            const isStderr = chunk.stream === 'stderr';
            const text = (isStderr ? this.stderrDecoder : this.stdoutDecoder).decode(bytes, { stream: true });
            if (isStderr) {
                this.stderr.append(text);
                if (text.length > 0)
                    this.mirror?.(`[stderr]\n${text}`);
            }
            else {
                this.stdout.append(text);
                this.mirror?.(text);
            }
        }
        if (read.truncated) {
            this.stdout.markTruncated();
            this.stderr.markTruncated();
            this.markMirrorTruncated?.();
        }
    }
    flush() {
        if (this.flushed)
            return;
        this.flushed = true;
        const stdout = this.stdoutDecoder.decode();
        const stderr = this.stderrDecoder.decode();
        this.stdout.append(stdout);
        this.stderr.append(stderr);
        this.mirror?.(stdout);
        if (stderr.length > 0)
            this.mirror?.(`[stderr]\n${stderr}`);
    }
}
async function writeAndCloseStdin(client, processId, stdin, signal) {
    const data = Buffer.from(stdin ?? '', 'utf8');
    if (data.length === 0) {
        await writeProcessChunk(client, processId, data, true, signal);
        return;
    }
    for (let offset = 0; offset < data.length; offset += PROCESS_INPUT_CHUNK_BYTES) {
        const chunk = data.subarray(offset, Math.min(data.length, offset + PROCESS_INPUT_CHUNK_BYTES));
        signal?.throwIfAborted();
        await writeProcessChunk(client, processId, chunk, offset + chunk.length === data.length, signal);
    }
}
async function writeProcessChunk(client, processId, data, eof, signal) {
    const result = await client.call('process/write', {
        processId,
        data: data.toString('base64'),
        encoding: 'base64',
        eof,
        operationId: randomUUID(),
    }, { signal, timeoutMs: 15_000, mutation: true });
    if (result.written !== data.length) {
        throw new Error(`remote helper accepted ${result.written} of ${data.length} stdin bytes`);
    }
}
async function terminateBestEffort(client, processId) {
    await client.call('process/terminate', {
        processId,
        graceMs: 3_000,
        operationId: randomUUID(),
    }, { timeoutMs: 8_000, mutation: true }).catch(() => { });
}
async function releaseBestEffort(client, processId) {
    await client.call('process/release', {
        processId,
        operationId: randomUUID(),
    }, { timeoutMs: 5_000, mutation: true }).catch(() => { });
}
async function rollbackShellAllocation(helpers, uri, ids) {
    const client = await helpers.client(uri);
    const failures = [];
    const cleanup = async (method, params, unknownCodes) => {
        try {
            await client.call(method, params, { timeoutMs: 8_000, mutation: true });
        }
        catch (error) {
            const code = error?.code;
            if (typeof code === 'string' && unknownCodes.includes(code))
                return;
            failures.push(error instanceof Error ? error : new Error(String(error)));
        }
    };
    await cleanup('process/terminate', {
        processId: ids.processId,
        force: true,
        operationId: `rollback-terminate:${ids.processId}`,
    }, ['E_UNKNOWN_PROCESS']);
    await cleanup('process/release', {
        processId: ids.processId,
        operationId: `rollback-release:${ids.processId}`,
    }, ['E_UNKNOWN_PROCESS']);
    await cleanup('workspace/close', {
        workspaceId: ids.workspaceId,
        operationId: `rollback-close:${ids.workspaceId}`,
    }, ['E_UNKNOWN_WORKSPACE']);
    if (failures.length === 1)
        throw failures[0];
    if (failures.length > 1)
        throw new AggregateError(failures, 'remote shell allocation cleanup failed');
}
async function closeWorkspaceBestEffort(scope) {
    await scope.client.call('workspace/close', {
        workspaceId: scope.workspaceId,
        operationId: `close:${scope.workspaceId}`,
    }, { timeoutMs: 5_000, mutation: true }).catch(() => { });
}
function normalizeProcessSignal(value) {
    if (value === null)
        return null;
    if (typeof value === 'string')
        return value.startsWith('SIG') ? value : `SIG${value}`;
    return SIGNAL_NAMES[value] ?? null;
}
const SIGNAL_NAMES = {
    1: 'SIGHUP', 2: 'SIGINT', 3: 'SIGQUIT', 6: 'SIGABRT', 9: 'SIGKILL',
    13: 'SIGPIPE', 14: 'SIGALRM', 15: 'SIGTERM',
};
function sandboxInfo(sandbox, stderr) {
    return {
        mode: sandbox.mode,
        enforcement: sandbox.enforcement,
        denied: /permission denied|read-only file system|operation not permitted/iu.test(stderr.text),
    };
}
class BoundedOutput {
    maxBytes;
    text = '';
    dropped = false;
    totalBytes = 0;
    constructor(maxBytes) {
        this.maxBytes = maxBytes;
    }
    append(value) {
        if (value.length === 0)
            return;
        this.totalBytes += Buffer.byteLength(value, 'utf8');
        const bytes = Buffer.from(this.text + value, 'utf8');
        if (bytes.length <= this.maxBytes) {
            this.text += value;
            return;
        }
        let start = bytes.length - this.maxBytes;
        while (start < bytes.length && (bytes[start] & 0xc0) === 0x80)
            start += 1;
        this.text = bytes.subarray(start).toString('utf8');
        this.dropped = true;
    }
    markTruncated() {
        this.dropped = true;
    }
    snapshot() {
        return { text: this.text, truncated: this.dropped };
    }
    consume() {
        const result = this.snapshot();
        this.text = '';
        this.dropped = false;
        return result;
    }
    final() {
        return { text: this.text, truncated: this.dropped };
    }
    readFrom(fromByte) {
        const bytes = Buffer.from(this.text, 'utf8');
        const start = this.totalBytes - bytes.length;
        const offset = Math.min(this.totalBytes, Math.max(0, fromByte));
        const lossy = offset < start || (offset === 0 && this.dropped);
        return {
            text: bytes.subarray(Math.max(0, offset - start)).toString('utf8'),
            nextOffset: this.totalBytes,
            lossy,
        };
    }
}
/**
 * Minimal `SubprocessOutputReader` over one `BoundedOutput` tail window.
 * `readFrom(fromByte)` returns the text captured since `fromByte`; when the
 * window has slid past that offset the read is `lossy` and returns the whole
 * retained tail. Remote shell output is not spill-backed, so no spill path is
 * reported — matching the in-memory-only capture the helper delivers.
 */
class OutputOffsetReader {
    output;
    constructor(output) {
        this.output = output;
    }
    readFrom(fromByte) {
        return this.output.readFrom(fromByte);
    }
}
function remoteUri(path, resolveRemotePath) {
    return path.startsWith('ssh://') ? path : resolveRemotePath(path);
}
function sameHost(left, right) {
    return left.host === right.host && left.port === right.port && left.user === right.user;
}
function containsPath(root, child) {
    const normalizedRoot = posix.normalize(root);
    const normalizedChild = posix.normalize(child);
    return normalizedChild === normalizedRoot || normalizedChild.startsWith(`${normalizedRoot.replace(/\/+$/u, '')}/`);
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=helper-shell.js.map