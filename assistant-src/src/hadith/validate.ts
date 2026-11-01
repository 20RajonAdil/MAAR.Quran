import type { HadithRecord } from '../types';
import { parseImport, type Parsed, type RawRecord } from './adapters';
import { COLLECTION_ID_RE, HADITH_NUMBER_RE, KNOWN_COLLECTIONS, LANG_RE, LIMITS, mkGrading, statusOf } from './schema';

export interface ImportOptions { collectionId: string; collectionName?: string; collectionNameAr?: string; language?: string; sourceName: string; licence: string; authorised: boolean; translator?: string; edition?: string; fileName: string }
export interface Rejection { index: number; number: string | null; reason: string }
export interface ValidationReport {
  ok: boolean; errors: string[]; warnings: string[]; notes: string[]; format: Parsed['format'] | null; collectionId: string; collectionName: string; collectionNameAr: string | null; language: string | null;
  stats: { total: number; accepted: number; rejected: number; duplicates: number; withArabic: number; withTranslation: number; graded: number; gradeWithoutAuthority: number; ungraded: number; missingBookInfo: number };
  rejections: Rejection[]; records: Omit<HadithRecord, 'id' | 'collection'>[]; options: ImportOptions; edition: string | null; translator: string | null;
}
/** Remove markup and control characters. Imported text is also never rendered as HTML (React escapes it). */
export function clean(s: unknown, max = LIMITS.maxText): { v: string | null; changed: boolean } {
  if (s == null) return { v: null, changed: false }; if (typeof s !== 'string' && typeof s !== 'number') return { v: null, changed: true };
  const raw = String(s); let v = raw.normalize('NFC').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200e\u200f\u202a-\u202e]/g, '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  let changed = v !== raw.trim(); if (v.length > max) { v = v.slice(0, max); changed = true; }
  return { v: v || null, changed };
}
const empty = (o: ImportOptions, errors: string[]): ValidationReport => ({ ok: false, errors, warnings: [], notes: [], format: null, collectionId: o.collectionId, collectionName: o.collectionName || '', collectionNameAr: null, language: o.language ?? null, stats: { total: 0, accepted: 0, rejected: 0, duplicates: 0, withArabic: 0, withTranslation: 0, graded: 0, gradeWithoutAuthority: 0, ungraded: 0, missingBookInfo: 0 }, rejections: [], records: [], options: o, edition: null, translator: null });

export async function validateImport(json: unknown, o: ImportOptions): Promise<ValidationReport> {
  const errors: string[] = []; const warnings: string[] = [];
  if (!o.authorised) errors.push('You must confirm that you are legally authorised to use this dataset.');
  if (!o.sourceName.trim()) errors.push('Source name is required (who published this edition).');
  if (!o.licence.trim()) errors.push('Licence / permission statement is required (e.g. licence name, URL, or the permission you hold).');
  if (!COLLECTION_ID_RE.test(o.collectionId)) errors.push('Collection ID must be 2-40 characters: lowercase letters, digits and hyphens.');
  if (o.language && !LANG_RE.test(o.language)) errors.push('Language code is not valid (use e.g. en, ur, bn).');
  let parsed: Parsed; try { parsed = parseImport(json, { language: o.language }); } catch (e: any) { return empty(o, [...errors, String(e.message || e)]); }
  if (parsed.records.length === 0) errors.push('The file contains no Hadith records.');
  if (parsed.records.length > LIMITS.maxRecords) errors.push(`Too many records (${parsed.records.length}); limit is ${LIMITS.maxRecords}.`);
  const known = KNOWN_COLLECTIONS[o.collectionId];
  const name = clean(o.collectionName || parsed.collection?.name || known?.name || '', LIMITS.maxShort).v; const nameAr = clean(o.collectionNameAr || parsed.collection?.nameAr || known?.nameAr || '', LIMITS.maxShort).v;
  if (!name) errors.push('Collection name is required for a collection that is not one of the six standard names.');
  const lang = o.language || parsed.language || null; const seen = new Set<string>(); const out: ValidationReport['records'] = []; const rej: Rejection[] = [];
  const st = { total: parsed.records.length, accepted: 0, rejected: 0, duplicates: 0, withArabic: 0, withTranslation: 0, graded: 0, gradeWithoutAuthority: 0, ungraded: 0, missingBookInfo: 0 }; let sanitised = 0;
  for (let i = 0; i < parsed.records.length; i++) {
    if (i % 3000 === 2999) await new Promise(r => setTimeout(r, 0));
    const r: RawRecord = parsed.records[i]; const numRaw = typeof r.number === 'number' ? String(r.number) : typeof r.number === 'string' ? r.number.trim() : '';
    const reject = (reason: string) => { st.rejected++; if (rej.length < 200) rej.push({ index: i, number: numRaw || null, reason }); };
    if (!numRaw) { reject('No Hadith number in the source (numbers are never invented)'); continue; }
    if (!HADITH_NUMBER_RE.test(numRaw)) { reject(`Hadith number "${numRaw.slice(0, 20)}" is not a valid number`); continue; }
    if (seen.has(numRaw)) { st.duplicates++; reject('Duplicate Hadith number in this file'); continue; }
    const ar = clean(r.arabic); const tr: Record<string, string> = {};
    for (const [l, t] of Object.entries(r.translations ?? {})) { if (!LANG_RE.test(l)) continue; const c = clean(t); if (c.v) { tr[l] = c.v; if (c.changed) sanitised++; } }
    if (ar.changed) sanitised++;
    if (!ar.v && !Object.keys(tr).length) { reject('Record has neither Arabic text nor translation text'); continue; }
    if (Object.keys(tr).length && !lang && !Object.keys(r.translations ?? {}).length) { reject('Translation language unknown'); continue; }
    const gradings = (r.gradings ?? []).map(g => mkGrading(clean(g?.grade, 120).v, clean(g?.authority, 200).v)).filter((g): g is NonNullable<typeof g> => !!g);
    const bookNo = clean(r.book?.number, 20).v; const bookName = clean(r.book?.name, LIMITS.maxShort).v; const chapter = clean(r.chapter, LIMITS.maxShort).v;
    seen.add(numRaw);
    const rec = { number: numRaw, numberSort: parseFloat(numRaw) || 0, book: { number: bookNo, name: bookName }, chapter, arabic: ar.v, translations: tr, narrator: clean(r.narrator, LIMITS.maxShort).v, gradings, gradingStatus: statusOf(gradings), reference: clean(r.reference, LIMITS.maxShort).v };
    out.push(rec); st.accepted++; if (rec.arabic) st.withArabic++; if (Object.keys(tr).length) st.withTranslation++;
    if (rec.gradingStatus === 'graded') st.graded++; else if (rec.gradingStatus === 'grade_without_authority') st.gradeWithoutAuthority++; else st.ungraded++;
    if (!bookNo && !bookName) st.missingBookInfo++;
  }
  if (st.total && st.rejected / st.total > LIMITS.maxRejectedRatio) errors.push(`${st.rejected} of ${st.total} records were rejected (more than ${LIMITS.maxRejectedRatio * 100}%). The file does not look like a reliable dataset.`);
  if (st.total && st.duplicates / st.total > LIMITS.maxDuplicateRatio) errors.push(`${st.duplicates} duplicate Hadith numbers found.`);
  if (st.rejected && !errors.length) warnings.push(`${st.rejected} record(s) were rejected and will not be installed (see list).`);
  if (st.accepted && st.ungraded === st.accepted) warnings.push('This dataset contains NO authenticity gradings. Its Hadith will be shown as "no grading in the installed data" -- never as authentic.');
  else if (st.ungraded) warnings.push(`${st.ungraded} record(s) have no grading and will be labelled as such.`);
  if (st.gradeWithoutAuthority) warnings.push(`${st.gradeWithoutAuthority} record(s) have a grade but no grading authority; they will be labelled "authority not stated".`);
  if (st.missingBookInfo) warnings.push(`${st.missingBookInfo} record(s) have no book information; references will show only the collection and number.`);
  if (sanitised) warnings.push(`${sanitised} text field(s) contained markup/control characters that were removed.`);
  if (st.accepted && !st.withArabic) warnings.push('No Arabic text in this file. Arabic can be added later by importing an Arabic edition of the same collection (matched by Hadith number).');
  return { ok: errors.length === 0 && st.accepted > 0, errors, warnings, notes: parsed.notes, format: parsed.format, collectionId: o.collectionId, collectionName: name || '', collectionNameAr: nameAr, language: lang, stats: st, rejections: rej, records: errors.length ? [] : out, options: o, edition: clean(o.edition || parsed.edition, LIMITS.maxShort).v, translator: clean(o.translator || parsed.translator, LIMITS.maxShort).v };
}
