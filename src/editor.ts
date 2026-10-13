import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { FsVersion } from '@deepseek-ai/dsh-fs';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import { HelperRemoteFileSystem, type RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
import { formatSshUri, parseSshUri } from './types.js';

export const EDITOR_MAX_BYTES = 256 * 1024;
const MAX_OPERATIONS = 256;
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

export interface EditorDocument {
  sessionId: string;
  rootUri: string;
  path: string;
  alias: string;
  version: string;
  text: string;
  bom: boolean;
  newline: 'lf' | 'crlf';
  maxBytes: number;
}
export interface EditorSave {
  rootUri: string;
  path: string;
  version: string;
  text: string;
  bom: boolean;
  newline: 'lf' | 'crlf';
  operationId: string;
}
export interface EditorSaveResult {
  state: 'pending' | 'saved' | 'conflict' | 'failed' | 'unknown';
  version?: string;
  message?: string;
}
interface Receipt {
  sessionId: string;
  request: Omit<EditorSave, 'text'>;
  fingerprint: string;
  contentHash: string;
  result: EditorSaveResult;
  completedAt?: number;
}

declare module '@deepseek-ai/cordis' {
  interface Context { sshRemoteEditor: SshRemoteEditor }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'ssh-editor/refused': { reason: string } }
}

/** Human-only writes: authenticated Session lookup, never a caller-supplied SSH host. */
export class SshRemoteEditor extends TypertRemoteService {
  private readonly fs: HelperRemoteFileSystem;
  private readonly receipts = new Map<string, Receipt>();
  private reads = 0;

  constructor(ctx: Context, helpers: RemoteHelperProvider, private readonly resolvePath: RemotePathResolver,
    private readonly invalidate?: (workspaceRoot: string) => void) {
    super(ctx, 'sshRemoteEditor');
    this.fs = new HelperRemoteFileSystem(helpers, resolvePath);
  }

  @Remote
  async read(scope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<EditorDocument> {
    if (this.reads >= 8) throw refusal('busy', '编辑器读取繁忙，请稍后重试。');
    this.reads++;
    try {
      signal.throwIfAborted();
      const identity = this.identity(scope, path);
      const target = await this.fs.resolve(identity.uri, { signal });
      // Resolving a symlink must not change authority or escape this Session's root.
      if (String(target.targetKey) !== identity.uri) throw refusal('path', '编辑器不支持符号链接或非规范路径，请打开原文件。');
      const snapshot = await this.fs.readSnapshot(target, EDITOR_MAX_BYTES, signal);
      const { text, bom, newline } = decodeEditorText(snapshot.bytes);
      return { sessionId: scope.sessionId, rootUri: identity.rootUri, path: identity.path,
        alias: identity.alias, version: snapshot.version, text, bom, newline, maxBytes: EDITOR_MAX_BYTES };
    } finally { this.reads--; }
  }

  @Remote
  async save(scope: WorkspaceFileScope, request: EditorSave): Promise<EditorSaveResult> {
    const identity = this.identity(scope, request.path, request.rootUri);
    if (!/^v1:/u.test(request.version)) throw refusal('version', '需要重新完整读取文件后才能保存。');
    if (!/^[a-zA-Z0-9-]{16,80}$/u.test(request.operationId)) throw refusal('request', '保存请求标识无效。');
    const bytes = encodeEditorText(request);
    const fingerprint = hash(JSON.stringify({ ...request, path: identity.path }));
    const key = `${scope.sessionId}\0${request.operationId}`;
    const previous = this.receipts.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw refusal('request', '同一个保存请求不能用于不同内容。');
      return previous.result;
    }
    const now = Date.now();
    for (const [id, receipt] of this.receipts) {
      if (receipt.completedAt !== undefined && receipt.result.state !== 'unknown'
        && now - receipt.completedAt > RECEIPT_TTL_MS) this.receipts.delete(id);
    }
    if (this.receipts.size >= MAX_OPERATIONS) throw refusal('busy', '保存回执已达上限，请保留草稿并稍后重试。');
    if ([...this.receipts.values()].filter(r => r.result.state === 'pending').length >= 4) {
      throw refusal('busy', '同时保存的文件过多，请稍后重试。');
    }
    // A lost acknowledgement must be reconciled, never replaced by a new write.
    if ([...this.receipts.values()].some(r => r.sessionId === scope.sessionId
      && r.request.rootUri === identity.rootUri && r.request.path === identity.path
      && (r.result.state === 'pending' || r.result.state === 'unknown'))) {
      throw refusal('pending', '此文件已有保存结果待确认，请先检查保存结果。');
    }
    const { text: _text, ...metadata } = request;
    const receipt: Receipt = { sessionId: scope.sessionId, request: { ...metadata, path: identity.path },
      fingerprint, contentHash: hash(bytes), result: { state: 'pending' } };
    this.receipts.set(key, receipt);
    try {
      const target = await this.fs.resolve(identity.uri);
      if (String(target.targetKey) !== identity.uri) throw refusal('path', '保存目标已改变，请重新打开。');
      const version = await this.fs.replaceSnapshot(target, bytes, FsVersion(request.version),
        { mode: 'workspace-write', workspaceRoot: scope.workspaceRoot });
      receipt.result = { state: 'saved', version: String(version) };
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : String(error);
      receipt.result = code === 'FS_STALE_VERSION'
        ? { state: 'conflict', message: '远端文件已更改，未覆盖。草稿已保留，请查看远端版本或重新加载。' }
        : ['FS_PERMISSION_DENIED', 'FS_SANDBOX_DENIED', 'FS_NOT_FOUND', 'FS_NOT_REGULAR_FILE', 'FS_NOT_TEXT', 'FS_TOO_LARGE', 'FS_NOT_DIRECTORY', 'ssh-editor/refused'].includes(code ?? '')
          ? { state: 'failed', message }
          : { state: 'unknown', message: `保存结果待确认：${message}` };
    } finally {
      receipt.completedAt = Date.now();
      if (receipt.result.state === 'saved' || receipt.result.state === 'unknown') this.invalidate?.(scope.workspaceRoot);
    }
    return receipt.result;
  }

  @Remote
  async status(scope: WorkspaceFileScope, operationId: string, signal: AbortSignal): Promise<EditorSaveResult> {
    const receipt = this.receipts.get(`${scope.sessionId}\0${operationId}`);
    if (!receipt) return { state: 'unknown', message: '找不到保存回执，请保留草稿并重新读取远端文件核对。' };
    this.identity(scope, receipt.request.path, receipt.request.rootUri);
    if (receipt.result.state !== 'unknown') return receipt.result;
    const snapshot = await this.read(scope, receipt.request.path, signal);
    const observed = encodeEditorText(snapshot);
    if (hash(observed) === receipt.contentHash) {
      receipt.result = { state: 'saved', version: snapshot.version, message: '已核对远端内容与提交内容一致。' };
    } else if (snapshot.version !== receipt.request.version) {
      receipt.result = { state: 'conflict', message: '远端当前内容与草稿不同；原保存是否曾完成无法确定。请核对后重新加载。' };
    }
    return receipt.result;
  }

  private identity(scope: WorkspaceFileScope, path: string, expectedRoot?: string) {
    if (!scope?.sessionId || !scope.workspaceRoot) throw refusal('session', '需要有效会话。');
    const rootUri = this.resolvePath(scope.workspaceRoot);
    if (rootUri === undefined) throw refusal('local', '远程编辑器只支持已注册的 SSH 工作区。');
    if (expectedRoot !== undefined && expectedRoot !== rootUri) throw refusal('session', '工作区身份已改变，未保存。');
    if (!path || path.length > 4096 || path.includes('\0') || path.split('/').includes('..')) throw refusal('path', '文件路径无效或包含上级跳转。');
    const root = parseSshUri(rootUri);
    const mapped = path.startsWith('ssh://') ? path : this.resolvePath(path);
    const target = mapped ? parseSshUri(mapped) : { ...root, path: posix.resolve(root.path, path) };
    if ((!mapped && /^[a-z][a-z\d+.-]*:/iu.test(path)) || target.host !== root.host || target.user !== root.user || target.port !== root.port
      || (target.path !== root.path && !target.path.startsWith(`${root.path.replace(/\/+$/u, '')}/`))) {
      throw refusal('path', '文件不属于此会话的远程工作区。');
    }
    target.path = posix.normalize(target.path);
    return { rootUri, uri: formatSshUri(target), alias: root.host, path: target.path };
  }
}

export function decodeEditorText(bytes: Buffer): Pick<EditorDocument, 'text' | 'bom' | 'newline'> {
  if (bytes.length > EDITOR_MAX_BYTES) throw refusal('too-large', '编辑器仅支持不超过 256 KiB 的完整文本文件。');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw refusal('encoding', '仅支持 UTF-8 文本；不自动转换或替换无效字符。'); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw refusal('binary', '二进制或控制字符文件不能进入编辑模式。');
  const bom = text.startsWith('\ufeff');
  if (bom) text = text.slice(1);
  const crlf = text.includes('\r\n');
  if (text.replace(/\r\n/gu, '').includes('\r') || (crlf && text.replace(/\r\n/gu, '').includes('\n'))) {
    throw refusal('newline', '暂不支持混合换行或单独 CR 换行；请使用只读预览。');
  }
  return { text: text.replace(/\r\n/gu, '\n'), bom, newline: crlf ? 'crlf' : 'lf' };
}

function encodeEditorText(request: Pick<EditorSave, 'text' | 'bom' | 'newline'>): Buffer {
  if (typeof request.text !== 'string' || request.text.includes('\r') || /\p{Surrogate}/u.test(request.text)
    || typeof request.bom !== 'boolean' || !['lf', 'crlf'].includes(request.newline)) throw refusal('encoding', '保存内容的编码或换行参数无效。');
  const bytes = Buffer.from((request.bom ? '\ufeff' : '') + (request.newline === 'crlf' ? request.text.replace(/\n/gu, '\r\n') : request.text));
  decodeEditorText(bytes);
  return bytes;
}
function hash(input: string | Buffer) { return createHash('sha256').update(input).digest('hex'); }
function refusal(code: string, message: string) { return new RemoteError('ssh-editor/refused', message, { reason: code }); }
