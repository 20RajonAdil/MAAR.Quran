import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { validateImport, type ImportOptions } from '../src/hadith/validate';
import { installValidated, listCollections, loadAllRecords, removeCollection } from '../src/hadith/hadithStore';
import { SearchCore } from '../src/knowledge/searchCore';
import { answerQuestion, type AnswerDeps } from '../src/rag/answerGenerator';
import { chapters, ar, arS, en } from './helpers';
import type { HadithRecord } from '../src/types';
import { resetDbHandle } from '../src/storage/indexedDB';

// SYNTHETIC TEST FIXTURES ONLY: invented sentences, not real Hadith.
const opts = (o: Partial<ImportOptions> = {}): ImportOptions => ({ collectionId: 'testcoll', collectionName: 'Test Collection', language: 'en', sourceName: 'Test publisher', licence: 'Test licence: fixture', authorised: true, fileName: 'fixture.json', ...o });
const pack = (hadiths: any[]) => ({ schema: 'maar-hadith-pack', version: 1, collection: { id: 'testcoll', name: 'Test Collection' }, hadiths });
const good = [
  { number: '1', book: { number: '1', name: 'Book One' }, chapter: 'On patience', arabic: 'نص عربي تجريبي عن الصبر', translations: { en: 'Fixture text about patience and perseverance in hardship.' }, gradings: [{ grade: 'Sahih', authority: 'Fixture Scholar' }] },
  { number: '2', translations: { en: 'Fixture text about charity and giving to the poor.' }, gradings: [{ grade: 'Hasan' }] },
  { number: '3', translations: { en: 'Fixture text about honesty in trade.' } },
];
beforeEach(async () => { const { deleteDatabase } = await import('./idb-reset'); await deleteDatabase(); resetDbHandle(); });

describe('Hadith import validation', () => {
  it('accepts a valid pack and labels grading status honestly', async () => { const r = await validateImport(pack(good), opts()); expect(r.ok).toBe(true); expect(r.stats).toMatchObject({ accepted: 3, graded: 1, gradeWithoutAuthority: 1, ungraded: 1 }); expect(r.records.map(x => x.gradingStatus)).toEqual(['graded', 'grade_without_authority', 'ungraded']); });
  it('NEVER invents a missing number: such records are rejected', async () => { const r = await validateImport(pack([...good, { translations: { en: 'No number here' } }]), opts()); expect(r.stats.rejected).toBe(1); expect(r.rejections[0].reason).toMatch(/never invented/); expect(r.records.every(x => x.number)).toBe(true); });
  it('rejects without authorisation / licence / source', async () => { for (const bad of [{ authorised: false }, { licence: '' }, { sourceName: ' ' }]) { const r = await validateImport(pack(good), opts(bad)); expect(r.ok).toBe(false); expect(r.records.length).toBe(0); } });
  it('blocks datasets with too many bad records or duplicates', async () => { const many = Array.from({ length: 20 }, (_, i) => ({ number: i < 5 ? 'x' + i : String(i), translations: { en: 't' + i } })); expect((await validateImport(pack(many), opts())).ok).toBe(false); const dup = Array.from({ length: 50 }, (_, i) => ({ number: String(i % 25), translations: { en: 't' } })); expect((await validateImport(pack(dup), opts())).ok).toBe(false); });
  it('strips HTML/control characters and never stores markup', async () => { const r = await validateImport(pack([{ number: '1', translations: { en: 'Safe <script>alert(1)</script> text\u0007 <b>bold</b>' } }]), opts()); expect(r.ok).toBe(true); expect(r.records[0].translations.en).not.toMatch(/[<>]/); expect(r.warnings.join()).toMatch(/markup/); });
  it('rejects non-Hadith JSON and garbage', async () => { expect((await validateImport({ hello: 1 }, opts())).ok).toBe(false); expect((await validateImport('str', opts())).ok).toBe(false); expect((await validateImport(pack([]), opts())).ok).toBe(false); });
  it('does not treat a grade as verified when authority is unknown', async () => { const r = await validateImport(pack([{ number: '9', translations: { en: 'x' }, gradings: [{ grade: 'Sahih', authority: 'Unknown' }] }]), opts()); expect(r.records[0].gradingStatus).toBe('grade_without_authority'); });
  it('warns loudly when the whole dataset has no gradings', async () => { const r = await validateImport(pack([{ number: '1', translations: { en: 'a' } }]), opts()); expect(r.warnings.join()).toMatch(/NO authenticity gradings/); });
  it('adapts hadith-api edition format (grades kept, nothing invented)', async () => { const j = { metadata: { name: 'Fixture', section: { '1': 'Sec' } }, hadiths: [{ hadithnumber: 5, arabicnumber: 5, text: 'Fixture english', grades: [{ name: 'Fixture Grader', grade: 'Daif' }], reference: { book: 1, hadith: 5 } }, { hadithnumber: 6, text: 'No grades here', grades: [], reference: { book: 1, hadith: 6 } }] }; const r = await validateImport(j, opts()); expect(r.ok).toBe(true); expect(r.format).toBe('fawazahmed0-edition'); expect(r.records[0].gradings[0]).toMatchObject({ grade: 'Daif', authority: 'Fixture Grader', level: 'daif' }); expect(r.records[1].gradingStatus).toBe('ungraded'); });
  it('adapts hadith-json format using idInBook only', async () => { const mk = (n: number) => ({ id: 90000 + n, idInBook: n, chapterId: 1, bookId: 1, arabic: 'نص', english: { narrator: 'N', text: 'Fixture ' + n } }); const j = { metadata: { id: 1, english: { title: 'Fixture' } }, hadiths: [...Array.from({ length: 40 }, (_, i) => mk(i + 1)), { id: 100000, chapterId: 1, bookId: 1, arabic: 'نص', english: { narrator: 'N', text: 'No idInBook' } }] }; const r = await validateImport(j, opts()); expect(r.ok).toBe(true); expect(r.records.length).toBe(40); expect(r.records[0].number).toBe('1'); expect(r.stats.rejected).toBe(1); expect(r.rejections[0].reason).toMatch(/never invented/); });
});
describe('Hadith store, merge, removal', () => {
  it('installs, merges Arabic and translation editions by number, never overwriting with empties, and removes cleanly', async () => {
    await installValidated(await validateImport(pack(good), opts()));
    const arOnly = await validateImport(pack([{ number: '2', arabic: 'نص عربي للحديث الثاني' }]), opts()); expect(arOnly.ok).toBe(true); await installValidated(arOnly);
    const all = await loadAllRecords(); const r2 = all.find(r => r.number === '2')!; expect(r2.arabic).toContain('الثاني'); expect(r2.translations.en).toMatch(/charity/); expect(r2.gradings[0].grade).toBe('Hasan'); expect(all.length).toBe(3);
    const meta = (await listCollections())[0]; expect(meta.count).toBe(3); expect(meta.sources.length).toBe(2); expect(meta.sources[0].authorisedByUser).toBe(true);
    await removeCollection('testcoll'); expect((await loadAllRecords()).length).toBe(0); expect((await listCollections()).length).toBe(0);
  });
  it('refuses to install a failed report', async () => { await expect(installValidated(await validateImport({ x: 1 }, opts()))).rejects.toThrow(); });
});
describe('RAG pipeline (real Quran data, mock LLM)', () => {
  const core = new SearchCore(); core.buildQuran(arS, { en });
  const backend = { rebuild: async () => ({ quran: 6236, hadith: core.hadithCount }), search: async (q: string, h: boolean) => ({ quran: core.searchQuran(q), hadith: h ? core.searchHadith(q) : { hits: [], strong: false } }) };
  let calls = 0; let lastPrompt = '';
  const llm = { ready: true, generate: async (m: any[], onTok: (t: string) => void) => { calls++; lastPrompt = JSON.stringify(m); const ids = [...m.at(-1).content.matchAll(/\[(Q:\d+:\d+|H:[a-z0-9-]+:[\w.]+)\]/g)].map((x: any) => x[1]); const t = `This teaches the topic [${ids[0]}]. It is also stated at [Q:99:99] and in 4:34. As narrated in Sahih Bukhari, the Prophet said something. Be mindful.`; onTok(t); return t; } };
  const hadithMap = new Map<string, HadithRecord>();
  const deps = (o: Partial<AnswerDeps> = {}): AnswerDeps => ({ chapters, ar, en, backend, hadithInstalled: false, getHadith: id => hadithMap.get(id), llm, settings: { responseLang: 'auto', detail: 'normal' }, ...o });
  it('answers a topic question with only valid, database-backed citations', async () => { calls = 0; const m = await answerQuestion('What does Islam say about patience?', [], deps(), () => {}); expect(m.kind).toBe('answer'); expect(calls).toBe(1); expect(m.text).not.toMatch(/99:99|4:34|bukhari/i); expect(m.evidence!.length).toBeGreaterThan(0); expect(m.text).toMatch(/\[Q:\d+:\d+\]/); expect(m.notes!.join(' ')).toMatch(/Hadith/); expect(lastPrompt).toMatch(/NO HADITH EVIDENCE/); });
  it('Hadith question with none installed: no model call, honest message', async () => { calls = 0; const m = await answerQuestion('Give me a hadith about patience', [], deps(), () => {}); expect(m.kind).toBe('hadith-missing'); expect(calls).toBe(0); expect(m.text).toMatch(/No Hadith collection is installed/); });
  it('unrelated question: insufficient evidence, no model call', async () => { calls = 0; const m = await answerQuestion('how do I bake a pizza', [], deps(), () => {}); expect(m.kind).toBe('insufficient'); expect(calls).toBe(0); });
  it('crisis message bypasses retrieval and the model', async () => { calls = 0; const m = await answerQuestion('I want to kill myself', [], deps(), () => {}); expect(m.kind).toBe('safety'); expect(calls).toBe(0); });
  it('model not ready: shows verified sources only', async () => { const m = await answerQuestion('explain 2:255', [], deps({ llm: { ready: false, generate: async () => '' } }), () => {}); expect(m.kind).toBe('search-only'); expect(m.evidence![0].id).toBe('Q:2:255'); });
  it('explicit reference retrieves exactly that ayah first', async () => { const m = await answerQuestion('What does 2:255 mean?', [], deps(), () => {}); expect(m.evidence![0].id).toBe('Q:2:255'); });
  it('a new question that merely starts with "how" is NOT a follow-up', async () => { const first = await answerQuestion('explain 2:255', [], deps(), () => {}); const m = await answerQuestion('how do I bake a pizza', [first], deps(), () => {}); expect(m.kind).toBe('insufficient'); });
  it('follow-up reuses previous evidence', async () => { const first = await answerQuestion('explain 2:255', [], deps(), () => {}); const second = await answerQuestion('explain it more simply', [first], deps(), () => {}); expect(second.kind).toBe('answer'); expect(second.evidence![0].id).toBe('Q:2:255'); });
  it('with Hadith installed, retrieves them with grading info and Hadith claims survive validation', async () => {
    await installValidated(await validateImport(pack(good), opts())); const recs = await loadAllRecords(); recs.forEach(r => hadithMap.set(r.id, r)); core.buildHadith(recs);
    calls = 0; const m = await answerQuestion('Is there a hadith about honesty in trade?', [], deps({ hadithInstalled: true }), () => {}); expect(calls).toBe(1); const h = m.evidence!.filter(e => e.kind === 'hadith'); expect(h.length).toBeGreaterThan(0); expect(lastPrompt).toMatch(/NO GRADING AVAILABLE|Fixture Scholar|authority not stated/);
  });
});
