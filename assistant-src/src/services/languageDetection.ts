import { normalizeText } from '../knowledge/normalize';
export const LANGUAGES: Record<string, { name: string; native: string; rtl?: boolean; modelQuality: 'good' | 'limited' }> = {
  en: { name: 'English', native: 'English', modelQuality: 'good' }, ar: { name: 'Arabic', native: 'العربية', rtl: true, modelQuality: 'good' },
  bn: { name: 'Bengali', native: 'বাংলা', modelQuality: 'limited' }, ur: { name: 'Urdu', native: 'اردو', rtl: true, modelQuality: 'limited' },
  hi: { name: 'Hindi', native: 'हिन्दी', modelQuality: 'limited' }, tr: { name: 'Turkish', native: 'Türkçe', modelQuality: 'good' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia', modelQuality: 'good' }, ms: { name: 'Malay', native: 'Bahasa Melayu', modelQuality: 'good' },
  fa: { name: 'Persian', native: 'فارسی', rtl: true, modelQuality: 'limited' }, fr: { name: 'French', native: 'Français', modelQuality: 'good' },
  es: { name: 'Spanish', native: 'Español', modelQuality: 'good' }, de: { name: 'German', native: 'Deutsch', modelQuality: 'good' },
  pt: { name: 'Portuguese', native: 'Português', modelQuality: 'good' }, sw: { name: 'Swahili', native: 'Kiswahili', modelQuality: 'limited' },
  ru: { name: 'Russian', native: 'Русский', modelQuality: 'good' }, zh: { name: 'Chinese', native: '中文', modelQuality: 'good' },
};
const STOP: Record<string, string> = {
  en: 'the is are what how why does do can should about of and to in for with my me i you it this that was were have has will would', fr: 'le la les est une des que qui quoi comment pourquoi dans pour avec sur pas je tu nous vous', es: 'el los las es una que como por qué para con sobre mi tu nuestro pero cuál', de: 'der die das ist und nicht wie was warum ich du wir mit für über eine einen', pt: 'o os as é uma que como por para com sobre meu não você são', tr: 'bir ve bu için ne nasıl neden ile mı mi değil ben sen var', id: 'yang dan di ke dari ini itu apa bagaimana kenapa untuk dengan tidak saya adalah', ms: 'yang dan di ke dari ini itu apa bagaimana kenapa untuk dengan tidak saya adalah boleh', sw: 'na ya wa kwa ni katika hii kuhusu nini vipi kwa nini mimi wewe',
};
const ROMAN_BN = 'ki kemon keno kothay hoy hoye kora korbo korte noy nai achhe ache amar tomar apni namaj namaz roja jakat hok bolo bolun kibhabe islam e er ta ba o';
const ROMAN_UR = 'kya hai hain kaise kyun kyon mein ka ki ke ko se aur nahi nahin namaz roza zakat mujhe batao bataye kaisay';
const ROMAN_AR = 'ma hukm hal kayfa limatha kam fi min ila ala anna';
const sets = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));
const bnR = new Set(ROMAN_BN.split(' ')), urR = new Set(ROMAN_UR.split(' ')), arR = new Set(ROMAN_AR.split(' '));
export interface Detection { lang: string; confidence: number; script: string; romanised?: boolean; mixed?: boolean }
export function detectLanguage(text: string): Detection {
  const counts: Record<string, number> = {}; let letters = 0;
  for (const ch of text) { const c = ch.codePointAt(0)!; let s = '';
    if (c >= 0x0980 && c <= 0x09ff) s = 'bn'; else if (c >= 0x0900 && c <= 0x097f) s = 'hi'; else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f)) s = 'arab'; else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) s = 'zh'; else if (c >= 0x0400 && c <= 0x04ff) s = 'ru'; else if (/\p{L}/u.test(ch)) s = 'latin';
    if (s) { counts[s] = (counts[s] || 0) + 1; letters++; } }
  if (!letters) return { lang: 'en', confidence: 0, script: 'none' };
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; const mixed = Object.keys(counts).length > 1 && top[1] / letters < 0.9;
  if (top[0] === 'arab') {
    const urdu = (text.match(/[\u0679\u0688\u0691\u06BA\u06BE\u06C1\u06C3\u06D2]/g) || []).length; const fa = (text.match(/[\u067E\u0686\u0698\u06AF]/g) || []).length;
    const urWords = /(?<!\p{L})(کیا|ہے|ہیں|میں|کی|کو|سے|اور|ہوتا|ہوتی|کرنا|کریں)(?!\p{L})/u.test(text); const faWords = /(?<!\p{L})(است|چیست|می|را|که|این|چگونه|آیا|برای|های|دارد|نیست)(?!\p{L})/u.test(text);
    if (faWords && !urWords) return { lang: 'fa', confidence: 0.8, script: 'arab', mixed };
    if (urdu > 0 || urWords) return { lang: 'ur', confidence: 0.85, script: 'arab', mixed };
    if (fa > 0) return { lang: 'fa', confidence: 0.55, script: 'arab', mixed };
    return { lang: 'ar', confidence: 0.85, script: 'arab', mixed };
  }
  if (top[0] !== 'latin') return { lang: top[0], confidence: 0.9, script: top[0], mixed };
  const words = normalizeText(text).split(/[^\p{L}]+/u).filter(Boolean); const score: Record<string, number> = {};
  for (const w of words) { for (const [l, s] of Object.entries(sets)) if (s.has(w)) score[l] = (score[l] || 0) + 1; if (bnR.has(w)) score.bnr = (score.bnr || 0) + 1; if (urR.has(w)) score.urr = (score.urr || 0) + 1; if (arR.has(w)) score.arr = (score.arr || 0) + 1; }
  if (/[ğışİ]/i.test(text)) score.tr = (score.tr || 0) + 2; if (/[ñ¿¡]/.test(text)) score.es = (score.es || 0) + 2; if (/[äöüß]/i.test(text)) score.de = (score.de || 0) + 1; if (/[ãõ]/i.test(text)) score.pt = (score.pt || 0) + 2; if (/[éèêçàùô]/i.test(text)) score.fr = (score.fr || 0) + 1;
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return { lang: 'en', confidence: 0.3, script: 'latin', mixed };
  const conf = Math.min(0.95, 0.4 + best[1] / Math.max(3, words.length) * 1.5);
  if (best[0] === 'bnr') return { lang: 'bn', confidence: conf, script: 'latin', romanised: true, mixed };
  if (best[0] === 'urr') return { lang: 'ur', confidence: conf, script: 'latin', romanised: true, mixed };
  if (best[0] === 'arr' && best[1] >= 2) return { lang: 'ar', confidence: conf, script: 'latin', romanised: true, mixed };
  return { lang: best[0], confidence: conf, script: 'latin', mixed };
}
