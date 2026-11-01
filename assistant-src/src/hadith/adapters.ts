/** Format adapters. They only RESHAPE data. Missing numbers/grades/references stay missing -- nothing is invented. */
export interface RawRecord { number?: unknown; book?: { number?: unknown; name?: unknown }; chapter?: unknown; arabic?: unknown; translations?: Record<string, unknown>; narrator?: unknown; gradings?: { grade?: unknown; authority?: unknown }[]; reference?: unknown }
export interface Parsed { format: 'maar-hadith-pack' | 'fawazahmed0-edition' | 'hadith-json' | 'generic'; collection?: { id?: string; name?: string; nameAr?: string }; edition?: string; translator?: string; language?: string; records: RawRecord[]; notes: string[] }
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const arabicRatio = (s: string) => { let a = 0, l = 0; for (const ch of s) { if (/\p{L}/u.test(ch)) { l++; if (/[\u0600-\u06ff]/.test(ch)) a++; } } return l ? a / l : 0; };
export function parseImport(json: unknown, hint: { language?: string }): Parsed {
  if (isObj(json) && json.schema === 'maar-hadith-pack') {
    const recs = Array.isArray(json.hadiths) ? json.hadiths : [];
    return { format: 'maar-hadith-pack', collection: isObj(json.collection) ? json.collection : undefined, edition: json.edition, translator: json.translator, language: json.language, notes: [], records: recs.map((h: any) => isObj(h) ? { number: h.number, book: h.book, chapter: h.chapter, arabic: h.arabic, translations: isObj(h.translations) ? h.translations : undefined, narrator: h.narrator, gradings: Array.isArray(h.gradings) ? h.gradings : undefined, reference: h.reference } : {}) };
  }
  const list: any[] | null = Array.isArray(json) ? json : isObj(json) && Array.isArray(json.hadiths) ? json.hadiths : null;
  if (!list) throw new Error('Not a recognised Hadith file: expected a "hadiths" array (see the documented import format).');
  const meta = isObj(json) ? (json as any).metadata : undefined; const first = list.find(isObj) ?? {};
  if (isObj(meta) && ('hadithnumber' in first || 'arabicnumber' in first)) { // fawazahmed0/hadith-api edition
    const lang = hint.language || 'en'; const sect = isObj(meta.section) ? meta.section : {}; const notes: string[] = [];
    const records = list.filter(isObj).map(h => {
      const text = typeof h.text === 'string' ? h.text : '';
      const isAr = lang === 'ar' || (lang !== 'ar' && arabicRatio(text) > 0.7 && !hint.language);
      const bk = isObj(h.reference) ? h.reference.book : undefined;
      const gr = Array.isArray(h.grades) ? h.grades.map((g: any) => ({ grade: g?.grade, authority: g?.name })) : undefined;
      return { number: h.hadithnumber, book: bk != null ? { number: bk, name: sect[String(bk)] } : undefined, arabic: isAr ? text : undefined, translations: isAr ? undefined : { [lang]: text }, gradings: gr, reference: isObj(h.reference) && h.reference.book != null ? `Book ${h.reference.book}, Hadith ${h.reference.hadith}` : undefined } as RawRecord;
    });
    notes.push('Detected hadith-api edition format; numbers are the source edition\'s "hadithnumber".');
    return { format: 'fawazahmed0-edition', collection: { name: typeof meta.name === 'string' ? meta.name : undefined }, language: lang, records, notes };
  }
  if (isObj(meta) && ('idInBook' in first || 'bookId' in first || 'chapterId' in first)) { // AhmedBaset/hadith-json
    const chapters = isObj(json) && Array.isArray((json as any).chapters) ? (json as any).chapters : []; const chName = new Map<number, string>();
    for (const c of chapters) if (isObj(c) && c.id != null) chName.set(+c.id, (c.english && String(c.english)) || (c.arabic && String(c.arabic)) || '');
    const records = list.filter(isObj).map(h => ({ number: h.idInBook, book: h.bookId != null ? { number: h.bookId } : undefined, chapter: h.chapterId != null ? chName.get(+h.chapterId) || undefined : undefined, arabic: h.arabic, translations: isObj(h.english) && h.english.text ? { en: h.english.text } : undefined, narrator: isObj(h.english) ? h.english.narrator : undefined } as RawRecord));
    return { format: 'hadith-json', collection: { name: isObj(meta.english) ? meta.english.title : undefined, nameAr: isObj(meta.arabic) ? meta.arabic.title : undefined }, edition: isObj(meta.english) ? meta.english.author : undefined, language: 'en', records, notes: ['Detected hadith-json format. Only "idInBook" is used as the Hadith number; records without it are rejected. This format carries no authenticity grades.'] };
  }
  const pick = (o: any, ...ks: string[]) => { for (const k of ks) if (o[k] != null && o[k] !== '') return o[k]; return undefined; };
  const lang = hint.language || 'en';
  return { format: 'generic', language: lang, notes: ['Generic list format: mapped fields number/hadith_number, arabic, text/english/translation, grade, grade_authority, book, chapter.'], records: list.map((h: any) => {
    if (!isObj(h)) return {}; const tr = pick(h, 'text', 'english', 'translation', 'text_en'); const g = pick(h, 'grade', 'grading');
    return { number: pick(h, 'number', 'hadith_number', 'hadithNumber', 'hadithnumber'), arabic: pick(h, 'arabic', 'arabic_text', 'text_ar'), translations: tr != null ? { [lang]: tr } : undefined, book: { number: pick(h, 'book_number', 'bookNumber', 'book'), name: pick(h, 'book_name', 'bookName') }, chapter: pick(h, 'chapter', 'chapter_name'), narrator: pick(h, 'narrator'), gradings: g ? [{ grade: g, authority: pick(h, 'grade_authority', 'grader', 'authority') }] : undefined } as RawRecord;
  }) };
}
