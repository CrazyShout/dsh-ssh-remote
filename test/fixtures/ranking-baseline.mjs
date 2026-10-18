/** Frozen 0.10.2 ordering oracle, deliberately not used in production. */
export function baselineRank(entries, input, limit = 50, includeHidden = false) {
  const query = input.toLocaleLowerCase(), hidden = includeHidden || query.startsWith('.') || query.includes('/.');
  return entries.filter(row => hidden || !row.path.split('/').some(p => p.startsWith('.'))).map(row => {
    const path = row.path.toLocaleLowerCase(), name = path.split('/').pop();
    let score = !query ? (path.includes('/') ? 0 : 100) : name === query ? 1000 : name.startsWith(query) ? 900
      : name.includes(query) ? 700 : path.includes(query) ? 500 : 0;
    if (!score && query) { let at = 0; for (const ch of path) if (ch === query[at]) at++; if (at === query.length) score = 300; }
    return { row, score: score + (score && row.kind === 'directory' ? 25 : 0) };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.row.path.length - b.row.path.length
    || (a.row.path < b.row.path ? -1 : a.row.path > b.row.path ? 1 : 0)).slice(0, limit).map(x => x.row);
}
