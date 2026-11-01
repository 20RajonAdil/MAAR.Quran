import type { Chapter, Evidence, HadithRecord } from '../types';
import { stripTranslationMarkers } from '../knowledge/normalize';
export interface EvidenceSource { chapters: Chapter[]; ar: string[]; en: string[] | null; getHadith(id: string): HadithRecord | undefined }
export function describeEvidence(e: Evidence, s: EvidenceSource): string | null {
  if (e.kind === 'quran') {
    const c = s.chapters[e.surah - 1]; const t = s.en?.[e.index]; if (!c || !t) return null;
    return `[${e.id}] Quran, Surah ${c.tr} (${c.en}) ${e.surah}:${e.ayah}\nEnglish translation: ${stripTranslationMarkers(t)}`;
  }
  const r = s.getHadith(e.id.slice(2)); if (!r) return null;
  const text = r.translations.en ?? Object.values(r.translations)[0] ?? ''; if (!text) return null;
  const grade = r.gradings.length ? r.gradings.map(g => `${g.grade}${g.authority ? ` (according to ${g.authority})` : ' (authority not stated)'}`).join('; ') : 'NO GRADING AVAILABLE in the installed data';
  return `[${e.id}] Hadith, collection ${r.collection}, number ${r.number}${r.book.name ? `, book "${r.book.name}"` : ''}\nGrading: ${grade}\nText: ${text.slice(0, 900)}`;
}
export function buildEvidenceBlock(evs: Evidence[], s: EvidenceSource, maxChars = 5200): { block: string; used: Evidence[] } {
  const parts: string[] = []; const used: Evidence[] = []; let n = 0;
  for (const e of evs) { const d = describeEvidence(e, s); if (!d) continue; if (n + d.length > maxChars) break; parts.push(d); used.push(e); n += d.length; }
  return { block: parts.join('\n\n'), used };
}
