import type { Evidence } from '../types';
export interface Validated { text: string; cited: string[]; removedMarkers: string[]; removedSentences: number; unverifiedRefs: string[]; notes: string[] }
const MARK = /\[\s*(Q|H)\s*:\s*([^\]\s]+)\s*\]/g;
const HADITH_WORDS = /(\bhadiths?\b|\bahadith\b|bukhari|tirmidhi|abu dawud|abu daud|\bnasa'?i\b|ibn majah|\bsunan\b|\bnarrated\b|\bnarrator\b|prophet (muhammad )?(\(?peace|ﷺ|said)|حديث|الحديث|বুখারী|হাদিস|হাদীস|हदीस|hadis\b)/i;
/** Citations are only trusted if their marker is in the evidence set that was actually supplied to the model. */
export function validateAnswer(raw: string, evidence: Evidence[], opts: { hadithInstalled: boolean; hasHadithEvidence: boolean; lang: string }): Validated {
  const ok = new Set(evidence.map(e => e.id)); const cited: string[] = []; const removed: string[] = []; const notes: string[] = [];
  let text = raw.replace(MARK, (m, k, rest) => { const id = `${k}:${rest.replace(/\s/g, '')}`; if (ok.has(id)) { if (!cited.includes(id)) cited.push(id); return `[${id}]`; } removed.push(id); return ''; });
  // unsupported hadith claims
  let removedSentences = 0;
  if (!opts.hasHadithEvidence) {
    const parts = text.split(/(?<=[.!?۔।。])\s+|\n+/); const keep = parts.filter(s => { const bad = HADITH_WORDS.test(s) && !/^\s*$/.test(s); if (bad) removedSentences++; return !bad; });
    if (removedSentences) { text = keep.join('\n').trim(); notes.push(opts.hadithInstalled ? 'Sentences that referred to Hadith were removed because no matching installed Hadith was retrieved for this question.' : 'Sentences that referred to Hadith were removed because no Hadith collection is installed.'); }
  }
  // verse references that are not in the evidence
  const unverified: string[] = [];
  text = text.replace(/\(?\b(\d{1,3}):(\d{1,3})(?:[-–]\d{1,3})?\b\)?/g, (m, s, a) => { if (ok.has(`Q:${s}:${a}`)) return m; unverified.push(`${s}:${a}`); return ''; });
  if (unverified.length) notes.push('Verse numbers that were not in the retrieved sources were removed: ' + unverified.join(', '));
  if (removed.length) notes.push('Citations that did not match a retrieved source were removed.');
  if (!['ar', 'ur', 'fa'].includes(opts.lang) && /[\u0600-\u06ff]{15,}/.test(text)) notes.push('The answer contains Arabic text written by the model. Do not treat it as a Quran or Hadith quotation; the verified Arabic is in the source cards.');
  text = text.replace(/[ \t]+([.,;!?])/g, '$1').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { text, cited, removedMarkers: removed, removedSentences, unverifiedRefs: unverified, notes };
}
