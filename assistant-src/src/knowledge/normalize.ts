/** Search-only normalisation. NEVER applied to text that is displayed or stored as a source record. */
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g;
export function normalizeArabic(s: string): string {
  return s.normalize('NFC').replace(TASHKEEL, '').replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').replace(/\u0649/g, '\u064A')
    .replace(/\u06CC/g, '\u064A').replace(/\u06A9/g, '\u0643').replace(/\u0624/g, '\u0648').replace(/\u0626/g, '\u064A').replace(/\u0629/g, '\u0647');
}
export function normalizeLatin(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u02BF\u02BE\u2018\u2019'`]/g, '').toLowerCase();
}
/** Light normalisation for any text: Arabic-script letters folded, Latin diacritics removed, lower-cased. */
export function normalizeText(s: string): string {
  return normalizeLatin(normalizeArabic(s.replace(/\u200c|\u200d/g, '')));
}
/** Remove the translation publisher's verse number "(12)" and footnote markers "[3]" -- for SEARCH/PROMPT use only. */
export function stripTranslationMarkers(s: string): string {
  return s.replace(/^\(\d+\)\s*/, '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
}
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const part of normalizeText(s).split(/[^\p{L}\p{N}\p{M}]+/u)) {
    if (!part) continue;
    if (CJK.test(part)) { const chars = [...part]; if (chars.length === 1) out.push(chars[0]); for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]); }
    else out.push(part);
  }
  return out;
}
export const STOPWORDS = new Set(('a an the and or of to in on at for from with by is are was were be been being it its this that these those what which who whom whose how why when where does do did can could should would will shall may might must about say says said tell me please explain meaning mean means islam islamic quran koran verse verses ayah ayat surah hadith give show find any some there their they them he she his her you your i my we our us as if but not no so than then also into over under again very more most such only own same too just now like want know need one best good great new people thing things make time way get use many much every ' +
    'এবং কি কী কে কেন কোন এই সেই আমি আপনি ইসলাম সম্পর্কে বলুন কুরআন ' + 'و في من على إلى عن ما ماذا هل هذا هذه ذلك التي الذي كيف لماذا ' + 'کیا ہے ہیں اور کی کا کے میں سے کو').split(/\s+/).map(normalizeText));
export function contentTerms(q: string): string[] { return tokenize(q).filter(t => t.length > 1 && !STOPWORDS.has(t)); }
