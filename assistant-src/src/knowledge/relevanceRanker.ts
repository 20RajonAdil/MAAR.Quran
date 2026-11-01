import type { Evidence } from '../types';
/** Removes duplicates (keeping the best score) and returns the top `limit` by relevance. Explicit references (score 10) always lead. */
export function dedupeAndRank<T extends Evidence>(items: T[], limit: number): T[] {
  const best = new Map<string, T>();
  for (const e of items) { const p = best.get(e.id); if (!p || e.score > p.score) best.set(e.id, e); }
  return [...best.values()].sort((a, b) => b.score - a.score || (a.kind === 'quran' && b.kind === 'quran' ? a.index - b.index : 0)).slice(0, limit);
}
