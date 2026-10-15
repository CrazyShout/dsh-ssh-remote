import type { PortForwardInput, PortForwardList, PortForwardRemote, PortForwardView } from './port-forward-types.js';
interface State { list?: PortForwardList; error: string; listError: string; pending?: PortForwardInput; busy: Set<string> }
export class PortForwardModel {
  private state: State = { error: '', listError: '', busy: new Set() };
  private readonly stoppedRequests = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private reader?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private revision = 0;
  constructor(readonly sessionId: string, private readonly remote: PortForwardRemote) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private update(patch: Partial<State>) { if (this.disposed) return; this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn(); }
  async refresh(): Promise<void> {
    if (this.disposed) return;
    clearTimeout(this.timer); this.reader?.abort();
    const reader = this.reader = new AbortController(), revision = this.revision;
    try {
      const result = await deadline(this.remote.list(this.sessionId, reader.signal), 8000);
      if (reader.signal.aborted || this.reader !== reader || revision !== this.revision) return;
      if (!result.ok) { this.update({ listError: result.error.message }); return; }
      const found = this.state.pending && result.value.items.some(row => row.id === this.state.pending!.id);
      this.update({ list: result.value, listError: '', ...(found ? { pending: undefined, error: '' } : {}) });
    } catch (error) {
      if (!reader.signal.aborted && this.reader === reader && revision === this.revision) {
        this.update({ listError: error instanceof Error && error.message === 'timeout'
          ? '状态刷新超时；显示的是上次状态，不能据此判断转发仍在运行。' : String(error) });
      }
    } finally {
      reader.abort();
      if (!this.disposed && this.reader === reader) this.timer = setTimeout(() => void this.refresh(), 1500);
    }
  }
  async create(input: Omit<PortForwardInput, 'id'>): Promise<void> {
    if (this.state.pending) return;
    const request = { ...input, id: crypto.randomUUID() }; this.revision++;
    this.update({ pending: request, error: '' });
    try {
      const result = await deadline(this.remote.create(this.sessionId, request), 8000);
      if (this.stoppedRequests.has(request.id)) return;
      if (!result.ok) {
        this.update({ error: result.error.message, ...(result.error.code === 'ssh-ports/refused' ? { pending: undefined } : {}) }); return;
      }
      this.put(result.value); this.update({ pending: undefined });
    } catch { if (!this.stoppedRequests.has(request.id)) this.update({ error: '创建结果待确认；将从列表核对。可停止此请求，不要重复创建。' }); }
    finally { this.revision++; void this.refresh(); }
  }
  async stop(id: string): Promise<void> {
    if (this.state.busy.has(id)) return;
    this.stoppedRequests.add(id);
    this.revision++; this.update({ error: '', busy: new Set([...this.state.busy, id]) });
    try {
      const result = await deadline(this.remote.stop(this.sessionId, id), 15_000);
      if (!result.ok) { this.update({ error: result.error.message }); return; }
      this.put(result.value);
      if (this.state.pending?.id === id && result.value.state === 'stopped') this.update({ pending: undefined });
    } catch { this.update({ error: '停止结果待确认；不会自动重连，请刷新状态或再次停止。' }); }
    finally { this.revision++; const busy = new Set(this.state.busy); busy.delete(id); this.update({ busy }); void this.refresh(); }
  }
  async probe(id: string): Promise<void> {
    this.revision++;
    try {
      const result = await deadline(this.remote.probe(this.sessionId, id), 8000);
      if (result.ok) this.put(result.value); else this.update({ error: result.error.message });
    } catch { this.update({ error: '远端端口检查暂不可用。' }); }
    finally { this.revision++; void this.refresh(); }
  }
  private put(row: PortForwardView) {
    if (!this.state.list || !row.localPort) return;
    if (this.stoppedRequests.has(row.id) && !['stopped', 'stopping'].includes(row.state)) return;
    this.update({ list: { ...this.state.list, items: [row, ...this.state.list.items.filter(item => item.id !== row.id)] } });
  }
  dispose() { this.disposed = true; this.reader?.abort(); clearTimeout(this.timer); this.listeners.clear(); }
}
async function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); })]); }
  finally { clearTimeout(timer!); }
}
export function browserIsOnHost(location: Pick<Location, 'protocol' | 'hostname'>): boolean {
  // A localhost Web URL may itself be an SSH tunnel to a different DSH Host.
  // Only the native local app is known; Web requires explicit human confirmation.
  return location.protocol === 'dsh-app:';
}
export function forwardUrl(row: Pick<PortForwardView, 'protocol' | 'localPort'>): string {
  if (!['http', 'https'].includes(row.protocol) || !Number.isInteger(row.localPort) || row.localPort < 1024 || row.localPort > 65535) throw new Error('无效转发地址。');
  return `${row.protocol}://127.0.0.1:${row.localPort}/`;
}
