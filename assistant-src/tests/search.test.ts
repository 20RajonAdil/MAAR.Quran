import { describe, it, expect } from 'vitest';
import { core, ref, chapters, ar, en, D } from './helpers';
import { normalizeArabic } from '../src/knowledge/normalize';
import { createHash } from 'crypto'; import { readFileSync } from 'fs';
const c = core();
const top = (q: string, n = 6) => c.searchQuran(q).hits.slice(0, n).map(h => ref(h.index));
describe('Quran dataset', () => {
  it('has 114 surahs and 6,236 ayat with consistent chapter table', () => { expect(chapters.length).toBe(114); expect(ar.length).toBe(6236); expect(chapters.reduce((s: number, x: any) => s + x.verses, 0)).toBe(6236); expect(chapters[113].start + chapters[113].verses).toBe(6236); });
  it('checksums in manifest match files', () => { const m = JSON.parse(readFileSync(D + 'manifest.json', 'utf8')); for (const [p, h] of Object.entries(m.sha256)) expect(createHash('sha256').update(readFileSync(D + p)).digest('hex')).toBe(h); });
  it('Ayat al-Kursi (2:255) text is intact', () => { const i = chapters[1].start + 254; expect(normalizeArabic(ar[i]).startsWith('الله لا اله الا هو الحي القيوم')).toBe(true); expect(en[i]).toMatch(/Allāh/); });
});
describe('search relevance (real data)', () => {
  it('English topic: patience returns verses mentioning patience', () => { const r = c.searchQuran('what does islam say about patience'); expect(r.strong).toBe(true); expect(r.topics).toContain('patience'); const txt = r.hits.slice(0, 5).map(h => en[h.index].toLowerCase()); expect(txt.filter(t => /patien|persever|steadfast|endure/.test(t)).length).toBeGreaterThanOrEqual(4); });
  it('Bengali topic word maps to the same topic (ধৈর্য)', () => { const r = c.searchQuran('ধৈর্য সম্পর্কে ইসলাম কী বলে'); expect(r.topics).toContain('patience'); expect(r.hits.length).toBeGreaterThan(0); });
  it('Romanised: "namaj" -> prayer; Urdu "نماز" -> prayer; Arabic "الصلاة" -> prayer', () => { for (const q of ['namaj er gurutto ki', 'نماز کی اہمیت کیا ہے', 'ما حكم الصلاة']) expect(c.searchQuran(q).topics).toContain('prayer'); });
  it('Arabic search finds Ayat al-Kursi by its words', () => { const r = c.searchQuran('الله لا اله الا هو الحي القيوم'); expect(r.hits.slice(0, 3).map(h => ref(h.index))).toContain('2:255'); });
  it('Spelling mistakes still match (fuzzy): "forgivness"', () => { const r = c.searchQuran('forgivness'); expect(r.topics.length + r.hits.length).toBeGreaterThan(0); });
  it('Chinese topic detection works without spaces', () => { expect(c.searchQuran('关于耐心').topics).toContain('patience'); });
  it('unrelated questions are NOT strong evidence', () => { for (const q of ['how do I bake a pizza', 'who won the football match yesterday', 'best laptop for programming']) expect(c.searchQuran(q).strong, q).toBe(false); });
  it('fasting / charity / parents topics return relevant verses', () => { expect(top('fasting in ramadan').some(r => r.startsWith('2:18'))).toBe(true); expect(c.searchQuran('how to treat my parents').hits.slice(0, 6).some(h => /parents/i.test(en[h.index]))).toBe(true); expect(c.searchQuran('zakat').hits.slice(0, 6).some(h => /zak[aā]h|charity/i.test(en[h.index]))).toBe(true); });
});
