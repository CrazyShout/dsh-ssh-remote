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
function shellDeadline(upstream, timeoutMs) {
    const timer = new AbortController();
    const id = setTimeout(() => timer.abort(new RemoteShellTimeoutReason(timeoutMs)), timeoutMs);
    return {
        signal: upstream === undefined ? timer.signal : AbortSignal.any([upstream, timer.signal]),
        dispose: () => clearTimeout(id),
    };
}
/** Route model-facing shell execution before local sandbox argv is materialized. */
export function installRemoteShellRouter(shell, helpers, resolveRemotePath, processes) {
    const originalRun = shell.run;
    const originalStart = shell.start;
    shell.run = function (spec) {
        const uri = remoteUri(spec.workdir, resolveRemotePath);
        return uri === undefined
            ? originalRun.call(shell, spec)
            : runRemoteShell(uri, spec, helpers, resolveRemotePath);
    };
    shell.start = function (spec) {
        const uri = remoteUri(spec.workdir, resolveRemotePath);
        return uri === undefined
            ? originalStart.call(shell, spec)
            : processes?.track(new RemoteShellProcess(uri, spec, helpers, resolveRemotePath))
                ?? new RemoteShellProcess(uri, spec, helpers, resolveRemotePath);
    };
    return () => {
        shell.run = originalRun;
        shell.start = originalStart;
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
async function runRemoteShell(uri, spec, helpers, resolveRemotePath) {
    const stdout = new BoundedOutput(spec.stdoutMaxBytes);
    const stderr = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
    const decoder = new ProcessOutputDecoder(stdout, stderr);
    const executionDeadline = shellDeadline(spec.signal, spec.timeoutMs);
    const ids = { workspaceId: randomUUID(), processId: randomUUID() };
    let timedOut = false;
    let aborted = false;
    let scope;
    let process;
    let rolledBack = false;
    let cursor = '0';
    let exitCode = null;
    let exitSignal = null;
    let terminationRequested = false;
    try {
        scope = await openProcessScope(uri, spec.sandboxPolicy, helpers, resolveRemotePath, executionDeadline.signal, ids.workspaceId);
        try {
            process = await startProcess(scope, spec, executionDeadline.signal, ids.processId);
        }
        finally {
            await closeWorkspaceBestEffort(scope);
        }
        if (spec.stdin !== undefined) {
            await writeAndCloseStdin(scope.client, process.processId, spec.stdin, executionDeadline.signal);
        }
        for (;;) {
            if (!terminationRequested && executionDeadline.signal.aborted) {
                terminationRequested = true;
                timedOut = executionDeadline.signal.reason instanceof RemoteShellTimeoutReason;
                aborted = !timedOut;
                await terminateBestEffort(scope.client, process.processId);
            }
            const read = await scope.client.call('process/read', {
                processId: process.processId,
                afterSeq: cursor,
                maxBytes: 192 * 1024,
                waitMs: 1_000,
            }, { timeoutMs: 5_000 });
            cursor = read.nextSeq;
            decoder.append(read);
            if (read.exited) {
                exitCode = read.exitCode;
                exitSignal = normalizeProcessSignal(read.signal);
                decoder.flush();
                break;
            }
        }
    }
    catch (error) {
        decoder.flush();
        if (executionDeadline.signal.aborted) {
            timedOut = executionDeadline.signal.reason instanceof RemoteShellTimeoutReason;
            aborted = !timedOut;
            await rollbackShellAllocation(helpers, uri, ids);
            rolledBack = true;
            return {
                exitCode: null,
                signal: process === undefined ? null : 'SIGTERM',
                timedOut,
                aborted,
                timeoutMs: spec.timeoutMs,
                stdout: stdout.final(),
                stderr: stderr.final(),
                ...(process?.sandbox === undefined ? {} : {
                    sandbox: sandboxInfo(process.sandbox, stderr.snapshot()),
                }),
            };
        }
        if (process === undefined) {
            await rollbackShellAllocation(helpers, uri, ids);
            rolledBack = true;
            throw error;
        }
        await rollbackShellAllocation(helpers, uri, ids);
        rolledBack = true;
        throw new Error(`remote helper transport failed after process start: ${messageOf(error)}`, {
            cause: error,
        });
    }
    finally {
        executionDeadline.dispose();
        if (!rolledBack && scope !== undefined && process !== undefined) {
            await releaseBestEffort(scope.client, process.processId);
        }
    }
    return {
        exitCode,
        signal: exitSignal,
        timedOut,
        aborted,
        timeoutMs: spec.timeoutMs,
        stdout: stdout.final(),
        stderr: stderr.final(),
        ...(process?.sandbox === undefined ? {} : {
            sandbox: sandboxInfo(process.sandbox, stderr.snapshot()),
        }),
    };
}
class RemoteShellProcess {
    status = 'running';
    exitCode = null;
    signal = null;
    sandbox;
    done;
    unread = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
    stdout = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
    stderr = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
    decoder = new ProcessOutputDecoder(this.stdout, this.stderr, value => this.unread.append(value), () => this.unread.markTruncated());
    scope;
    process;
    killed = false;
    removeAbort;
    constructor(uri, spec, helpers, resolveRemotePath) {
        if (spec.signal !== undefined) {
            const onAbort = () => { this.kill(); };
            spec.signal.addEventListener('abort', onAbort, { once: true });
            this.removeAbort = () => spec.signal?.removeEventListener('abort', onAbort);
            if (spec.signal.aborted)
                onAbort();
        }
        this.done = this.run(uri, spec, helpers, resolveRemotePath);
    }
    readOutput() {
        const read = this.unread.consume();
        return { delta: read.text, lossy: read.truncated };
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
    async run(uri, spec, helpers, resolveRemotePath) {
        let cursor = '0';
        const ids = { workspaceId: randomUUID(), processId: randomUUID() };
        let rolledBack = false;
        try {
            this.scope = await openProcessScope(uri, spec.sandboxPolicy, helpers, resolveRemotePath, spec.signal, ids.workspaceId);
            try {
                this.process = await startProcess(this.scope, spec, spec.signal, ids.processId);
            }
            finally {
                await closeWorkspaceBestEffort(this.scope);
            }
            if (this.killed)
                await terminateBestEffort(this.scope.client, this.process.processId);
            if (spec.stdin !== undefined) {
                await writeAndCloseStdin(this.scope.client, this.process.processId, spec.stdin, spec.signal);
            }
            for (;;) {
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
                    break;
                }
            }
            if (this.process.sandbox !== undefined) {
                this.sandbox = sandboxInfo(this.process.sandbox, this.stderr.snapshot());
            }
        }
        catch (error) {
            this.status = 'killed';
            this.signal = 'SIGKILL';
            this.decoder.flush();
            this.unread.append(`[stderr]\nspawn failed: ${messageOf(error)}\n`);
            try {
                await rollbackShellAllocation(helpers, uri, ids);
                rolledBack = true;
            }
            catch (cleanupError) {
                this.unread.append(`[stderr]\ncleanup failed: ${messageOf(cleanupError)}\n`);
            }
        }
        finally {
            this.removeAbort?.();
            this.removeAbort = undefined;
            if (!rolledBack && this.scope !== undefined && this.process !== undefined) {
                await releaseBestEffort(this.scope.client, this.process.processId);
            }
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
    constructor(maxBytes) {
        this.maxBytes = maxBytes;
    }
    append(value) {
        if (value.length === 0)
            return;
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