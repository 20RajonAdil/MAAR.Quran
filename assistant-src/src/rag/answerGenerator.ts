import type { Chapter, Evidence, HadithRecord, Message, Settings } from '../types';
import type { SearchBackend } from '../knowledge/searchClient';
import { detectLanguage, LANGUAGES } from '../services/languageDetection';
import { isCrisis, CRISIS_MESSAGE } from '../services/safety';
import { retrieve } from './retrieval';
import { buildEvidenceBlock, type EvidenceSource } from './contextBuilder';
import { validateAnswer } from './citationValidator';
import { buildSystemPrompt } from '../ai/systemInstructions';
import { buildHistory, looksLikeFollowUp, type ChatMsg } from '../ai/conversation';
import { newId } from '../storage/conversationHistory';

export interface LLM { ready: boolean; generate(m: ChatMsg[], onToken: (t: string) => void, signal?: AbortSignal): Promise<string> }
export interface AnswerDeps { chapters: Chapter[]; ar: string[]; en: string[] | null; backend: SearchBackend; hadithInstalled: boolean; getHadith(id: string): HadithRecord | undefined; llm: LLM | null; settings: Pick<Settings, 'responseLang' | 'detail'> }
const MSG: Record<string, { insufficient: string; hadith: string; noModel: string }> = {
  en: { insufficient: 'I could not find enough relevant verses in the installed Quran text to answer this reliably, so I will not guess. Try rephrasing, name a topic (for example patience, prayer, fasting), or give a reference such as 2:255.', hadith: 'No Hadith collection is installed in this app yet, so I cannot answer from Hadith. You can import a Hadith dataset you are legally authorised to use from the Hadith tab. I can still help from the Quran.', noModel: 'The AI model is not loaded, so I am showing the verified Quran sources I found without an AI explanation.' },
  ar: { insufficient: 'لم أجد آيات كافية ذات صلة في النص المثبّت للإجابة بثقة، ولن أخمّن. جرّب إعادة الصياغة أو اذكر موضوعًا أو مرجعًا مثل 2:255.', hadith: 'لم يتم تثبيت أي مجموعة أحاديث بعد، لذلك لا يمكنني الإجابة من الحديث. يمكنك استيراد مجموعة بيانات مرخّص لك باستخدامها من تبويب الحديث. ما زلت أستطيع المساعدة من القرآن.', noModel: 'نموذج الذكاء الاصطناعي غير محمّل، لذلك أعرض المصادر القرآنية الموثّقة دون شرح.' },
  bn: { insufficient: 'ইনস্টল করা কুরআনের পাঠে এই প্রশ্নের নির্ভরযোগ্য উত্তরের জন্য যথেষ্ট প্রাসঙ্গিক আয়াত পাইনি, তাই আন্দাজ করছি না। অন্যভাবে লিখুন, কোনো বিষয় (যেমন ধৈর্য, নামাজ) বা 2:255 এর মতো রেফারেন্স দিন।', hadith: 'এখনো কোনো হাদিস সংকলন ইনস্টল করা নেই, তাই হাদিস থেকে উত্তর দিতে পারছি না। হাদিস ট্যাব থেকে আপনি যে ডেটাসেট ব্যবহারের বৈধ অনুমতি রাখেন তা ইমপোর্ট করতে পারেন। কুরআন থেকে আমি সাহায্য করতে পারি।', noModel: 'এআই মডেল লোড হয়নি, তাই ব্যাখ্যা ছাড়া যাচাইকৃত কুরআনের সূত্রগুলো দেখাচ্ছি।' },
  ur: { insufficient: 'نصب شدہ قرآنی متن میں اس سوال کے قابلِ اعتماد جواب کے لیے کافی متعلقہ آیات نہیں ملیں، اس لیے میں اندازہ نہیں لگاؤں گا۔ سوال دوبارہ لکھیں، کوئی موضوع (مثلاً صبر، نماز) یا 2:255 جیسا حوالہ دیں۔', hadith: 'ابھی کوئی حدیث مجموعہ نصب نہیں ہے، اس لیے میں حدیث سے جواب نہیں دے سکتا۔ حدیث ٹیب سے وہ ڈیٹا سیٹ امپورٹ کریں جسے استعمال کرنے کی آپ کو قانونی اجازت ہے۔ میں قرآن سے مدد کر سکتا ہوں۔', noModel: 'اے آئی ماڈل لوڈ نہیں ہے، اس لیے وضاحت کے بغیر تصدیق شدہ قرآنی ماخذ دکھا رہا ہوں۔' },
  fr: { insufficient: 'Je n\'ai pas trouvé assez de versets pertinents dans le texte du Coran installé pour répondre de façon fiable, donc je ne vais pas deviner. Reformulez, nommez un thème (patience, prière…) ou donnez une référence comme 2:255.', hadith: 'Aucun recueil de hadiths n\'est installé, je ne peux donc pas répondre à partir des hadiths. Vous pouvez importer un jeu de données que vous avez le droit d\'utiliser depuis l\'onglet Hadith. Je peux toutefois aider avec le Coran.', noModel: 'Le modèle d\'IA n\'est pas chargé ; je montre les sources coraniques vérifiées sans explication.' },
  es: { insufficient: 'No encontré suficientes versículos relevantes en el texto coránico instalado para responder con fiabilidad, así que no voy a adivinar. Reformula, indica un tema (paciencia, oración…) o una referencia como 2:255.', hadith: 'Aún no hay ninguna colección de hadices instalada, así que no puedo responder desde los hadices. Puedes importar un conjunto de datos que estés autorizado a usar desde la pestaña Hadith. Sí puedo ayudar con el Corán.', noModel: 'El modelo de IA no está cargado; muestro las fuentes coránicas verificadas sin explicación.' },
  tr: { insufficient: 'Yüklü Kur\'an metninde güvenilir bir cevap için yeterli ilgili ayet bulamadım, bu yüzden tahmin yürütmeyeceğim. Soruyu yeniden yazın, bir konu (sabır, namaz…) ya da 2:255 gibi bir referans verin.', hadith: 'Henüz hiçbir hadis koleksiyonu yüklü değil, bu yüzden hadislerden cevap veremem. Hadis sekmesinden kullanma yetkiniz olan bir veri setini içe aktarabilirsiniz. Kur\'an\'dan yardımcı olabilirim.', noModel: 'Yapay zekâ modeli yüklü değil; doğrulanmış Kur\'an kaynaklarını açıklama olmadan gösteriyorum.' },
  id: { insufficient: 'Saya tidak menemukan cukup ayat yang relevan dalam teks Al-Qur\'an terpasang untuk menjawab dengan andal, jadi saya tidak akan menebak. Coba tulis ulang, sebut topik (sabar, shalat…) atau rujukan seperti 2:255.', hadith: 'Belum ada koleksi hadis yang terpasang, jadi saya tidak dapat menjawab dari hadis. Anda dapat mengimpor dataset yang sah Anda gunakan dari tab Hadith. Saya tetap dapat membantu dari Al-Qur\'an.', noModel: 'Model AI belum dimuat; saya menampilkan sumber Al-Qur\'an terverifikasi tanpa penjelasan.' },
  de: { insufficient: 'Ich habe im installierten Koran-Text nicht genug passende Verse gefunden, um verlässlich zu antworten, und werde nicht raten. Formuliere um, nenne ein Thema (Geduld, Gebet …) oder eine Stelle wie 2:255.', hadith: 'Es ist noch keine Hadith-Sammlung installiert, daher kann ich nicht aus den Hadithen antworten. Du kannst im Hadith-Tab einen Datensatz importieren, den du rechtmäßig nutzen darfst. Aus dem Koran kann ich helfen.', noModel: 'Das KI-Modell ist nicht geladen; ich zeige die geprüften Koran-Quellen ohne Erklärung.' },
};
const text = (lang: string) => MSG[lang] ?? MSG.en;
const WANTS_HADITH = /(hadith|hadis|ahadith|sunnah|bukhari|muslim collection|tirmidhi|abu dawud|حديث|أحاديث|হাদিস|হাদীস|حدیث|हदीस)/i;

export async function answerQuestion(question: string, history: Message[], d: AnswerDeps, onToken: (t: string) => void, signal?: AbortSignal): Promise<Message> {
  const det = detectLanguage(question); const lang = d.settings.responseLang === 'auto' ? (det.confidence < 0.35 ? history.filter(m => m.lang).at(-1)?.lang ?? det.lang : det.lang) : d.settings.responseLang;
  const mk = (kind: Message['kind'], t: string, evidence?: Evidence[], notes?: string[]): Message => ({ id: newId(), role: 'assistant', text: t, createdAt: Date.now(), lang, kind, evidence, notes });
  if (isCrisis(question)) return mk('safety', CRISIS_MESSAGE);
  const r = await retrieve(question, d.chapters, d.backend, d.hadithInstalled);
  const wantsHadith = WANTS_HADITH.test(question);
  if (wantsHadith && !d.hadithInstalled) return mk('hadith-missing', text(lang).hadith, r.strongQuran ? r.quran : undefined);
  let quran = r.quran; let hadith = r.hadith; let strong = r.strongQuran || (d.hadithInstalled && r.strongHadith);
  if (looksLikeFollowUp(question) && !r.explicitRefs && r.topics.length === 0) { const prev = [...history].reverse().find(m => m.role === 'assistant' && m.evidence?.length); if (prev) { quran = prev.evidence!.filter(e => e.kind === 'quran') as any; hadith = prev.evidence!.filter(e => e.kind === 'hadith') as any; strong = true; } }
  if (!strong) return mk('insufficient', text(lang).insufficient);
  const useHadith = d.hadithInstalled && (hadith.length > 0);
  const src: EvidenceSource = { chapters: d.chapters, ar: d.ar, en: d.en, getHadith: d.getHadith };
  const { block, used } = buildEvidenceBlock([...quran, ...(useHadith ? hadith : [])], src);
  if (!used.length) return mk('insufficient', text(lang).insufficient);
  if (!d.llm || !d.llm.ready) return mk('search-only', text(lang).noModel, used);
  const { history: h, summary } = buildHistory(history);
  const user = `EVIDENCE:\n${block}\n\n${useHadith ? '' : 'NO HADITH EVIDENCE IS AVAILABLE for this question: do not mention Hadith.\n\n'}${summary ? summary + '\n\n' : ''}QUESTION: ${question}`;
  const msgs: ChatMsg[] = [{ role: 'system', content: buildSystemPrompt(lang, d.settings.detail, useHadith) }, ...h, { role: 'user', content: user }];
  const raw = await d.llm.generate(msgs, onToken, signal);
  const v = validateAnswer(raw, used, { hadithInstalled: d.hadithInstalled, hasHadithEvidence: used.some(e => e.kind === 'hadith'), lang });
  const notes = [...v.notes]; if (LANGUAGES[lang]?.modelQuality === 'limited') notes.push(`The local model's ${LANGUAGES[lang].name} is limited. Check the explanation against the source cards (verified text) below.`);
  const final = v.text || text(lang).insufficient; return { ...mk('answer', final, used, notes) };
}
