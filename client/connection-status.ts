import { t } from './locale.js';
import type { ConnectionGenerationState } from '@deepseek-ai/dsh-client-connection/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { Context } from '@deepseek-ai/cordis';
import type { HelperHostStatus, RemoteResult } from 'dsh-ssh-remote/ssh';
declare module '@deepseek-ai/cordis' {
    interface Context {
        sshConnectionStatus: ConnectionStatusStore;
    }
}
/** One Cordis-scoped observer; settings and conversation surfaces share it. */
export function mountConnectionStatus(ctx: Context) {
    const fiber = ctx.inject(['remote.sshRemote', 'connection'], scope => {
        const connection = (scope as Context & {
            connection: ConnectionHandle;
        }).connection;
        const store = new ConnectionStatusStore(() => scope.remote.sshRemote.statuses(), connection.generation, alias => scope.remote.sshRemote.refreshEnvironment(alias));
        const release = scope.reflect.provide('sshConnectionStatus', store);
        return () => { release(); store.dispose(); };
    });
    return async () => { await fiber.dispose(); };
}
export interface ConnectionStatusSnapshot {
    readonly generation?: number;
    readonly hosts: Readonly<Record<string, HelperHostStatus>>;
    readonly unavailable?: string;
}
export interface ConnectionStatusOptions {
    /** Minimum delay between environment re-probes of one host identity. */
    recheckCooldownMs?: number;
}
/** An owner key is `${Session}\0${cwd}\0${alias}`; the alias is the retry unit. */
const ownerAlias = (owner: string): string => owner.slice(owner.lastIndexOf('\0') + 1);
/** One read-only poll shared by the visible host badge and workbench. */
export class ConnectionStatusStore {
    private snapshot: ConnectionStatusSnapshot = { hosts: {}, unavailable: t('正在读取连接状态') };
    private readonly listeners = new Set<() => void>();
    private readonly owners = new Map<string, number>();
    private readonly rechecks = new Map<string, Promise<void>>();
    private readonly nextRecheckAt = new Map<string, number>();
    private readonly wanted = new Set<string>();
    /** Visible lease count per host alias, so one host can withdraw its own retry. */
    private readonly visible = new Map<string, number>();
    private retryTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly recheckCooldownMs: number;
    private epoch = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private deadline: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;
    /** RPCs have no abort parameter: never stack another read behind a timeout. */
    private inFlight: Promise<void> | undefined;
    private refreshPending = false;
    private readonly stopGeneration: () => void;
    constructor(private readonly load: () => Promise<RemoteResult<Record<string, HelperHostStatus>>>, private readonly generation: ConnectionGenerationState, private readonly recheck?: (alias: string) => Promise<unknown>, options: ConnectionStatusOptions = {}) {
        this.recheckCooldownMs = options.recheckCooldownMs ?? 60000;
        this.snapshot = { ...this.snapshot, generation: generation.getSnapshot()?.id };
        this.stopGeneration = generation.subscribe(() => this.restart());
    }
    getSnapshot = (): ConnectionStatusSnapshot => this.snapshot;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    hasOwner(key: string): boolean { return this.owners.has(key); }
    /**
     * Republish the polled snapshot after out-of-band knowledge changed.
     *
     * The cached capability verdict is only refreshed by an explicit environment
     * probe; without this the badge keeps the connect-time verdict even after the
     * host reports a new one.
     */
    refresh(): void {
        // restart() already stopped polling for a lost carrier; a late probe reply
        // must not restart it from here.
        if (this.disposed || this.generation.getSnapshot()?.id === undefined)
            return;
        const epoch = ++this.epoch;
        clearTimeout(this.timer);
        clearTimeout(this.deadline);
        if (this.owners.size > 0)
            this.poll(epoch);
    }
    /**
     * Re-probe one host's login-shell environment, then republish.
     *
     * The badge and the workbench are separate components over one store, and the
     * five-second poll re-renders both of them, so the in-flight request, the
     * cooldown and the retry timer have to live here rather than in a per-surface
     * ref: one host identity means one probe. A negative verdict is never final
     * either — the tool may be installed after the helper connected, or after an
     * earlier probe failed — so a degraded host keeps a bounded, low-frequency
     * retry that the store drives on its own clock. That keeps the five-second
     * status poll from becoming an environment check, needs no reconnect or
     * Session switch, and stops as soon as the surface hides or the host recovers.
     */
    async recheckHost(alias: string): Promise<void> {
        if (this.disposed || this.recheck === undefined || !this.isVisible(alias))
            return;
        const identity = this.identity(alias);
        this.wanted.add(identity);
        const pending = this.rechecks.get(identity);
        if (pending !== undefined)
            return pending;
        if (Date.now() < (this.nextRecheckAt.get(identity) ?? 0)) {
            this.scheduleRetry();
            return;
        }
        const task = this.probe(identity, alias);
        this.rechecks.set(identity, task);
        await task;
    }
    private identity(alias: string): string {
        return `${alias}\0${this.generation.getSnapshot()?.id ?? ''}`;
    }
    private isVisible(alias: string): boolean {
        return (this.visible.get(alias) ?? 0) > 0;
    }
    private async probe(identity: string, alias: string): Promise<void> {
        try {
            await this.recheck?.(alias);
        }
        catch { /* keep the last good snapshot */ }
        finally {
            this.rechecks.delete(identity);
            // A result that outlived its connection identity or its visible surface is
            // not evidence about anything the user can still see.
            if (this.disposed || !this.isCurrent(identity))
                this.nextRecheckAt.delete(identity);
            else
                this.nextRecheckAt.set(identity, Date.now() + this.recheckCooldownMs);
        }
        if (this.disposed || !this.isCurrent(identity))
            return;
        this.refresh();
        this.scheduleRetry();
    }
    /**
     * Arm one timer for the earliest visible host that is still degraded.
     *
     * A host with a probe in flight has no due time yet: arming on it would fire a
     * zero-delay timer that can only re-enter the same pending probe. Its own
     * completion arms the next round.
     */
    private scheduleRetry(): void {
        if (this.disposed || this.retryTimer !== undefined)
            return;
        const now = Date.now();
        let due = Infinity;
        for (const identity of [...this.wanted]) {
            if (!this.isCurrent(identity)) {
                this.wanted.delete(identity);
                continue;
            }
            if (this.rechecks.has(identity))
                continue;
            const alias = this.identityAlias(identity);
            if (!this.isVisible(alias)) {
                this.wanted.delete(identity);
                continue;
            }
            if (this.snapshot.hosts[alias]?.environment?.search.available !== false) {
                this.wanted.delete(identity);
                continue;
            }
            due = Math.min(due, this.nextRecheckAt.get(identity) ?? now);
        }
        if (due === Infinity)
            return;
        this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.retryDue(); }, Math.max(0, due - now));
    }
    private async retryDue(): Promise<void> {
        if (this.disposed)
            return;
        for (const identity of [...this.wanted]) {
            if (!this.isCurrent(identity) || this.rechecks.has(identity)) {
                this.wanted.delete(identity);
                continue;
            }
            const alias = this.identityAlias(identity);
            if (!this.isVisible(alias)) {
                this.wanted.delete(identity);
                continue;
            }
            if (this.snapshot.hosts[alias]?.environment?.search.available !== false) {
                this.wanted.delete(identity);
                continue;
            }
            await this.recheckHost(alias);
        }
        this.scheduleRetry();
    }
    private identityAlias(identity: string): string {
        return identity.slice(0, identity.indexOf('\0'));
    }
    private isCurrent(identity: string): boolean {
        return identity.endsWith(`\0${this.generation.getSnapshot()?.id ?? ''}`);
    }
    /** Drop one host's retry demand once its last visible surface is gone. */
    private forget(alias: string): void {
        for (const identity of [...this.wanted])
            if (this.identityAlias(identity) === alias)
                this.wanted.delete(identity);
        if (this.wanted.size === 0) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
    }
    /** A key includes Session, cwd and verified alias; duplicate surfaces share a lease. */
    retain(key: string): () => void {
        if (this.disposed)
            return () => { };
        const count = this.owners.get(key) ?? 0;
        this.owners.set(key, count + 1);
        if (count === 0) {
            this.holdAlias(ownerAlias(key));
            // statuses() returns all aliases. Adding a second visible surface needs
            // neither a new request nor withdrawal of the already valid snapshot.
            if (this.owners.size === 1)
                this.restart();
        }
        let released = false;
        return () => {
            if (released || this.disposed)
                return;
            released = true;
            const remaining = (this.owners.get(key) ?? 1) - 1;
            if (remaining > 0) {
                this.owners.set(key, remaining);
                return;
            }
            this.owners.delete(key);
            this.releaseAlias(ownerAlias(key));
            if (this.owners.size === 0)
                this.restart();
            else
                this.refresh();
        };
    }
    private holdAlias(alias: string): void {
        this.visible.set(alias, (this.visible.get(alias) ?? 0) + 1);
    }
    private releaseAlias(alias: string): void {
        const leases = (this.visible.get(alias) ?? 1) - 1;
        if (leases > 0) {
            this.visible.set(alias, leases);
            return;
        }
        this.visible.delete(alias);
        this.forget(alias);
    }
    dispose(): void {
        if (this.disposed)
            return;
        this.disposed = true;
        this.epoch++;
        clearTimeout(this.timer);
        clearTimeout(this.deadline);
        clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        this.wanted.clear();
        this.rechecks.clear();
        this.visible.clear();
        this.stopGeneration();
        this.owners.clear();
        this.listeners.clear();
    }
    private publish(snapshot: ConnectionStatusSnapshot): void {
        this.snapshot = snapshot;
        for (const listener of this.listeners)
            listener();
    }
    private restart(): void {
        if (this.disposed)
            return;
        const epoch = ++this.epoch;
        clearTimeout(this.timer);
        clearTimeout(this.deadline);
        clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        const generation = this.generation.getSnapshot()?.id;
        // A new connection identity may legitimately see a different environment,
        // so only cooldowns that still belong to it survive.
        for (const identity of [...this.nextRecheckAt.keys()]) {
            if (!identity.endsWith(`\0${generation ?? ''}`))
                this.nextRecheckAt.delete(identity);
        }
        for (const identity of [...this.wanted])
            if (!this.isCurrent(identity))
                this.wanted.delete(identity);
        const ready = generation !== undefined;
        this.publish({ hosts: {}, generation, unavailable: ready ? t('正在读取连接状态') : t('与 DSH 的连接不可用') });
        if (ready && this.owners.size > 0)
            this.poll(epoch);
    }
    private poll(epoch: number): void {
        if (this.disposed || epoch !== this.epoch || this.owners.size === 0 || this.snapshot.generation === undefined)
            return;
        if (this.inFlight) {
            this.refreshPending = true;
            this.deadline = setTimeout(() => {
                if (epoch === this.epoch && !this.disposed)
                    this.publish({
                        hosts: {}, generation: this.snapshot.generation, unavailable: t('连接状态查询超时'),
                    });
            }, 10000);
            return;
        }
        this.refreshPending = false;
        let settled = false;
        const finish = (snapshot: ConnectionStatusSnapshot) => {
            if (settled || epoch !== this.epoch || this.disposed)
                return;
            settled = true;
            clearTimeout(this.deadline);
            this.publish({ ...snapshot, generation: this.snapshot.generation });
        };
        this.deadline = setTimeout(() => finish({ hosts: {}, unavailable: t('连接状态查询超时') }), 10000);
        const operation = Promise.resolve().then(() => {
            if (epoch !== this.epoch || this.disposed)
                return;
            return this.load();
        }).then(result => {
            if (result)
                finish(result.ok ? { hosts: result.value } : { hosts: {}, unavailable: t('无法读取连接状态：{value1}', { value1: result.error.message }) });
        }, error => finish({ hosts: {}, unavailable: t('无法读取连接状态：{value1}', { value1: error instanceof Error ? error.message : String(error) }) }));
        this.inFlight = operation;
        void operation.finally(() => {
            if (this.inFlight !== operation)
                return;
            this.inFlight = undefined;
            clearTimeout(this.deadline);
            if (this.disposed || this.owners.size === 0 || this.snapshot.generation === undefined)
                return;
            if (this.refreshPending || epoch !== this.epoch)
                this.poll(this.epoch);
            else
                this.timer = setTimeout(() => this.poll(this.epoch), 5000);
        });
    }
}
