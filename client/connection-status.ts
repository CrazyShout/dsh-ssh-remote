import type { ConnectionGenerationState } from '@deepseek-ai/dsh-client-connection/client';
import type { HelperHostStatus, RemoteResult } from 'dsh-ssh-remote/ssh';

export interface ConnectionStatusSnapshot {
  readonly generation?: number;
  readonly hosts: Readonly<Record<string, HelperHostStatus>>;
  readonly unavailable?: string;
}

/** One read-only poll shared by the visible host badge and workbench. */
export class ConnectionStatusStore {
  private snapshot: ConnectionStatusSnapshot = { hosts: {}, unavailable: '正在读取连接状态' };
  private readonly listeners = new Set<() => void>();
  private readonly owners = new Map<string, number>();
  private epoch = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private readonly stopGeneration: () => void;

  constructor(
    private readonly load: () => Promise<RemoteResult<Record<string, HelperHostStatus>>>,
    private readonly generation: ConnectionGenerationState,
  ) {
    this.snapshot = { ...this.snapshot, generation: generation.getSnapshot()?.id };
    this.stopGeneration = generation.subscribe(() => this.restart());
  }

  getSnapshot = (): ConnectionStatusSnapshot => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  hasOwner(key: string): boolean { return this.owners.has(key); }

  /** A key includes Session, cwd and verified alias; duplicate surfaces share a lease. */
  retain(key: string): () => void {
    if (this.disposed) return () => {};
    const count = this.owners.get(key) ?? 0;
    this.owners.set(key, count + 1);
    if (count === 0) this.restart();
    let released = false;
    return () => {
      if (released || this.disposed) return;
      released = true;
      const remaining = (this.owners.get(key) ?? 1) - 1;
      if (remaining > 0) this.owners.set(key, remaining);
      else { this.owners.delete(key); this.restart(); }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch++;
    clearTimeout(this.timer); clearTimeout(this.deadline);
    this.stopGeneration(); this.owners.clear(); this.listeners.clear();
  }

  private publish(snapshot: ConnectionStatusSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private restart(): void {
    if (this.disposed) return;
    const epoch = ++this.epoch;
    clearTimeout(this.timer); clearTimeout(this.deadline);
    const generation = this.generation.getSnapshot()?.id;
    const ready = generation !== undefined;
    this.publish({ hosts: {}, generation, unavailable: ready ? '正在读取连接状态' : '与 DSH 的连接不可用' });
    if (ready && this.owners.size > 0) this.poll(epoch);
  }

  private poll(epoch: number): void {
    let settled = false;
    const finish = (snapshot: ConnectionStatusSnapshot) => {
      if (settled || epoch !== this.epoch || this.disposed) return;
      settled = true;
      clearTimeout(this.deadline);
      this.publish({ ...snapshot, generation: this.snapshot.generation });
      // A subscriber may withdraw the last visible surface during publish().
      if (epoch === this.epoch && !this.disposed) this.timer = setTimeout(() => this.poll(epoch), 5_000);
    };
    this.deadline = setTimeout(() => finish({ hosts: {}, unavailable: '连接状态查询超时' }), 10_000);
    void Promise.resolve().then(() => {
      if (epoch !== this.epoch || this.disposed) return;
      return this.load();
    }).then(result => {
      if (result) finish(result.ok ? { hosts: result.value } : { hosts: {}, unavailable: `无法读取连接状态：${result.error.message}` });
    }, error => finish({ hosts: {}, unavailable: `无法读取连接状态：${error instanceof Error ? error.message : String(error)}` }));
  }
}
