export type LangCode = string;
export interface Chapter { n: number; ar: string; tr: string; en: string; type: string; verses: number; start: number }
export interface QuranManifestTranslation { key: string; lang: LangCode; label: string; title: string; version: string; direction: 'ltr' | 'rtl'; browse_url: string; terms_url: string; license: string; has_footnotes: boolean; file: string; bytes: number }
export interface QuranManifest { schema: string; dataVersion: number; ayahCount: number; surahCount: number; numbering: string; arabic: { source: string; license: string; license_url: string; files: string[]; note: string }; distribution: { repository: string; repository_license: string }; translations: QuranManifestTranslation[]; sha256: Record<string, string> }

export type GradeLevel = 'sahih' | 'hasan' | 'daif' | 'mawdu' | 'other';
export interface Grading { grade: string; level: GradeLevel; authority: string | null }
/** 'graded' = a grade AND its authority are recorded in the imported data.
 *  'grade_without_authority' = grade present, authority absent.  'ungraded' = no grading in the imported data. */
export type GradingStatus = 'graded' | 'grade_without_authority' | 'ungraded';
export interface HadithRecord {
  id: string; collection: string; number: string; numberSort: number;
  book: { number: string | null; name: string | null }; chapter: string | null;
  arabic: string | null; translations: Record<LangCode, string>; narrator: string | null;
  gradings: Grading[]; gradingStatus: GradingStatus; reference: string | null;
}
export interface HadithCollectionMeta {
  id: string; name: string; nameAr: string | null; edition: string | null; sources: HadithSourceInfo[];
  count: number; withArabic: number; withTranslation: Record<LangCode, number>; graded: number; gradeWithoutAuthority: number; ungraded: number; installedAt: number; updatedAt: number;
}
export interface HadithSourceInfo { importedAt: number; fileName: string; format: string; language: LangCode | null; sourceName: string; licence: string; authorisedByUser: true; translator: string | null; edition: string | null; recordCount: number }

export interface EvidenceQuran { kind: 'quran'; id: string; surah: number; ayah: number; index: number; score: number; matchedTerms: string[] }
export interface EvidenceHadith { kind: 'hadith'; id: string; collection: string; number: string; score: number; matchedTerms: string[] }
export type Evidence = EvidenceQuran | EvidenceHadith;

export interface Message {
  id: string; role: 'user' | 'assistant'; text: string; createdAt: number; lang?: LangCode;
  evidence?: Evidence[]; notes?: string[]; kind?: 'answer' | 'insufficient' | 'hadith-missing' | 'safety' | 'search-only';
}
export interface Conversation { id: string; title: string; createdAt: number; updatedAt: number; messages: Message[]; summary?: string }
export interface Bookmark { id: string; kind: 'quran' | 'hadith'; ref: string; label: string; createdAt: number }
export interface Settings { theme: 'auto' | 'light' | 'dark'; responseLang: 'auto' | LangCode; displayTranslation: Record<string, string>; modelId: 'auto' | string; autoDownloadModel: boolean; detail: 'short' | 'normal' | 'detailed' }
