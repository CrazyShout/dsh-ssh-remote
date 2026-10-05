import { parseFileAddress, sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import type { WorkspaceByteReadOptions, WorkspaceFileBytes } from '@deepseek-ai/dsh-api-workspace-files/types';

type ReadResult = { ok: true; value: WorkspaceFileBytes } | { ok: false; error: { message: string } };
export type ReadImageBytes = (sessionId: string, path: string, options: WorkspaceByteReadOptions, signal: AbortSignal) => Promise<ReadResult>;
export interface ImageCacheLimits { entries: number; imageBytes: number; totalBytes: number; concurrent: number; readTimeoutMs: number }
const DEFAULT_LIMITS: ImageCacheLimits = { entries: 64, imageBytes: 4 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, concurrent: 4, readTimeoutMs: 10_000 };
interface Entry { path: string; state: 'queued' | 'loading' | 'loaded' | 'failed'; url?: string }

/** Decode authored filenames once; schemes never change the document's authority. */
export function imageFilePath(destination: string): string | undefined {
  const suffix = destination.search(/[?#]/u);
  let path: string;
  try { path = decodeURIComponent(suffix < 0 ? destination : destination.slice(0, suffix)); }
  catch { return undefined; }
  if (!path || path.includes('\0') || path.startsWith('//') || path.startsWith('\\\\')) return undefined;
  if (!/^[a-z]:[/\\]/iu.test(path) && /^[a-z][a-z\d+.-]*:/iu.test(path)) return undefined;
  return path;
}

/** Per-document, session-owned image bytes. Never falls back to /api/file or the local Host. */
export class SessionImageCache {
  private readonly file;
  private readonly entries = new Map<string, Entry>();
  private readonly lifetime = new AbortController();
  private running = 0;
  private bytes = 0;
  private limited = false;
  private disposed = false;
  private stalled = false;
  readonly limits: ImageCacheLimits;

  constructor(
    resourceAddress: string,
    private readonly read: ReadImageBytes,
    private readonly changed: () => void,
    private readonly dependency: (address: string) => void = () => {},
    limits: Partial<ImageCacheLimits> = {},
    private readonly urls = { create: (blob: Blob) => URL.createObjectURL(blob), revoke: (url: string) => URL.revokeObjectURL(url) },
  ) {
    const parsed = parseFileAddress(resourceAddress);
    this.file = parsed?.scope === 'session' ? parsed : undefined;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const value of Object.values(this.limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error('invalid Markdown image cache limit');
  }

  get(destination: string): string | undefined {
    const path = imageFilePath(destination);
    return path === undefined ? undefined : this.entries.get(path)?.url;
  }

  get failed(): boolean { return this.limited || [...this.entries.values()].some(entry => entry.state === 'failed'); }

  /** Called after React commits, never from the Markdown resolver's render pass. */
  request(destinations: Iterable<string>): void {
    if (this.disposed || this.stalled || this.file === undefined) return;
    let newlyLimited = false;
    for (const destination of destinations) {
      const path = imageFilePath(destination);
      if (path === undefined || this.entries.has(path)) continue;
      if (this.entries.size >= this.limits.entries) { newlyLimited ||= !this.limited; this.limited = true; continue; }
      this.entries.set(path, { path, state: 'queued' });
    }
    this.pump();
    if (newlyLimited) this.changed();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort(new Error('Markdown image document changed or closed'));
    for (const entry of this.entries.values()) if (entry.url !== undefined) this.urls.revoke(entry.url);
    this.entries.clear(); this.bytes = 0;
  }

  private pump(): void {
    if (this.disposed || this.stalled) return;
    for (const entry of this.entries.values()) {
      if (this.running >= this.limits.concurrent) return;
      if (entry.state !== 'queued') continue;
      entry.state = 'loading'; this.running += 1;
      void this.load(entry).then(() => { entry.state = 'loaded'; }, () => { entry.state = 'failed'; }).finally(() => {
        this.running -= 1;
        if (!this.disposed) { this.changed(); this.pump(); }
      });
    }
  }

  private async load(entry: Entry): Promise<void> {
    const file = this.file!;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error('Markdown image read timed out')), this.limits.readTimeoutMs);
    const signal = AbortSignal.any([this.lifetime.signal, timeout.signal]);
    const chunks: Uint8Array[] = [];
    let offset = 0; let version: string | undefined; let absolutePath: string | undefined;
    try {
      for (;;) {
        signal.throwIfAborted();
        const result = await abortable(this.read(file.sessionId, entry.path, {
          baseFile: file.path, range: { offset, length: Math.min(64 * 1024, this.limits.imageBytes - offset + 1) },
        }, signal), signal);
        if (!result.ok) throw new Error(result.error.message);
        const part = result.value;
        if (!(part.data instanceof Uint8Array) || part.offset !== offset || (part.bytes !== undefined && part.bytes > this.limits.imageBytes)
          || offset + part.data.byteLength > this.limits.imageBytes || (version !== undefined && (version !== part.version || absolutePath !== part.absolutePath))) {
          throw new Error('Markdown image is too large or changed during reading');
        }
        version = part.version; absolutePath = part.absolutePath;
        chunks.push(part.data); offset += part.data.byteLength;
        if (part.eof) break;
        if (part.data.byteLength === 0) throw new Error('Markdown image read made no progress');
      }
      signal.throwIfAborted();
      if (this.bytes + offset > this.limits.totalBytes) throw new Error('Markdown image cache is full');
      const data = new Uint8Array(offset); let start = 0;
      for (const chunk of chunks) { data.set(chunk, start); start += chunk.byteLength; }
      const mime = imageMime(data);
      if (mime === undefined) throw new Error('Markdown image format is unsupported');
      const url = this.urls.create(new Blob([data], { type: mime }));
      if (this.disposed) { this.urls.revoke(url); return; }
      entry.url = url; this.bytes += offset;
      this.dependency(sessionFileAddress(file.sessionId, absolutePath!));
    } catch (error) {
      if (timeout.signal.aborted) {
        // A transport may ignore cancellation. Do not recycle its permit and
        // fan out more underlying requests while it is still unresolved.
        this.stalled = true;
        for (const queued of this.entries.values()) if (queued.state === 'queued') queued.state = 'failed';
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
}

function imageMime(data: Uint8Array): string | undefined {
  const signature = [...data.subarray(0, 12)].map(value => String.fromCharCode(value)).join('');
  if (signature.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (/^GIF8[79]a/u.test(signature)) return 'image/gif';
  if (signature.startsWith('RIFF') && signature.slice(8) === 'WEBP') return 'image/webp';
  if (signature.startsWith('BM')) return 'image/bmp';
  if (signature.slice(4, 8) === 'ftyp' && ['avif', 'avis'].includes(signature.slice(8))) return 'image/avif';
  const text = new TextDecoder().decode(data.subarray(0, 4096)).trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/u.test(text)) return 'image/svg+xml';
  return undefined;
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
