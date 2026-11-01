import type { HadithCollectionMeta, HadithRecord } from '../types';
import { del, deleteByIndex, getAll, getAllByIndex, put, putMany, get } from '../storage/indexedDB';
import type { ValidationReport } from './validate';
import { statusOf } from './schema';

const recId = (c: string, n: string) => `${c}:${n}`;
/** Install a VALIDATED import. Only call with report.ok === true. Merges by Hadith number so Arabic and translation
 *  editions of the same collection can be imported separately; never overwrites existing data with empty values. */
export async function installValidated(report: ValidationReport): Promise<HadithCollectionMeta> {
  if (!report.ok) throw new Error('Refusing to install a dataset that failed validation.');
  const cid = report.collectionId; const existing = new Map((await getAllByIndex<HadithRecord>('hadithRecords', 'collection', cid)).map(r => [r.number, r]));
  const out: HadithRecord[] = [];
  for (const n of report.records) {
    const prev = existing.get(n.number);
    const gradings = [...(prev?.gradings ?? [])]; for (const g of n.gradings) if (!gradings.some(x => x.grade === g.grade && x.authority === g.authority)) gradings.push(g);
    const rec: HadithRecord = { id: recId(cid, n.number), collection: cid, number: n.number, numberSort: n.numberSort,
      book: { number: n.book.number ?? prev?.book.number ?? null, name: n.book.name ?? prev?.book.name ?? null }, chapter: n.chapter ?? prev?.chapter ?? null,
      arabic: n.arabic ?? prev?.arabic ?? null, translations: { ...(prev?.translations ?? {}), ...n.translations }, narrator: n.narrator ?? prev?.narrator ?? null,
      gradings, gradingStatus: statusOf(gradings), reference: n.reference ?? prev?.reference ?? null };
    out.push(rec); existing.set(n.number, rec);
  }
  await putMany('hadithRecords', out);
  const all = [...existing.values()]; const prevMeta = await get<HadithCollectionMeta>('hadithCollections', cid);
  const wt: Record<string, number> = {}; for (const r of all) for (const l of Object.keys(r.translations)) wt[l] = (wt[l] || 0) + 1;
  const meta: HadithCollectionMeta = { id: cid, name: report.collectionName || prevMeta?.name || cid, nameAr: report.collectionNameAr ?? prevMeta?.nameAr ?? null, edition: report.edition ?? prevMeta?.edition ?? null,
    sources: [...(prevMeta?.sources ?? []), { importedAt: Date.now(), fileName: report.options.fileName, format: report.format ?? 'unknown', language: report.language, sourceName: report.options.sourceName.trim(), licence: report.options.licence.trim(), authorisedByUser: true, translator: report.translator, edition: report.edition, recordCount: report.stats.accepted }],
    count: all.length, withArabic: all.filter(r => r.arabic).length, withTranslation: wt, graded: all.filter(r => r.gradingStatus === 'graded').length, gradeWithoutAuthority: all.filter(r => r.gradingStatus === 'grade_without_authority').length, ungraded: all.filter(r => r.gradingStatus === 'ungraded').length,
    installedAt: prevMeta?.installedAt ?? Date.now(), updatedAt: Date.now() };
  await put('hadithCollections', meta); return meta;
}
export const listCollections = () => getAll<HadithCollectionMeta>('hadithCollections');
export const loadAllRecords = () => getAll<HadithRecord>('hadithRecords');
export const getRecord = (id: string) => get<HadithRecord>('hadithRecords', id);
export async function removeCollection(id: string) { await deleteByIndex('hadithRecords', 'collection', id); await del('hadithCollections', id); }
