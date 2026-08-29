import { DshRpcLineDecoder, encodeDshRpcFrame } from './framing.js';
import { DSH_RPC_PROTOCOL, DSH_RPC_VERSION, DshRpcProtocolError, assertProtocolCompatible, parseInitializeResult, parseServerHello, } from './protocol.js';
export class RemoteHelperRpcError extends Error {
    code;
    retryable;
    data;
    constructor(error) {
        super(error.message);
        this.name = 'RemoteHelperRpcError';
        this.code = error.code;
        this.retryable = error.retryable;
        this.data = error.data;
    }
}
export class RemoteHelperCallInterruptedError extends Error {
    mutationMayHaveStarted;
    kind;
    constructor(message, mutationMayHaveStarted, kind, options) {
        super(message, options);
        this.name = 'RemoteHelperCallInterruptedError';
        this.mutationMayHaveStarted = mutationMayHaveStarted;
        this.kind = kind;
    }
}
/** One initialized multiplexed client over the helper's JSON-line stdio. */
export class RemoteHelperRpcClient {
    options;
    hello;
    capabilities = {};
    limits = {};
    sessionId = '';
    session;
    closed;
    decoder = new DshRpcLineDecoder();
    pending = new Map();
    retiredIds = new Set();
    notificationListeners = new Set();
    closeListeners = new Set();
    helloWaiters = new Set();
    nextId = 0;
    initialized = false;
    closing = false;
    closeReasonValue;
    writeChain = Promise.resolve();
    resolveClosed;
    constructor(options) {
        this.options = options;
        this.closed = new Promise((resolve) => { this.resolveClosed = resolve; });
        options.readable.on('data', this.onData);
        options.readable.once('end', this.onEnd);
        options.readable.once('close', this.onReadableClose);
        options.readable.once('error', this.onTransportError);
        options.writable.once('error', this.onTransportError);
    }
    get closeReason() {
        return this.closeReasonValue;
    }
    async initialize(params, options = {}) {
        if (this.initialized)
            return;
        const hello = await this.waitForHello(options.signal, options.timeoutMs ?? this.options.helloTimeoutMs ?? 15_000);
        assertProtocolCompatible(hello);
        const result = parseInitializeResult(await this.callInternal('initialize', {
            ...params,
            protocol: params.protocol ?? { min: DSH_RPC_PROTOCOL, max: DSH_RPC_PROTOCOL },
        }, options, true));
        if (result.session.clientId !== params.clientId) {
            throw new DshRpcProtocolError('initialize returned a different clientId');
        }
        this.session = result.session;
        this.sessionId = result.session.sessionId;
        this.capabilities = result.capabilities;
        this.limits = result.limits;
        this.initialized = true;
    }
    call(method, params = {}, options = {}) {
        if (!this.initialized)
            return Promise.reject(new Error('remote helper client is not initialized'));
        return this.callInternal(method, params, options, false);
    }
    /** Send one fire-and-forget protocol notification. */
    notify(method, params = {}) {
        if (!this.initialized)
            return Promise.reject(new Error('remote helper client is not initialized'));
        return this.enqueue({
            dshRpc: DSH_RPC_VERSION,
            method,
            params: params,
        });
    }
    /** Alias retained for callers that name the wire shape directly. */
    notification(method, params = {}) {
        return this.notify(method, params);
    }
    onNotification(listener) {
        this.notificationListeners.add(listener);
        return () => this.notificationListeners.delete(listener);
    }
    onClose(listener) {
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }
    close(reason = 'remote helper client closed') {
        if (this.closing)
            return;
        this.closing = true;
        try {
            this.options.writable.end();
        }
        catch {
            /* transport cleanup below is still required */
        }
        try {
            this.options.closeTransport?.();
        }
        finally {
            this.failAll(new Error(reason));
        }
    }
    /** Manager hook for a child-process close that may precede stream EOF. */
    transportClosed(reason) {
        this.failAll(asError(reason, 'remote helper transport closed'));
    }
    callInternal(method, params, options, allowBeforeInitialize) {
        if (!allowBeforeInitialize && !this.initialized) {
            return Promise.reject(new Error('remote helper client is not initialized'));
        }
        if (!method)
            return Promise.reject(new Error('RPC method must be non-empty'));
        if (this.closeReasonValue !== undefined)
            return Promise.reject(this.closeReasonValue);
        options.signal?.throwIfAborted();
        const id = `request-${++this.nextId}`;
        return new Promise((resolve, reject) => {
            let timer;
            let removeAbort;
            const pending = {
                id,
                method,
                mutation: options.mutation === true,
                started: false,
                settled: false,
                resolve,
                reject,
                cleanup: () => {
                    if (timer !== undefined)
                        clearTimeout(timer);
                    removeAbort?.();
                },
            };
            this.pending.set(id, pending);
            const interrupt = (kind, message, cause) => {
                if (!this.pending.delete(id) || pending.settled)
                    return;
                pending.settled = true;
                pending.cleanup();
                this.retire(id);
                reject(new RemoteHelperCallInterruptedError(message, pending.mutation && pending.started, kind, cause === undefined ? undefined : { cause: asError(cause) }));
            };
            if (options.signal !== undefined) {
                const onAbort = () => interrupt('abort', `remote helper call ${method} was aborted`, options.signal?.reason);
                options.signal.addEventListener('abort', onAbort, { once: true });
                removeAbort = () => options.signal?.removeEventListener('abort', onAbort);
            }
            const timeoutMs = options.timeoutMs ?? 30_000;
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
                interrupt('timeout', `remote helper call ${method} has an invalid timeout`);
                return;
            }
            timer = setTimeout(() => interrupt('timeout', `remote helper call ${method} timed out after ${timeoutMs}ms`), timeoutMs);
            void this.enqueue({
                dshRpc: DSH_RPC_VERSION,
                id,
                method,
                params: params,
            }, () => { pending.started = true; }).catch((error) => {
                if (!(error instanceof DshRpcProtocolError)) {
                    this.failAll(asError(error, 'remote helper transport write failed'));
                    this.options.closeTransport?.();
                    return;
                }
                interrupt('send', `failed to send remote helper call ${method}`, error);
            });
        });
    }
    waitForHello(signal, timeoutMs) {
        if (this.hello !== undefined)
            return Promise.resolve(this.hello);
        signal?.throwIfAborted();
        return new Promise((resolve, reject) => {
            let settled = false;
            const waiter = {
                resolve: (value) => finish(() => resolve(value)),
                reject: (reason) => finish(() => reject(reason)),
            };
            const timer = setTimeout(() => waiter.reject(new Error(`server/hello timed out after ${timeoutMs}ms`)), timeoutMs);
            const onAbort = () => waiter.reject(signal?.reason ?? new Error('server/hello aborted'));
            const finish = (run) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                this.helloWaiters.delete(waiter);
                run();
            };
            this.helloWaiters.add(waiter);
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }
    enqueue(frame, onStarted) {
        let operation;
        operation = this.writeChain.catch(() => undefined).then(async () => {
            if (this.closeReasonValue !== undefined)
                throw this.closeReasonValue;
            const encoded = encodeDshRpcFrame(frame);
            await new Promise((resolve, reject) => {
                let callbackCalled = false;
                try {
                    onStarted?.();
                    this.options.writable.write(encoded, (error) => {
                        if (callbackCalled)
                            return;
                        callbackCalled = true;
                        if (error)
                            reject(error);
                        else
                            resolve();
                    });
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        this.writeChain = operation;
        return operation;
    }
    onData = (chunk) => {
        if (this.closeReasonValue !== undefined)
            return;
        try {
            for (const frame of this.decoder.push(chunk))
                this.accept(frame);
        }
        catch (error) {
            this.failAll(asError(error, 'invalid helper RPC stream'));
            this.options.closeTransport?.();
        }
    };
    onEnd = () => {
        try {
            this.decoder.finish();
            this.failAll(new Error('remote helper stdout ended'));
        }
        catch (error) {
            this.failAll(asError(error));
        }
    };
    onReadableClose = () => {
        this.failAll(new Error('remote helper stdout closed'));
    };
    onTransportError = (error) => {
        this.failAll(error);
    };
    accept(frame) {
        if ('method' in frame) {
            if ('id' in frame)
                throw new DshRpcProtocolError(`unexpected server request ${frame.method}`);
            const notification = frame;
            if (notification.method === 'server/hello') {
                const hello = parseServerHello(notification);
                if (this.hello !== undefined) {
                    throw new DshRpcProtocolError('received duplicate server/hello');
                }
                this.hello = hello;
                for (const waiter of [...this.helloWaiters])
                    waiter.resolve(hello);
            }
            for (const listener of this.notificationListeners) {
                try {
                    listener(notification);
                }
                catch { /* consumer failures are not protocol failures */ }
            }
            return;
        }
        const id = String(frame.id);
        const pending = this.pending.get(id);
        if (pending === undefined) {
            if (this.retiredIds.delete(id))
                return;
            throw new DshRpcProtocolError(`response for unknown request id ${id}`);
        }
        this.pending.delete(id);
        pending.settled = true;
        pending.cleanup();
        if ('error' in frame)
            pending.reject(new RemoteHelperRpcError(frame.error));
        else
            pending.resolve(frame.result);
    }
    retire(id) {
        this.retiredIds.add(id);
        if (this.retiredIds.size > 1024) {
            const oldest = this.retiredIds.values().next().value;
            if (oldest !== undefined)
                this.retiredIds.delete(oldest);
        }
    }
    failAll(reason) {
        if (this.closeReasonValue !== undefined)
            return;
        this.closeReasonValue = reason;
        for (const pending of this.pending.values()) {
            pending.settled = true;
            pending.cleanup();
            pending.reject(new RemoteHelperCallInterruptedError(`${pending.method} interrupted: ${reason.message}`, pending.mutation && pending.started, 'disconnect', { cause: reason }));
        }
        this.pending.clear();
        for (const waiter of this.helloWaiters)
            waiter.reject(reason);
        this.helloWaiters.clear();
        this.detach();
        for (const listener of this.closeListeners) {
            try {
                listener(reason);
            }
            catch { /* every listener still receives closure */ }
        }
        this.closeListeners.clear();
        this.resolveClosed();
    }
    detach() {
        this.options.readable.removeListener('data', this.onData);
        this.options.readable.removeListener('end', this.onEnd);
        this.options.readable.removeListener('close', this.onReadableClose);
        this.options.readable.removeListener('error', this.onTransportError);
        this.options.writable.removeListener('error', this.onTransportError);
    }
}
function asError(reason, fallback = 'remote helper failure') {
    return reason instanceof Error ? reason : new Error(reason === undefined ? fallback : String(reason));
}
//# sourceMappingURL=rpc-client.js.map