import type { ChangeResult } from '@deepseek-ai/dsh-api-remotes/client';
import type { ReleaseTarget } from 'dsh-ssh-remote/updates';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface UpdateResultSummary extends Pick<ChangeResult, 'changed' | 'application' | 'stage' | 'target'> {
  error?: { code: string; diagnostic?: string };
  pendingBuilds?: string[];
  pendingBuildsOmitted?: number;
  packageResult?: Partial<Pick<NonNullable<ChangeResult['packageResult']>, 'exitCode' | 'kind' | 'timedOut' | 'logPath'>>;
}
export interface UpdateReceipt {
  version: 2;
  requestId: string;
  target: ReleaseTarget;
  result?: UpdateResultSummary;
}

export const RECEIPT_BYTES = 8 * 1024;
export const LEGACY_RECEIPT_BYTES = 256 * 1024;
const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value).byteLength;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const stable = /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/u;
const version = /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const safeText = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length <= maximum && bytes(value) <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);

/** Shorten human-readable diagnostics, never identifiers or paths. */
function shorten(value: string, maximum: number): string {
  if (bytes(value) <= maximum) return value;
  let result = '', used = 0;
  for (const point of value) {
    const width = bytes(point);
    if (used + width + 3 > maximum) break;
    result += point;
    used += width;
  }
  return maximum >= 3 ? result + '…' : '';
}

/** Do not persist pnpm output, credentials, approvals or the full installer response. */
export function compactResult(value: ChangeResult): UpdateResultSummary {
  const result: UpdateResultSummary = { changed: value.changed, application: value.application, stage: value.stage, target: value.target };
  if (value.error) {
    result.error = { code: value.error.code };
    if (typeof value.error.diagnostic === 'string') result.error.diagnostic = shorten(value.error.diagnostic, 2048);
  }
  if (value.pendingBuilds?.length) {
    const retained = value.pendingBuilds.filter(name => safeText(name, 256)).slice(0, 16);
    result.pendingBuilds = retained;
    result.pendingBuildsOmitted = value.pendingBuilds.length - retained.length;
  }
  if (value.packageResult) {
    const source = value.packageResult, detail: NonNullable<UpdateResultSummary['packageResult']> = {};
    if (Number.isSafeInteger(source.exitCode)) detail.exitCode = source.exitCode;
    if (safeText(source.kind, 64)) detail.kind = source.kind;
    if (typeof source.timedOut === 'boolean') detail.timedOut = source.timedOut;
    if (safeText(source.logPath, 4096)) detail.logPath = source.logPath;
    if (Object.keys(detail).length) result.packageResult = detail;
  }
  return result;
}

function target(value: unknown): ReleaseTarget | undefined {
  if (!object(value) || typeof value.version !== 'string' || !stable.test(value.version)) return;
  const base = 'https://github.com/CrazyShout/dsh-ssh-remote/releases';
  if (value.url !== `${base}/tag/v${value.version}`
    || value.packageUrl !== `${base}/download/v${value.version}/dsh-ssh-remote-${value.version}.tgz`
    || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.sha256)
    || !safeText(value.publishedAt, 80) || !Number.isFinite(Date.parse(value.publishedAt))
    || !Array.isArray(value.testedDshVersions) || value.testedDshVersions.length > 20
    || !value.testedDshVersions.every(item => safeText(item, 80) && version.test(item))) return;
  return { version: value.version, url: value.url, packageUrl: value.packageUrl, sha256: value.sha256,
    publishedAt: value.publishedAt, testedDshVersions: [...value.testedDshVersions] };
}

function summary(value: unknown): UpdateResultSummary | undefined {
  if (!object(value) || typeof value.changed !== 'boolean'
    || !['applied', 'restart-required', 'overridden', 'failed', 'cancelled'].includes(String(value.application))
    || !['install', 'enable', 'remove'].includes(String(value.stage)) || !safeText(value.target, 4096)) return;
  if (value.error !== undefined && (!object(value.error) || !safeText(value.error.code, 80)
    || !/^[a-z][a-z0-9-]*$/u.test(value.error.code) || (value.error.diagnostic !== undefined && typeof value.error.diagnostic !== 'string'))) return;
  if (value.pendingBuilds !== undefined && (!Array.isArray(value.pendingBuilds) || !value.pendingBuilds.every(name => typeof name === 'string'))) return;
  if (value.packageResult !== undefined && !object(value.packageResult)) return;
  const result = compactResult(value as unknown as ChangeResult);
  if (typeof value.pendingBuildsOmitted === 'number' && Number.isSafeInteger(value.pendingBuildsOmitted) && value.pendingBuildsOmitted >= 0) {
    result.pendingBuildsOmitted = (result.pendingBuildsOmitted ?? 0) + value.pendingBuildsOmitted;
  }
  return result;
}

function normalize(value: unknown): UpdateReceipt | undefined {
  if (!object(value) || (value.version !== undefined && value.version !== 2)
    || typeof value.requestId !== 'string' || !/^[a-z0-9-]{16,80}$/iu.test(value.requestId)) return;
  const release = target(value.target);
  if (!release) return;
  const result = value.result === undefined ? undefined : summary(value.result);
  if (value.result !== undefined && !result) return;
  return { version: 2, requestId: value.requestId, target: release, ...(result ? { result } : {}) };
}

/** All optional fields are detached before trimming to the serialized UTF-8 budget. */
function serialize(receipt: UpdateReceipt): string | undefined {
  let serialized = JSON.stringify(receipt);
  if (bytes(serialized) <= RECEIPT_BYTES) return serialized;
  const diagnostic = receipt.result?.error?.diagnostic;
  if (diagnostic !== undefined) {
    const points = [...diagnostic];
    let low = 0, high = points.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      receipt.result!.error!.diagnostic = points.slice(0, middle).join('') + '…';
      if (bytes(JSON.stringify(receipt)) <= RECEIPT_BYTES) low = middle;
      else high = middle - 1;
    }
    receipt.result!.error!.diagnostic = low ? points.slice(0, low).join('') + '…' : '';
  }
  // Keep full package names and paths; omission is safer than a partial copy target.
  while (bytes(JSON.stringify(receipt)) > RECEIPT_BYTES && (receipt.result?.pendingBuilds?.length ?? 0) > 1) {
    receipt.result!.pendingBuilds!.pop();
    receipt.result!.pendingBuildsOmitted = (receipt.result!.pendingBuildsOmitted ?? 0) + 1;
  }
  if (bytes(JSON.stringify(receipt)) > RECEIPT_BYTES && receipt.result?.packageResult?.logPath !== undefined) {
    delete receipt.result.packageResult.logPath;
  }
  serialized = JSON.stringify(receipt);
  return bytes(serialized) <= RECEIPT_BYTES ? serialized : undefined;
}

export function writeReceipt(storage: StorageLike | undefined, key: string, value: UpdateReceipt): boolean {
  if (!storage) return false;
  try {
    const receipt = normalize(value), serialized = receipt && serialize(receipt);
    if (!serialized) return false;
    storage.setItem(key, serialized);
    return true;
  } catch { return false; }
}

export function readReceipt(storage: StorageLike | undefined, key: string): { receipt?: UpdateReceipt; error?: 'unreadable' } {
  let raw: string | null | undefined;
  try { raw = storage?.getItem(key); }
  catch { return {}; } // Disabled storage is not a corrupt persisted operation.
  if (raw === null || raw === undefined) return {};
  try {
    if (raw.length > LEGACY_RECEIPT_BYTES || bytes(raw) > LEGACY_RECEIPT_BYTES) return { error: 'unreadable' };
    const parsed: unknown = JSON.parse(raw);
    if (object(parsed) && parsed.version === 2 && bytes(raw) > RECEIPT_BYTES) return { error: 'unreadable' };
    const receipt = normalize(parsed);
    if (!receipt || !serialize(receipt)) return { error: 'unreadable' };
    if (object(parsed) && parsed.version === undefined) writeReceipt(storage, key, receipt);
    return { receipt };
  } catch { return { error: 'unreadable' }; }
}

export function clearReceipt(storage: StorageLike | undefined, key: string): void {
  try { storage?.removeItem(key); } catch { /* In-memory operation state remains authoritative. */ }
}

export function peekRequestId(storage: StorageLike | undefined, key: string): string | undefined {
  return readReceipt(storage, key).receipt?.requestId;
}
