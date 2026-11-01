import { readFileSync } from 'fs';
import { SearchCore } from '../src/knowledge/searchCore';
import { fileURLToPath } from 'url';
export const D = process.env.QURAN_DATA_DIR ?? fileURLToPath(new URL('../public/data/quran/', import.meta.url));
const J = (p: string) => JSON.parse(readFileSync(D + p, 'utf8'));
export const chapters = J('chapters.json').chapters; export const ar: string[] = J('arabic.json'); export const arS: string[] = J('arabic-search.json');
export const en: string[] = J('translations/english_saheeh.json'); export const bn: string[] = J('translations/bengali_zakaria.json'); export const ur: string[] = J('translations/urdu_junagarhi.json');
export function core(withBnUr = true) { const c = new SearchCore(); c.buildQuran(arS, withBnUr ? { en, bn, ur } : { en }); return c; }
export const ref = (idx: number) => { let c = chapters[0]; for (const x of chapters) if (x.start <= idx) c = x; return `${c.n}:${idx - c.start + 1}`; };
