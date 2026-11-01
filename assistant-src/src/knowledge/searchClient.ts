import type { HadithHit, QuranHit } from './searchCore';
export interface SearchResult { quran: { hits: QuranHit[]; topics: string[]; strong: boolean }; hadith: { hits: HadithHit[]; strong: boolean } }
export interface SearchBackend { rebuild(): Promise<{ quran: number; hadith: number }>; search(query: string, hadith: boolean): Promise<SearchResult> }
export class WorkerSearch implements SearchBackend {
  private w = new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' }); private n = 0; private pending = new Map<number, [(v: any) => void, (e: Error) => void]>();
  constructor() { this.w.onmessage = e => { const p = this.pending.get(e.data.id); if (!p) return; this.pending.delete(e.data.id); e.data.ok ? p[0](e.data) : p[1](new Error(e.data.error)); }; this.w.onerror = ev => { for (const [, p] of this.pending) p[1](new Error(ev.message)); this.pending.clear(); }; }
  private call<T>(msg: object): Promise<T> { const id = ++this.n; return new Promise((res, rej) => { this.pending.set(id, [res, rej]); this.w.postMessage({ id, ...msg }); }); }
  rebuild() { return this.call<{ quran: number; hadith: number }>({ type: 'rebuild' }); }
  search(query: string, hadith: boolean) { return this.call<SearchResult>({ type: 'search', query, hadith }); }
}
