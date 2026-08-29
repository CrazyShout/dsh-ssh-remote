import type { Readable, Writable } from 'node:stream';
import { DshRpcLineDecoder, encodeDshRpcFrame } from './framing.js';
import {
  DSH_RPC_PROTOCOL,
  DSH_RPC_VERSION,
  DshRpcProtocolError,
  assertProtocolCompatible,
  parseInitializeResult,
  parseServerHello,
  type DshRpcErrorBody,
  type DshRpcFailure,
  type DshRpcFrame,
  type DshRpcNotification,
  type DshRpcSuccess,
  type HelperCapabilities,
  type HelperLimits,
  type HelperNotificationListener,
  type HelperSession,
  type InitializeParams,
  type JsonObject,
  type ServerHello,
} from './protocol.js';

export interface RemoteHelperCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** A disconnect/timeout after bytes are written makes the outcome ambiguous. */
  mutation?: boolean;
}

export interface RemoteHelperClientOptions {
  readable: Readable;
  writable: Writable;
  closeTransport?: () => void;
  helloTimeoutMs?: number;
}

export interface RemoteHelperClient {
  readonly hello: ServerHello;
  readonly capabilities: HelperCapabilities;
  readonly limits: HelperLimits;
  readonly sessionId: string;
  readonly session: HelperSession;
  readonly closed: Promise<void>;
  readonly closeReason: Error | undefined;
  call<T>(method: string, params?: Record<string, unknown>, options?: RemoteHelperCallOptions): Promise<T>;
  notify(method: string, params?: Record<string, unknown>): Promise<void>;
  notification(method: string, params?: Record<string, unknown>): Promise<void>;
  onNotification(listener: HelperNotificationListener): () => void;
  onClose(listener: (reason: Error) => void): () => void;
  close(reason?: string): void;
}

export type RemoteHelperInterruptionKind = 'disconnect' | 'timeout' | 'abort' | 'send';

interface PendingCall {
  id: string;
  method: string;
  mutation: boolean;
  started: boolean;
  settled: boolean;
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  cleanup(): void;
}

export class RemoteHelperRpcError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly data: unknown;

  constructor(error: DshRpcErrorBody) {
    super(error.message);
    this.name = 'RemoteHelperRpcError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.data = error.data;
  }
}

export class RemoteHelperCallInterruptedError extends Error {
  readonly mutationMayHaveStarted: boolean;
  readonly kind: RemoteHelperInterruptionKind;

  constructor(
    message: string,
    mutationMayHaveStarted: boolean,
    kind: RemoteHelperInterruptionKind,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RemoteHelperCallInterruptedError';
    this.mutationMayHaveStarted = mutationMayHaveStarted;
    this.kind = kind;
  }
}

/** One initialized multiplexed client over the helper's JSON-line stdio. */
export class RemoteHelperRpcClient implements RemoteHelperClient {
  hello!: ServerHello;
  capabilities: HelperCapabilities = {};
  limits: HelperLimits = {};
  sessionId = '';
  session!: HelperSession;
  readonly closed: Promise<void>;

  private readonly decoder = new DshRpcLineDecoder();
  private readonly pending = new Map<string, PendingCall>();
  private readonly retiredIds = new Set<string>();
  private readonly notificationListeners = new Set<HelperNotificationListener>();
  private readonly closeListeners = new Set<(reason: Error) => void>();
  private readonly helloWaiters = new Set<{ resolve(value: ServerHello): void; reject(reason: unknown): void }>();
  private nextId = 0;
  private initialized = false;
  private closing = false;
  private closeReasonValue: Error | undefined;
  private writeChain: Promise<void> = Promise.resolve();
  private resolveClosed!: () => void;

  constructor(private readonly options: RemoteHelperClientOptions) {
    this.closed = new Promise<void>((resolve) => { this.resolveClosed = resolve; });
    options.readable.on('data', this.onData);
    options.readable.once('end', this.onEnd);
    options.readable.once('close', this.onReadableClose);
    options.readable.once('error', this.onTransportError);
    options.writable.once('error', this.onTransportError);
  }

  get closeReason(): Error | undefined {
    return this.closeReasonValue;
  }

  async initialize(params: InitializeParams, options: RemoteHelperCallOptions = {}): Promise<void> {
    if (this.initialized) return;
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

  call<T>(
    method: string,
    params: Record<string, unknown> = {},
    options: RemoteHelperCallOptions = {},
  ): Promise<T> {
    if (!this.initialized) return Promise.reject(new Error('remote helper client is not initialized'));
    return this.callInternal(method, params, options, false) as Promise<T>;
  }

  /** Send one fire-and-forget protocol notification. */
  notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    if (!this.initialized) return Promise.reject(new Error('remote helper client is not initialized'));
    return this.enqueue({
      dshRpc: DSH_RPC_VERSION,
      method,
      params: params as JsonObject,
    });
  }

  /** Alias retained for callers that name the wire shape directly. */
  notification(method: string, params: Record<string, unknown> = {}): Promise<void> {
    return this.notify(method, params);
  }

  onNotification(listener: HelperNotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onClose(listener: (reason: Error) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(reason = 'remote helper client closed'): void {
    if (this.closing) return;
    this.closing = true;
    try {
      this.options.writable.end();
    } catch {
      /* transport cleanup below is still required */
    }
    try {
      this.options.closeTransport?.();
    } finally {
      this.failAll(new Error(reason));
    }
  }

  /** Manager hook for a child-process close that may precede stream EOF. */
  transportClosed(reason: unknown): void {
    this.failAll(asError(reason, 'remote helper transport closed'));
  }

  private callInternal(
    method: string,
    params: Record<string, unknown>,
    options: RemoteHelperCallOptions,
    allowBeforeInitialize: boolean,
  ): Promise<unknown> {
    if (!allowBeforeInitialize && !this.initialized) {
      return Promise.reject(new Error('remote helper client is not initialized'));
    }
    if (!method) return Promise.reject(new Error('RPC method must be non-empty'));
    if (this.closeReasonValue !== undefined) return Promise.reject(this.closeReasonValue);
    options.signal?.throwIfAborted();
    const id = `request-${++this.nextId}`;
    return new Promise<unknown>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let removeAbort: (() => void) | undefined;
      const pending: PendingCall = {
        id,
        method,
        mutation: options.mutation === true,
        started: false,
        settled: false,
        resolve,
        reject,
        cleanup: () => {
          if (timer !== undefined) clearTimeout(timer);
          removeAbort?.();
        },
      };
      this.pending.set(id, pending);
      const interrupt = (kind: RemoteHelperInterruptionKind, message: string, cause?: unknown): void => {
        if (!this.pending.delete(id) || pending.settled) return;
        pending.settled = true;
        pending.cleanup();
        this.retire(id);
        reject(new RemoteHelperCallInterruptedError(
          message,
          pending.mutation && pending.started,
          kind,
          cause === undefined ? undefined : { cause: asError(cause) },
        ));
      };
      if (options.signal !== undefined) {
        const onAbort = (): void => interrupt('abort', `remote helper call ${method} was aborted`, options.signal?.reason);
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
        params: params as JsonObject,
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

  private waitForHello(signal: AbortSignal | undefined, timeoutMs: number): Promise<ServerHello> {
    if (this.hello !== undefined) return Promise.resolve(this.hello);
    signal?.throwIfAborted();
    return new Promise<ServerHello>((resolve, reject) => {
      let settled = false;
      const waiter = {
        resolve: (value: ServerHello) => finish(() => resolve(value)),
        reject: (reason: unknown) => finish(() => reject(reason)),
      };
      const timer = setTimeout(() => waiter.reject(new Error(`server/hello timed out after ${timeoutMs}ms`)), timeoutMs);
      const onAbort = (): void => waiter.reject(signal?.reason ?? new Error('server/hello aborted'));
      const finish = (run: () => void): void => {
        if (settled) return;
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

  private enqueue(frame: DshRpcFrame, onStarted?: () => void): Promise<void> {
    let operation!: Promise<void>;
    operation = this.writeChain.catch(() => undefined).then(async () => {
      if (this.closeReasonValue !== undefined) throw this.closeReasonValue;
      const encoded = encodeDshRpcFrame(frame);
      await new Promise<void>((resolve, reject) => {
        let callbackCalled = false;
        try {
          onStarted?.();
          this.options.writable.write(encoded, (error?: Error | null) => {
            if (callbackCalled) return;
            callbackCalled = true;
            if (error) reject(error);
            else resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    this.writeChain = operation;
    return operation;
  }

  private readonly onData = (chunk: Buffer | Uint8Array | string): void => {
    if (this.closeReasonValue !== undefined) return;
    try {
      for (const frame of this.decoder.push(chunk)) this.accept(frame);
    } catch (error) {
      this.failAll(asError(error, 'invalid helper RPC stream'));
      this.options.closeTransport?.();
    }
  };

  private readonly onEnd = (): void => {
    try {
      this.decoder.finish();
      this.failAll(new Error('remote helper stdout ended'));
    } catch (error) {
      this.failAll(asError(error));
    }
  };

  private readonly onReadableClose = (): void => {
    this.failAll(new Error('remote helper stdout closed'));
  };

  private readonly onTransportError = (error: Error): void => {
    this.failAll(error);
  };

  private accept(frame: DshRpcFrame): void {
    if ('method' in frame) {
      if ('id' in frame) throw new DshRpcProtocolError(`unexpected server request ${frame.method}`);
      const notification = frame as DshRpcNotification;
      if (notification.method === 'server/hello') {
        const hello = parseServerHello(notification);
        if (this.hello !== undefined) {
          throw new DshRpcProtocolError('received duplicate server/hello');
        }
        this.hello = hello;
        for (const waiter of [...this.helloWaiters]) waiter.resolve(hello);
      }
      for (const listener of this.notificationListeners) {
        try { listener(notification); } catch { /* consumer failures are not protocol failures */ }
      }
      return;
    }

    const id = String(frame.id);
    const pending = this.pending.get(id);
    if (pending === undefined) {
      if (this.retiredIds.delete(id)) return;
      throw new DshRpcProtocolError(`response for unknown request id ${id}`);
    }
    this.pending.delete(id);
    pending.settled = true;
    pending.cleanup();
    if ('error' in frame) pending.reject(new RemoteHelperRpcError((frame as DshRpcFailure).error));
    else pending.resolve((frame as DshRpcSuccess).result);
  }

  private retire(id: string): void {
    this.retiredIds.add(id);
    if (this.retiredIds.size > 1024) {
      const oldest = this.retiredIds.values().next().value as string | undefined;
      if (oldest !== undefined) this.retiredIds.delete(oldest);
    }
  }

  private failAll(reason: Error): void {
    if (this.closeReasonValue !== undefined) return;
    this.closeReasonValue = reason;
    for (const pending of this.pending.values()) {
      pending.settled = true;
      pending.cleanup();
      pending.reject(new RemoteHelperCallInterruptedError(
        `${pending.method} interrupted: ${reason.message}`,
        pending.mutation && pending.started,
        'disconnect',
        { cause: reason },
      ));
    }
    this.pending.clear();
    for (const waiter of this.helloWaiters) waiter.reject(reason);
    this.helloWaiters.clear();
    this.detach();
    for (const listener of this.closeListeners) {
      try { listener(reason); } catch { /* every listener still receives closure */ }
    }
    this.closeListeners.clear();
    this.resolveClosed();
  }

  private detach(): void {
    this.options.readable.removeListener('data', this.onData);
    this.options.readable.removeListener('end', this.onEnd);
    this.options.readable.removeListener('close', this.onReadableClose);
    this.options.readable.removeListener('error', this.onTransportError);
    this.options.writable.removeListener('error', this.onTransportError);
  }
}

function asError(reason: unknown, fallback = 'remote helper failure'): Error {
  return reason instanceof Error ? reason : new Error(reason === undefined ? fallback : String(reason));
}
