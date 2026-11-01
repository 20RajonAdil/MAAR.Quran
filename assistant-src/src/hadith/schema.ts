import type { Grading, GradeLevel, GradingStatus } from '../types';
export const KNOWN_COLLECTIONS: Record<string, { name: string; nameAr: string }> = {
  bukhari: { name: 'Sahih al-Bukhari', nameAr: 'صحيح البخاري' }, muslim: { name: 'Sahih Muslim', nameAr: 'صحيح مسلم' },
  abudawud: { name: 'Sunan Abu Dawud', nameAr: 'سنن أبي داود' }, tirmidhi: { name: 'Jami at-Tirmidhi', nameAr: 'جامع الترمذي' },
  nasai: { name: "Sunan an-Nasa'i", nameAr: 'سنن النسائي' }, ibnmajah: { name: 'Sunan Ibn Majah', nameAr: 'سنن ابن ماجه' },
};
export const COLLECTION_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const HADITH_NUMBER_RE = /^\d{1,6}(\.\d{1,3})?[a-z]?$/i;
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
export const LIMITS = { maxFileBytes: 120 * 1024 * 1024, maxRecords: 120000, maxText: 30000, maxShort: 400, maxRejectedRatio: 0.05, maxDuplicateRatio: 0.01 };
/** Documented native import format (also accepted: fawazahmed0 editions, AhmedBaset hadith-json, and a generic array). */
export const PACK_EXAMPLE = {
  schema: 'maar-hadith-pack', version: 1,
  collection: { id: 'bukhari', name: 'Sahih al-Bukhari', nameAr: 'صحيح البخاري' },
  edition: 'Name of the edition you are authorised to use', translator: 'Translator name (if any)', language: 'en',
  hadiths: [{ number: '1', book: { number: '1', name: 'Book name as printed in your edition' }, chapter: 'Chapter title (optional)', arabic: 'Arabic text (optional)', translations: { en: 'Translation text (optional)' }, narrator: 'optional', gradings: [{ grade: 'Sahih', authority: 'Name of the scholar who gave this grade' }] }],
};
export function gradeLevel(grade: string): GradeLevel {
  const g = grade.toLowerCase().replace(/[`’']/g, '').trim();
  if (/^(sahih|authentic)$/.test(g)) return 'sahih'; if (/^hasan$/.test(g)) return 'hasan'; if (/^(daif|dhaif|weak|da ?if)$/.test(g)) return 'daif'; if (/^(mawdu|maudu|fabricated)$/.test(g)) return 'mawdu';
  return 'other';
}
export function mkGrading(grade: unknown, authority: unknown): Grading | null {
  const g = typeof grade === 'string' ? grade.trim() : ''; if (!g) return null;
  const a = typeof authority === 'string' && authority.trim() && !/^(unknown|n\/a|none|-)$/i.test(authority.trim()) ? authority.trim() : null;
  return { grade: g, level: gradeLevel(g), authority: a };
}
export function statusOf(gs: Grading[]): GradingStatus { if (!gs.length) return 'ungraded'; return gs.some(g => g.authority) ? 'graded' : 'grade_without_authority'; }
export const GRADING_LABEL: Record<GradingStatus, string> = { graded: 'Grading recorded (with authority)', grade_without_authority: 'Grade recorded, authority not stated', ungraded: 'No authenticity grading in the installed data' };
