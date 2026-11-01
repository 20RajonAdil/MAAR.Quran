import type { Chapter, Evidence, HadithRecord } from '../types';
/** Validates that evidence points at a REAL record before it can be shown or sent to the model. */
export function validateQuranRef(surah: number, ayah: number, chapters: Chapter[]): number | null {
  const c = chapters[surah - 1]; if (!c || c.n !== surah || !Number.isInteger(ayah) || ayah < 1 || ayah > c.verses) return null; return c.start + ayah - 1;
}
export function quranRefOf(index: number, chapters: Chapter[]): { surah: number; ayah: number } | null {
  if (!Number.isInteger(index) || index < 0 || index >= 6236) return null;
  let lo = 0, hi = chapters.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (chapters[mid].start <= index) lo = mid; else hi = mid - 1; }
  const c = chapters[lo]; const ayah = index - c.start + 1; return ayah >= 1 && ayah <= c.verses ? { surah: c.n, ayah } : null;
}
export function validateHadithRecord(r: HadithRecord | undefined | null): r is HadithRecord {
  return !!r && !!r.collection && !!r.number && r.id === `${r.collection}:${r.number}` && (!!r.arabic || Object.keys(r.translations).length > 0);
}
export const evidenceKey = (e: Evidence) => (e.kind === 'quran' ? `Q:${e.surah}:${e.ayah}` : `H:${e.collection}:${e.number}`);
