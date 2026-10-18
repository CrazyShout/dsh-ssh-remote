import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference';
export interface PreparedCandidate { row: FileReferenceCandidate; path: string; name: string; hidden: boolean; bytes: number }
export function prepareCandidate(row: FileReferenceCandidate): PreparedCandidate {
  const path = row.path.toLocaleLowerCase(), slash = path.lastIndexOf('/'), name = path.slice(slash + 1);
  return { row, path, name, hidden: row.path.startsWith('.') || row.path.includes('/.'),
    bytes: Buffer.byteLength(row.path) + 2 * (path.length + name.length) + 40 };
}
interface Ranked { entry: PreparedCandidate; score: number }
function compare(a: Ranked, b: Ranked): number {
  return b.score - a.score || a.entry.row.path.length - b.entry.row.path.length
    || (a.entry.row.path < b.entry.row.path ? -1 : a.entry.row.path > b.entry.row.path ? 1 : 0);
}
/** A max heap retains only the best K. Equal keys keep discovery order. */
export function rankPrepared(entries: readonly PreparedCandidate[], input: string, limit = 50, includeHidden = false): FileReferenceCandidate[] {
  if (limit <= 0) return [];
  const query = input.toLocaleLowerCase(), hidden = includeHidden || query.startsWith('.') || query.includes('/.');
  const heap: Ranked[] = [];
  for (const entry of entries) {
    if (!hidden && entry.hidden) continue;
    const { path, name, row } = entry;
    let score = !query ? (path.includes('/') ? 0 : 100) : name === query ? 1000 : name.startsWith(query) ? 900
      : name.includes(query) ? 700 : path.includes(query) ? 500 : 0;
    if (!score && query) { let at = 0; for (const ch of path) if (ch === query[at]) at++; if (at === query.length) score = 300; }
    if (!score) continue;
    if (row.kind === 'directory') score += 25;
    const item = { entry, score };
    if (heap.length < limit) {
      heap.push(item); let i = heap.length - 1;
      while (i) { const parent = (i - 1) >>> 1; if (compare(heap[i], heap[parent]) <= 0) break;
        [heap[i], heap[parent]] = [heap[parent], heap[i]]; i = parent; }
    } else if (compare(item, heap[0]) < 0) {
      heap[0] = item; let i = 0;
      for (;;) { let worst = i; const left = i * 2 + 1, right = left + 1;
        if (left < heap.length && compare(heap[left], heap[worst]) > 0) worst = left;
        if (right < heap.length && compare(heap[right], heap[worst]) > 0) worst = right;
        if (worst === i) break; [heap[i], heap[worst]] = [heap[worst], heap[i]]; i = worst; }
    }
  }
  return heap.sort(compare).map(item => item.entry.row);
}
export function rankCandidates(entries: FileReferenceCandidate[], input: string, limit = 50, includeHidden = false): FileReferenceCandidate[] {
  return rankPrepared(entries.map(prepareCandidate), input, limit, includeHidden);
}
