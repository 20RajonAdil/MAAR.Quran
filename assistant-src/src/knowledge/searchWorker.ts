/// <reference lib="webworker" />
import { SearchCore } from './searchCore';
import { loadQuran } from '../services/datasetManager';
import { loadAllRecords } from '../hadith/hadithStore';
const core = new SearchCore();
type Req = { id: number; type: 'rebuild' } | { id: number; type: 'search'; query: string; hadith: boolean } | { id: number; type: 'hadithOnly' };
self.onmessage = async (e: MessageEvent<Req>) => {
  const m = e.data;
  try {
    if (m.type === 'rebuild') {
      const q = await loadQuran(); if (q) core.buildQuran(q.arSearch, q.translations);
      const h = await loadAllRecords(); core.buildHadith(h);
      (self as any).postMessage({ id: m.id, ok: true, quran: core.quranCount, hadith: core.hadithCount });
    } else if (m.type === 'search') {
      const quran = core.searchQuran(m.query); const hadith = m.hadith ? core.searchHadith(m.query) : { hits: [], strong: false };
      (self as any).postMessage({ id: m.id, ok: true, quran, hadith });
    }
  } catch (err: any) { (self as any).postMessage({ id: m.id, ok: false, error: String(err?.message || err) }); }
};
