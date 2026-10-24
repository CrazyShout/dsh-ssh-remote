import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, posix } from 'node:path';
import { Duplex, PassThrough } from 'node:stream';
import { SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox';
import { parseSshUri } from './types.js';
const BOOTSTRAP = '__DSH_PTC_BOOTSTRAP__';
const CHUNK = 64 * 1024;
/** Keep the official PTC protocol/binding runtime; adapt only its public execution seams. */
export function installRemotePtcRouter(runtime, fs, subprocess, sandbox, helpers, resolve) {
    const current = new AsyncLocalStorage();
    const original = { run: runtime.run, path: fs.processPathFromHostPath, resolve: subprocess.resolveExecutable,
        spawn: subprocess.spawn, confine: sandbox.confine };
    const live = new Set();
    const runs = new Set();
    const lifetime = new AbortController();
    const owners = new WeakMap();
    const releasable = runtime;
    const originalRelease = releasable.release;
    if (originalRelease !== undefined)
        releasable.release = async function (owner) {
            await originalRelease.call(this, owner);
            owners.delete(owner);
        };
    let disposed = false;
    let disposal;
    const mapped = (path) => path.startsWith('ssh://') ? path : resolve(path);
    runtime.run = function (spec) {
        const uri = mapped(spec.cwd);
        if (disposed && uri !== undefined)
            throw new Error('remote PTC router is disposed');
        const ownerKey = spec.stateOwner;
        if (ownerKey !== undefined) {
            const identity = uri ?? `local:${spec.cwd}`;
            const previous = owners.get(ownerKey);
            if (previous !== undefined && previous !== identity)
                throw new Error('PTC execution workspace changed; release the retained environment before reusing its owner');
            owners.set(ownerKey, identity);
        }
        if (uri === undefined)
            return current.run(undefined, () => original.run.call(this, spec));
        const policy = spec.sandboxPolicy;
        if (policy === undefined)
            throw new Error('remote PTC requires a resolved sandbox policy');
        const mode = policy.mode;
        const owner = parseSshUri(uri);
        const signal = spec.signal === undefined ? lifetime.signal : AbortSignal.any([spec.signal, lifetime.signal]);
        const rootUri = policy === undefined ? undefined : mapped(policy.workspaceRoot);
        const root = mode === 'danger-full-access' ? '/' : rootUri === undefined ? undefined : parseSshUri(rootUri);
        if (root === undefined || (typeof root !== 'string' && (root.host !== owner.host || root.user !== owner.user || root.port !== owner.port
            || !within(root.path, owner.path))))
            throw new Error('remote PTC workspace policy does not match its SSH identity');
        // Preflight remains inside the runtime's outcome/deadline handling: no
        // unhandled rejected connection promise before resolveExecutable awaits it.
        let client;
        const route = { uri, root: typeof root === 'string' ? root : root.path,
            mode, client: () => client ??= helpers.client(uri, signal), launched: false };
        const bindings = spec.bindings.map(binding => ({ ...binding,
            functions: Object.fromEntries(Object.entries(binding.functions).map(([name, fn]) => [name, (args) => current.run(undefined, () => fn(args))])),
        }));
        const pending = current.run(route, () => original.run.call(this, { ...spec, cwd: owner.path, bindings, signal }));
        runs.add(pending);
        void pending.then(() => runs.delete(pending), () => runs.delete(pending));
        return pending;
    };
    fs.processPathFromHostPath = function (path) {
        const route = current.getStore();
        if (route === undefined || route.launched)
            return original.path.call(this, path);
        // This public projection is called with the *active* SDK's asset, including
        // Electron ASAR paths. Never load a second runtime/version from our package.
        if (!['process.js', 'persistent-process.js'].includes(basename(path)) || basename(dirname(path)) !== 'lib'
            || basename(dirname(dirname(path))) !== 'dsh-ptc-runtime-node')
            return original.path.call(this, path);
        const bytes = readFileSync(path);
        if (bytes.length > 512 * 1024)
            throw new Error('official PTC bootstrap exceeds the remote helper asset limit');
        route.bootstrap = { data: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') };
        return BOOTSTRAP;
    };
    subprocess.resolveExecutable = async function (command, env, signal) {
        const route = current.getStore();
        if (route === undefined || route.launched)
            return original.resolve.call(this, command, env, signal);
        const client = await route.client();
        requireCapability(client);
        const result = await client.call('environment/resolveExecutable', {
            command: command === process.execPath ? 'node' : command, login: true,
            nodePtc: true,
        }, { signal, timeoutMs: 10_000 });
        return result.path;
    };
    sandbox.confine = async function (argv, policy, signal) {
        const route = current.getStore();
        if (route === undefined || !argv.includes(BOOTSTRAP))
            return original.confine.call(this, argv, policy, signal);
        signal?.throwIfAborted();
        const client = await route.client();
        const capability = client.capabilities.process;
        if (capability?.sandbox !== 'bwrap')
            throw new SandboxUnavailableError(policy.mode, 'Remote run_code requires bubblewrap for restricted permissions; no local or full-access fallback.');
        return { argv: [...argv], enforcement: 'full', denialSignatures: ['Permission denied', 'Read-only file system'],
            runnerFailureRules: [{ fatalSignatures: ['bwrap:'] }] };
    };
    subprocess.spawn = function (spec) {
        const route = current.getStore();
        if (route === undefined || spec.stdio.control !== 'pipe')
            return original.spawn.call(this, spec);
        if (!route.bootstrap || !spec.argv.includes(BOOTSTRAP)) {
            throw new Error('Remote run_code requires the official built Node bootstrap; custom/prepackaged bootstrap is not supported.');
        }
        route.launched = true;
        const handle = new RemotePtcProcess(route, spec);
        live.add(handle);
        void handle.done.then(() => live.delete(handle), () => live.delete(handle));
        return handle;
    };
    return { dispose() {
            return disposal ??= (async () => {
                disposed = true;
                lifetime.abort(new Error('remote PTC router disposed'));
                for (const process of live)
                    process.terminate();
                // A launch waiting for Node discovery still owns these seams. Quiesce it
                // before restoring them, or its late continuation could reach local spawn.
                await Promise.allSettled([...runs, ...[...live].map(process => process.done)]);
                runtime.run = original.run;
                fs.processPathFromHostPath = original.path;
                if (originalRelease !== undefined)
                    releasable.release = originalRelease;
                subprocess.resolveExecutable = original.resolve;
                subprocess.spawn = original.spawn;
                sandbox.confine = original.confine;
            })();
        } };
}
function within(root, path) {
    const relative = posix.relative(root, path);
    return relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative);
}
function requireCapability(client) {
    const capability = client.capabilities.process;
    if (capability?.controlPipe?.version !== 1 || capability.ptcBootstrap?.version !== 1) {
        throw new Error('Remote helper does not support run_code control pipes. Reconnect with the updated plugin; the program was not started.');
    }
}
/** Bounded, lossless fd-7 transport; output and process ownership stay separate. */
class RemotePtcProcess {
    route;
    spec;
    stdin = undefined;
    stdout = new PassThrough({ highWaterMark: CHUNK });
    stderr = new PassThrough({ highWaterMark: CHUNK });
    collected = {};
    control;
    done;
    id = randomUUID();
    workspace = randomUUID();
    stop = new AbortController();
    call;
    inputSeq = '0';
    wakeRead;
    releaseConfirmed = false;
    termination;
    stoppedAt;
    ready;
    publish;
    constructor(route, spec) {
        this.route = route;
        this.spec = spec;
        if (spec.stdio.stdin !== 'ignore' || spec.stdio.stdout !== 'pipe' || spec.stdio.stderr !== 'pipe') {
            throw new Error('remote PTC requires ignored stdin and piped output');
        }
        this.ready = new Promise(resolve => { this.publish = resolve; });
        this.control = new Duplex({ highWaterMark: CHUNK,
            read: () => { this.wakeRead?.(); },
            write: (chunk, _encoding, callback) => { void this.writeControl(Buffer.from(chunk), false).then(() => callback(), callback); },
            final: callback => { void this.writeControl(Buffer.alloc(0), true).then(() => callback(), callback); },
            destroy: (error, callback) => { this.wakeRead?.(); callback(error); },
        });
        // The consumer attaches after the synchronous spawn return.
        for (const stream of [this.control, this.stdout, this.stderr])
            stream.on('error', () => { });
        const abort = () => this.terminate();
        spec.signal?.addEventListener('abort', abort, { once: true });
        if (spec.signal?.aborted)
            this.terminate();
        this.done = this.run().finally(() => { spec.signal?.removeEventListener('abort', abort); });
    }
    terminate() {
        if (this.stop.signal.aborted)
            return;
        this.stoppedAt = Date.now();
        this.stop.abort();
        this.wakeRead?.();
        if (this.call !== undefined)
            this.termination = this.call('process/terminate', {
                processId: this.id, operationId: randomUUID(), graceMs: Math.min(2000, this.spec.graceMs),
            }, { mutation: true, timeoutMs: 6000 }).catch(() => { });
    }
    async waitForExit(signal) {
        if (signal?.aborted)
            return false;
        let abort;
        const aborted = new Promise(resolve => { abort = () => resolve(false); signal?.addEventListener('abort', abort, { once: true }); });
        try {
            return await Promise.race([this.done.then(() => {
                    if (!this.releaseConfirmed)
                        throw new Error('remote process cleanup was not confirmed');
                    return true;
                }), aborted]);
        }
        finally {
            signal?.removeEventListener('abort', abort);
        }
    }
    async writeControl(bytes, eof) {
        await this.ready;
        if (this.call === undefined)
            throw new Error('remote PTC allocation failed');
        this.stop.signal.throwIfAborted();
        for (let offset = 0; offset < bytes.length || (eof && offset === 0); offset += CHUNK) {
            const result = await this.call('process/controlWrite', {
                processId: this.id, operationId: randomUUID(), afterSeq: this.inputSeq,
                data: bytes.subarray(offset, offset + CHUNK).toString('base64'), eof,
            }, { mutation: true, timeoutMs: 10_000 });
            this.inputSeq = result.nextSeq;
        }
    }
    async run() {
        let opened = false;
        try {
            const client = await this.route.client();
            requireCapability(client);
            const session = client.sessionId;
            this.call = (method, params, options = {}) => client.callInSession
                ? client.callInSession(session, method, params, options)
                : client.sessionId !== session ? Promise.reject(new Error('remote PTC helper session changed')) : client.call(method, params, options);
            this.stop.signal.throwIfAborted();
            opened = true; // Close/retire even if the allocation response is lost.
            const ws = await this.call('workspace/open', {
                workspaceId: this.workspace, operationId: this.workspace, path: this.route.root, access: this.route.mode,
            }, { mutation: true, timeoutMs: 10_000 });
            this.stop.signal.throwIfAborted();
            // PTC's host tombstones must also clear remote-only ambient secrets.
            // The helper starts this worker with a minimal startup environment.
            await this.call('process/start', { workspaceId: this.workspace, processId: this.id, operationId: this.id,
                cwd: posix.relative(ws.path, parseSshUri(this.route.uri).path), argv: [...this.spec.argv],
                control: 'pipe', stdin: 'closed', ptcBootstrap: this.route.bootstrap,
            }, { mutation: true, timeoutMs: 20_000 });
            this.publish();
            if (this.stop.signal.aborted) {
                await this.call('process/terminate', { processId: this.id, operationId: randomUUID(), force: true }, { mutation: true, timeoutMs: 6000 });
            }
            const [outcome] = await Promise.all([this.readOutput(), this.readControl()]);
            return outcome;
        }
        catch (cause) {
            const error = cause instanceof Error ? cause : new Error(String(cause));
            this.control.destroy(error);
            this.stdout.destroy(error);
            this.stderr.destroy(error);
            throw error;
        }
        finally {
            this.publish();
            this.wakeRead?.();
            await this.termination;
            if (this.call !== undefined) {
                try {
                    await this.call('process/release', { processId: this.id, operationId: randomUUID() }, { mutation: true, timeoutMs: 10_000 });
                    this.releaseConfirmed = true;
                }
                catch (error) {
                    if (error.code === 'E_UNKNOWN_PROCESS')
                        this.releaseConfirmed = true;
                    else
                        throw error;
                }
                finally {
                    if (opened)
                        await this.call('workspace/close', { workspaceId: this.workspace, operationId: randomUUID() }, { mutation: true, timeoutMs: 5000 });
                }
            }
        }
    }
    async readControl() {
        let cursor = '0';
        while (!this.control.destroyed) {
            this.checkDrainDeadline();
            const result = await this.call('process/controlRead', {
                processId: this.id, afterSeq: cursor, maxBytes: CHUNK, waitMs: 1000,
            }, { timeoutMs: 5000 });
            cursor = result.nextSeq;
            if (result.data && !this.control.push(Buffer.from(result.data, 'base64')) && this.control.readableLength >= CHUNK
                && !this.control.destroyed && !this.stop.signal.aborted) {
                await new Promise(resolve => { this.wakeRead = resolve; });
                this.wakeRead = undefined;
            }
            if (result.eof) {
                this.control.push(null);
                return;
            }
        }
    }
    async readOutput() {
        let cursor = '0';
        for (;;) {
            this.checkDrainDeadline();
            const result = await this.call('process/read', {
                processId: this.id, afterSeq: cursor, maxBytes: CHUNK, waitMs: 1000,
            }, { timeoutMs: 5000 });
            cursor = result.nextSeq;
            if (result.truncated)
                throw new Error('remote PTC output was truncated; run result is incomplete');
            for (const chunk of result.chunks) {
                const stream = chunk.stream === 'stderr' ? this.stderr : this.stdout;
                if (!stream.destroyed && !stream.write(Buffer.from(chunk.data, 'base64')))
                    await new Promise((resolve, reject) => {
                        const cleanup = () => { stream.off('drain', done); stream.off('close', done); this.stop.signal.removeEventListener('abort', cancelled); };
                        const done = () => { cleanup(); resolve(); };
                        const cancelled = () => { cleanup(); reject(new Error('remote PTC output consumer stopped during cancellation')); };
                        stream.once('drain', done);
                        stream.once('close', done);
                        this.stop.signal.addEventListener('abort', cancelled, { once: true });
                        if (this.stop.signal.aborted)
                            cancelled();
                    });
            }
            if (result.exited) {
                this.stdout.end();
                this.stderr.end();
                return { exitCode: result.exitCode, signal: result.signal };
            }
        }
    }
    checkDrainDeadline() {
        if (this.stoppedAt !== undefined && Date.now() - this.stoppedAt > 5000) {
            throw new Error('remote PTC output did not close within 5s after termination');
        }
    }
}
//# sourceMappingURL=ptc-router.js.map