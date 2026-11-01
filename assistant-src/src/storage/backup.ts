import type { Bookmark, Conversation, HadithCollectionMeta, HadithRecord } from '../types';
import { getAll, putMany, kvGet, kvSet } from './indexedDB';
export interface BackupFile { schema: 'maar-assistant-backup'; version: 1; exportedAt: number; conversations: Conversation[]; bookmarks: Bookmark[]; settings: unknown; hadith?: { collections: HadithCollectionMeta[]; records: HadithRecord[] } }
export async function exportBackup(includeHadith: boolean): Promise<Blob> {
  const b: BackupFile = { schema: 'maar-assistant-backup', version: 1, exportedAt: Date.now(), conversations: await getAll('conversations'), bookmarks: await getAll('bookmarks'), settings: await kvGet('settings') ?? null };
  if (includeHadith) b.hadith = { collections: await getAll('hadithCollections'), records: await getAll('hadithRecords') };
  return new Blob([JSON.stringify(b)], { type: 'application/json' });
}
const isStr = (x: unknown) => typeof x === 'string';
export async function restoreBackup(text: string): Promise<{ conversations: number; bookmarks: number; hadith: number }> {
  let b: any; try { b = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!b || b.schema !== 'maar-assistant-backup' || b.version !== 1) throw new Error('This is not a MAAR Islamic Assistant backup file.');
  const convs = (Array.isArray(b.conversations) ? b.conversations : []).filter((c: any) => c && isStr(c.id) && Array.isArray(c.messages) && c.messages.every((m: any) => m && isStr(m.text) && (m.role === 'user' || m.role === 'assistant')));
  const bms = (Array.isArray(b.bookmarks) ? b.bookmarks : []).filter((x: any) => x && isStr(x.id) && isStr(x.ref) && (x.kind === 'quran' || x.kind === 'hadith'));
  await putMany('conversations', convs); await putMany('bookmarks', bms); if (b.settings && typeof b.settings === 'object') await kvSet('settings', b.settings);
  let h = 0;
  if (b.hadith && Array.isArray(b.hadith.records) && Array.isArray(b.hadith.collections)) {
    const recs = b.hadith.records.filter((r: any) => r && isStr(r.id) && isStr(r.collection) && isStr(r.number) && r.id === `${r.collection}:${r.number}` && typeof r.translations === 'object');
    const cols = b.hadith.collections.filter((c: any) => c && isStr(c.id) && Array.isArray(c.sources) && c.sources.every((s: any) => s.authorisedByUser === true));
    await putMany('hadithRecords', recs); await putMany('hadithCollections', cols); h = recs.length;
  }
  return { conversations: convs.length, bookmarks: bms.length, hadith: h };
}
