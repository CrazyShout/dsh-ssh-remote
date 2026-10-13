import type { EditorDocument, EditorRemote, EditorSaveResult } from './editor-types.js';

export interface EditorState {
  document?: EditorDocument;
  draft: string;
  message: string;
  reading: boolean;
  saving: boolean;
  outcome?: EditorSaveResult['state'];
  remoteText?: string;
  confirmation?: 'discard' | 'close';
}

/** The buffer belongs to an explicit Session, never to the current selection. */
export class EditorModel {
  private state: EditorState = { draft: '', message: '', reading: false, saving: false };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private reader?: AbortController;
  private attempt?: { id: string; text: string; document: EditorDocument };
  private confirmedAction?: () => void;
  constructor(readonly sessionId: string, private readonly remote: EditorRemote, private readonly timeoutMs = 90_000) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  get dirty() { return this.state.document !== undefined && this.state.draft !== this.state.document.text; }
  get unsettled() { return this.state.saving || this.state.outcome === 'pending' || this.state.outcome === 'unknown'; }
  get needsProtection() { return this.dirty || this.unsettled; }
  edit(text: string) { this.update({ draft: text }); }
  notice(message: string) { this.update({ message }); }
  requestOpen(path: string) {
    if (this.unsettled) { this.notice('保存结果待确认，请先核对；切换文件不会撤销已发出的保存。'); return; }
    if (this.dirty) this.ask('discard', () => { void this.open(path, true); });
    else void this.open(path);
  }
  requestClose(close: () => void): boolean {
    if (!this.needsProtection) return true;
    this.ask('close', close); return false;
  }
  confirm(accept: boolean) {
    const action = this.confirmedAction; this.confirmedAction = undefined;
    this.update({ confirmation: undefined });
    if (accept) action?.();
  }
  private ask(confirmation: 'discard' | 'close', action: () => void) {
    this.confirmedAction = action; this.update({ confirmation });
  }

  async open(path: string, discard = false) {
    if (this.unsettled) { this.notice('保存结果待确认，请先核对；切换文件不会撤销已发出的保存。'); return; }
    if (this.dirty && !discard) { this.notice('请先保存，或确认放弃当前草稿。'); return; }
    this.reader?.abort();
    const reader = this.reader = new AbortController();
    const generation = ++this.generation;
    this.update({ reading: true, message: '正在读取完整文件…' });
    try {
      const result = await bounded(this.remote.read(this.sessionId, path, reader.signal), this.timeoutMs, () => reader.abort());
      if (reader.signal.aborted || generation !== this.generation) return;
      if (!result.ok) throw new Error(result.error.message);
      if (result.value.sessionId !== this.sessionId) throw new Error('文件会话身份不匹配，未打开。');
      this.attempt = undefined;
      this.update({ document: result.value, draft: result.value.text, outcome: undefined, remoteText: undefined,
        message: '手动保存；草稿仅在本次运行中保留。' });
    } catch (error) {
      if (generation === this.generation) this.notice(message(error));
    } finally { if (generation === this.generation) this.update({ reading: false }); }
  }

  async save() {
    const document = this.state.document;
    if (!document || this.state.reading || this.unsettled || !this.dirty) return;
    const encoded = (document.bom ? '\ufeff' : '') + (document.newline === 'crlf'
      ? this.state.draft.replace(/\n/gu, '\r\n') : this.state.draft);
    if (new TextEncoder().encode(encoded).byteLength > document.maxBytes) {
      this.update({ outcome: 'failed', message: `内容超过 ${document.maxBytes / 1024} KiB，未发送保存；草稿已保留。` }); return;
    }
    const attempt = this.attempt = { id: operationId(), text: this.state.draft, document };
    this.update({ saving: true, outcome: 'pending', message: '正在保存…' });
    try {
      const result = await bounded(this.remote.save(this.sessionId, { ...document,
        text: attempt.text, operationId: attempt.id }), this.timeoutMs);
      if (!result.ok) {
        const code = result.error.code as string;
        if (code === 'ssh-editor/refused' || code === 'gateway/bad-request') {
          this.accept({ state: 'failed', message: result.error.message }, attempt); return;
        }
        throw new Error(result.error.message);
      }
      this.accept(result.value, attempt);
    } catch (error) {
      this.update({ outcome: 'unknown', message: `保存结果待确认，草稿已保留。${message(error)}` });
    } finally { this.update({ saving: false }); }
  }

  async verify() {
    if (!this.attempt || this.state.saving) return;
    const attempt = this.attempt;
    const controller = new AbortController();
    this.update({ saving: true, message: '正在核对保存回执与远端内容…' });
    try {
      const result = await bounded(this.remote.status(this.sessionId, attempt.id, controller.signal), this.timeoutMs, () => controller.abort());
      if (!result.ok) throw new Error(result.error.message);
      this.accept(result.value, attempt);
    } catch (error) { this.notice(`核对失败，草稿已保留。${message(error)}`); }
    finally { this.update({ saving: false }); }
  }

  async compare() {
    const document = this.state.document;
    if (!document || this.state.reading) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.update({ reading: true });
    try {
      const result = await bounded(this.remote.read(this.sessionId, document.path, controller.signal), this.timeoutMs, () => controller.abort());
      if (generation !== this.generation) return;
      if (!result.ok) throw new Error(result.error.message);
      if (result.value.rootUri !== document.rootUri || result.value.path !== document.path || result.value.sessionId !== this.sessionId) {
        throw new Error('文件身份已改变，未采用该内容。');
      }
      this.update({ remoteText: result.value.text, message: '下方为最新远端内容；你的草稿和保存基线尚未改变。' });
    } catch (error) { if (generation === this.generation) this.notice(message(error)); }
    finally { if (generation === this.generation) this.update({ reading: false }); }
  }

  dispose() { this.generation++; this.reader?.abort(); this.listeners.clear(); }
  private accept(result: EditorSaveResult, attempt: NonNullable<EditorModel['attempt']>) {
    if (this.attempt !== attempt) return;
    if (result.state === 'saved' && result.version) {
      this.update({ document: { ...attempt.document, text: attempt.text, version: result.version },
        outcome: 'saved', remoteText: undefined, message: result.message ?? '已保存。' });
    } else this.update({ outcome: result.state, message: result.message ?? (result.state === 'pending'
      ? '保存仍在进行，请稍后核对。' : '保存结果待确认，草稿已保留。') });
  }
  private update(patch: Partial<EditorState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
}
function operationId() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function bounded<T>(promise: Promise<T>, timeout: number, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { onTimeout?.(); reject(new Error('请求超时；不会自动重发保存。')); }, timeout);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
