import type { Chapter } from '../types';
import { normalizeText } from './normalize';
/** Well-known named verses -> exact references. Only unambiguous, universally used names. */
export const VERSE_ALIASES: Record<string, [number, number, number]> = {
  'ayat al kursi': [2, 255, 255], 'ayatul kursi': [2, 255, 255], 'ayat ul kursi': [2, 255, 255], 'ayah al kursi': [2, 255, 255], 'throne verse': [2, 255, 255], 'اية الكرسي': [2, 255, 255], 'آية الكرسي': [2, 255, 255], 'আয়াতুল কুরসি': [2, 255, 255], 'আয়াতুল কুরসী': [2, 255, 255], 'آیت الکرسی': [2, 255, 255],
  'last two verses of surah baqarah': [2, 285, 286], 'last two ayat of baqarah': [2, 285, 286],
};
const SURAH_ALT: Record<number, string[]> = { 1: ['fatiha', 'fatihah', 'opening', 'الفاتحه'], 2: ['baqarah', 'baqara', 'cow', 'البقره'], 3: ['imran', 'al imran', 'ali imran'], 18: ['kahf', 'cave'], 36: ['yasin', 'ya sin', 'yaseen', 'يس'], 55: ['rahman', 'ar rahman'], 67: ['mulk'], 112: ['ikhlas', 'ikhlaas', 'sincerity', 'الاخلاص'], 113: ['falaq'], 114: ['nas', 'naas', 'mankind', 'الناس'], 103: ['asr', 'time', 'العصر'], 108: ['kawthar', 'kauthar'], 109: ['kafirun', 'kafiroon'], 110: ['nasr'], 93: ['duha', 'dhuha'], 94: ['sharh', 'inshirah'], 97: ['qadr'], 99: ['zalzalah', 'zilzal'], 56: ['waqiah', 'waqia'], 32: ['sajdah', 'sajda'], 12: ['yusuf', 'yousuf', 'joseph'], 19: ['maryam', 'mary'], 31: ['luqman'], 49: ['hujurat'], 24: ['nur', 'noor', 'light'], 17: ['isra', 'bani israil'], 4: ['nisa', 'women'], 5: ['maidah', 'maida'], 9: ['tawbah', 'tawba', 'bara\'ah'], 13: ['rad'], 14: ['ibrahim'], 21: ['anbiya'], 23: ['muminun', 'mu\'minun'], 33: ['ahzab'], 39: ['zumar'], 40: ['ghafir', 'mumin'], 48: ['fath'], 59: ['hashr'], 62: ['jumuah', 'jumua'], 65: ['talaq'], 71: ['nuh'], 73: ['muzzammil'], 74: ['muddaththir', 'muddathir'], 76: ['insan', 'dahr'], 78: ['naba'], 96: ['alaq', 'iqra'], 105: ['fil', 'elephant'], 106: ['quraysh', 'quraish'], 107: ['maun'], 111: ['masad', 'lahab'] };
export interface ParsedRef { surah: number; from: number; to: number; source: string }
export function parseReferences(q: string, chapters: Chapter[]): ParsedRef[] {
  const out: ParsedRef[] = []; const norm = normalizeText(q);
  for (const [k, [s, a, b]] of Object.entries(VERSE_ALIASES)) if (norm.includes(normalizeText(k))) out.push({ surah: s, from: a, to: b, source: k });
  const digits = q.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[\u09E6-\u09EF]/g, d => String(d.charCodeAt(0) - 0x9E6)).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x6F0));
  for (const m of digits.matchAll(/(?<![\d:])(\d{1,3})\s*[:：.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?![\d:])/g)) {
    const s = +m[1], a = +m[2], b = m[3] ? +m[3] : a; const ch = chapters[s - 1];
    if (ch && a >= 1 && a <= ch.verses && b >= a && b <= ch.verses && b - a < 15) out.push({ surah: s, from: a, to: b, source: m[0] });
  }
  const nameIdx = new Map<string, number>();
  for (const c of chapters) { nameIdx.set(normalizeText(c.tr).replace(/[^a-z]/g, ''), c.n); nameIdx.set(normalizeText(c.en).replace(/[^a-z]/g, ''), c.n); nameIdx.set(normalizeText(c.ar), c.n); }
  for (const [n, alts] of Object.entries(SURAH_ALT)) for (const a of alts) nameIdx.set(normalizeText(a).replace(/[^a-z\u0600-\u06ff]/g, ''), +n);
  const m = norm.match(/(?:surah|sura|surat|soorah|সূরা|سوره|سورة|سورہ)\s*(?:al|an|ar|as|ash|at|az|ad|adh)?[\s-]*([a-z\u0600-\u06ff']+(?:\s[a-z]+)?)\s*(?:(?:ayah|ayat|verse|aya|আয়াত|اية|ایت)?\s*(\d{1,3}))?/u);
  if (m) {
    const key = m[1].replace(/[^a-z\u0600-\u06ff]/g, ''); let n = nameIdx.get(key);
    if (!n) { const first = key.replace(/^(al|an|ar|as|ash|at|az|ad|adh)/, ''); n = nameIdx.get(first); }
    if (!n) for (const [k, v] of nameIdx) if (k.length >= 4 && key.length >= 4 && (k === key.slice(0, k.length) || key === k.slice(0, key.length))) { n = v; break; }
    if (n) { const a = m[2] ? +m[2] : 0; const ch = chapters[n - 1]; if (a && a <= ch.verses) out.push({ surah: n, from: a, to: a, source: m[0].trim() }); else if (!out.some(o => o.surah === n)) out.push({ surah: n, from: 1, to: Math.min(ch.verses, 5), source: m[0].trim() }); }
  }
  return out;
}
