import type { Chapter, QuranManifest, QuranManifestTranslation } from '../types';
import { get, kvGet, kvSet, put } from '../storage/indexedDB';

const BASE = () => new URL('./data/quran/', (typeof document !== 'undefined' ? document.baseURI : self.location.href)).href;
export interface InstallProgress { phase: string; file?: string; done: number; total: number; bytes?: number }
export interface QuranData { chapters: Chapter[]; juzStart: number[]; ar: string[]; arSearch: string[]; translations: Record<string, string[]>; manifest: QuranManifest; translationKeys: Record<string, string> }
const sha256 = async (buf: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');

async function fetchRetry(url: string, tries = 4): Promise<ArrayBuffer> {
  let last: unknown;
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`); return await r.arrayBuffer(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 400 * 2 ** i)); } }
  throw last instanceof Error ? last : new Error('Download failed');
}
export async function fetchManifest(): Promise<QuranManifest> { const buf = await fetchRetry(BASE() + 'manifest.json'); return JSON.parse(new TextDecoder().decode(buf)); }
/** Download one data file, verify its SHA-256 against the manifest, store it. Skips files already stored with a matching hash (resume after interruption). */
async function installFile(m: QuranManifest, path: string, key: string, onBytes?: (n: number) => void) {
  const want = m.sha256[path]; if (!want) throw new Error(`Manifest has no checksum for ${path}`);
  const have = await get('quran', key); if (have && have.sha === want) return;
  const buf = await fetchRetry(BASE() + path); const got = await sha256(buf);
  if (got !== want) throw new Error(`Integrity check failed for ${path}: file does not match the published checksum.`);
  const data = JSON.parse(new TextDecoder().decode(buf)); await put('quran', { key, sha: want, data, bytes: buf.byteLength }); onBytes?.(buf.byteLength);
}
const keyForTr = (t: QuranManifestTranslation) => 'tr:' + t.lang;
export async function installCore(onProgress: (p: InstallProgress) => void, translationLangs: string[] = ['en']): Promise<QuranManifest> {
  const m = await fetchManifest(); const trs = m.translations.filter(t => translationLangs.includes(t.lang));
  const jobs: [string, string][] = [['arabic.json', 'arabic'], ['arabic-search.json', 'arabic-search'], ['chapters.json', 'chapters'], ...trs.map(t => [t.file, keyForTr(t)] as [string, string])];
  let bytes = 0; let done = 0; onProgress({ phase: 'Installing Quran database', done, total: jobs.length, bytes });
  for (const [path, key] of jobs) { await installFile(m, path, key, n => { bytes += n; }); done++; onProgress({ phase: 'Installing Quran database', file: path, done, total: jobs.length, bytes }); }
  await put('quran', { key: 'manifest', data: m, sha: '', bytes: 0 });
  await kvSet('quranInstall', { dataVersion: m.dataVersion, installedAt: Date.now(), translations: [...new Set([...(await kvGet<string[]>('quranTranslations') ?? []), ...trs.map(t => t.lang)])] });
  await kvSet('quranTranslations', (await kvGet('quranInstall')).translations); return m;
}
export async function installTranslation(lang: string, onProgress?: (p: InstallProgress) => void) {
  const m = (await get('quran', 'manifest'))?.data as QuranManifest | undefined ?? await fetchManifest(); const t = m.translations.find(x => x.lang === lang); if (!t) throw new Error('No translation available for ' + lang);
  await installFile(m, t.file, keyForTr(t), n => onProgress?.({ phase: 'Installing translation', file: t.file, done: 1, total: 1, bytes: n }));
  if (t.has_footnotes) { try { await installFile(m, 'footnotes/' + t.key + '.json', 'fn:' + t.lang); } catch { /* footnotes are optional */ } }
  const cur = (await kvGet<string[]>('quranTranslations')) ?? []; if (!cur.includes(lang)) await kvSet('quranTranslations', [...cur, lang]);
}
export async function quranInstallStatus(): Promise<{ installed: boolean; dataVersion: number | null; translations: string[]; bytes: number }> {
  const st = await kvGet<{ dataVersion: number }>('quranInstall'); const trs = (await kvGet<string[]>('quranTranslations')) ?? [];
  const ar = await get('quran', 'arabic'); return { installed: !!(st && ar), dataVersion: st?.dataVersion ?? null, translations: trs, bytes: 0 };
}
export async function loadQuran(): Promise<QuranData | null> {
  const [ar, arS, ch, man] = await Promise.all(['arabic', 'arabic-search', 'chapters', 'manifest'].map(k => get('quran', k)));
  if (!ar || !arS || !ch || !man) return null;
  const translations: Record<string, string[]> = {}; const translationKeys: Record<string, string> = {};
  for (const t of (man.data as QuranManifest).translations) { const r = await get('quran', keyForTr(t)); if (r) { translations[t.lang] = r.data; translationKeys[t.lang] = t.key; } }
  if (!ar.data || ar.data.length !== 6236 || arS.data.length !== 6236) throw new Error('Quran database is incomplete; please reinstall.');
  return { chapters: ch.data.chapters, juzStart: ch.data.juzStart, ar: ar.data, arSearch: arS.data, translations, manifest: man.data, translationKeys };
}
export async function getFootnotes(lang: string): Promise<Record<string, string> | null> { return (await get('quran', 'fn:' + lang))?.data ?? null; }
export const juzOf = (index: number, juzStart: number[]) => { let j = 0; for (let i = 0; i < juzStart.length; i++) if (index >= juzStart[i]) j = i + 1; return j; };
/** Verifies stored data against the manifest (integrity check button). */
export async function verifyQuranIntegrity(): Promise<{ ok: boolean; problems: string[] }> {
  const d = await loadQuran(); const problems: string[] = []; if (!d) return { ok: false, problems: ['Quran database is not installed.'] };
  if (d.ar.length !== 6236) problems.push('Arabic text does not contain 6,236 ayat.'); let n = 0; for (const c of d.chapters) n += c.verses; if (n !== 6236 || d.chapters.length !== 114) problems.push('Chapter table is inconsistent.');
  for (const [l, a] of Object.entries(d.translations)) if (a.length !== 6236) problems.push(`Translation ${l} is incomplete.`);
  for (const [k, v] of Object.entries({ arabic: 'arabic.json', 'arabic-search': 'arabic-search.json' })) { const r = await get('quran', k); if (!r || r.sha !== d.manifest.sha256[v]) problems.push(`${v} does not match its published checksum.`); }
  return { ok: problems.length === 0, problems };
}
