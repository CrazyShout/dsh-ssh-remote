var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { FsVersion } from '@deepseek-ai/dsh-fs';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { HelperRemoteFileSystem } from './helper-fs.js';
import { formatSshUri, parseSshUri } from './types.js';
export const EDITOR_MAX_BYTES = 256 * 1024;
const MAX_OPERATIONS = 256;
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
/** Human-only writes: authenticated Session lookup, never a caller-supplied SSH host. */
let SshRemoteEditor = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _read_decorators;
    let _save_decorators;
    let _status_decorators;
    return class SshRemoteEditor extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _read_decorators = [Remote];
            _save_decorators = [Remote];
            _status_decorators = [Remote];
            __esDecorate(this, null, _read_decorators, { kind: "method", name: "read", static: false, private: false, access: { has: obj => "read" in obj, get: obj => obj.read }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _save_decorators, { kind: "method", name: "save", static: false, private: false, access: { has: obj => "save" in obj, get: obj => obj.save }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        resolvePath = __runInitializers(this, _instanceExtraInitializers);
        invalidate;
        fs;
        receipts = new Map();
        reads = 0;
        constructor(ctx, helpers, resolvePath, invalidate) {
            super(ctx, 'sshRemoteEditor');
            this.resolvePath = resolvePath;
            this.invalidate = invalidate;
            this.fs = new HelperRemoteFileSystem(helpers, resolvePath);
        }
        async read(scope, path, signal) {
            if (this.reads >= 8)
                throw refusal('busy', '编辑器读取繁忙，请稍后重试。');
            this.reads++;
            try {
                signal.throwIfAborted();
                const identity = this.identity(scope, path);
                const target = await this.fs.resolve(identity.uri, { signal });
                // Resolving a symlink must not change authority or escape this Session's root.
                if (String(target.targetKey) !== identity.uri)
                    throw refusal('path', '编辑器不支持符号链接或非规范路径，请打开原文件。');
                const snapshot = await this.fs.readSnapshot(target, EDITOR_MAX_BYTES, signal);
                const { text, bom, newline } = decodeEditorText(snapshot.bytes);
                return { sessionId: scope.sessionId, rootUri: identity.rootUri, path: identity.path,
                    alias: identity.alias, version: snapshot.version, text, bom, newline, maxBytes: EDITOR_MAX_BYTES };
            }
            finally {
                this.reads--;
            }
        }
        async save(scope, request) {
            const identity = this.identity(scope, request.path, request.rootUri);
            if (!/^v1:/u.test(request.version))
                throw refusal('version', '需要重新完整读取文件后才能保存。');
            if (!/^[a-zA-Z0-9-]{16,80}$/u.test(request.operationId))
                throw refusal('request', '保存请求标识无效。');
            const bytes = encodeEditorText(request);
            const fingerprint = hash(JSON.stringify({ ...request, path: identity.path }));
            const key = `${scope.sessionId}\0${request.operationId}`;
            const previous = this.receipts.get(key);
            if (previous) {
                if (previous.fingerprint !== fingerprint)
                    throw refusal('request', '同一个保存请求不能用于不同内容。');
                return previous.result;
            }
            const now = Date.now();
            for (const [id, receipt] of this.receipts) {
                if (receipt.completedAt !== undefined && receipt.result.state !== 'unknown'
                    && now - receipt.completedAt > RECEIPT_TTL_MS)
                    this.receipts.delete(id);
            }
            if (this.receipts.size >= MAX_OPERATIONS)
                throw refusal('busy', '保存回执已达上限，请保留草稿并稍后重试。');
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
            const receipt = { sessionId: scope.sessionId, request: { ...metadata, path: identity.path },
                fingerprint, contentHash: hash(bytes), result: { state: 'pending' } };
            this.receipts.set(key, receipt);
            try {
                const target = await this.fs.resolve(identity.uri);
                if (String(target.targetKey) !== identity.uri)
                    throw refusal('path', '保存目标已改变，请重新打开。');
                const version = await this.fs.replaceSnapshot(target, bytes, FsVersion(request.version), { mode: 'workspace-write', workspaceRoot: scope.workspaceRoot });
                receipt.result = { state: 'saved', version: String(version) };
            }
            catch (error) {
                const code = error.code;
                const message = error instanceof Error ? error.message : String(error);
                receipt.result = code === 'FS_STALE_VERSION'
                    ? { state: 'conflict', message: '远端文件已更改，未覆盖。草稿已保留，请查看远端版本或重新加载。' }
                    : ['FS_PERMISSION_DENIED', 'FS_SANDBOX_DENIED', 'FS_NOT_FOUND', 'FS_NOT_REGULAR_FILE', 'FS_NOT_TEXT', 'FS_TOO_LARGE', 'FS_NOT_DIRECTORY', 'ssh-editor/refused'].includes(code ?? '')
                        ? { state: 'failed', message }
                        : { state: 'unknown', message: `保存结果待确认：${message}` };
            }
            finally {
                receipt.completedAt = Date.now();
                if (receipt.result.state === 'saved' || receipt.result.state === 'unknown')
                    this.invalidate?.(scope.workspaceRoot);
            }
            return receipt.result;
        }
        async status(scope, operationId, signal) {
            const receipt = this.receipts.get(`${scope.sessionId}\0${operationId}`);
            if (!receipt)
                return { state: 'unknown', message: '找不到保存回执，请保留草稿并重新读取远端文件核对。' };
            this.identity(scope, receipt.request.path, receipt.request.rootUri);
            if (receipt.result.state !== 'unknown')
                return receipt.result;
            const snapshot = await this.read(scope, receipt.request.path, signal);
            const observed = encodeEditorText(snapshot);
            if (hash(observed) === receipt.contentHash) {
                receipt.result = { state: 'saved', version: snapshot.version, message: '已核对远端内容与提交内容一致。' };
            }
            else if (snapshot.version !== receipt.request.version) {
                receipt.result = { state: 'conflict', message: '远端当前内容与草稿不同；原保存是否曾完成无法确定。请核对后重新加载。' };
            }
            return receipt.result;
        }
        identity(scope, path, expectedRoot) {
            if (!scope?.sessionId || !scope.workspaceRoot)
                throw refusal('session', '需要有效会话。');
            const rootUri = this.resolvePath(scope.workspaceRoot);
            if (rootUri === undefined)
                throw refusal('local', '远程编辑器只支持已注册的 SSH 工作区。');
            if (expectedRoot !== undefined && expectedRoot !== rootUri)
                throw refusal('session', '工作区身份已改变，未保存。');
            if (!path || path.length > 4096 || path.includes('\0') || path.split('/').includes('..'))
                throw refusal('path', '文件路径无效或包含上级跳转。');
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
    };
})();
export { SshRemoteEditor };
export function decodeEditorText(bytes) {
    if (bytes.length > EDITOR_MAX_BYTES)
        throw refusal('too-large', '编辑器仅支持不超过 256 KiB 的完整文本文件。');
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch {
        throw refusal('encoding', '仅支持 UTF-8 文本；不自动转换或替换无效字符。');
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))
        throw refusal('binary', '二进制或控制字符文件不能进入编辑模式。');
    const bom = text.startsWith('\ufeff');
    if (bom)
        text = text.slice(1);
    const crlf = text.includes('\r\n');
    if (text.replace(/\r\n/gu, '').includes('\r') || (crlf && text.replace(/\r\n/gu, '').includes('\n'))) {
        throw refusal('newline', '暂不支持混合换行或单独 CR 换行；请使用只读预览。');
    }
    return { text: text.replace(/\r\n/gu, '\n'), bom, newline: crlf ? 'crlf' : 'lf' };
}
function encodeEditorText(request) {
    if (typeof request.text !== 'string' || request.text.includes('\r') || /\p{Surrogate}/u.test(request.text)
        || typeof request.bom !== 'boolean' || !['lf', 'crlf'].includes(request.newline))
        throw refusal('encoding', '保存内容的编码或换行参数无效。');
    const bytes = Buffer.from((request.bom ? '\ufeff' : '') + (request.newline === 'crlf' ? request.text.replace(/\n/gu, '\r\n') : request.text));
    decodeEditorText(bytes);
    return bytes;
}
function hash(input) { return createHash('sha256').update(input).digest('hex'); }
function refusal(code, message) { return new RemoteError('ssh-editor/refused', message, { reason: code }); }
//# sourceMappingURL=editor.js.map