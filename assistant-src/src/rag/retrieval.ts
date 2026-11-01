import type { Chapter, Evidence, EvidenceHadith, EvidenceQuran } from '../types';
import type { SearchBackend } from '../knowledge/searchClient';
import { parseReferences } from '../knowledge/quranRefs';
import { quranRefOf, validateQuranRef } from '../knowledge/sourceValidator';
import { dedupeAndRank } from '../knowledge/relevanceRanker';

export interface Retrieval { quran: EvidenceQuran[]; hadith: EvidenceHadith[]; strongQuran: boolean; strongHadith: boolean; explicitRefs: boolean; topics: string[] }
export async function retrieve(query: string, chapters: Chapter[], backend: SearchBackend, hadithInstalled: boolean): Promise<Retrieval> {
  const refs = parseReferences(query, chapters); const explicit: EvidenceQuran[] = [];
  for (const r of refs) for (let a = r.from; a <= r.to; a++) { const idx = validateQuranRef(r.surah, a, chapters); if (idx != null) explicit.push({ kind: 'quran', id: `Q:${r.surah}:${a}`, surah: r.surah, ayah: a, index: idx, score: 10, matchedTerms: ['reference'] }); }
  const res = await backend.search(query, hadithInstalled);
  const found: EvidenceQuran[] = [];
  for (const h of res.quran.hits) { const ref = quranRefOf(h.index, chapters); if (ref) found.push({ kind: 'quran', id: `Q:${ref.surah}:${ref.ayah}`, surah: ref.surah, ayah: ref.ayah, index: h.index, score: h.score, matchedTerms: [...new Set(h.terms)] }); }
  const hadith: EvidenceHadith[] = res.hadith.hits.map(h => { const [c, ...n] = h.id.split(':'); return { kind: 'hadith' as const, id: 'H:' + h.id, collection: c, number: n.join(':'), score: h.score, matchedTerms: [...new Set(h.terms)] }; });
  const quran = dedupeAndRank<EvidenceQuran>([...explicit, ...found], 6); const hadithTop = dedupeAndRank<EvidenceHadith>(hadith, 4);
  return { quran, hadith: hadithTop, strongQuran: explicit.length > 0 || res.quran.strong, strongHadith: res.hadith.strong, explicitRefs: explicit.length > 0, topics: res.quran.topics };
}
export type { Evidence };
