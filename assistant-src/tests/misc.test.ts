import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../src/services/languageDetection';
import { parseReferences } from '../src/knowledge/quranRefs';
import { validateAnswer } from '../src/rag/citationValidator';
import { quranRefOf, validateQuranRef } from '../src/knowledge/sourceValidator';
import { normalizeArabic } from '../src/knowledge/normalize';
import { chapters, ar } from './helpers';
describe('language detection', () => {
  const t = (s: string, l: string) => expect(detectLanguage(s).lang, s).toBe(l);
  it('scripts and romanised', () => { t('What does Islam say about patience?', 'en'); t('ধৈর্য সম্পর্কে ইসলাম কী বলে?', 'bn'); t('نماز کے بارے میں کیا حکم ہے؟', 'ur'); t('ما حكم الصلاة في الإسلام؟', 'ar'); t('Namaz kaise padhte hain, mujhe batao', 'ur'); t('Namaj er niyom ki ki, amar jante iccha', 'bn'); t('Comment prier correctement ?', 'fr'); t('¿Qué dice el Islam sobre la paciencia?', 'es'); t('Wie wichtig ist das Gebet im Islam?', 'de'); t('Bagaimana cara berpuasa yang benar?', 'id'); t('Oruç tutmak neden önemli?', 'tr'); t('耐心在伊斯兰教中有什么意义', 'zh'); t('Что говорит ислам о терпении?', 'ru'); t('آیا نماز واجب است؟ این چیست', 'fa'); });
});
describe('references', () => {
  it('parses 2:255, ranges, names, aliases and Arabic-Indic digits', () => { const p = (q: string) => parseReferences(q, chapters); expect(p('explain 2:255')[0]).toMatchObject({ surah: 2, from: 255 }); expect(p('verses 18:1-5')[0]).toMatchObject({ surah: 18, from: 1, to: 5 }); expect(p('Ayatul Kursi')[0]).toMatchObject({ surah: 2, from: 255 }); expect(p('surah ikhlas')[0].surah).toBe(112); expect(p('surah al-baqarah ayah 286')[0]).toMatchObject({ surah: 2, from: 286 }); expect(p('٢:٢٥٥')[0]).toMatchObject({ surah: 2, from: 255 }); expect(p('what is 300:5').length).toBe(0); expect(p('2:999').length).toBe(0); });
  it('validates and round-trips indexes', () => { expect(validateQuranRef(2, 255, chapters)).toBe(chapters[1].start + 254); expect(validateQuranRef(2, 287, chapters)).toBeNull(); expect(validateQuranRef(115, 1, chapters)).toBeNull(); expect(quranRefOf(6235, chapters)).toEqual({ surah: 114, ayah: 6 }); expect(quranRefOf(6236, chapters)).toBeNull(); for (let i = 0; i < 6236; i += 97) { const r = quranRefOf(i, chapters)!; expect(validateQuranRef(r.surah, r.ayah, chapters)).toBe(i); } });
  it('normalisation is search-only: source text unchanged', () => { const i = chapters[1].start + 254; const before = ar[i]; normalizeArabic(before); expect(ar[i]).toBe(before); expect(normalizeArabic('ٱللَّهُ')).toBe('الله'); });
});
describe('citation validation (hallucination guard)', () => {
  const ev: any[] = [{ kind: 'quran', id: 'Q:2:255', surah: 2, ayah: 255, index: 0, score: 1, matchedTerms: [] }];
  const o = { hadithInstalled: false, hasHadithEvidence: false, lang: 'en' };
  it('keeps valid markers, removes invented ones', () => { const v = validateAnswer('God is ever-living [Q:2:255]. Also see [Q:3:999] and [H:bukhari:1].', ev, o); expect(v.cited).toEqual(['Q:2:255']); expect(v.text).not.toContain('Q:3:999'); expect(v.text).not.toContain('H:bukhari:1'); expect(v.removedMarkers.length).toBe(2); });
  it('removes verse numbers that are not in the evidence', () => { const v = validateAnswer('See verse 4:34 for details. And 2:255 is covered.', ev, o); expect(v.text).not.toContain('4:34'); expect(v.text).toContain('2:255'); expect(v.unverifiedRefs).toContain('4:34'); });
  it('strips Hadith claims when no Hadith evidence exists', () => { const v = validateAnswer('The verse speaks of God. As narrated in Sahih Bukhari, the Prophet said this. It teaches trust.', ev, o); expect(v.text).not.toMatch(/bukhari|narrated/i); expect(v.removedSentences).toBeGreaterThan(0); expect(v.notes.join(' ')).toMatch(/no Hadith collection is installed/i); });
  it('keeps Hadith discussion when real Hadith evidence exists', () => { const h: any[] = [...ev, { kind: 'hadith', id: 'H:bukhari:1', collection: 'bukhari', number: '1', score: 1, matchedTerms: [] }]; const v = validateAnswer('This hadith [H:bukhari:1] says deeds depend on intentions.', h, { ...o, hadithInstalled: true, hasHadithEvidence: true }); expect(v.cited).toContain('H:bukhari:1'); expect(v.text).toMatch(/hadith/i); });
});
