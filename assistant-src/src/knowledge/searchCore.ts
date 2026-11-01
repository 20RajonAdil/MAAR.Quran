import MiniSearch from 'minisearch';
import { normalizeArabic, normalizeText, stripTranslationMarkers, tokenize, contentTerms } from './normalize';
import { detectTopics } from './topicIndex';
import type { HadithRecord } from '../types';

export interface QuranHit { index: number; score: number; terms: string[]; q: string[] }
export interface HadithHit { id: string; score: number; terms: string[]; q: string[] }
const base = { tokenize, processTerm: (t: string) => t.toLowerCase(), searchOptions: { tokenize, processTerm: (t: string) => t.toLowerCase(), bm25: { k: 1.2, b: 0.35, d: 0.5 } } };

/** Holds the in-memory MiniSearch indexes. Runs inside searchWorker.ts (and directly in unit tests). */
export class SearchCore {
  private quran: MiniSearch | null = null; private hadith: MiniSearch | null = null; private quranLangs: string[] = [];
  hadithCount = 0; quranCount = 0;

  buildQuran(arSearch: string[], translations: Record<string, string[]>) {
    this.quranLangs = Object.keys(translations); const fields = ['ar', ...this.quranLangs.map(l => 't_' + l)];
    const ms = new MiniSearch({ idField: 'id', fields, storeFields: [], ...base });
    const docs = arSearch.map((ar, i) => { const d: Record<string, any> = { id: i, ar: normalizeArabic(ar) }; for (const l of this.quranLangs) d['t_' + l] = stripTranslationMarkers(translations[l][i] ?? ''); return d; });
    ms.addAll(docs); this.quran = ms; this.quranCount = arSearch.length;
  }
  buildHadith(records: HadithRecord[]) {
    const ms = new MiniSearch({ idField: 'id', fields: ['ar', 'text', 'meta'], storeFields: [], ...base });
    ms.addAll(records.map(r => ({ id: r.id, ar: r.arabic ? normalizeArabic(r.arabic) : '', text: Object.values(r.translations).join(' \n '), meta: [r.chapter, r.book.name].filter(Boolean).join(' ') })));
    this.hadith = ms; this.hadithCount = records.length;
  }
  /** Topic-aware Quran search. `langs` = translation languages whose fields should be searched for the raw query. */
  searchQuran(query: string, limit = 12): { hits: QuranHit[]; topics: string[]; strong: boolean } {
    if (!this.quran) return { hits: [], topics: [], strong: false };
    const topics = detectTopics(query); const raw = contentTerms(query); const score = new Map<number, QuranHit>();
    const add = (list: ReturnType<MiniSearch['search']>, w: number, kind: 'topic' | 'raw') => {
      const max = list[0]?.score || 1;
      for (const r of list.slice(0, 80)) { const prev = score.get(r.id as number); const cov = kind === 'raw' && raw.length ? Math.min(1, new Set(r.queryTerms).size / raw.length) : 1; const s = (r.score / max) * w * (0.4 + 0.6 * cov); if (prev) { prev.score += s; prev.terms.push(...r.terms); prev.q.push(...r.queryTerms); } else score.set(r.id as number, { index: r.id as number, score: s, terms: [...r.terms], q: [...r.queryTerms] }); }
    };
    const opts = (extra: object) => ({ ...base.searchOptions, combineWith: 'OR' as const, ...extra });
    if (topics.length) {
      topics.forEach((t, i) => {
        const en = t.en.map(normalizeText).join(' '); const ar = t.ar.map(normalizeArabic).join(' '); const w = i === 0 ? 1 : 0.6;
        if (this.quranLangs.includes('en') && en) add(this.quran!.search(en, opts({ fields: ['t_en'], prefix: false, fuzzy: false })), 0.7 * w, 'topic');
        if (ar) add(this.quran!.search(ar, opts({ fields: ['ar'], prefix: false, fuzzy: false })), 0.5 * w, 'topic');
      });
    }
    if (raw.length) add(this.quran.search(raw.join(' '), opts({ prefix: (t: string) => t.length >= 4, fuzzy: (t: string) => (t.length >= 6 ? 0.15 : false), boost: { t_en: 1.3 } })), topics.length ? 0.45 : 1, 'raw');
    let hits = [...score.values()];
    // Count distinct query terms matched -- used for the "strong evidence" test.
    const distinct = (h: QuranHit) => new Set(h.q.map(normalizeText)).size;
    hits = hits.sort((a, b) => b.score - a.score).slice(0, limit);
    const need = Math.min(2, Math.max(1, raw.length));
    const strong = topics.length > 0 ? hits.length > 0 : hits.length > 0 && distinct(hits[0]) >= need && hits[0].score >= 0.5;
    return { hits, topics: topics.map(t => t.id), strong };
  }
  searchHadith(query: string, limit = 8): { hits: HadithHit[]; strong: boolean } {
    if (!this.hadith || !this.hadithCount) return { hits: [], strong: false };
    const topics = detectTopics(query); const raw = contentTerms(query); const m = new Map<string, HadithHit>();
    const o = { ...base.searchOptions, combineWith: 'OR' as const };
    const add = (list: ReturnType<MiniSearch['search']>, w: number) => { const max = list[0]?.score || 1; for (const r of list.slice(0, 60)) { const p = m.get(r.id as string); const s = (r.score / max) * w; if (p) { p.score += s; p.terms.push(...r.terms); p.q.push(...r.queryTerms); } else m.set(r.id as string, { id: r.id as string, score: s, terms: [...r.terms], q: [...r.queryTerms] }); } };
    for (const t of topics) { add(this.hadith.search(t.en.map(normalizeText).join(' '), { ...o, fields: ['text', 'meta'], prefix: false }), 0.7); if (t.ar.length) add(this.hadith.search(t.ar.map(normalizeArabic).join(' '), { ...o, fields: ['ar'], prefix: false }), 0.5); }
    if (raw.length) add(this.hadith.search(raw.join(' '), { ...o, prefix: (t: string) => t.length >= 4, fuzzy: (t: string) => (t.length >= 6 ? 0.15 : false) }), topics.length ? 0.45 : 1);
    const hits = [...m.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    const need = Math.min(2, Math.max(1, raw.length));
    return { hits, strong: topics.length > 0 ? hits.length > 0 : hits.length > 0 && new Set(hits[0].q).size >= need && hits[0].score >= 0.5 };
  }
}
