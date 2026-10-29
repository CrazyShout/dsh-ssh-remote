import { describe, expect, it } from 'vitest';
import type { ChangeResult } from '@deepseek-ai/dsh-api-remotes/client';
import { clearReceipt, compactResult, LEGACY_RECEIPT_BYTES, readReceipt, RECEIPT_BYTES, writeReceipt,
  type StorageLike, type UpdateReceipt } from '../client/update-receipt.js';

const target = { version: '0.13.3', url: 'https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v0.13.3',
  packageUrl: 'https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.13.3/dsh-ssh-remote-0.13.3.tgz',
  sha256: 'a'.repeat(64), testedDshVersions: ['0.2.0-rc.2', '0.2.1-rc.3'], publishedAt: '2026-10-29T00:00:00Z' };
const key = 'updates:test:pending';
class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}
const receipt = (): UpdateReceipt => ({ version: 2, requestId: '11223344-5566-7788-99aa-bbccddeeff00', target });
function result(output = 'install output'): ChangeResult {
  return { changed: false, application: 'failed', stage: 'install', target: target.packageUrl,
    error: { code: 'operation-error', diagnostic: 'Dependency download failed' },
    packageResult: { exitCode: 1, output, truncated: false, logPath: '/test/profile/中文 空格/pnpm.log', kind: 'network' } };
}
const size = (value: string) => new TextEncoder().encode(value).byteLength;

describe('bounded update receipts', () => {
  it.each([16384, 128 * 1024, 1024 * 1024])('drops %s bytes of installer output before storing a recovery record', length => {
    const storage = new MemoryStorage(), full = result('x'.repeat(length));
    expect(writeReceipt(storage, key, { ...receipt(), result: full })).toBe(true);
    const raw = storage.getItem(key)!;
    expect(size(raw)).toBeLessThanOrEqual(RECEIPT_BYTES);
    expect(raw).not.toContain('output');
    const restored = readReceipt(storage, key);
    expect(restored.receipt?.result).toMatchObject({ application: 'failed', stage: 'install',
      error: { diagnostic: 'Dependency download failed' }, packageResult: { logPath: full.packageResult!.logPath } });
    expect(restored.error).toBeUndefined();
  });

  it.each([16384, 128 * 1024])('migrates a legacy record with a %s-byte log', length => {
    const storage = new MemoryStorage();
    storage.setItem(key, JSON.stringify({ requestId: receipt().requestId, target, result: result('x'.repeat(length)) }));
    expect(size(storage.getItem(key)!)).toBeGreaterThan(RECEIPT_BYTES);
    expect(readReceipt(storage, key).receipt?.version).toBe(2);
    expect(size(storage.getItem(key)!)).toBeLessThanOrEqual(RECEIPT_BYTES);
    expect(JSON.parse(storage.getItem(key)!)).not.toHaveProperty('result.packageResult.output');
  });

  it('uses serialized UTF-8 bytes, retaining valid Unicode and complete paths', () => {
    const storage = new MemoryStorage(), full = result();
    full.error!.diagnostic = '\u0001'.repeat(1500) + '中文🙂'.repeat(1000);
    full.packageResult!.logPath = '/' + '文'.repeat(1300);
    full.pendingBuilds = Array.from({ length: 30 }, (_, i) => `@package/${i}-${'文'.repeat(75)}`);
    const original = JSON.stringify(full);
    expect(writeReceipt(storage, key, { ...receipt(), result: full })).toBe(true);
    const raw = storage.getItem(key)!, restored = readReceipt(storage, key).receipt!;
    expect(size(raw)).toBeLessThanOrEqual(RECEIPT_BYTES);
    expect(restored.result?.error?.diagnostic).not.toMatch(/[\ud800-\udbff]$/u);
    expect(restored.result?.packageResult?.logPath).toBe(full.packageResult!.logPath);
    expect(restored.result?.pendingBuildsOmitted).toBeGreaterThan(0);
    expect(JSON.stringify(full)).toBe(original);
  });

  it('omits oversized paths instead of offering a truncated copy target', () => {
    const full = result(); full.packageResult!.logPath = '/' + 'x'.repeat(4096);
    expect(compactResult(full).packageResult).not.toHaveProperty('logPath');
    const storage = new MemoryStorage();
    expect(writeReceipt(storage, key, { ...receipt(), result: full })).toBe(true);
    expect(readReceipt(storage, key).receipt?.result?.packageResult).not.toHaveProperty('logPath');
  });

  it.each(['', '{broken', 'null', '[]', JSON.stringify({ ...receipt(), version: 3 }),
    JSON.stringify({ ...receipt(), requestId: 'bad id' }),
    JSON.stringify({ ...receipt(), target: { ...target, packageUrl: 'https://other.test/package.tgz' } }),
    JSON.stringify({ ...receipt(), result: { changed: false, application: 'made-up', stage: 'install', target: target.packageUrl } }),
    JSON.stringify({ ...receipt(), result: { ...result(), error: null } })])('reports malformed records without deleting them: %s', raw => {
    const storage = new MemoryStorage(); storage.setItem(key, raw);
    expect(readReceipt(storage, key)).toEqual({ error: 'unreadable' });
    expect(storage.getItem(key)).toBe(raw);
  });

  it('enforces the new 8 KiB and legacy 256 KiB limits on reading', () => {
    const storage = new MemoryStorage();
    const current = JSON.stringify({ ...receipt(), extra: 'x'.repeat(RECEIPT_BYTES) });
    storage.setItem(key, current); expect(readReceipt(storage, key)).toEqual({ error: 'unreadable' });
    const old = JSON.stringify({ requestId: receipt().requestId, target, result: result('x'.repeat(LEGACY_RECEIPT_BYTES)) });
    storage.setItem(key, old); expect(readReceipt(storage, key)).toEqual({ error: 'unreadable' });
    const multibyte = JSON.stringify({ requestId: receipt().requestId, target, result: result('文'.repeat(100000)) });
    expect(multibyte.length).toBeLessThan(LEGACY_RECEIPT_BYTES);
    storage.setItem(key, multibyte); expect(readReceipt(storage, key)).toEqual({ error: 'unreadable' });
  });

  it('keeps in-memory operations possible when storage is unavailable', () => {
    const unavailable: StorageLike = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    expect(readReceipt(undefined, key)).toEqual({});
    expect(readReceipt(unavailable, key)).toEqual({});
    expect(writeReceipt(undefined, key, receipt())).toBe(false);
    expect(writeReceipt(unavailable, key, receipt())).toBe(false);
    expect(() => clearReceipt(unavailable, key)).not.toThrow();
  });

  it('returns a valid migrated summary even when saving that migration is denied', () => {
    const raw = JSON.stringify({ requestId: receipt().requestId, target, result: result('x'.repeat(16384)) });
    const blocked: StorageLike = { getItem: () => raw, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('quota'); } };
    expect(readReceipt(blocked, key).receipt?.result?.application).toBe('failed');
  });

  it('never changes required identity or replaces a good record with an invalid one', () => {
    const storage = new MemoryStorage(); expect(writeReceipt(storage, key, receipt())).toBe(true);
    const original = storage.getItem(key);
    expect(writeReceipt(storage, key, { ...receipt(), requestId: 'x'.repeat(81) })).toBe(false);
    expect(storage.getItem(key)).toBe(original);
    expect(readReceipt(storage, key).receipt?.target).toEqual(target);
    clearReceipt(storage, key); expect(readReceipt(storage, key)).toEqual({});
  });
});
