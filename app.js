/* ============================================================
   QURAN MAAR v6.0 — app.js
   Real React (via ESM + htm — no build step, no Babel-in-browser,
   so first paint stays fast on mobile). Ported data/APIs from v4
   so every reciter, translation and prayer/hadith source keeps
   working exactly as before, behind an all-new UI.
   ============================================================ */
/* Loaded as classic (non-module) scripts so the app also runs
   correctly when index.html is opened directly via file:// —
   ES module imports are blocked by browsers under file:// for
   CORS reasons, which is why nothing rendered before this fix.
   React, ReactDOM and htm are loaded as globals ahead of this file. */
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const html = htm.bind(React.createElement);
/* New-feature components live in features.js (window.QMX). If that file
   ever fails to load, these fall back to rendering nothing so the rest
   of the app keeps working. */
const QMX_NOOP = () => null;
const QMXC = (name) => (window.QMX && window.QMX[name]) || QMX_NOOP;

/* ---------------------------------------------------------------
   0. AMBIENT BACKGROUND — twinkling starfield + drifting gold glow.
   Plain canvas, mounted once, independent of React's render cycle.
--------------------------------------------------------------- */
(function ambientSky(){
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, DPR, stars = [], t = 0;

  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const count = Math.round((W * H) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.9,
      r: Math.random() * 1.1 + 0.25,
      tw: Math.random() * Math.PI * 2,
      sp: 0.4 + Math.random() * 0.9,
    }));
  }

  function draw(){
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const a = reduceMotion ? 0.55 : 0.25 + Math.abs(Math.sin(s.tw + t * s.sp * 0.01)) * 0.65;
      ctx.beginPath();
      ctx.fillStyle = `rgba(245,242,237,${a.toFixed(3)})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    t += 1;
    if (!reduceMotion) requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  draw();
})();

/* ---------------------------------------------------------------
   1. DATA — ported 1:1 from the existing v4 engine.
--------------------------------------------------------------- */
const QURAN_API = 'https://api.alquran.cloud/v1';
const ARABIC_EDITION = 'quran-uthmani';

/* Guards the silent background text save below so two triggers (e.g. an
   'online' event firing while the mount timer is still pending) can't
   both start fetching all 114 surahs at once. */
let _autoTextSaveInFlight = false;
let _autoHadithSaveInFlight = false;
const AUDIO_EDITION = 'ar.alafasy';
const BISMILLAH_AR = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const BISMILLAH_EN = 'In the name of Allah, the Most Gracious, the Most Merciful';
/* Diacritic- and alef-variant-tolerant matcher: the Uthmani text the API
   returns can use ٱ/ا/أ/إ interchangeably and stacks harakat (diacritics)
   right on the letters, so a literal string match against one exact
   Unicode form silently fails and leaves the Bismillah duplicated inside
   ayah 1's own text — this builds a pattern that matches regardless. */
function qmLenientArabicPattern(word){
  const DIAC = '[\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640]*';
  return [...word].map((ch) => (ch === 'ا' ? '[اٱأإ]' : ch) + DIAC).join('');
}
const BISMILLAH_STRIP_RE = new RegExp('^' + ['بسم', 'الله', 'الرحمن', 'الرحيم'].map(qmLenientArabicPattern).join('\\s*') + '\\s*');
const HADITH_CDN = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const KAABA = { lat: 21.4225, lon: 39.8262 };

const audioUrl = (ayahGlobalNumber, edition = AUDIO_EDITION) =>
  `https://cdn.islamic.network/quran/audio/128/${edition}/${ayahGlobalNumber}.mp3`;

const SHAKIR_QASMI_SURAH_AUDIO = {
  1:'https://archive.org/download/QuranByQariShakirQasmi/Surah001Al-fateha-TheOpening.mp3',
  2:'https://archive.org/download/QuranByQariShakirQasmi/Surah002Al-baqarah-TheCow.mp3',
  3:'https://archive.org/download/QuranByQariShakirQasmi/Surah003Aal-e-imran-TheFamilyOfImran.mp3',
  4:'https://archive.org/download/QuranByQariShakirQasmi/Surah004An-nisa-Women.mp3',
  5:'https://archive.org/download/QuranByQariShakirQasmi/Surah005Al-maedah-TheTableSpread.mp3',
  6:'https://archive.org/download/QuranByQariShakirQasmi/Surah006Al-anaam-Livestock.mp3',
  7:'https://archive.org/download/QuranByQariShakirQasmi/Surah007Al-aaraaf-TheHeights.mp3',
  8:'https://archive.org/download/QuranByQariShakirQasmi/Surah008Al-anfal-SpoilsOfWar.mp3',
  9:'https://archive.org/download/QuranByQariShakirQasmi/Surah009At-tawba-Repentance.mp3',
  10:'https://archive.org/download/QuranByQariShakirQasmi/Surah010Yunus-Jonah.mp3',
  11:'https://archive.org/download/QuranByQariShakirQasmi/Surah011Hood-Hud.mp3',
  12:'https://archive.org/download/QuranByQariShakirQasmi/Surah012Yusuf-Joseph.mp3',
  13:'https://archive.org/download/QuranByQariShakirQasmi/Surah013Ar-raad-TheThunder.mp3',
  14:'https://archive.org/download/QuranByQariShakirQasmi/Surah014Ibrahim-Abraham.mp3',
  15:'https://archive.org/download/QuranByQariShakirQasmi/Surah015Al-hijr-StoneLand.mp3',
  16:'https://archive.org/download/QuranByQariShakirQasmi/Surah016An-nahl-TheBee.mp3',
  17:'https://archive.org/download/QuranByQariShakirQasmi/Surah017BaniIsraeel-ChildrenOfIsrael.mp3',
  18:'https://archive.org/download/QuranByQariShakirQasmi/Surah018Al-kahf-TheCave.mp3',
  19:'https://archive.org/download/QuranByQariShakirQasmi/Surah019Maryam-Mary.mp3',
  20:'https://archive.org/download/QuranByQariShakirQasmi/Surah020TaHa-TaHa.mp3',
  21:'https://archive.org/download/QuranByQariShakirQasmi/Surah021Al-ambiya-TheProphets.mp3',
  22:'https://archive.org/download/QuranByQariShakirQasmi/Surah022Al-hajj-ThePilgrimage.mp3',
  23:'https://archive.org/download/QuranByQariShakirQasmi/Surah023Al-momenoon-TheBelievers.mp3',
  24:'https://archive.org/download/QuranByQariShakirQasmi/Surah024An-noor-TheLight.mp3',
  25:'https://archive.org/download/QuranByQariShakirQasmi/Surah025Al-furqan-TheCriterion.mp3',
  26:'https://archive.org/download/QuranByQariShakirQasmi/Surah026Ash-shuara-ThePoets.mp3',
  27:'https://archive.org/download/QuranByQariShakirQasmi/Surah027An-naml-TheAnt.mp3',
  28:'https://archive.org/download/QuranByQariShakirQasmi/Surah028Al-qasas-TheStory.mp3',
  29:'https://archive.org/download/QuranByQariShakirQasmi/Surah029Al-ankaboot-TheSpider.mp3',
  30:'https://archive.org/download/QuranByQariShakirQasmi/Surah030Ar-room-TheRomans.mp3',
  31:'https://archive.org/download/QuranByQariShakirQasmi/Surah031Luqman-Luqman.mp3',
  32:'https://archive.org/download/QuranByQariShakirQasmi/Surah032As-sajda-TheProstration.mp3',
  33:'https://archive.org/download/QuranByQariShakirQasmi/Surah033Al-ahzab-TheClans.mp3',
  34:'https://archive.org/download/QuranByQariShakirQasmi/Surah034Saba-Sheba.mp3',
  35:'https://archive.org/download/QuranByQariShakirQasmi/Surah035Fatir-TheOriginatorOfCreation.mp3',
  36:'https://archive.org/download/QuranByQariShakirQasmi/Surah036YaSeen-YaSin.mp3',
  37:'https://archive.org/download/QuranByQariShakirQasmi/Surah037As-saffaat-DrawnUpInRanks.mp3',
  38:'https://archive.org/download/QuranByQariShakirQasmi/Surah038Saad-ArabicLettersaad.mp3',
  39:'https://archive.org/download/QuranByQariShakirQasmi/Surah039Az-zumar-TheTroops.mp3',
  40:'https://archive.org/download/QuranByQariShakirQasmi/Surah040Al-momin-TheBeliever.mp3',
  41:'https://archive.org/download/QuranByQariShakirQasmi/Surah041Haameem-HaMim.mp3',
  42:'https://archive.org/download/QuranByQariShakirQasmi/Surah042Ash-shoora-Consultation.mp3',
  43:'https://archive.org/download/QuranByQariShakirQasmi/Surah043Az-zukhruf-OrnamentsOfGold.mp3',
  44:'https://archive.org/download/QuranByQariShakirQasmi/Surah044Ad-dukhan-Smoke.mp3',
  45:'https://archive.org/download/QuranByQariShakirQasmi/Surah045Al-jaseyah-Crouching.mp3',
  46:'https://archive.org/download/QuranByQariShakirQasmi/Surah046Al-ahqaf-TheDunes.mp3',
  47:'https://archive.org/download/QuranByQariShakirQasmi/Surah047Muhammad-Mohammed.mp3',
  48:'https://archive.org/download/QuranByQariShakirQasmi/Surah048Al-fatah-Victory.mp3',
  49:'https://archive.org/download/QuranByQariShakirQasmi/Surah049Al-hujurat-ThePrivateAppartments.mp3',
  50:'https://archive.org/download/QuranByQariShakirQasmi/Surah050Qaaf-ArabicLetterqaaf.mp3',
  51:'https://archive.org/download/QuranByQariShakirQasmi/Surah051Az-zariat-TheWinnowingWinds.mp3',
  52:'https://archive.org/download/QuranByQariShakirQasmi/Surah052At-toor-TheMount.mp3',
  53:'https://archive.org/download/QuranByQariShakirQasmi/Surah053An-najm-TheStar.mp3',
  54:'https://archive.org/download/QuranByQariShakirQasmi/Surah054Al-qamar-TheMoon.mp3',
  55:'https://archive.org/download/QuranByQariShakirQasmi/Surah055Ar-rahman-TheBeneficient.mp3',
  56:'https://archive.org/download/QuranByQariShakirQasmi/Surah056Al-waqia-TheEvent.mp3',
  57:'https://archive.org/download/QuranByQariShakirQasmi/Surah057Al-hadeed-TheIron.mp3',
  58:'https://archive.org/download/QuranByQariShakirQasmi/Surah058Al-mujadila-SheThatDisputeth.mp3',
  59:'https://archive.org/download/QuranByQariShakirQasmi/Surah059Al-hashr-Exile.mp3',
  60:'https://archive.org/download/QuranByQariShakirQasmi/Surah060Al-mumtahina-ExaminingHer.mp3',
  61:'https://archive.org/download/QuranByQariShakirQasmi/Surah061As-saf-TheRanks.mp3',
  62:'https://archive.org/download/QuranByQariShakirQasmi/Surah062Jummah-TheCongregation.mp3',
  63:'https://archive.org/download/QuranByQariShakirQasmi/Surah063Al-munafiqoon-TheHypocrites.mp3',
  64:'https://archive.org/download/QuranByQariShakirQasmi/Surah064At-tagabun-MutualDisillusion.mp3',
  65:'https://archive.org/download/QuranByQariShakirQasmi/Surah065At-talaq-Divorce.mp3',
  66:'https://archive.org/download/QuranByQariShakirQasmi/Surah066At-tahreem-Prohibition.mp3',
  67:'https://archive.org/download/QuranByQariShakirQasmi/Surah067Al-mulk-TheSovereignty.mp3',
  68:'https://archive.org/download/QuranByQariShakirQasmi/Surah068Al-qalam-ThePen.mp3',
  69:'https://archive.org/download/QuranByQariShakirQasmi/Surah069Al-haaqah-TheReality.mp3',
  70:'https://archive.org/download/QuranByQariShakirQasmi/Surah070Al-maarij-TheAscendingStairways.mp3',
  71:'https://archive.org/download/QuranByQariShakirQasmi/Surah071Nuh-Noah.mp3',
  72:'https://archive.org/download/QuranByQariShakirQasmi/Surah072Al-jinn-TheJinn.mp3',
  73:'https://archive.org/download/QuranByQariShakirQasmi/Surah073Al-muzammil-TheEnshroudedOne.mp3',
  74:'https://archive.org/download/QuranByQariShakirQasmi/Surah074Al-muddassir-TheCloakedOne.mp3',
  75:'https://archive.org/download/QuranByQariShakirQasmi/Surah075Al-qiyama-TheResurrection.mp3',
  76:'https://archive.org/download/QuranByQariShakirQasmi/Surah076Al-insan-Man.mp3',
  77:'https://archive.org/download/QuranByQariShakirQasmi/Surah077Al-mursalat-TheEmissaries.mp3',
  78:'https://archive.org/download/QuranByQariShakirQasmi/Surah078An-naba-TheTidings.mp3',
  79:'https://archive.org/download/QuranByQariShakirQasmi/Surah079An-naziat-ThoseWhoDragForth.mp3',
  80:'https://archive.org/download/QuranByQariShakirQasmi/Surah080Abasa-HeFrowned.mp3',
  81:'https://archive.org/download/QuranByQariShakirQasmi/Surah081At-takwir-TheOverthrowing.mp3',
  82:'https://archive.org/download/QuranByQariShakirQasmi/Surah082Al-infitar-TheCleaving.mp3',
  83:'https://archive.org/download/QuranByQariShakirQasmi/Surah083Al-mutaffifin-Defrauding.mp3',
  84:'https://archive.org/download/QuranByQariShakirQasmi/Surah084Al-inshiqaq-TheSundering.mp3',
  85:'https://archive.org/download/QuranByQariShakirQasmi/Surah085Al-burooj-TheMansionsOfTheStars.mp3',
  86:'https://archive.org/download/QuranByQariShakirQasmi/Surah086At-tariq-TheMorningStar1.mp3',
  87:'https://archive.org/download/QuranByQariShakirQasmi/Surah087Al-ala-TheMostHigh.mp3',
  88:'https://archive.org/download/QuranByQariShakirQasmi/Surah088Al-ghashiya-TheOverwhelming.mp3',
  89:'https://archive.org/download/QuranByQariShakirQasmi/Surah089Al-fajr-TheDawn.mp3',
  90:'https://archive.org/download/QuranByQariShakirQasmi/Surah090Al-balad-TheCity.mp3',
  91:'https://archive.org/download/QuranByQariShakirQasmi/Surah091Ash-shams-TheSun.mp3',
  92:'https://archive.org/download/QuranByQariShakirQasmi/Surah092Al-lail-TheNight.mp3',
  93:'https://archive.org/download/QuranByQariShakirQasmi/Surah093Ad-dhuha-TheMorningHours.mp3',
  94:'https://archive.org/download/QuranByQariShakirQasmi/Surah094AlmNashra-Solace.mp3',
  95:'https://archive.org/download/QuranByQariShakirQasmi/Surah095At-tin-TheFig.mp3',
  96:'https://archive.org/download/QuranByQariShakirQasmi/Surah096Al-alaq-TheClot.mp3',
  97:'https://archive.org/download/QuranByQariShakirQasmi/Surah097Al-qadr-Power.mp3',
  98:'https://archive.org/download/QuranByQariShakirQasmi/Surah098Al-bayyina-TheClearProof.mp3',
  99:'https://archive.org/download/QuranByQariShakirQasmi/Surah099Az-zalzala-TheEarthquake.mp3',
  100:'https://archive.org/download/QuranByQariShakirQasmi/Surah100Al-adiyat-TheCoursers.mp3',
  101:'https://archive.org/download/QuranByQariShakirQasmi/Surah101Al-qaria-TheCalamity.mp3',
  102:'https://archive.org/download/QuranByQariShakirQasmi/Surah102At-takathur-Competition.mp3',
  103:'https://archive.org/download/QuranByQariShakirQasmi/Surah103Al-asr-TheDecliningDay.mp3',
  104:'https://archive.org/download/QuranByQariShakirQasmi/Surah104Al-humaza-TheTraducer.mp3',
  105:'https://archive.org/download/QuranByQariShakirQasmi/Surah105Al-fil-TheElephant.mp3',
  106:'https://archive.org/download/QuranByQariShakirQasmi/Surah106Quraish-Quraysh.mp3',
  107:'https://archive.org/download/QuranByQariShakirQasmi/Surah107Al-maun-SmallKindnesses.mp3',
  108:'https://archive.org/download/QuranByQariShakirQasmi/Surah108Al-kauther-Abundance.mp3',
  109:'https://archive.org/download/QuranByQariShakirQasmi/Surah109Al-kafiroon-TheDisbelievers.mp3',
  110:'https://archive.org/download/QuranByQariShakirQasmi/Surah110An-nasr-DivineSupport.mp3',
  111:'https://archive.org/download/QuranByQariShakirQasmi/Surah111Al-masadd-TheFlame.mp3',
  112:'https://archive.org/download/QuranByQariShakirQasmi/Surah112Al-ikhlas-TheUnityOfGod.mp3',
  113:'https://archive.org/download/QuranByQariShakirQasmi/Surah113Al-falaq-TheDaybreak.mp3',
  114:'https://archive.org/download/QuranByQariShakirQasmi/Surah114An-nas-Mankind.mp3',
};

const MOSSAD_SURAH_AUDIO = {
  29:'https://archive.org/download/abdulrahman-mosad/029%20Al-Ankabut%20%D8%A7%D9%84%D8%B9%D9%86%D9%83%D8%A8%D9%88%D8%AA.mp3',
  32:'https://archive.org/download/abdulrahman-mosad/032%20As-Sajdah%20%D8%A7%D9%84%D8%B3%D8%AC%D8%AF%D8%A9.mp3',
  49:'https://archive.org/download/abdulrahman-mosad/049%20Al-Hujurat%20%D8%A7%D9%84%D8%AD%D8%AC%D8%B1%D8%A7%D8%AA.mp3',
  73:'https://archive.org/download/abdulrahman-mosad/073%20Al-Muzzammil%20%D8%A7%D9%84%D9%85%D8%B2%D9%85%D9%84.mp3',
  78:'https://archive.org/download/abdulrahman-mosad/078%20An-Naba%20%D8%A7%D9%84%D9%86%D8%A8%D8%A3.mp3',
  87:'https://archive.org/download/abdulrahman-mosad/087%20Al-Ala%20%D8%A7%D9%84%D8%A3%D8%B9%D9%84%D9%89.mp3',
  88:'https://archive.org/download/abdulrahman-mosad/088%20Al-Ghashiyah%20%D8%A7%D9%84%D8%BA%D8%A7%D8%B4%D9%8A%D8%A9.mp3',
  100:'https://archive.org/download/abdulrahman-mosad/100%20Al-Adiyat%20%D8%A7%D9%84%D8%B9%D8%A7%D8%AF%D9%8A%D8%A7%D8%AA.mp3',
  107:'https://archive.org/download/abdulrahman-mosad/107%20Al-Ma%27un%20%D8%A7%D9%84%D9%85%D8%A7%D8%B9%D9%88%D9%86.mp3',
};

const RECITERS = [
  { id:'alafasy', name:'Mishary Rashid Al-Afasy', sub:'Kuwait · clear Murattal recitation (default)', source:'cdn', edition:'ar.alafasy', ayah:true, tag:'' },
  { id:'shakirqasmi', name:'Qari Shakir Qasmi', sub:'Pakistan · complete surah recordings', source:'archive-shakir', ayah:false, surahOnly:true, tag:'Featured' },
  { id:'husary', name:'Sheikh Mahmoud Khalil Al-Husary', sub:'Egypt · classic, measured Murattal style', source:'cdn', edition:'ar.husary', ayah:true, tag:'' },
  { id:'minshawi', name:'Sheikh Mohamed Siddiq Al-Minshawi', sub:'Egypt · gentle, melodic Murattal style', source:'cdn', edition:'ar.minshawi', ayah:true, tag:'' },
  { id:'mossad', name:'Sheikh Abdul Rahman Mossad', sub:'Egypt · complete recordings of 9 surahs', source:'archive-mossad', ayah:false, surahOnly:true, tag:'' },
];
const getReciter = (id) => RECITERS.find(r => r.id === id) || RECITERS[0];

function ayahAudioForReciter(reciterId, globalAyahNumber){
  const r = getReciter(reciterId);
  const edition = (r.ayah && r.source === 'cdn' && r.edition) ? r.edition : AUDIO_EDITION;
  return audioUrl(globalAyahNumber, edition);
}
function surahAudioForReciter(reciterId, surahNumber){
  const r = getReciter(reciterId);
  if (r.source === 'archive-shakir') return SHAKIR_QASMI_SURAH_AUDIO[surahNumber] || null;
  if (r.source === 'archive-mossad') return MOSSAD_SURAH_AUDIO[surahNumber] || null;
  const edition = r.edition || AUDIO_EDITION;
  return `https://cdn.islamic.network/quran/audio-surah/128/${edition}/${surahNumber}.mp3`;
}

/* ---------------------------------------------------------------
   1b. OFFLINE DOWNLOADS — bridge between the UI and QMOffline.

   Two shapes of recitation exist in this app and they download very
   differently, so the URL list is resolved per reciter:
     · surah-only reciters (Shakir Qasmi, Mossad) = ONE mp3.
     · per-ayah reciters (Al-Afasy, Al-Husary, Al-Minshawi) = one mp3
       per verse, so Al-Baqarah alone is 286 separate files.
   The per-ayah global verse numbers aren't derivable from the surah
   list, so they're read from the same API the reader already uses —
   which has the useful side effect of warming the offline text cache
   for that surah at the same time.
--------------------------------------------------------------- */
async function resolveRecitationUrls(reciter, surah){
  if (reciter.surahOnly || !reciter.ayah) {
    const u = surahAudioForReciter(reciter.id, surah.number);
    return u ? [u] : [];
  }
  const res = await fetch(`${QURAN_API}/surah/${surah.number}/${ARABIC_EDITION}`);
  const j = await res.json();
  const ayahs = (j.data && j.data.ayahs) || [];
  return ayahs.map((a) => ayahAudioForReciter(reciter.id, a.number));
}

/* Single source of truth for download state, shared by every button on
   screen plus the Offline tab, so downloading from the surah grid
   instantly updates the reader and the manager. */
function useDownloads(){
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(() => {
    if (!window.QMOffline) return;
    window.QMOffline.listDownloads().then((d) => { setItems(d); setReady(true); }).catch(() => setReady(true));
  }, []);
  useEffect(() => {
    refresh();
    if (!window.QMOffline) return;
    return window.QMOffline.subscribe(refresh);
  }, [refresh]);
  return { items, ready, refresh };
}

function useOnlineStatus(){
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

const LANGUAGES = [
  { code:'en', label:'English', edition:'en.sahih' },
  { code:'bn', label:'Bangla', edition:'bn.bengali' },
  { code:'zh', label:'Chinese (Simplified)', edition:'zh.jian' },
  { code:'hi', label:'Hindi', edition:'hi.hindi' },
  { code:'ur', label:'Urdu', edition:'ur.jalandhry' },
  { code:'es', label:'Spanish', edition:'es.cortes' },
  { code:'fr', label:'French', edition:'fr.hamidullah' },
  { code:'id', label:'Indonesian', edition:'id.indonesian' },
  { code:'tr', label:'Turkish', edition:'tr.diyanet' },
  { code:'ru', label:'Russian', edition:'ru.kuliev' },
  { code:'ms', label:'Malay', edition:'ms.basmeih' },
  { code:'fa', label:'Persian (Farsi)', edition:'fa.makarem' },
  { code:'it', label:'Italian', edition:'it.piccardo' },
  { code:'ja', label:'Japanese', edition:'ja.japanese' },
  { code:'ko', label:'Korean', edition:'ko.korean' },
  { code:'th', label:'Thai', edition:'th.thai' },
  { code:'sw', label:'Swahili', edition:'sw.barwani' },
  { code:'ta', label:'Tamil', edition:'ta.tamil' },
  { code:'ml', label:'Malayalam', edition:'ml.abdulhameed' },
  { code:'de', label:'German', edition:'de.bubenheim' },
];

const ARABIC_FONTS = [
  { label:'Noto Naskh Arabic', stack:"'Noto Naskh Arabic','Amiri',serif" },
  { label:'Amiri', stack:"'Amiri',serif" },
  { label:'Amiri Quran', stack:"'Amiri Quran','Amiri',serif" },
  { label:'Scheherazade New', stack:"'Scheherazade New','Amiri',serif" },
  { label:'Lateef', stack:"'Lateef','Amiri',serif" },
  { label:'Reem Kufi', stack:"'Reem Kufi',sans-serif" },
  { label:'Aref Ruqaa', stack:"'Aref Ruqaa',serif" },
  { label:'Harmattan', stack:"'Harmattan',sans-serif" },
  { label:'Markazi Text', stack:"'Markazi Text',serif" },
  { label:'Cairo', stack:"'Cairo',sans-serif" },
  { label:'Rakkas', stack:"'Rakkas',cursive" },
];

const HADITH_COLLECTIONS = [
  { id:'bukhari', name:'Sahih al-Bukhari', sections:97 },
  { id:'muslim', name:'Sahih Muslim', sections:56 },
  { id:'abudawud', name:'Sunan Abu Dawood', sections:43 },
  { id:'tirmidhi', name:'Jami At-Tirmidhi', sections:49 },
  { id:'nasai', name:"Sunan an-Nasa'i", sections:51 },
  { id:'ibnmajah', name:'Sunan Ibn Majah', sections:37 },
];
const HADITH_LANG_PREFIXES = [
  { prefix:'eng', label:'English' },
  { prefix:'ara', label:'Arabic' },
  { prefix:'ben', label:'Bangla' },
  { prefix:'urd', label:'Urdu' },
  { prefix:'fra', label:'French' },
  { prefix:'ind', label:'Indonesian' },
  { prefix:'rus', label:'Russian' },
  { prefix:'tur', label:'Turkish' },
  { prefix:'tam', label:'Tamil' },
];
const HADITH_LANGS_BY_COLLECTION = {
  bukhari:  ['eng','ara','ben','urd','fra','ind','rus','tam','tur'],
  muslim:   ['eng','ara','ben','urd','fra','ind','rus','tam','tur'],
  abudawud: ['eng','ara','ben','urd','fra','ind','rus','tur'],
  tirmidhi: ['eng','ara','ben','urd','ind','tur'],
  nasai:    ['eng','ara','ben','urd','fra','ind','tur'],
  ibnmajah: ['eng','ara','ben','urd','fra','ind','tur'],
};

/* Small illustrative glyph per surah, echoing its meaning — kept from
   the "manuscript" direction, redrawn to fit the new arch cards. */
const SURAH_GLYPH = {
  1:'◇', 2:'𓃵', 6:'ᛉ', 12:'☾', 16:'✳', 18:'⛰', 19:'✦', 21:'✺', 27:'ﭞ',
  29:'🕸', 36:'❖', 55:'✦', 67:'✷', 71:'❋', 89:'☀', 91:'☉', 93:'☾', 105:'✺',
  112:'◈', 113:'✧', 114:'✧',
};
const glyphFor = (n) => SURAH_GLYPH[n] || '۩';

/* 12-hour clock formatting, e.g. "05:32" -> "5:32 AM" */
function to12h(hhmm){
  if (!hhmm) return '--';
  const [hStr, mStr] = String(hhmm).split(':');
  let h = parseInt(hStr, 10);
  const m = (mStr || '00').padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

/* ---------- moon position (simplified geocentric formulas, same
   public astronomical approach SunCalc itself is built on) ---------- */
const MOONPOS = (() => {
  const rad = Math.PI / 180;
  const dayMs = 1000 * 60 * 60 * 24;
  const J1970 = 2440588, J2000 = 2451545;
  const toDays = (date) => date.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(23.4397 * rad) - Math.tan(b) * Math.sin(23.4397 * rad), Math.cos(l));
  const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(23.4397 * rad) + Math.cos(b) * Math.sin(23.4397 * rad) * Math.sin(l));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));

  function moonCoords(d){
    const L = rad * (218.316 + 13.176396 * d);
    const M = rad * (134.963 + 13.064993 * d);
    const F = rad * (93.272 + 13.229350 * d);
    const l = L + rad * 6.289 * Math.sin(M);
    const b = rad * 5.128 * Math.sin(F);
    const dt = 385001 - 20905 * Math.cos(M);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
  }

  return function getMoonPosition(date, lat, lon){
    const lw = rad * -lon, phi = rad * lat;
    const d = toDays(date);
    const c = moonCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    let alt = altitude(H, phi, c.dec);
    const az = azimuth(H, phi, c.dec) + Math.PI; // azimuth from north, clockwise
    const pAlt = 0.017 / Math.tan(alt + 0.017 / (alt + 0.0001));
    alt += pAlt;
    return { altitude: alt / rad, azimuth: (az / rad + 360) % 360 };
  };
})();

function compassPoint(deg){
  const points = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return points[Math.round(deg / 22.5) % 16];
}
const NS = 'qm_';
const store = {
  get(key, fallback = null){ try { const v = localStorage.getItem(NS + key); return v === null ? fallback : v; } catch { return fallback; } },
  set(key, value){ try { localStorage.setItem(NS + key, value); } catch {} },
  getJSON(key, fallback){ try { const v = localStorage.getItem(NS + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  getArray(key){ const v = this.getJSON(key, []); return Array.isArray(v) ? v : []; },
  setJSON(key, value){ try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch {} },
};

/* ---------------------------------------------------------------
   2b. LOCAL STORE VAULT — ported from v2.0.html. Bookmarks, last
   reciter/language/font are always cached in localStorage; on
   Chromium browsers they can also mirror into a real folder on disk
   via the File System Access API, with rolling timestamped backups.
   Firefox/Safari get manual Export/Import as the universal fallback.
--------------------------------------------------------------- */
const QM_FSA_SUPPORTED = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
const QM_MARKER_FILE = '.quran-maar';
const QM_DATA_FILE = 'quran-maar-data.json';
const QM_MAX_BACKUPS = 15;
const QM_IDB_NAME = 'quran-maar-fs', QM_IDB_STORE = 'handles';

function qmCollectState(){
  return {
    app: 'Quran Maar', format: 'quran-maar', version: 1, savedAt: new Date().toISOString(),
    reciter: store.get('reciter'),
    langEdition: store.get('lang_edition'),
    arabicFontIndex: store.get('arabic_font_index'),
    bookmarks: store.getArray('v5_bookmarks'),
    hadithBookmarks: store.getArray('v5_hadith_bookmarks'),
    dailyTasks: store.getJSON('daily_tasks_v1', {}),
    khatam: store.getJSON('khatam_v1', null),
    seerahWatched: store.getArray('seerah_watched_v1'),
  };
}
function qmApplyState(incoming){
  if (!incoming || typeof incoming !== 'object') return;
  const s = incoming.state || incoming;
  if (s.reciter) store.set('reciter', s.reciter);
  if (s.langEdition) store.set('lang_edition', s.langEdition);
  if (s.arabicFontIndex !== undefined) store.set('arabic_font_index', String(s.arabicFontIndex));
  // only ever accept the array shape this app actually uses — an older or
  // foreign export/backup file (e.g. v4's object-keyed hadith bookmarks)
  // must never get written through as-is, or every screen reading it
  // back out as an array crashes on the next render.
  if (Array.isArray(s.bookmarks)) store.setJSON('v5_bookmarks', s.bookmarks);
  if (Array.isArray(s.hadithBookmarks)) store.setJSON('v5_hadith_bookmarks', s.hadithBookmarks);
  // Daily goals, khatam plan and Seerah progress (same shape checks)
  if (s.dailyTasks && typeof s.dailyTasks === 'object' && !Array.isArray(s.dailyTasks)) store.setJSON('daily_tasks_v1', s.dailyTasks);
  if (s.khatam && typeof s.khatam === 'object' && Number.isFinite(s.khatam.days) && Number.isFinite(s.khatam.pages) && typeof s.khatam.start === 'string') store.setJSON('khatam_v1', s.khatam);
  if (Array.isArray(s.seerahWatched)) store.setJSON('seerah_watched_v1', s.seerahWatched);
}

function qmIdbOpen(){
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no-idb'));
    const req = indexedDB.open(QM_IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(QM_IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function qmIdbSet(key, value){
  const db = await qmIdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QM_IDB_STORE, 'readwrite');
    tx.objectStore(QM_IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
async function qmIdbGet(key){
  const db = await qmIdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QM_IDB_STORE, 'readonly');
    const req = tx.objectStore(QM_IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
  });
}

const QMVault = {
  mode: 'checking', // 'folder' | 'local' | 'needs-permission' | 'checking'
  dirHandle: null,
  lastBackupAt: null,
  writesSinceBackup: 0,
  saveTimer: null,
  busy: false,

  async verifyPermission(handle, mode){ try { return (await handle.queryPermission({ mode })) === 'granted'; } catch { return false; } },
  async requestPermission(handle, mode){ try { return (await handle.requestPermission({ mode })) === 'granted'; } catch { return false; } },

  async tryAutoReconnect(){
    if (!QM_FSA_SUPPORTED) { this.mode = 'local'; return false; }
    try {
      const handle = await qmIdbGet('dirHandle');
      if (!handle) { this.mode = 'local'; return false; }
      const ok = await this.verifyPermission(handle, 'readwrite');
      this.dirHandle = handle;
      if (ok) { this.mode = 'folder'; await this.loadFromFolder(); return true; }
      this.mode = 'needs-permission';
      return false;
    } catch { this.mode = 'local'; return false; }
  },

  async connectNewFolder(){
    if (!QM_FSA_SUPPORTED) throw new Error('unsupported');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    this.dirHandle = handle; this.mode = 'folder';
    await qmIdbSet('dirHandle', handle);
    await this.writeData(); await this.writeMarker(); await this.createBackup();
    return handle;
  },
  async reconnect(){
    if (!this.dirHandle) return false;
    const ok = await this.requestPermission(this.dirHandle, 'readwrite');
    if (ok) { this.mode = 'folder'; await this.loadFromFolder(); }
    return ok;
  },
  async writeMarker(){
    try {
      const fh = await this.dirHandle.getFileHandle(QM_MARKER_FILE, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify({ app: 'Quran Maar', createdAt: new Date().toISOString() }));
      await w.close();
    } catch {}
  },
  async writeData(){
    const fh = await this.dirHandle.getFileHandle(QM_DATA_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(qmCollectState(), null, 2));
    await w.close();
  },
  async loadFromFolder(){
    try {
      const fh = await this.dirHandle.getFileHandle(QM_DATA_FILE).catch(() => null);
      if (fh) { const text = await (await fh.getFile()).text(); if (text?.trim()) qmApplyState(JSON.parse(text)); }
      await this.writeData(); await this.writeMarker();
    } catch {}
  },
  scheduleSave(){
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), 600);
  },
  async persistNow(){
    if (this.mode !== 'folder' || !this.dirHandle) return;
    if (this.busy) { this.saveTimer = setTimeout(() => this.persistNow(), 400); return; }
    this.busy = true;
    try {
      await this.writeData();
      this.writesSinceBackup++;
      const due = this.writesSinceBackup >= 20 || !this.lastBackupAt || (Date.now() - this.lastBackupAt.getTime()) > 6 * 3600 * 1000;
      if (due) await this.createBackup();
    } catch {} finally { this.busy = false; }
  },
  async createBackup(){
    if (this.mode !== 'folder' || !this.dirHandle) return false;
    try {
      const backupsDir = await this.dirHandle.getDirectoryHandle('backups', { create: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fh = await backupsDir.getFileHandle(`backup-${stamp}.json`, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state: qmCollectState() }, null, 2));
      await w.close();
      this.lastBackupAt = new Date(); this.writesSinceBackup = 0;
      await this.pruneBackups(backupsDir);
      return true;
    } catch { return false; }
  },
  async pruneBackups(backupsDir){
    const names = [];
    for await (const [name, handle] of backupsDir.entries()) { if (handle.kind === 'file' && name.startsWith('backup-')) names.push(name); }
    names.sort().reverse();
    for (const name of names.slice(QM_MAX_BACKUPS)) { try { await backupsDir.removeEntry(name); } catch {} }
  },
  async listBackups(){
    if (this.mode !== 'folder' || !this.dirHandle) return [];
    try {
      const backupsDir = await this.dirHandle.getDirectoryHandle('backups', { create: true });
      const names = [];
      for await (const [name, handle] of backupsDir.entries()) { if (handle.kind === 'file' && name.startsWith('backup-')) names.push(name); }
      return names.sort().reverse();
    } catch { return []; }
  },
  async restoreBackup(name){
    if (this.mode !== 'folder' || !this.dirHandle) return false;
    try {
      const backupsDir = await this.dirHandle.getDirectoryHandle('backups', { create: true });
      const fh = await backupsDir.getFileHandle(name);
      const parsed = JSON.parse(await (await fh.getFile()).text());
      qmApplyState(parsed);
      await this.writeData();
      return true;
    } catch { return false; }
  },
  exportFile(){
    const blob = new Blob([JSON.stringify(qmCollectState(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Quran-MAAR-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
  async importFile(file){
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (this.mode === 'folder' && this.dirHandle) await this.createBackup();
    qmApplyState(parsed);
    if (this.mode === 'folder' && this.dirHandle) await this.writeData();
  },
};
// every localStorage write from the app schedules a debounced mirror to
// the connected folder (no-op when no folder is connected)
const qmOrigSet = store.set.bind(store), qmOrigSetJSON = store.setJSON.bind(store);
store.set = (k, v) => { qmOrigSet(k, v); QMVault.scheduleSave(); };
store.setJSON = (k, v) => { qmOrigSetJSON(k, v); QMVault.scheduleSave(); };
function qmFmtDateTime(d){ if (!d) return 'Never'; return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }

/* ---------------------------------------------------------------
   3. HOOKS
--------------------------------------------------------------- */
/** Adds `.in` to an element once it scrolls into view, for the
 *  `.reveal` fade-up used across every section. */
function useReveal(deps = []){
  const ref = useRef(null);
  const ioRef = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!ioRef.current) {
      ioRef.current = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); ioRef.current.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    }
    const io = ioRef.current;
    // Scans for any `.reveal` element that isn't animated in yet and starts
    // observing it. Run once immediately, then on every DOM mutation inside
    // this container — so newly-mounted async content (a fresh fetch result,
    // a language switch that happens to produce the same item count as
    // before, pagination, anything) is always picked up the moment it
    // actually appears, instead of depending on guessing the right React
    // dependency array for every call site.
    function scan(){
      const nodes = el.classList?.contains('reveal') ? [el] : el.querySelectorAll('.reveal');
      nodes.forEach((n) => { if (!n.classList.contains('in')) io.observe(n); });
    }
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, deps);
  return ref;
}

function useLocalState(key, initial){
  const [val, setVal] = useState(() => store.get(key, initial));
  useEffect(() => { store.set(key, val); }, [key, val]);
  return [val, setVal];
}

/** Geolocation: browser GPS first (accurate), IP lookup as fallback
 *  — same two-tier strategy v4 used. The last successful fix is
 *  cached on-device, so if there's no connection at all (GPS chips
 *  can still get a position offline, but the IP lookup and reverse
 *  geocoding can't), the app falls straight back to "where you were
 *  last time" instead of showing an error. */
function useGeo(){
  const cached = store.getJSON('geo:last', null);
  const [state, setState] = useState(() =>
    cached ? { status:'ready', lat:cached.lat, lon:cached.lon, city:cached.city || '', source:'cache' } : { status:'loading', lat:null, lon:null, city:'', source:'' }
  );
  useEffect(() => {
    let cancelled = false;
    function fromIp(){
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!cached) setState((s) => ({ ...s, status:'error' }));
        return; // no network for IP lookup — keep whatever cached fix we already applied
      }
      fetch('https://ipapi.co/json/').then(r => r.json()).then(j => {
        if (cancelled) return;
        if (j && j.latitude) {
          const next = { lat:j.latitude, lon:j.longitude, city:[j.city,j.country_name].filter(Boolean).join(', ') };
          setState({ status:'ready', ...next, source:'ip' });
          store.setJSON('geo:last', next);
        } else throw new Error('no-ip');
      }).catch(() => {
        fetch('https://ipwho.is/').then(r => r.json()).then(j => {
          if (cancelled) return;
          if (j && j.latitude) {
            const next = { lat:j.latitude, lon:j.longitude, city:[j.city,j.country].filter(Boolean).join(', ') };
            setState({ status:'ready', ...next, source:'ip' });
            store.setJSON('geo:last', next);
          } else if (!cached) setState((s) => ({ ...s, status:'error' }));
        }).catch(() => { if (!cancelled && !cached) setState((s) => ({ ...s, status:'error' })); });
      });
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const { latitude, longitude } = pos.coords;
          setState((s) => ({ status:'ready', lat:latitude, lon:longitude, city:s.city || '', source:'gps' }));
          store.setJSON('geo:last', { lat:latitude, lon:longitude, city:(cached && cached.city) || '' });
          if (typeof navigator !== 'undefined' && !navigator.onLine) return; // reverse-geocode needs a connection
          fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
            .then(r => r.json()).then(j => {
              if (cancelled) return;
              const city = [j.city || j.locality, j.countryName].filter(Boolean).join(', ');
              if (city) { setState((s) => ({ ...s, city })); store.setJSON('geo:last', { lat:latitude, lon:longitude, city }); }
            }).catch(() => {});
        },
        () => !cancelled && fromIp(),
        { timeout: 8000 }
      );
    } else fromIp();
    return () => { cancelled = true; };
  }, []);
  return state;
}

/* ---------------------------------------------------------------
   4. ICONS — small hand-drawn stroke set, no icon library.
--------------------------------------------------------------- */
const ICONS = {
  home: 'M4 11.5 12 5l8 6.5M6 10v9h5v-5h2v5h5v-9',
  book: 'M4 5.5c2.5-1.2 5-1.2 8 0v13c-3-1.2-5.5-1.2-8 0v-13ZM20 5.5c-2.5-1.2-5-1.2-8 0v13c3-1.2 5.5-1.2 8 0v-13Z',
  sun: 'M12 4.5v-2M12 21.5v-2M4.5 12h-2M21.5 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.2-12.2-2 5-5 2 2-5 5-2Z',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 1 0 10.5 10.5Z',
  bookmark: 'M6 3.5h12v18l-6-4-6 4v-18Z',
  bookmarkFilled: 'M6 3.5h12v18l-6-4-6 4v-18Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M5 5l14 14M19 5 5 19',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm10 17-5.6-5.6',
  play: 'M7 4.5v15l13-7.5-13-7.5Z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  volume: 'M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4Zm11 .5a3.5 3.5 0 0 1 0 4m2.5-6.5a7 7 0 0 1 0 9',
  mute: 'M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4Zm12 0 5 5m0-5-5 5',
  pause: 'M7 4.5h4v15H7v-15Zm6 0h4v15h-4v-15Z',
  x: 'M5 5l14 14M19 5 5 19',
  chev: 'M9 6l6 6-6 6',
  save: 'M5 4.5h11l3 3v12H5v-15Zm2 0v5h8v-5M8 14.5h8v5H8v-5Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v.01M12 11v6',
  note: 'M4 20l1-4L16 5l3 3L8 19l-4 1ZM13.5 6.5l3 3M3 21h18',
  download: 'M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  trash: 'M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  check: 'M4.5 12.5 9.5 17.5 19.5 7',
  cloudOff: 'M3 3l18 18M7.5 18A4.5 4.5 0 0 1 7 9.02M9.5 5.7A6 6 0 0 1 18 10a4 4 0 0 1 2.4 7.2',
  offline: 'M12 20h.01M5 12.5a10 10 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M2 9a15 15 0 0 1 20 0',
  android: 'M5 17a7 7 0 0 1 14 0H5ZM8 9.5 6.5 7M16 9.5 17.5 7M9.5 13.5h.01M14.5 13.5h.01M9 20.5v-3.5M15 20.5v-3.5',
  phone: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3ZM11 18h2',
  share: 'M12 15V4M8 8l4-4 4 4M7 11H6v9h12v-9h-1',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0M12 18v3M9 21h6',
  settings: 'M4 7h9m4 0h3M4 12h3m4 0h9M4 17h11m4 0h1M15 5v4M9 10v4M17 15v4',
};
function Icon({ name, size = 18, filled = false }){
  const d = ICONS[name] || '';
  return html`
    <svg width=${size} height=${size} viewBox="0 0 24 24" fill=${filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d=${d} />
    </svg>
  `;
}

/* ---------------------------------------------------------------
   5. NAVIGATION
--------------------------------------------------------------- */
const NAV_ITEMS = [
  { id:'home', label:'Home', icon:'home' },
  { id:'quran', label:"Qur'an", icon:'book' },
  { id:'hadith', label:'Hadith', icon:'search' },
  { id:'videos', label:'Videos', icon:'play' },
  { id:'qibla', label:'Qibla', icon:'compass' },
  { id:'seerah', label:'Seerah', icon:'book' },
  { id:'daily', label:'Daily', icon:'sun' },
  { id:'offline', label:'Offline', icon:'download' },
  { id:'about', label:'About', icon:'info' },
  { id:'settings', label:'Settings', icon:'settings' },
];

function LocalStoreControl(){
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(QMVault.mode);
  const [folderName, setFolderName] = useState(QMVault.dirHandle?.name || '');
  const [lastBackup, setLastBackup] = useState(QMVault.lastBackupAt);
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const wrapRef = useRef(null);

  function refresh(){
    setMode(QMVault.mode);
    setFolderName(QMVault.dirHandle?.name || '');
    setLastBackup(QMVault.lastBackupAt);
    QMVault.listBackups().then(setBackups);
  }

  useEffect(() => {
    QMVault.tryAutoReconnect().then(refresh);
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    function onDocClick(e){ if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function flash(msg){ setToast(msg); clearTimeout(flash._t); flash._t = setTimeout(() => setToast(''), 4200); }

  async function connect(){
    setBusy('connect');
    try { await QMVault.connectNewFolder(); flash('Folder connected — your data is now mirrored there.'); refresh(); }
    catch { flash(QM_FSA_SUPPORTED ? "Couldn't connect to that folder." : "Folder storage isn't supported in this browser."); }
    setBusy('');
  }
  async function reconnect(){
    setBusy('reconnect');
    const ok = await QMVault.reconnect();
    flash(ok ? 'Reconnected.' : "Couldn't reconnect — try Connect a Folder again.");
    refresh(); setBusy('');
  }
  async function backupNow(){
    setBusy('backup');
    const ok = await QMVault.createBackup();
    flash(ok ? 'Backup created.' : 'Connect a folder first to create backups.');
    refresh(); setBusy('');
  }
  function exportNow(){ QMVault.exportFile(); flash('File exported.'); }
  async function restore(name){
    setBusy(name);
    const ok = await QMVault.restoreBackup(name);
    flash(ok ? 'Restored — reloading…' : 'Could not restore that backup.');
    if (ok) setTimeout(() => window.location.reload(), 700);
    setBusy('');
  }
  function importPick(e){
    const file = e.target.files?.[0];
    if (!file) return;
    QMVault.importFile(file).then(() => { flash('Imported — reloading…'); setTimeout(() => window.location.reload(), 700); })
      .catch(() => flash('Could not read that file.'));
  }

  let modeText, folderText, showConnect = false, showReconnect = false, showChange = false;
  if (mode === 'folder') { modeText = 'Folder storage (private files on this device)'; folderText = folderName || 'Connected'; showChange = true; }
  else if (mode === 'needs-permission') { modeText = 'Folder storage (needs one click to reconnect)'; folderText = folderName || 'Permission needed'; showReconnect = true; showChange = true; }
  else if (!QM_FSA_SUPPORTED) { modeText = "On-device storage only — this browser can't link an extra folder for backups"; folderText = 'Not available here (your bookmarks are still saved on this device)'; }
  else { modeText = 'This browser only — connect a folder for extra safety'; folderText = 'Not connected'; showConnect = true; }

  return html`
    <div class="local-store-wrap" ref=${wrapRef}>
      <button class="local-store-badge" onClick=${() => setOpen((o) => !o)} title="Your reciter, bookmarks and settings are saved only on this device.">
        <span class=${'ls-dot' + (mode === 'folder' ? ' linked' : mode === 'needs-permission' ? ' warn' : '')}></span>
        <${Icon} name="save" size=${13} />
        <span>Local Store</span>
      </button>
      ${open ? html`
        <div class="ls-dropdown">
          <div class="ls-header">
            <strong>Quran-MAAR — 100% local</strong>
            <small>Bookmarks (Qur'an + Hadith), last reciter, and your font choice are saved on this device only. Nothing is ever uploaded anywhere.</small>
          </div>
          <div class="ls-status">
            <div class="ls-status-row"><span class="ls-status-label">Storage mode</span><span class="ls-status-value">${modeText}</span></div>
            <div class="ls-status-row"><span class="ls-status-label">Connected folder</span><span class="ls-status-value">${folderText}</span></div>
            <div class="ls-status-row"><span class="ls-status-label"><span class=${'ls-dot is-ok'}></span>Auto-save</span><span class="ls-status-value">${mode === 'folder' ? 'Saved to your folder' : 'Saved in this browser'}</span></div>
            <div class="ls-status-row"><span class="ls-status-label">Last backup</span><span class="ls-status-value">${qmFmtDateTime(lastBackup)}</span></div>
          </div>
          ${toast ? html`<div class="ls-toast">${toast}</div>` : null}
          <div class="ls-btn-row">
            ${showConnect ? html`<button class="ls-btn ls-btn-primary" disabled=${busy==='connect'} onClick=${connect}>${busy==='connect'?'Connecting…':'Connect a Folder'}</button>` : null}
            ${showReconnect ? html`<button class="ls-btn ls-btn-primary" disabled=${busy==='reconnect'} onClick=${reconnect}>${busy==='reconnect'?'Reconnecting…':'Reconnect Folder'}</button>` : null}
            ${showChange ? html`<button class="ls-btn" disabled=${busy==='connect'} onClick=${connect}>Change Folder</button>` : null}
            <button class="ls-btn" disabled=${busy==='backup'} onClick=${backupNow}>${busy==='backup'?'Backing up…':'Create Backup Now'}</button>
            <button class="ls-btn" onClick=${exportNow}>Export File</button>
            <label class="ls-btn" style=${{cursor:'pointer'}}>Import File<input type="file" accept="application/json" style=${{display:'none'}} onChange=${importPick} /></label>
          </div>
          <div class="ls-backups">
            <div class="ls-backups-title">Backups</div>
            ${backups.length === 0 ? html`<p class="ls-backup-empty">No backups yet. Create one anytime with "Create Backup Now", or one will be made automatically as you use the app.</p>` : null}
            ${backups.map((name) => html`
              <div key=${name} class="ls-backup-item">
                <span>${name.replace('backup-', '').replace('.json', '')}</span>
                <button disabled=${busy===name} onClick=${() => restore(name)}>${busy===name?'Restoring…':'Restore'}</button>
              </div>
            `)}
          </div>
        </div>
      ` : null}
    </div>
  `;
}

function NavBar({ tab, setTab, onOpenMenu, onOpenBookmarks, bookmarkCount }){
  return html`
    <header class="nav">
      <div class="nav-inner">
        <button class="brand" onClick=${() => setTab('home')} aria-label="Quran Maar — home">
          <span class="brand-mark">۩</span>
          <span class="brand-text">Quran <b>Maar</b></span>
        </button>
        <nav class="nav-pills" role="tablist" aria-label="Sections">
          ${NAV_ITEMS.map((n) => html`
            <button
              key=${n.id}
              class=${'nav-pill' + (tab === n.id ? ' active' : '')}
              role="tab"
              aria-selected=${tab === n.id}
              onClick=${() => setTab(n.id)}
            >${n.label}</button>
          `)}
        </nav>
        <div class="nav-actions">
          <${LocalStoreControl} />
          <button class="icon-btn" aria-label="Bookmarks" onClick=${onOpenBookmarks}>
            <${Icon} name="bookmark" size=${17} />
            ${bookmarkCount > 0 ? html`<span class="dot"></span>` : null}
          </button>
          <button class="icon-btn menu-btn" aria-label="Open menu" onClick=${onOpenMenu}>
            <${Icon} name="menu" size=${18} />
          </button>
        </div>
      </div>
    </header>
  `;
}

function MobileMenu({ open, onClose, tab, setTab }){
  return html`
    <div class=${'mobile-menu' + (open ? ' open' : '')} onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="mobile-menu-panel">
        <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
          <span class="brand-text" style=${{ fontSize:'19px' }}>Quran <b>Maar</b></span>
          <button class="icon-btn" onClick=${onClose} aria-label="Close menu"><${Icon} name="close" size=${16} /></button>
        </div>
        <div style=${{ marginBottom:'14px' }}><${LocalStoreControl} /></div>
        ${NAV_ITEMS.map((n) => html`
          <button
            key=${n.id}
            class=${'mobile-menu-item' + (tab === n.id ? ' active' : '')}
            onClick=${() => { setTab(n.id); onClose(); }}
          >
            <${Icon} name=${n.icon} size=${17} />
            ${n.label}
          </button>
        `)}
      </div>
    </div>
  `;
}

function TabBar({ tab, setTab }){
  const items = NAV_ITEMS.slice(0, 5);
  return html`
    <nav class="tab-bar" aria-label="Sections">
      ${items.map((n) => html`
        <button key=${n.id} class=${'tab-item' + (tab === n.id ? ' active' : '')} onClick=${() => setTab(n.id)}>
          <${Icon} name=${n.icon} size=${19} />
          ${n.label}
        </button>
      `)}
    </nav>
  `;
}

/* ---------------------------------------------------------------
   6. HOME
--------------------------------------------------------------- */
const ANDROID_APK_URL = 'https://github.com/20RajonAdil/MAAR.Quran/releases/download/v1.0/Quran.MAAR.apk';
const SITE_HOST_PATH = '20rajonadil.github.io/MAAR.Quran';

/* Hide the install buttons when the site is already running as an installed app. */
function isRunningAsApp(){
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
      || /; wv\)/.test(navigator.userAgent);
  } catch { return false; }
}

function IosInstallModal({ onClose }){
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);
  return html`
    <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="ios-install-title" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="app-modal-box">
        <button class="icon-btn app-modal-x" onClick=${onClose} aria-label="Close"><${Icon} name="close" size=${18} /></button>
        <h2 id="ios-install-title">Install on iPhone / iPad</h2>
        <p class="lead">iOS doesn't use APK files — instead, Safari can add this site to your Home Screen as its own app icon, opening full-screen with no browser bar. This must be done in <strong>Safari</strong> (not Chrome or another browser) for it to work.</p>
        <ol class="app-steps">
          <li><span>Open <code>${SITE_HOST_PATH}</code> in <b>Safari</b> (you're most of the way there already if you're reading this on your iPhone).</span></li>
          <li><span>Tap the <b>Share</b> icon <${Icon} name="share" size=${18} /> in Safari's toolbar.</span></li>
          <li><span>Scroll down the share menu and tap <b>"Add to Home Screen."</b></span></li>
          <li><span>Tap <b>"Add"</b> in the top right corner.</span></li>
          <li><span>A <b>"Quran MAAR"</b> icon now appears on your Home Screen and opens like a normal app — and it keeps working offline.</span></li>
        </ol>
        <div class="app-modal-actions">
          <button class="btn btn-gold" onClick=${onClose}>Got it</button>
        </div>
      </div>
    </div>
  `;
}

/* Glowing moon inside a slowly turning eight-point star. Follows the
   pointer a few pixels for depth; still when reduced motion is on. */
function HeroOrb(){
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onMove = (e) => {
      el.style.setProperty('--px', ((e.clientX / innerWidth) - .5).toFixed(3));
      el.style.setProperty('--py', ((e.clientY / innerHeight) - .5).toFixed(3));
    };
    addEventListener('pointermove', onMove, { passive:true });
    return () => removeEventListener('pointermove', onMove);
  }, []);
  const star = (cls, sz) => html`<svg class=${'orb-star ' + cls} viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width=${sz}>
      <rect x="40" y="40" width="120" height="120" /><rect x="40" y="40" width="120" height="120" transform="rotate(45 100 100)" />
    </svg>`;
  return html`
    <div class="hero-orb" ref=${ref} aria-hidden="true">
      <span class="orb-ring r1"></span><span class="orb-ring r2"></span><span class="orb-ring r3"></span>
      ${star('s1', .5)}${star('s2', .4)}
      <span class="orb-orbit"><i></i></span>
      <div class="orb-moon">
        <span class="oc c1"></span><span class="oc c2"></span><span class="oc c3"></span>
      </div>
    </div>
  `;
}

function Hero({ setTab, surahCount }){
  const ref = useReveal();
  const [iosOpen, setIosOpen] = useState(false);
  const installed = useMemo(isRunningAsApp, []);
  return html`
    <section class="hero shell" ref=${ref}>
      <div class="hero-arch" aria-hidden="true"></div>
      <${HeroOrb} />
      <div class="reveal in">
        <div class="hero-kicker">Bismillah — Light · Time · Guidance</div>
        <h1>Read, listen<br/>and return<br/>to <em>stillness.</em></h1>
        <p class="hero-sub">The Qur'an in Arabic with translations in 20 languages, multi-reciter audio, live prayer times, a Qibla finder, Hadith collections and the real-time moon — 100% free, and saved only on your device.</p>
        <div class="hero-cta">
          <button class="btn btn-gold" onClick=${() => setTab('quran')}><${Icon} name="book" size=${16} /> Open the Qur'an</button>
          <button class="btn btn-ghost" onClick=${() => document.getElementById('home-today')?.scrollIntoView({ behavior:'smooth', block:'start' })}><${Icon} name="sun" size=${16} /> Today's prayer times</button>
          ${!installed && html`
            <a class="btn btn-ghost" href=${ANDROID_APK_URL} download="Quran.MAAR.apk" rel="noopener"><${Icon} name="android" size=${16} /> Download for Android</a>
            <button class="btn btn-ghost" onClick=${() => setIosOpen(true)}><${Icon} name="phone" size=${16} /> Download for iPhone</button>
          `}
        </div>
        ${iosOpen && html`<${IosInstallModal} onClose=${() => setIosOpen(false)} />`}
        <div class="hero-stats">
          <div class="hero-stat"><b>${surahCount || 114}</b><span>Surahs</span></div>
          <div class="hero-stat"><b>5</b><span>Reciters</span></div>
          <div class="hero-stat"><b>20</b><span>Languages</span></div>
          <div class="hero-stat"><b>6</b><span>Hadith books</span></div>
        </div>
      </div>
    </section>
  `;
}

/* ---------------------------------------------------------------
   6b. LIVE PRAYER RING — countdown to the next prayer; the card's
   sky changes with the current part of the day (Fajr … Isha).
--------------------------------------------------------------- */
const PRAYER_SKY = {
  Fajr:    { sky:['#0b1030','#2c2150','#8a3a62'], glow:'#c26a9a', note:'Pre-dawn',        night:true  },
  Sunrise: { sky:['#1a0c10','#6b2a22','#d98a3a'], glow:'#f0a24a', note:'Morning light',   night:false },
  Dhuhr:   { sky:['#150f0f','#4a2420','#c24a3a'], glow:'#ff8f6e', note:'Midday',          night:false },
  Asr:     { sky:['#140c0b','#55301c','#c9772e'], glow:'#e8a050', note:'Afternoon',       night:false },
  Maghrib: { sky:['#12060a','#5a0f22','#d03a3c'], glow:'#ff6a5a', note:'Sunset',          night:false },
  Isha:    { sky:['#050507','#0d0d20','#2e1028'], glow:'#a03a60', note:'Night',           night:true  },
};
const RING_PRAYERS = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];

function prayerClock(timings, now){
  const at = (k, dayOffset = 0) => {
    const [h, m] = String(timings[k] || '00:00').split(':').map((x) => parseInt(x, 10));
    const d = new Date(now); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + dayOffset); return d;
  };
  const marks = [
    { k:'Isha', d:at('Isha', -1) }, { k:'Fajr', d:at('Fajr') }, { k:'Sunrise', d:at('Sunrise') },
    { k:'Dhuhr', d:at('Dhuhr') }, { k:'Asr', d:at('Asr') }, { k:'Maghrib', d:at('Maghrib') },
    { k:'Isha', d:at('Isha') }, { k:'Fajr', d:at('Fajr', 1) },
  ];
  let i = 0; while (i < marks.length - 1 && marks[i + 1].d <= now) i++;
  const phase = marks[i].k;
  const prayersOnly = marks.filter((m) => m.k !== 'Sunrise');
  let j = 0; while (j < prayersOnly.length - 1 && prayersOnly[j + 1].d <= now) j++;
  const prev = prayersOnly[j], next = prayersOnly[Math.min(j + 1, prayersOnly.length - 1)];
  const span = next.d - prev.d;
  return { phase, prev, next, progress: span > 0 ? Math.min(1, Math.max(0, (now - prev.d) / span)) : 0, msLeft: Math.max(0, next.d - now) };
}

function PrayerRing({ geo, prayer }){
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const valid = !!(prayer.timings && ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'].every((k) => /^\d{1,2}:\d{2}/.test(String(prayer.timings[k] || ''))));
  const ready = geo.status === 'ready' && prayer.status === 'ready' && valid;
  const c = ready ? prayerClock(prayer.timings, now) : null;
  const sky = PRAYER_SKY[c ? c.phase : 'Isha'];
  const R = 88, C = 2 * Math.PI * R;
  const ang = c ? c.progress * 2 * Math.PI - Math.PI / 2 : -Math.PI / 2;
  return html`
    <section class="section shell" style=${{ paddingBottom: 0 }}>
      <div class=${'pr-card' + (sky.night ? ' night' : '')}
        style=${{ '--s0': sky.sky[0], '--s1': sky.sky[1], '--s2': sky.sky[2], '--glow': sky.glow }}>
        ${!ready ? html`
          <div class="pr-empty">
            ${geo.status === 'error' ? html`<p>Allow location access to see your live prayer countdown.</p>` : html`<div class="spinner"></div>`}
          </div>
        ` : html`
          <div class="pr-ring-wrap">
            <svg class="pr-ring" viewBox="0 0 200 200" role="img" aria-label=${`Next prayer ${prayerLabel(c.next.k)} in ${fmtCountdown(c.msLeft)}`}>
              <defs>
                <linearGradient id="prg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#f5f2ed" /><stop offset="1" stop-color="var(--glow)" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r=${R} class="pr-track" />
              <circle cx="100" cy="100" r=${R} class="pr-prog" stroke="url(#prg)"
                stroke-dasharray=${C} stroke-dashoffset=${C * (1 - c.progress)} transform="rotate(-90 100 100)" />
              <circle cx=${100 + R * Math.cos(ang)} cy=${100 + R * Math.sin(ang)} r="5" class="pr-dot" />
            </svg>
            <div class="pr-center">
              <div class="pr-lbl">Next prayer</div>
              <div class="pr-name">${prayerLabel(c.next.k, c.next.d)}</div>
              <div class="pr-count">${fmtCountdown(c.msLeft)}</div>
              <div class="pr-at">at ${to12h(prayer.timings[c.next.k])}</div>
            </div>
          </div>
          <div class="pr-side">
            <div class="pr-phase"><span class="pr-phase-dot"></span>${sky.note}${geo.city ? html` · ${geo.city}` : null}</div>
            <div class="pr-list">
              ${RING_PRAYERS.map((k) => {
                const isNext = c.next.k === k;
                const passed = !isNext && ['Fajr','Dhuhr','Asr','Maghrib','Isha'].indexOf(k) < ['Fajr','Dhuhr','Asr','Maghrib','Isha'].indexOf(c.next.k) && c.next.d.getDate() === now.getDate();
                return html`<div key=${k} class=${'pr-row' + (isNext ? ' next' : '') + (passed ? ' done' : '')}>
                  <span>${prayerLabel(k)}</span><b>${to12h(prayer.timings[k])}</b>
                </div>`;
              })}
            </div>
            ${prayer.offline ? html`<div class="pr-note">Offline estimate — times may differ by a few minutes.</div>` : null}
          </div>
        `}
      </div>
    </section>
  `;
}

/* ---------------------------------------------------------------
   6c. AYAH OF THE DAY — one verse a day from a hand-picked list,
   with "Share as image" (a ready-to-post card, made on the device).
--------------------------------------------------------------- */
const DAILY_AYAH_REFS = [
  '2:255','2:286','2:152','2:153','2:186','2:45','2:156','2:201','3:8','3:26','3:139','3:159','3:173','3:200',
  '4:103','5:8','6:162','7:23','7:56','8:46','9:51','10:62','11:88','12:87','13:28','14:7','15:9','16:90','16:128',
  '17:23','17:80','18:10','20:114','21:87','23:118','24:35','25:63','28:24','29:69','31:17','33:41','33:56',
  '39:10','39:53','40:60','41:34','42:36','49:13','51:56','55:13','57:4','59:22','59:23','64:11','65:2','65:3',
  '93:3','94:5','94:6','112:1',
];
const DAILY_AYAH_KEY = 'daily_ayah_v1';
const localDayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dailyAyahRef(d = new Date()){
  const days = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  return DAILY_AYAH_REFS[days % DAILY_AYAH_REFS.length];
}

function useDailyAyah(){
  const key = localDayKey();
  const [ayah, setAyah] = useState(() => {
    const c = store.getJSON(DAILY_AYAH_KEY, null);
    return c && c.day === key ? c : (c ? { ...c, stale:true } : null);
  });
  const [status, setStatus] = useState(ayah && !ayah.stale ? 'ok' : 'loading');
  const load = useCallback(() => {
    const ref = dailyAyahRef();
    setStatus('loading');
    fetch(`${QURAN_API}/ayah/${ref}/editions/quran-uthmani,en.sahih`)
      .then((r) => r.json())
      .then((j) => {
        const [ar, en] = j.data;
        const a = { day: key, ref, arabic: ar.text, english: en.text, surah: ar.surah.englishName, surahAr: ar.surah.name, surahNo: ar.surah.number, ayahNo: ar.numberInSurah };
        store.setJSON(DAILY_AYAH_KEY, a); setAyah(a); setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [key]);
  useEffect(() => { if (!ayah || ayah.day !== key) load(); }, []);
  return { ayah, status, reload: load };
}

function ayahWrap(ctx, text, maxW){
  const words = text.split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function ayahImageBlob(a){
  try { await Promise.all([document.fonts.load('60px Amiri'), document.fonts.load('italic 40px "Instrument Serif"'), document.fonts.load('600 28px "Plus Jakarta Sans"')]); } catch {}
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0b0b'); bg.addColorStop(.6, '#1a0a0e'); bg.addColorStop(1, '#4a0b14');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 330, 20, W / 2, 330, 640);
  glow.addColorStop(0, 'rgba(207,51,66,.35)'); glow.addColorStop(1, 'rgba(207,51,66,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // mihrab arch outline
  ctx.strokeStyle = 'rgba(245,242,237,.14)'; ctx.lineWidth = 2;
  const ax = 70, ay = 70, aw = W - 140, ah = H - 140, ar = aw / 2;
  ctx.beginPath(); ctx.moveTo(ax, ay + ah); ctx.lineTo(ax, ay + ar); ctx.arc(W / 2, ay + ar, ar, Math.PI, 0); ctx.lineTo(ax + aw, ay + ah); ctx.stroke();
  // little stars
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(245,242,237,${.1 + rnd() * .4})`; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, .8 + rnd() * 1.6, 0, 7); ctx.fill(); }

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#cf3342'; ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('AYAH OF THE DAY', W / 2, 190);

  const maxW = W - 300;
  let size = 68, lines;
  ctx.direction = 'rtl';
  for (; size >= 30; size -= 2) { ctx.font = `${size}px Amiri, "Noto Naskh Arabic", serif`; lines = ayahWrap(ctx, a.arabic, maxW); if (lines.length * size * 1.85 <= 560) break; }
  ctx.fillStyle = '#f5f2ed';
  let y = 290; const lh = size * 1.85;
  const blockH = lines.length * lh; y = 250 + Math.max(0, (560 - blockH) / 2) + size;
  lines.forEach((ln) => { ctx.fillText(ln, W / 2, y); y += lh; });
  ctx.direction = 'ltr';

  y = Math.max(y + 10, 860);
  ctx.strokeStyle = 'rgba(207,51,66,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 50, y); ctx.lineTo(W / 2 + 50, y); ctx.stroke();
  let es = 40, el;
  for (; es >= 24; es -= 2) { ctx.font = `italic ${es}px "Instrument Serif", Georgia, serif`; el = ayahWrap(ctx, a.english, W - 280); if (el.length * es * 1.4 <= 1130 - (y + 40)) break; }
  ctx.fillStyle = '#e8e2da'; let ey = y + 40 + es;
  el.forEach((ln) => { ctx.fillText(ln, W / 2, ey); ey += es * 1.4; });

  ctx.fillStyle = '#cf3342'; ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${a.surah} · ${a.surahNo}:${a.ayahNo}`, W / 2, 1180);
  ctx.fillStyle = 'rgba(245,242,237,.75)'; ctx.font = 'italic 40px "Instrument Serif", Georgia, serif';
  ctx.fillText('Quran Maar', W / 2, 1250);
  ctx.fillStyle = 'rgba(245,242,237,.45)'; ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(SITE_HOST_PATH, W / 2, 1288);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

function DailyAyah(){
  const ref = useReveal();
  const { ayah, status, reload } = useDailyAyah();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const flash = (t) => { setMsg(t); clearTimeout(flash._t); flash._t = setTimeout(() => setMsg(''), 3200); };

  async function shareImage(){
    if (!ayah || busy) return;
    setBusy(true);
    try {
      const blob = await ayahImageBlob(ayah);
      const file = new File([blob], `ayah-${ayah.surahNo}-${ayah.ayahNo}.png`, { type:'image/png' });
      if (navigator.canShare && navigator.canShare({ files:[file] })) {
        try { await navigator.share({ files:[file], title:'Ayah of the day', text:`${ayah.surah} ${ayah.surahNo}:${ayah.ayahNo} — ${SITE_HOST_PATH}` }); setBusy(false); return; }
        catch (e) { if (e && e.name === 'AbortError') { setBusy(false); return; } }
      }
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); flash('Image saved to your device.');
    } catch { flash("Couldn't make the image. Try again."); }
    setBusy(false);
  }
  async function copyText(){
    if (!ayah) return;
    const t = `${ayah.arabic}\n\n"${ayah.english}"\n— ${ayah.surah} ${ayah.surahNo}:${ayah.ayahNo}\n${SITE_HOST_PATH}`;
    try { await navigator.clipboard.writeText(t); flash('Copied.'); } catch { flash("Couldn't copy."); }
  }

  return html`
    <section class="section shell" ref=${ref} style=${{ paddingBottom: 0 }}>
      <div class="ay-card reveal">
        <div class="ay-top">
          <div class="eyebrow" style=${{ marginBottom: 0 }}>Ayah of the day</div>
          ${ayah ? html`<div class="ay-ref">${ayah.surah} · ${ayah.surahNo}:${ayah.ayahNo}</div>` : null}
        </div>
        ${!ayah && status === 'loading' ? html`<div class="center-msg" style=${{ padding:'40px 10px' }}><div class="spinner"></div></div>` : null}
        ${!ayah && status === 'error' ? html`<div class="center-msg" style=${{ padding:'30px 10px' }}><p>Couldn't load today's ayah.</p><button class="btn btn-ghost" onClick=${reload}>Try again</button></div>` : null}
        ${ayah ? html`
          <p class="ay-ar" lang="ar" dir="rtl">${ayah.arabic}</p>
          <p class="ay-en">${ayah.english}</p>
          <div class="ay-actions">
            <button class="btn btn-gold" onClick=${shareImage} disabled=${busy}>${busy ? 'Making image…' : 'Share as image'}</button>
            <button class="btn btn-ghost" onClick=${copyText}>Copy text</button>
            ${msg ? html`<span class="ay-msg" role="status">${msg}</span>` : null}
          </div>
        ` : null}
      </div>
    </section>
  `;
}

/* ---- Home: Today panel — live prayer ticker + clocks, 12-hour format ---- */
function HomePrayerPanel({ geo, prayerData }){
  const own = usePrayerTimes(prayerData ? { status:'idle' } : geo);
  const prayer = prayerData || own;
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);
  const next = useMemo(() => nextPrayer(prayer.timings), [prayer.timings, tick]);
  const now = new Date();

  return html`
    <div class="arch-card home-panel reveal" style=${{ cursor:'default' }}>
      <div class="panel-head">
        <div class="eyebrow" style=${{ marginBottom:0 }}>Today</div>
      </div>
      <div class="section-head" style=${{ marginBottom:'12px' }}>
        <h2 style=${{ fontSize:'26px' }}>Prayer times</h2>
      </div>

      ${geo.status !== 'ready' ? html`<div class="center-msg" style=${{ padding:'30px 10px' }}><div class="spinner"></div></div>` : null}

      ${geo.status === 'ready' && prayer.status !== 'ready' ? html`<div class="center-msg" style=${{ padding:'30px 10px' }}><div class="spinner"></div></div>` : null}

      ${geo.status === 'ready' && prayer.status === 'ready' ? html`
        <div class="loc-pill" style=${{marginBottom:'12px'}}><${Icon} name="compass" size=${12} /> ${geo.city || `${geo.lat.toFixed(2)}, ${geo.lon.toFixed(2)}`} ${prayer.offline ? html`<span style=${{opacity:0.65, marginLeft:'6px'}}>· offline estimate</span>` : null}</div>
        <div class="mini-prayer-ticker">
          ${PRAYER_ORDER.map((k) => html`
            <div key=${k} class=${'mini-prayer-pill' + (next && k === next.name ? ' now' : '')}>
              <div class="p-name">${prayerLabel(k)}</div>
              <div class="p-time">${to12h(prayer.timings[k])}</div>
            </div>
          `)}
        </div>
        ${next ? html`<div class="surah-meta" style=${{textAlign:'center'}}>Next — <b style=${{color:'var(--gold-hi)'}}>${prayerLabel(next.name, next.date)}</b> at ${to12h(next.time)} · in ${fmtCountdown(next.msLeft)}</div>` : null}
        <div class="home-clock-row">
          <div class="clock-box"><div class="c-val">${now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</div><div class="c-lbl">Local time</div></div>
          <div class="clock-box"><div class="c-val">${prayer.date?.gregorian ? `${prayer.date.gregorian.day} ${prayer.date.gregorian.month.en.slice(0,3)}` : '--'}</div><div class="c-lbl">Gregorian</div></div>
          <div class="clock-box"><div class="c-val">${prayer.date?.hijri ? `${prayer.date.hijri.day} ${prayer.date.hijri.month.en.slice(0,3)}` : '--'}</div><div class="c-lbl">Hijri</div></div>
          <div class="clock-box"><div class="c-val">${prayer.date?.hijri ? prayer.date.hijri.year : '--'}</div><div class="c-lbl">AH</div></div>
        </div>
      ` : null}
      ${geo.status === 'error' ? html`<div class="center-msg">Allow location access to see today's prayer times.</div>` : null}
    </div>
  `;
}

/* ---- Home: Moon panel — v4-style stage (clouds, glow ring, drift) ---- */
function HomeMoonPanel({ geo }){
  const phase = useMemo(() => moonPhase(new Date()), []);
  const [moonDir, setMoonDir] = useState(null);
  useEffect(() => {
    if (geo.status !== 'ready') return;
    const pos = MOONPOS(new Date(), geo.lat, geo.lon);
    setMoonDir(pos);
  }, [geo.status, geo.lat, geo.lon]);

  return html`
    <div class="arch-card home-panel reveal" style=${{ cursor:'default' }}>
      <div class="panel-head">
        <div class="eyebrow" style=${{ marginBottom:0 }}>Tonight's sky</div>
      </div>
      <div class="section-head" style=${{ marginBottom:'12px' }}>
        <h2 style=${{ fontSize:'26px' }}>The Moon</h2>
      </div>
      <div class="moon-stage">
        <div class="moon-orbit">
          <div class="moon-glow-ring"></div>
          <div class="moon-phase-container"><${MoonCanvas} phase=${phase} /></div>
        </div>
        <div class="cloud-layer c1"></div>
        <div class="cloud-layer c2"></div>
        <div class="cloud-layer c3"></div>
        <div class="moon-readout"><b>${phase.name}</b> · ${Math.round(phase.illumination * 100)}% lit</div>
      </div>
      <div class="moon-direction-callout">
        ${moonDir
          ? (moonDir.altitude > 0
              ? `The moon is up — look toward the ${compassPoint(moonDir.azimuth)}, about ${Math.round(moonDir.altitude)}° above the horizon.`
              : `The moon is below the horizon right now from ${geo.city || 'your location'} — it rises later.`)
          : 'Finding your location to work out which way to look…'}
      </div>
    </div>
  `;
}

function QuickLinks({ setTab }){
  const ref = useReveal();
  const items = [
    { id:'hadith', title:'Hadith', sub:'Six major collections, in nine languages', icon:'search' },
    { id:'qibla', title:'Qibla finder', sub:'A live map pointed at the Kaaba', icon:'compass' },
    { id:'seerah', title:'Seerah', sub:'The life of Prophet Muhammad ﷺ, in 11 parts', icon:'book' },
    { id:'daily', title:'Daily goals', sub:'Tasks, a Qur\'an khatam planner and duas', icon:'sun' },
  ];
  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">Explore</div>
          <h2>The rest of the companion</h2>
        </div>
      </div>
      <div class="surah-grid">
        ${items.map((it, i) => html`
          <div key=${it.id} class="arch-card reveal" style=${{ transitionDelay: (i*70)+'ms' }} onClick=${() => setTab(it.id)}>
            <div class="surah-top">
              <span class="surah-num"><${Icon} name=${it.icon} size=${14} /></span>
            </div>
            <div class="surah-en">${it.title}</div>
            <div class="surah-meta">${it.sub}</div>
          </div>
        `)}
      </div>
    </section>
  `;
}

function HomeSection({ setTab, surahCount, geo }){
  const ref = useReveal([geo.status]);
  const prayerData = usePrayerTimes(geo);
  return html`
    <${React.Fragment}>
      <${Hero} setTab=${setTab} surahCount=${surahCount} />
      <${RamadanBanner} prayer=${prayerData} setTab=${setTab} />
      <${PrayerRing} geo=${geo} prayer=${prayerData} />
      <${DailyAyah} />
      <section id="home-today" class="section shell" ref=${ref}>
        <div class="home-grid">
          <${HomePrayerPanel} geo=${geo} prayerData=${prayerData} />
          <${HomeMoonPanel} geo=${geo} />
        </div>
      </section>
      <section class="section shell" style=${{ paddingTop: 0 }}>
        <${QMXC('SkyClock')} geo=${geo} />
      </section>
      <${QuickLinks} setTab=${setTab} />
      <${VideosTeaser} setTab=${setTab} />
    <//>
  `;
}

/* ---------------------------------------------------------------
   7. QUR'AN — surah grid, reciter picker, reader overlay
--------------------------------------------------------------- */
/* A download control that reflects four states: idle, working (with a
   real byte/file progress bar), saved, and failed. Clicks are stopped
   from bubbling because these sit inside cards that open the reader. */
function DownloadButton({ reciter, surah, isDone, compact = false }){
  const [phase, setPhase] = useState('idle');   // idle | working | error
  const [prog, setProg] = useState({ done:0, total:0, bytes:0 });
  const [err, setErr] = useState('');
  const id = `${reciter.id}:${surah.number}`;
  const available = reciter.surahOnly ? !!surahAudioForReciter(reciter.id, surah.number) : true;

  async function start(e){
    e && e.stopPropagation();
    if (!window.QMOffline || phase === 'working') return;
    if (isDone) { await window.QMOffline.deleteDownload(id); return; }
    setPhase('working'); setErr(''); setProg({ done:0, total:0, bytes:0 });
    try {
      const urls = await resolveRecitationUrls(reciter, surah);
      if (!urls.length) throw new Error('No recording available for this surah in this voice.');
      setProg({ done:0, total:urls.length, bytes:0 });
      await window.QMOffline.downloadRecitation({
        reciterId: reciter.id,
        reciterName: reciter.name,
        surahNumber: surah.number,
        surahName: surah.name,
        surahEnglish: surah.englishName,
        urls,
        onProgress: (p) => setProg(p),
      });
      setPhase('idle');
    } catch (ex) {
      if (String(ex && ex.message) === 'cancelled') { setPhase('idle'); return; }
      setErr(String(ex && ex.message || ex));
      setPhase('error');
    }
  }

  function cancel(e){
    e && e.stopPropagation();
    window.QMOffline && window.QMOffline.cancelDownload(id);
  }

  if (!available) return null;

  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const fmt = window.QMOffline ? window.QMOffline.formatBytes : (n) => n + 'B';

  if (phase === 'working') {
    return html`
      <div style=${{ minWidth: compact ? '96px' : '132px' }} onClick=${(e)=>e.stopPropagation()}>
        <button class="dl-btn busy" onClick=${cancel} title="Cancel download">
          <${Icon} name="download" size=${12} />
          ${prog.total > 1 ? `${prog.done}/${prog.total}` : fmt(prog.bytes)}
        </button>
        <div class="dl-progress"><span style=${{ width: (prog.total > 1 ? pct : 100) + '%' }}></span></div>
      </div>
    `;
  }

  return html`
    <div onClick=${(e)=>e.stopPropagation()}>
      <button
        class=${'dl-btn' + (isDone ? ' done' : '') + (phase === 'error' ? ' pill-danger' : '')}
        onClick=${start}
        title=${isDone ? 'Saved for offline — click to remove' : 'Download this recitation for offline listening'}>
        <${Icon} name=${isDone ? 'check' : 'download'} size=${12} />
        ${isDone ? 'Saved' : (compact ? 'Save' : 'Download')}
      </button>
      ${phase === 'error' && !compact ? html`<div class="surah-meta" style=${{ marginTop:'6px', color:'var(--danger)', fontSize:'11px' }}>${err}</div>` : null}
    </div>
  `;
}

function ReciterPicker({ reciterId, setReciterId }){
  const ref = useReveal();
  const r = getReciter(reciterId);
  const note = r.surahOnly
    ? `${r.name}'s voice is used for full-surah playback only — his recitation exists as complete surah recordings, so "Play surah" streams his real audio. Verse-by-verse playback isn't available in his voice, so it uses Mishary Al-Afasy instead.`
    : `Streams from the Islamic Network CDN, verse by verse or as a full surah.`;
  return html`
    <div class="arch-card reveal" ref=${ref} style=${{ cursor:'default', marginBottom:'22px' }} onClick=${(e)=>e.stopPropagation()}>
      <div class="eyebrow" style=${{ marginBottom:'12px' }}>Listen · choose your reciter</div>
      <div class="reciter-grid">
        ${RECITERS.map((rc) => html`
          <button key=${rc.id} class=${'reciter-card' + (rc.id === reciterId ? ' active' : '')} onClick=${() => setReciterId(rc.id)}>
            <div class="r-name">${rc.name} ${rc.tag ? html`<span class="tag-pill">${rc.tag}</span>` : null}</div>
            <div class="r-sub">${rc.sub}</div>
          </button>
        `)}
      </div>
      <div class="surah-meta" style=${{ marginTop:'12px', lineHeight:'1.6' }}>${note}</div>
    </div>
  `;
}

function SurahCard({ s, i, reciter, onOpen, isDone }){
  const hasVoice = reciter.surahOnly ? !!surahAudioForReciter(reciter.id, s.number) : true;
  return html`
    <div class="arch-card surah-card reveal" style=${{ transitionDelay: Math.min(i*35,400)+'ms' }} onClick=${() => onOpen(s)}>
      <div class="surah-top">
        <span class="surah-num">${s.number}</span>
        ${hasVoice ? html`<span class="surah-badge">${glyphFor(s.number)} Voiced</span>` : null}
      </div>
      <div class="surah-ar">${s.name}</div>
      <div class="surah-en">${s.englishName}</div>
      <div class="surah-meta">${s.englishNameTranslation}<span class="dot"></span>${s.numberOfAyahs} ayahs<span class="dot"></span>${s.revelationType}</div>
      ${hasVoice ? html`
        <div style=${{ marginTop:'12px' }}>
          <${DownloadButton} reciter=${reciter} surah=${s} isDone=${isDone} compact=${true} />
        </div>
      ` : null}
    </div>
  `;
}

function QuranSection({ reciterId, setReciterId, langEdition, setLangEdition, arabicFontIdx, setArabicFontIdx, bookmarks, toggleBookmark }){
  const [surahs, setSurahs] = useState([]);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [openSurah, setOpenSurah] = useState(null);
  const ref = useReveal([surahs.length]);
  const { items: downloads } = useDownloads();
  const doneIds = useMemo(() => new Set(downloads.map((d) => d.id)), [downloads]);

  useEffect(() => {
    fetch(`${QURAN_API}/surah`).then(r => r.json()).then((j) => {
      setSurahs(j.data || []);
      setStatus('ready');
      /* Links from the static surah pages arrive as ?tab=quran&surah=N */
      try {
        const want = parseInt(new URLSearchParams(window.location.search).get('surah'), 10);
        if (want >= 1 && want <= 114 && !window.__surahDeepLinked) {
          const hit = (j.data || []).find((x) => x.number === want);
          if (hit) { window.__surahDeepLinked = true; setOpenSurah(hit); }
        }
      } catch {}
    }).catch(() => setStatus('error'));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return surahs;
    return surahs.filter((s) =>
      String(s.number).includes(q) ||
      s.englishName.toLowerCase().includes(q) ||
      s.englishNameTranslation.toLowerCase().includes(q) ||
      s.name.includes(query.trim())
    );
  }, [surahs, query]);

  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">The Qur'an</div>
          <h2>All 114 surahs</h2>
        </div>
        <p>Tap any surah to read it in Arabic with your chosen translation, and listen verse by verse.</p>
      </div>

      <${ReciterPicker} reciterId=${reciterId} setReciterId=${setReciterId} />

      <div class="toolbar reveal">
        <div class="search-box">
          <${Icon} name="search" size=${15} />
          <input placeholder="Search a surah by name or number…" value=${query} onInput=${(e) => setQuery(e.target.value)} />
        </div>
        <select class="select-pill" value=${langEdition} onChange=${(e) => setLangEdition(e.target.value)} aria-label="Translation language">
          ${LANGUAGES.map((l) => html`<option key=${l.code} value=${l.edition}>${l.label}</option>`)}
        </select>
        <select class="select-pill" value=${arabicFontIdx} onChange=${(e) => setArabicFontIdx(Number(e.target.value))} aria-label="Arabic script">
          ${ARABIC_FONTS.map((f, i) => html`<option key=${i} value=${i}>${f.label}</option>`)}
        </select>
      </div>

      <${AyahSearch} surahs=${surahs} onOpen=${setOpenSurah} />

      ${status === 'ready' ? html`<${QMXC('RevelationMap')} surahs=${surahs} onOpen=${setOpenSurah} />` : null}

      ${status === 'loading' ? html`<div class="center-msg"><div class="spinner"></div><div style=${{marginTop:'10px'}}>Loading surahs…</div></div>` : null}
      ${status === 'error' ? html`<div class="center-msg">Couldn't reach the Qur'an API, and no offline copy is stored yet. Connect once and use <strong>Offline \u2192 Save Qur'an text</strong> so this screen works without a connection.</div>` : null}

      ${status === 'ready' ? html`
        <div class="surah-grid">
          ${filtered.map((s, i) => html`<${SurahCard} key=${s.number} s=${s} i=${i} reciter=${getReciter(reciterId)} onOpen=${setOpenSurah} isDone=${doneIds.has(reciterId + ':' + s.number)} />`)}
        </div>
        ${filtered.length === 0 ? html`<div class="center-msg">No surah matches "${query}".</div>` : null}
      ` : null}

      ${openSurah ? html`
        <${ReaderOverlay}
          surah=${openSurah}
          onClose=${() => setOpenSurah(null)}
          reciterId=${reciterId}
          langEdition=${langEdition}
          bookmarks=${bookmarks}
          toggleBookmark=${toggleBookmark}
        />
      ` : null}
    </section>
  `;
}

/* Fetch JSON with a few automatic retries. The Qur'an API can briefly refuse
   a request (rate limiting, a flaky mobile connection, or the background
   offline-save running at the same time), and one failed attempt used to be
   a dead end for the reader. */
async function qmFetchJson(url, tries = 3){
  let last;
  for (let i = 0; i < tries; i++){
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j || !j.data) throw new Error('empty response');
      return j;
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 600 * (i + 1)));
    }
  }
  throw last;
}

function ReaderOverlay({ surah, onClose, reciterId, langEdition, bookmarks, toggleBookmark }){
  const [ayahs, setAyahs] = useState(null);
  const [status, setStatus] = useState('loading');
  const [playingId, setPlayingId] = useState(null);
  const [playingWhole, setPlayingWhole] = useState(false);
  const [notes, setNotes] = useState(() => {
    const v = store.getJSON('v5_notes', {});
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  });
  const [noteAyah, setNoteAyah] = useState(null);
  const [reciteAyah, setReciteAyah] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [readProg, setReadProg] = useState(0);
  const audioRef = useRef(null);
  const chainRef = useRef({ queue: [], index: 0, active: false });
  const rowRefs = useRef({});
  const reciter = getReciter(reciterId);
  const { items: rdDownloads } = useDownloads();
  const rdIsDone = rdDownloads.some((d) => d.id === reciterId + ':' + surah.number);

  function noteKeyFor(a){ return `${surah.number}:${a.numberInSurah}`; }
  function setNoteText(key, text){
    setNotes((prev) => {
      const next = { ...prev };
      if (text.trim()) next[key] = text; else delete next[key];
      store.setJSON('v5_notes', next);
      return next;
    });
  }

  useEffect(() => {
    setStatus('loading'); setAyahs(null);
    let cancelled = false;
    window.__qmReaderBusy = true; // asks the background offline-save to pause
    Promise.all([
      qmFetchJson(`${QURAN_API}/surah/${surah.number}/${ARABIC_EDITION}`),
      qmFetchJson(`${QURAN_API}/surah/${surah.number}/${langEdition}`),
    ]).then(([arRes, trRes]) => {
      if (cancelled) return;
      const ar = arRes.data.ayahs, tr = trRes.data.ayahs;
      let list = ar.map((a, i) => ({ ...a, translation: tr[i]?.text || '' }));
      // Every surah opens with the Bismillah except Al-Fatihah (1, where it
      // IS ayah 1) and At-Tawbah (9, which has none) — the API embeds it in
      // ayah 1's own text, so strip it out here and show it as its own
      // header block instead of leaving it duplicated inside ayah 1.
      if (surah.number !== 1 && surah.number !== 9 && list.length) {
        const stripped = list[0].text.replace(BISMILLAH_STRIP_RE, '').trim();
        if (stripped !== list[0].text.trim()) list = [{ ...list[0], text: stripped }, ...list.slice(1)];
      }
      setAyahs(list);
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('error'); })
      .finally(() => { window.__qmReaderBusy = false; });

    return () => { cancelled = true; window.__qmReaderBusy = false; audioRef.current && audioRef.current.pause(); chainRef.current.active = false; };
  }, [surah.number, langEdition, reloadTick]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);

  function stopAudio(){
    chainRef.current.active = false;
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.onerror = null; audioRef.current.pause(); audioRef.current = null; }
    setPlayingId(null); setPlayingWhole(false);
  }

  function playAyah(a){
    stopAudio();
    const url = ayahAudioForReciter(reciterId, a.number);
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(a.numberInSurah);
    audio.play().catch(() => {});
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      if (url !== audioUrl(a.number)) { audio.src = audioUrl(a.number); audio.play().catch(()=>{}); }
      else setPlayingId(null);
    };
  }

  /* For reciters with real per-ayah audio, "play surah" chains each verse's
     file in sequence — which is what lets the current ayah highlight and
     auto-scroll in sync, the way v2.0.html's reader does. Surah-only
     reciters (Shakir Qasmi, Mossad) only have one continuous recording, so
     for them it's a single file with no per-ayah highlight — there's no
     per-verse timing data available to sync against. */
  function playChainFrom(index){
    const chain = chainRef.current;
    if (!chain.active || index >= chain.queue.length) { stopAudio(); return; }
    const a = chain.queue[index];
    chain.index = index;
    const audio = new Audio(ayahAudioForReciter(reciterId, a.number));
    audioRef.current = audio;
    setPlayingId(a.numberInSurah);
    const el = rowRefs.current[a.numberInSurah];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    audio.play().catch(() => {});
    audio.onended = () => { if (chainRef.current.active) playChainFrom(index + 1); };
    audio.onerror = () => {
      const fallback = audioUrl(a.number);
      if (audio.src !== fallback) { audio.src = fallback; audio.play().catch(() => { if (chainRef.current.active) playChainFrom(index + 1); }); }
      else if (chainRef.current.active) playChainFrom(index + 1);
    };
  }

  function playWholeSurah(){
    stopAudio();
    if (reciter.surahOnly) {
      const url = surahAudioForReciter(reciterId, surah.number);
      if (!url) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingWhole(true);
      audio.play().catch(() => {});
      audio.onended = () => setPlayingWhole(false);
      audio.onerror = () => setPlayingWhole(false);
      return;
    }
    setPlayingWhole(true);
    chainRef.current = { queue: ayahs, index: 0, active: true };
    playChainFrom(0);
  }

  /* How far through the surah the person has read (furthest point reached,
     so scrolling back up never un-draws the illustration). A surah short
     enough to fit on screen has nothing to scroll, so it opens complete. */
  function onBodyScroll(e){
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 4 ? el.scrollTop / max : 1;
    setReadProg((prev) => (p > prev + 0.004 ? Math.min(1, p) : prev));
  }
  useEffect(() => {
    if (status !== 'ready') return;
    const t = setTimeout(() => {
      const el = document.querySelector('.reader-body');
      if (el && el.scrollHeight - el.clientHeight <= 4) setReadProg(1);
    }, 80);
    return () => clearTimeout(t);
  }, [status, surah.number]);

  const isBookmarked = (a) => bookmarks.some((b) => b.surah === surah.number && b.ayah === a.numberInSurah);

  return html`
    <div class="reader-overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="reader-panel">
        <div class="reader-head">
          <div class="qmx-readhead">
            <${QMXC('SurahMedallion')} n=${surah.number} progress=${readProg} size=${56} />
            <div style=${{ minWidth: 0 }}>
              <h3>${surah.englishName}</h3>
              <div class="surah-meta">${surah.englishNameTranslation} · ${surah.numberOfAyahs} ayahs · ${surah.revelationType}</div>
            </div>
          </div>
          <button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="close" size=${16} /></button>
        </div>
        <div class="reader-body" onScroll=${onBodyScroll}>
          ${status === 'loading' ? html`<div class="center-msg"><div class="spinner"></div></div>` : null}
          ${status === 'error' ? html`<div class="center-msg">Couldn't load this surah.<div style=${{ marginTop:'14px' }}><button class="qmx-pillbtn on" onClick=${() => setReloadTick((t) => t + 1)}>Try again</button></div></div>` : null}
          ${status === 'ready' && surah.number !== 1 && surah.number !== 9 ? html`
            <div class="bismillah-block">
              <div class="bismillah-ar">${BISMILLAH_AR}</div>
              <div class="bismillah-en">${BISMILLAH_EN}</div>
            </div>
          ` : null}
          ${status === 'ready' ? ayahs.map((a) => html`
            <div key=${a.numberInSurah} ref=${(el) => { rowRefs.current[a.numberInSurah] = el; }} class=${'ayah-row' + (playingId === a.numberInSurah ? ' is-playing' : '')}>
              <div class="ayah-top">
                <div class="ayah-actions">
                  <button class=${'mini-btn' + (playingId === a.numberInSurah ? ' active' : '')} onClick=${() => playingId === a.numberInSurah ? stopAudio() : playAyah(a)} aria-label="Play this ayah">
                    <${Icon} name=${playingId === a.numberInSurah ? 'pause' : 'play'} size=${13} filled=${true} />
                  </button>
                  <button class=${'mini-btn' + (isBookmarked(a) ? ' active' : '')} onClick=${() => toggleBookmark(surah, a)} aria-label="Bookmark this ayah">
                    <${Icon} name="bookmark" size=${13} filled=${isBookmarked(a)} />
                  </button>
                  <button class=${'mini-btn' + (notes[noteKeyFor(a)] ? ' active' : '')} onClick=${() => setNoteAyah(a)} aria-label="Write a reflection on this ayah">
                    <${Icon} name="note" size=${13} />
                  </button>
                  <button class="mini-btn" onClick=${() => { stopAudio(); setReciteAyah(a); }} aria-label="Recite and check this ayah">
                    <${Icon} name="mic" size=${13} />
                  </button>
                </div>
                <span class="ayah-badge">${a.numberInSurah}</span>
              </div>
              <div class="ayah-ar">${playingId === a.numberInSurah ? html`<${QMXC('WordGlow')} text=${a.text} audioRef=${audioRef} active=${true} />` : a.text}</div>
              <div class="ayah-tr">${a.translation}</div>
            </div>
          `) : null}
        </div>
        <${QMXC('CalligraphyWave')} active=${!!playingId || playingWhole} />
        <div class="reader-player">
          <button class="player-play" onClick=${() => playingWhole ? stopAudio() : playWholeSurah()} aria-label="Play full surah">
            <${Icon} name=${playingWhole ? 'pause' : 'play'} size=${16} filled=${true} />
          </button>
          <div class="player-info">${reciter.name} — ${playingWhole ? 'playing full surah\u2026' : 'play full surah'}</div>
          <${DownloadButton} reciter=${reciter} surah=${surah} isDone=${rdIsDone} />
        </div>
      </div>
      ${noteAyah ? html`
        <${NoteOverlay}
          surah=${surah}
          ayah=${noteAyah}
          value=${notes[noteKeyFor(noteAyah)] || ''}
          onChange=${(text) => setNoteText(noteKeyFor(noteAyah), text)}
          onClose=${() => setNoteAyah(null)}
        />
      ` : null}
      ${reciteAyah ? html`
        <${QMXC('ReciteCheck')}
          ayah=${reciteAyah}
          surahName=${surah.englishName}
          onClose=${() => setReciteAyah(null)}
          onHear=${() => playAyah(reciteAyah)}
        />
      ` : null}
    </div>
  `;
}

function NoteOverlay({ surah, ayah, value, onChange, onClose }){
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`
    <div class="reader-overlay" style=${{zIndex:75}} onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="note-panel">
        <div class="reader-head">
          <div>
            <h3>Reflection</h3>
            <div class="surah-meta">${surah.englishName} · ${surah.number}:${ayah.numberInSurah}</div>
          </div>
          <button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="close" size=${16} /></button>
        </div>
        <div class="note-body">
          <div class="ayah-ar" style=${{marginBottom:'6px'}}>${ayah.text}</div>
          <div class="ayah-tr" style=${{marginBottom:'20px'}}>${ayah.translation}</div>
          <label class="note-label">Write your reflection</label>
          <textarea
            class="note-textarea"
            value=${value}
            onInput=${(e) => onChange(e.target.value)}
            placeholder="What does this ayah mean to you? Your notes are saved automatically, only on this device."
            autoFocus
          ></textarea>
          <div class="note-savedstate"><${Icon} name="save" size=${11} /> ${value.trim() ? 'Saved to your device' : 'Nothing written yet — start typing'}</div>
        </div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------
   8. HADITH
--------------------------------------------------------------- */
function HadithSection({ hadithBookmarks, toggleHadithBookmark }){
  const [collectionId, setCollectionId] = useLocalState('hadith_collection', 'bukhari');
  const [lang, setLang] = useLocalState('hadith_lang', 'eng');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('loading');
  const [notes, setNotes] = useState(() => {
    const v = store.getJSON('v5_hadith_notes', {});
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  });
  const [noteHadith, setNoteHadith] = useState(null);
  const ref = useReveal([status, collectionId, lang, page]);
  const PAGE_SIZE = 20;

  const collection = HADITH_COLLECTIONS.find((c) => c.id === collectionId) || HADITH_COLLECTIONS[0];
  const availableLangs = HADITH_LANG_PREFIXES.filter((l) => (HADITH_LANGS_BY_COLLECTION[collectionId] || ['eng']).includes(l.prefix));

  function noteKeyFor(num){ return `${collectionId}:${num}`; }
  function setNoteText(key, text){
    setNotes((prev) => {
      const next = { ...prev };
      if (text.trim()) next[key] = text; else delete next[key];
      store.setJSON('v5_hadith_notes', next);
      return next;
    });
  }

  useEffect(() => {
    if (!availableLangs.some((l) => l.prefix === lang)) setLang('eng');
  }, [collectionId]);

  useEffect(() => {
    setStatus('loading'); setPage(0);
    fetch(`${HADITH_CDN}/${lang}-${collectionId}.json`).then((r) => { if (!r.ok) throw new Error('missing'); return r.json(); })
      .then((j) => {
        const list = Array.isArray(j.hadiths) ? j.hadiths : [];
        if (!list.length) throw new Error('empty');
        setItems(list);
        setTotal(typeof j.metadata?.length === 'number' ? j.metadata.length : list.length);
        setStatus('ready');
      }).catch(() => { setItems([]); setStatus('error'); });
  }, [collectionId, lang]);

  const pageItems = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const isRtlLang = lang === 'ara';

  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">Hadith</div>
          <h2>Six major collections</h2>
        </div>
        <p>Browse chapter by chapter, translated into nine languages.</p>
      </div>

      <div class="toolbar reveal">
        <select class="select-pill" value=${collectionId} onChange=${(e) => setCollectionId(e.target.value)}>
          ${HADITH_COLLECTIONS.map((c) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
        </select>
        <select class="select-pill" value=${lang} onChange=${(e) => setLang(e.target.value)}>
          ${availableLangs.map((l) => html`<option key=${l.prefix} value=${l.prefix}>${l.label}</option>`)}
        </select>
        ${total ? html`<div class="loc-pill" style=${{marginBottom:0}}>${total.toLocaleString()} hadith total</div>` : null}
      </div>

      ${status === 'loading' ? html`<div class="center-msg"><div class="spinner"></div></div>` : null}
      ${status === 'error' ? html`<div class="center-msg">Couldn't load this collection in that language — try a different language.</div>` : null}

      ${status === 'ready' ? pageItems.map((h, i) => {
        const num = h.hadithnumber ?? h.number ?? (page * PAGE_SIZE + i + 1);
        const text = (h.text || h.body || '').toString().trim();
        const grade = Array.isArray(h.grades) && h.grades.length ? h.grades[0].grade : null;
        const bookmarked = hadithBookmarks.some((b) => b.collectionId === collectionId && b.number === String(num));
        const hasNote = !!notes[noteKeyFor(num)];
        return html`
          <div key=${num} class="arch-card hadith-card reveal" style=${{ cursor:'default', transitionDelay:(i*40)+'ms' }}>
            <div class="hadith-actions">
              <button class=${'mini-btn' + (bookmarked ? ' active' : '')} onClick=${() => toggleHadithBookmark(collection, num, text)} aria-label="Bookmark this hadith">
                <${Icon} name="bookmark" size=${13} filled=${bookmarked} />
              </button>
              <button class=${'mini-btn' + (hasNote ? ' active' : '')} onClick=${() => setNoteHadith({ number: num, text })} aria-label="Write a reflection on this hadith">
                <${Icon} name="note" size=${13} />
              </button>
            </div>
            <div class="hadith-src">${collection.name} · #${num}</div>
            ${text ? (isRtlLang
              ? html`<div class="hadith-ar">${text}</div>`
              : html`<div class="hadith-en">${text}</div>`
            ) : html`<div class="hadith-en" style=${{opacity:.6}}>No text available for this hadith.</div>`}
            ${grade ? html`<div class="surah-meta" style=${{marginTop:'8px',color:'var(--emerald-hi)'}}>${grade}</div>` : null}
          </div>
        `;
      }) : null}

      ${status === 'ready' ? html`
        <div class="pager reveal">
          <button disabled=${page <= 0} onClick=${() => setPage((p) => Math.max(0, p - 1))} style=${{transform:'scaleX(-1)'}} aria-label="Previous page"><${Icon} name="chev" size=${14} /></button>
          <span>Page ${page + 1} of ${pageCount}</span>
          <button disabled=${page >= pageCount - 1} onClick=${() => setPage((p) => Math.min(pageCount - 1, p + 1))} aria-label="Next page"><${Icon} name="chev" size=${14} /></button>
        </div>
      ` : null}

      ${noteHadith ? html`
        <${HadithNoteOverlay}
          collection=${collection}
          hadith=${noteHadith}
          isRtl=${isRtlLang}
          value=${notes[noteKeyFor(noteHadith.number)] || ''}
          onChange=${(text) => setNoteText(noteKeyFor(noteHadith.number), text)}
          onClose=${() => setNoteHadith(null)}
        />
      ` : null}
    </section>
  `;
}

function HadithNoteOverlay({ collection, hadith, value, onChange, onClose, isRtl }){
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`
    <div class="reader-overlay" style=${{zIndex:75}} onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="note-panel">
        <div class="reader-head">
          <div>
            <h3>Reflection</h3>
            <div class="surah-meta">${collection.name} · #${hadith.number}</div>
          </div>
          <button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="close" size=${16} /></button>
        </div>
        <div class="note-body">
          ${hadith.text ? html`<div class=${isRtl ? 'hadith-ar' : 'hadith-en'} style=${{marginBottom:'20px'}}>${hadith.text}</div>` : null}
          <label class="note-label">Write your reflection</label>
          <textarea
            class="note-textarea"
            value=${value}
            onInput=${(e) => onChange(e.target.value)}
            placeholder="What does this hadith teach you? Your notes are saved automatically, only on this device."
            autoFocus
          ></textarea>
          <div class="note-savedstate"><${Icon} name="save" size=${11} /> ${value.trim() ? 'Saved to your device' : 'Nothing written yet — start typing'}</div>
        </div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------
   9. PRAYER TIMES
--------------------------------------------------------------- */
const PRAYER_ORDER = ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'];
/* On Fridays the Dhuhr slot is shown as Jumu'ah (the Friday congregational prayer).
   Uses the device's local date, so it switches at midnight on its own. */
function prayerLabel(name, date){
  return (name === 'Dhuhr' && (date || new Date()).getDay() === 5) ? "Jumu'ah" : name;
}

/* Offline fallback for prayer times + Hijri date. The API call below
   still runs first whenever there's a connection (it's the more
   authoritative source), but if it fails — no internet, or a date
   that was never visited before while online — this computes prayer
   times locally from the sun's position (Muslim World League angles,
   matching method=3 used online) and converts the date to Hijri with
   the standard civil/tabular Islamic calendar. Neither needs a
   network request, so "today" always has an answer even offline. */
function julianDay(date){
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
function sunPosition(jd){
  const D = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * D) % 360;
  const q = (280.459 + 0.98564736 * D) % 360;
  const gRad = g * Math.PI / 180;
  const L = (q + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad)) % 360;
  const e = 23.439 - 0.00000036 * D;
  const eRad = e * Math.PI / 180, lRad = L * Math.PI / 180;
  const declination = Math.asin(Math.sin(eRad) * Math.sin(lRad)) * 180 / Math.PI;
  let ra = Math.atan2(Math.cos(eRad) * Math.sin(lRad), Math.cos(lRad)) * 180 / Math.PI / 15;
  ra = ((ra % 24) + 24) % 24;
  const eqt = q / 15 - ra;
  return { declination, eqt };
}
function sunAngleTime(angleDeg, jd, lat, lon, direction){
  const rad = Math.PI / 180;
  const { declination, eqt } = sunPosition(jd);
  const ratio = (-Math.sin(angleDeg * rad) - Math.sin(lat * rad) * Math.sin(declination * rad)) / (Math.cos(lat * rad) * Math.cos(declination * rad));
  if (ratio < -1 || ratio > 1) return null; // sun never reaches this angle here (polar latitudes)
  const t = Math.acos(ratio) / rad / 15;
  const noon = 12 - lon / 15 - eqt;
  return noon + direction * t;
}
function computePrayerTimesLocal(date, lat, lon){
  const jd = julianDay(date);
  const { declination, eqt } = sunPosition(jd);
  const noon = 12 - lon / 15 - eqt;
  const asrFactor = 1; // standard (Shafi'i/Maliki/Hanbali) shadow ratio
  /* sunAngleTime takes degrees BELOW the horizon, so Asr (sun above the horizon) is negative */
  const asrAngle = -Math.atan(1 / (asrFactor + Math.tan(Math.abs(lat - declination) * Math.PI / 180))) * 180 / Math.PI;
  const raw = {
    Fajr: sunAngleTime(18, jd, lat, lon, -1),
    Sunrise: sunAngleTime(0.833, jd, lat, lon, -1),
    Dhuhr: noon,
    Asr: sunAngleTime(asrAngle, jd, lat, lon, 1),
    Maghrib: sunAngleTime(0.833, jd, lat, lon, 1),
    Isha: sunAngleTime(17, jd, lat, lon, 1),
  };
  const fmt = (h) => {
    if (h == null) return '--:--';
    h = ((h % 24) + 24) % 24;
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };
  const out = {}; for (const k in raw) out[k] = fmt(raw[k]); return out;
}
const HIJRI_MONTHS = ['Muharram','Safar',"Rabi' al-awwal","Rabi' al-thani",'Jumada al-awwal','Jumada al-thani','Rajab',"Sha'ban",'Ramadan','Shawwal',"Dhu al-Qi'dah","Dhu al-Hijjah"];
function gregorianToHijriLocal(date){
  let l = Math.floor(julianDay(date)) - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { day, month: { en: HIJRI_MONTHS[month - 1] }, year };
}

/* Share today's prayer times with customise.js so the whole site can
   change colour with the real prayer periods (Fajr … Isha). */
function publishPrayer(timings){
  try {
    window.QM_PRAYER = timings;
    store.setJSON('prayer:last', { day: new Date().toDateString(), timings });
    window.dispatchEvent(new Event('qm-prayer'));
  } catch {}
}
function usePrayerTimes(geo){
  const [state, setState] = useState({ status:'idle', timings:null, date:null, offline:false });
  useEffect(() => {
    if (geo.status !== 'ready') return;
    setState((s) => ({ ...s, status:'loading' }));
    const today = new Date();
    const useLocalFallback = () => {
      const localT = computePrayerTimesLocal(today, geo.lat, geo.lon);
      publishPrayer(localT);
      setState({
        status:'ready',
        timings: localT,
        date: {
          hijri: gregorianToHijriLocal(today),
          gregorian: { day: today.getDate(), month: { en: today.toLocaleString('en', { month:'long' }) } },
        },
        offline: true,
      });
    };
    if (typeof navigator !== 'undefined' && !navigator.onLine) { useLocalFallback(); return; }
    fetch(`https://api.aladhan.com/v1/timings?latitude=${geo.lat}&longitude=${geo.lon}&method=3`)
      .then(r => r.json())
      .then((j) => { publishPrayer(j.data.timings); setState({ status:'ready', timings:j.data.timings, date:j.data.date, offline:false }); })
      .catch(useLocalFallback);
  }, [geo.status, geo.lat, geo.lon]);
  return state;
}

function nextPrayer(timings){
  if (!timings) return null;
  const now = new Date();
  const entries = PRAYER_ORDER.filter(k => k !== 'Sunrise').map((k) => {
    const [h, m] = (timings[k] || '00:00').split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return { name:k, time:timings[k], date:d };
  });
  let upcoming = entries.find((e) => e.date > now);
  if (!upcoming) { upcoming = { ...entries[0] }; upcoming.date = new Date(upcoming.date.getTime() + 86400000); }
  return { ...upcoming, msLeft: upcoming.date - now };
}

function fmtCountdown(ms){
  if (ms == null || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ---------------------------------------------------------------
   10. MOON + HIJRI
   Simplified synodic-month illumination model (accurate to within
   a fraction of a day) — a lighter-weight stand-in for the full
   SunCalc engine, drawn live on canvas.
--------------------------------------------------------------- */
function moonPhase(date = new Date()){
  const synodic = 29.530588861;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNewMoon) / 86400000;
  let age = days % synodic;
  if (age < 0) age += synodic;
  const illumination = (1 - Math.cos((2 * Math.PI * age) / synodic)) / 2;
  const waxing = age < synodic / 2;
  let name = 'New Moon';
  if (age < 1.5) name = 'New Moon';
  else if (age < 6.4) name = 'Waxing Crescent';
  else if (age < 8.4) name = 'First Quarter';
  else if (age < 13.8) name = 'Waxing Gibbous';
  else if (age < 15.8) name = 'Full Moon';
  else if (age < 21.1) name = 'Waning Gibbous';
  else if (age < 23.1) name = 'Last Quarter';
  else if (age < 28.5) name = 'Waning Crescent';
  return { age, illumination, waxing, name };
}

/* ---------- photoreal moon surface (ported from v2.0.html) ----------
   Real photograph clipped to the disc when it loads, with the exact
   same limb-darkening as the procedural fallback so both paths look
   consistent if the image is ever slow or unavailable. */
const qmMoonPhoto = new Image();
let qmMoonPhotoReady = false;
qmMoonPhoto.onload = () => { qmMoonPhotoReady = true; };
qmMoonPhoto.onerror = () => { qmMoonPhotoReady = false; };
qmMoonPhoto.src = 'moon-photo.png';

function qmMulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const MOON_MARIA = [
  { blobs: [{dx:-0.30,dy:-0.14,r:0.20},{dx:-0.14,dy:-0.24,r:0.17},{dx:-0.06,dy:-0.08,r:0.15}], a:0.30 },
  { blobs: [{dx: 0.06,dy:-0.32,r:0.14},{dx: 0.14,dy:-0.20,r:0.11}], a:0.26 },
  { blobs: [{dx: 0.26,dy:-0.12,r:0.15},{dx: 0.34,dy: 0.00,r:0.12}], a:0.28 },
  { blobs: [{dx: 0.08,dy: 0.10,r:0.18},{dx:-0.02,dy: 0.20,r:0.13},{dx: 0.18,dy: 0.18,r:0.12}], a:0.30 },
  { blobs: [{dx:-0.34,dy: 0.22,r:0.11},{dx:-0.24,dy: 0.30,r:0.09}], a:0.22 },
  { blobs: [{dx: 0.36,dy: 0.30,r:0.10}], a:0.20 },
];
const MOON_CRATERS = [
  {dx:-0.42,dy:-0.30,r:0.045,a:0.5,rim:true},{dx:-0.10,dy:-0.48,r:0.075,a:0.48,rim:true},
  {dx: 0.18,dy:-0.42,r:0.035,a:0.42},{dx: 0.40,dy:-0.28,r:0.05,a:0.48,rim:true},
  {dx:-0.48,dy:-0.05,r:0.03,a:0.4},{dx:-0.28,dy: 0.02,r:0.055,a:0.48,rim:true},
  {dx: 0.00,dy: 0.32,r:0.085,a:0.5,rim:true},{dx: 0.22,dy: 0.40,r:0.04,a:0.44},
  {dx: 0.46,dy: 0.02,r:0.045,a:0.46},{dx: 0.36,dy:-0.42,r:0.03,a:0.38},
  {dx:-0.20,dy: 0.42,r:0.045,a:0.44},{dx:-0.44,dy: 0.36,r:0.035,a:0.4},
  {dx: 0.08,dy:-0.10,r:0.025,a:0.34},{dx:-0.02,dy: 0.55,r:0.03,a:0.38},
  {dx: 0.52,dy: 0.30,r:0.03,a:0.38},{dx:-0.55,dy: 0.15,r:0.025,a:0.34},
  {dx: 0.30,dy: 0.14,r:0.03,a:0.38},{dx:-0.05,dy:-0.55,r:0.035,a:0.38},
  {dx: 0.55,dy:-0.05,r:0.028,a:0.34},{dx:-0.30,dy:-0.45,r:0.025,a:0.32},
  {dx: 0.14,dy: 0.02,r:0.018,a:0.3},{dx:-0.14,dy:-0.18,r:0.02,a:0.32},
  {dx: 0.42,dy: 0.16,r:0.022,a:0.32},{dx:-0.40,dy: 0.05,r:0.018,a:0.3},
];
const MOON_SPECKLE_RNG = qmMulberry32(1337);
const MOON_SPECKLES = Array.from({ length: 340 }, () => {
  const ang = MOON_SPECKLE_RNG() * Math.PI * 2;
  const rad = Math.sqrt(MOON_SPECKLE_RNG()) * 0.95;
  return { dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad, r: 0.003 + MOON_SPECKLE_RNG() * 0.009, a: 0.03 + MOON_SPECKLE_RNG() * 0.10, dark: MOON_SPECKLE_RNG() < 0.55 };
});

function paintMoonTexture(ctx, cx, cy, R){
  if (qmMoonPhotoReady) paintMoonPhoto(ctx, cx, cy, R);
  else paintMoonProcedural(ctx, cx, cy, R);
}
function paintMoonPhoto(ctx, cx, cy, R){
  const d = R * 2.06;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(qmMoonPhoto, cx - d / 2, cy - d / 2, d, d);
  ctx.restore();
  const limb = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.02);
  limb.addColorStop(0, 'rgba(15,14,12,0)'); limb.addColorStop(1, 'rgba(15,14,12,.24)');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = limb; ctx.fill();
}
function paintMoonProcedural(ctx, cx, cy, R){
  const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.04, cx, cy, R * 1.05);
  grad.addColorStop(0, '#f2f1ee'); grad.addColorStop(0.4, '#d9d7d1'); grad.addColorStop(0.68, '#b3b1a9'); grad.addColorStop(0.87, '#8d8b82'); grad.addColorStop(1, '#65635a');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();

  MOON_MARIA.forEach((m) => m.blobs.forEach((b) => {
    const mx = cx + b.dx * R, my = cy + b.dy * R, mr = b.r * R;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
    mg.addColorStop(0, `rgba(72,70,64,${m.a})`); mg.addColorStop(0.6, `rgba(72,70,64,${m.a * 0.75})`); mg.addColorStop(1, 'rgba(72,70,64,0)');
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fillStyle = mg; ctx.fill();
  }));
  MOON_CRATERS.forEach((c) => {
    const px = cx + c.dx * R, py = cy + c.dy * R, pr = Math.max(0.6, c.r * R);
    const cg = ctx.createRadialGradient(px, py, 0, px, py, pr * 1.35);
    cg.addColorStop(0, `rgba(38,37,33,${c.a})`); cg.addColorStop(0.55, `rgba(38,37,33,${c.a * 0.7})`); cg.addColorStop(0.85, `rgba(38,37,33,${c.a * 0.22})`); cg.addColorStop(1, 'rgba(38,37,33,0)');
    ctx.beginPath(); ctx.arc(px, py, pr * 1.35, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
    if (c.rim) { ctx.beginPath(); ctx.arc(px - pr * 0.32, py - pr * 0.32, pr * 0.42, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,253,246,${c.a * 0.22})`; ctx.fill(); }
  });
  MOON_SPECKLES.forEach((s) => {
    const sx = cx + s.dx * R, sy = cy + s.dy * R, sr = Math.max(0.35, s.r * R);
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = s.dark ? `rgba(40,39,35,${s.a})` : `rgba(250,249,244,${s.a})`;
    ctx.fill();
  });
  const limb = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.02);
  limb.addColorStop(0, 'rgba(15,14,12,0)'); limb.addColorStop(1, 'rgba(15,14,12,.24)');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = limb; ctx.fill();
}

function MoonCanvas({ phase }){
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const size = 170;
    canvas.width = size * DPR; canvas.height = size * DPR;
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const R = size / 2 - 4, cx = size / 2, cy = size / 2;

    function draw(){
      ctx.clearRect(0, 0, size, size);
      const f = Math.min(Math.max(phase.illumination, 0), 1);
      const waxing = phase.waxing;

      // faint earthshine so the dark side is never flat black
      const earthshine = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.08, cx, cy, R);
      earthshine.addColorStop(0, 'rgba(120,150,255,.10)'); earthshine.addColorStop(1, 'rgba(6,8,14,1)');
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = earthshine; ctx.fill();

      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      const dark = 'rgba(6,8,14,1)';

      // the half that's always fully lit (or fully lit before we cut into it)
      ctx.save();
      ctx.beginPath();
      if (waxing) ctx.rect(cx, cy - R, R, R * 2); else ctx.rect(cx - R, cy - R, R, R * 2);
      ctx.clip();
      paintMoonTexture(ctx, cx, cy, R);
      ctx.restore();

      const rx = R * Math.abs(1 - 2 * f);
      if (f > 0.5) {
        ctx.save();
        ctx.beginPath();
        if (waxing) ctx.rect(cx - R, cy - R, R, R * 2); else ctx.rect(cx, cy - R, R, R * 2);
        ctx.clip();
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, R, 0, 0, Math.PI * 2); ctx.clip();
        paintMoonTexture(ctx, cx, cy, R);
        ctx.restore();
      } else if (f < 0.5) {
        ctx.save();
        ctx.beginPath();
        if (waxing) ctx.rect(cx, cy - R, R, R * 2); else ctx.rect(cx - R, cy - R, R, R * 2);
        ctx.clip();
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, R, 0, 0, Math.PI * 2);
        ctx.fillStyle = dark; ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    draw();
    if (!qmMoonPhotoReady) { const onReady = () => { draw(); }; qmMoonPhoto.addEventListener('load', onReady, { once: true }); return () => qmMoonPhoto.removeEventListener('load', onReady); }
  }, [phase.age]);
  return html`<canvas ref=${ref}></canvas>`;
}

/* ---------------------------------------------------------------
   11. QIBLA — Leaflet map, real great-circle line to the Kaaba,
   live device heading, and manual location search (Nominatim).
--------------------------------------------------------------- */
function qiblaBearing(lat, lon){
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const phi1 = toRad(lat), phi2 = toRad(KAABA.lat);
  const dLambda = toRad(KAABA.lon - lon);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function qiblaDistanceKm(lat, lon){
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(KAABA.lat - lat), dLon = toRad(KAABA.lon - lon);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat)) * Math.cos(toRad(KAABA.lat)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* Qibla location names: results Nominatim labels "Israel" are shown as "Palestine",
   and a search for "Palestine" also finds those places. Display-only — the coordinates
   and the Qibla calculation are untouched. */
const QB_PALESTINE_RE = /\b(state of palestine|palestinian territories|palestine)\b/gi;
function qbRelabel(s){ return String(s || '').replace(/\bIsrael\b/g, 'Palestine'); }

function QiblaSection({ geo }){
  const mapElRef = useRef(null);
  const mapObj = useRef(null);
  const kaabaMarker = useRef(null);
  const userMarker = useRef(null);
  const pathLine = useRef(null);
  const [coords, setCoords] = useState(null);
  const [placeName, setPlaceName] = useState('');
  const [heading, setHeading] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [headingNote, setHeadingNote] = useState('');
  const ref = useReveal([geo.status]);

  useEffect(() => { if (geo.status === 'ready') { setCoords({ lat: geo.lat, lon: geo.lon }); setPlaceName(geo.city || ''); } }, [geo.status, geo.lat, geo.lon]);

  // try to auto-attach a live heading sensor on mount (skipped on iOS, which
  // requires an explicit permission button — see enableCompass below)
  useEffect(() => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      setHeadingNote("Live facing direction isn't available on this device or browser, so the heading cone can't be shown — the map and Qibla bearing above are unaffected.");
      return;
    }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') return; // needs a user gesture (iOS)
    let received = false;
    const eventName = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
    function handler(e){ if (e.alpha == null) return; received = true; setHeading(360 - e.alpha); }
    window.addEventListener(eventName, handler, true);
    const timer = setTimeout(() => {
      if (!received) {
        window.removeEventListener(eventName, handler, true);
        setHeadingNote("Live facing direction isn't available on this device or browser, so the heading cone can't be shown — the map and Qibla bearing above are unaffected.");
      }
    }, 2500);
    return () => { clearTimeout(timer); window.removeEventListener(eventName, handler, true); };
  }, []);

  // init map once
  useEffect(() => {
    if (!mapElRef.current || mapObj.current || typeof L === 'undefined') return;
    const map = L.map(mapElRef.current, { attributionControl: true, zoomControl: true });
    map.setView([20, 20], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const kaabaIcon = L.divIcon({ className: '', html: '<div class="qb-kaaba-pin">🕋</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
    kaabaMarker.current = L.marker([KAABA.lat, KAABA.lon], { icon: kaabaIcon, title: 'The Kaaba, Makkah' }).addTo(map);
    mapObj.current = map;
    return () => { map.remove(); mapObj.current = null; };
  }, []);

  // update map when coords change
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !coords) return;
    const userIcon = L.divIcon({ className: '', html: '<div class="qb-user-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    if (userMarker.current) userMarker.current.setLatLng([coords.lat, coords.lon]);
    else userMarker.current = L.marker([coords.lat, coords.lon], { icon: userIcon, title: 'Your location', zIndexOffset: 1000 }).addTo(map);
    if (pathLine.current) map.removeLayer(pathLine.current);
    pathLine.current = L.polyline([[coords.lat, coords.lon], [KAABA.lat, KAABA.lon]], { color: '#cf3342', weight: 3, opacity: .85, dashArray: '2 8' }).addTo(map);
    map.fitBounds(L.latLngBounds([[coords.lat, coords.lon], [KAABA.lat, KAABA.lon]]), { padding: [40, 40], maxZoom: 6 });
  }, [coords]);

  function enableCompass(){
    function onOrient(e){ if (e.alpha != null) setHeading(360 - e.alpha); }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then((res) => {
        if (res === 'granted') { setHeadingNote(''); window.addEventListener('deviceorientationabsolute', onOrient, true); window.addEventListener('deviceorientation', onOrient, true); }
        else setHeadingNote("Facing-direction permission wasn't granted, so the live heading cone can't be shown.");
      }).catch(() => setHeadingNote("Facing-direction permission wasn't granted, so the live heading cone can't be shown."));
    } else { window.addEventListener('deviceorientationabsolute', onOrient, true); window.addEventListener('deviceorientation', onOrient, true); }
  }

  function runSearch(q){
    setSearchQuery(q);
    if (q.trim().length < 3) { setSearchResults([]); return; }
    const base = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=6&q=';
    const alt = q.replace(QB_PALESTINE_RE, 'Israel');
    const urls = [base + encodeURIComponent(q)];
    if (alt !== q) urls.push(base + encodeURIComponent(alt));
    Promise.all(urls.map((u) => fetch(u).then((r) => r.json()).catch(() => []))).then((lists) => {
      const seen = new Set(), out = [];
      lists.forEach((l) => (Array.isArray(l) ? l : []).forEach((r) => {
        if (r && !seen.has(r.place_id)) { seen.add(r.place_id); out.push(r); }
      }));
      setSearchResults(out.slice(0, 6));
    });
  }
  function pickResult(r){
    setCoords({ lat: parseFloat(r.lat), lon: parseFloat(r.lon) });
    setPlaceName(qbRelabel(r.display_name.split(',').slice(0, 2).join(', ')));
    setSearchOpen(false); setSearchQuery(''); setSearchResults([]);
  }

  const bearing = coords ? qiblaBearing(coords.lat, coords.lon) : null;
  const distance = coords ? qiblaDistanceKm(coords.lat, coords.lon) : null;
  const needleRotation = bearing == null ? 0 : (heading != null ? bearing - heading : bearing);

  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">Qibla</div>
          <h2>Direction to the Kaaba</h2>
        </div>
        <p>Your location and the Kaaba, joined by the real great-circle path.</p>
      </div>

      <div class="qb-map-wrap reveal">
        <div class="qb-map" ref=${mapElRef}></div>
      </div>

      ${!coords ? html`<div class="center-msg"><div class="spinner"></div><div style=${{marginTop:'10px'}}>Finding your location…</div></div>` : html`
        <div class="qb-facing-banner reveal">From your location, the Qibla is <b>${compassPoint(bearing).toLowerCase()}</b> — bearing <b>${bearing.toFixed(1)}°</b> from true north.</div>

        <div class="qb-info-grid reveal">
          <div class="qb-info-box"><div class="qb-info-val">${compassPoint(bearing)}</div><div class="qb-info-lbl">Qibla direction</div></div>
          <div class="qb-info-box"><div class="qb-info-val">${bearing.toFixed(1)}°</div><div class="qb-info-lbl">Bearing from true north</div></div>
          <div class="qb-info-box"><div class="qb-info-val">${distance >= 1 ? Math.round(distance).toLocaleString() + ' km' : Math.round(distance*1000) + ' m'}</div><div class="qb-info-lbl">Distance to the Kaaba</div></div>
          <div class="qb-info-box"><div class="qb-info-val" style=${{fontSize:'14px'}}>${qbRelabel(placeName) || `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`}</div><div class="qb-info-lbl">Detected location</div></div>
        </div>

        ${headingNote ? html`<div class="qb-note reveal">${headingNote}</div>` : null}

        <div class="arch-card reveal" style=${{ cursor:'default', marginBottom:'14px' }}>
          <div class="qibla-wrap">
            <div class="qibla-deg">${Math.round(bearing)}°</div>
            <div class="surah-meta" style=${{marginBottom:'18px'}}>from true north${heading != null ? ' · live compass on' : ''}</div>
            <div class="compass">
              <div class="compass-ring"></div>
              <div class="compass-n">N</div>
              <div class="compass-needle" style=${{ transform:`translate(-50%,-100%) rotate(${needleRotation}deg)` }}></div>
              <div class="compass-center"></div>
            </div>
            ${heading == null && !headingNote ? html`<button class="btn btn-ghost" onClick=${enableCompass}><${Icon} name="compass" size=${15} /> Enable live heading</button>` : null}
          </div>
        </div>

        <button class="qb-wide-btn reveal" onClick=${() => setSearchOpen((s) => !s)}><${Icon} name="search" size=${15} /> Search for a location manually</button>
        ${searchOpen ? html`
          <div class="qb-search-wrap">
            <div class="search-box">
              <${Icon} name="search" size=${14} />
              <input placeholder="e.g. Tokyo, Japan or a full address" value=${searchQuery} onInput=${(e) => runSearch(e.target.value)} autoFocus />
            </div>
            ${searchResults.length > 0 ? html`
              <div class="qb-search-results">
                ${searchResults.map((r, i) => html`<div key=${i} class="qb-search-result" onClick=${() => pickResult(r)}>${qbRelabel(r.display_name)}</div>`)}
              </div>
            ` : null}
          </div>
        ` : null}

        <p class="surah-meta reveal" style=${{marginTop:'16px'}}>The Qibla bearing is calculated fresh from your coordinates and the Kaaba's fixed location (${KAABA.lat}° N, ${KAABA.lon}° E) every time your location changes — it is never a fixed or assumed direction.</p>
      `}
    </section>
  `;
}

/* ---------------------------------------------------------------
   12. ABOUT
--------------------------------------------------------------- */
function ProfileCard({ img, alt, name, children, gradient }){
  const [imgOk, setImgOk] = useState(true);
  return html`
    <div class="arch-card about-card reveal" style=${{ cursor:'default' }}>
      <div class="about-avatar" style=${!imgOk ? { background: gradient } : null}>
        ${imgOk ? html`<img src=${img} alt=${alt} loading="lazy" onError=${() => setImgOk(false)} />` : null}
      </div>
      <div class="about-info">
        <h3>${name}</h3>
        ${children}
      </div>
    </div>
  `;
}

const ABOUT_FEATURES = [
  { icon:'book', title:"The full Qur'an", desc:"All 114 surahs in Arabic (Uthmani script), with translations in 20 languages and 11 selectable Arabic fonts." },
  { icon:'play', title:'Audio recitation', desc:'5 reciters — Al-Afasy, Al-Husary, Al-Minshawi, Qari Shakir Qasmi and Abdul Rahman Mossad. Play verse by verse or the full surah, with the current ayah highlighted and auto-scrolled in sync.' },
  { icon:'bookmark', title:'Bookmarks', desc:'Save any ayah or hadith and find them again instantly from the bookmarks drawer.' },
  { icon:'note', title:'Personal reflections', desc:'Write your own notes on any ayah — saved automatically as you type.' },
  { icon:'search', title:'Hadith', desc:'Six major collections — Bukhari, Muslim, Abu Dawood, At-Tirmidhi, An-Nasa\'i and Ibn Majah — translated into nine languages, with bookmarking.' },
  { icon:'sun', title:'Prayer times', desc:"Live countdown to the next prayer for your location, in 12-hour format." },
  { icon:'moon', title:'Moon & Hijri calendar', desc:"Tonight's real moon phase rendered photographically, which way to look to see it, and today's Hijri date." },
  { icon:'compass', title:'Qibla finder', desc:'A live map with the true bearing and distance to the Kaaba, a device compass, and manual location search.' },
  { icon:'save', title:'100% local & private', desc:'Everything — bookmarks, notes, reciter and language choices — is saved only on your device, with optional folder backup, export and import. Nothing is ever uploaded.' },
];

/* ---------------------------------------------------------------
   OFFLINE — storage manager. Shows what's saved on this device,
   lets the user play or delete each recitation, and warms the
   Qur'an text cache for reading with no connection at all.
--------------------------------------------------------------- */
function OfflineSection(){
  const ref = useReveal();
  const online = useOnlineStatus();
  const { items, ready } = useDownloads();
  const [usage, setUsage] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [textStatus, setTextStatus] = useState(null);
  const [textProg, setTextProg] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  const fmt = (n) => (window.QMOffline ? window.QMOffline.formatBytes(n) : n + ' B');

  const refreshStorage = useCallback(() => {
    if (!window.QMOffline) return;
    window.QMOffline.estimate().then(setUsage);
    window.QMOffline.quranTextStatus().then(setTextStatus);
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(setPersisted).catch(() => {});
    }
  }, []);

  useEffect(() => { refreshStorage(); }, [refreshStorage, items.length]);

  /* Release the object URL on unmount, or the blob stays pinned in memory. */
  useEffect(() => () => {
    if (audioRef.current) audioRef.current.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  function stop(){
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setPlaying(null);
  }

  /* Plays straight from the stored blob rather than the network URL, so
     this works even if the service worker isn't controlling the page. */
  async function play(item){
    stop();
    const first = item.urls && item.urls[0];
    if (!first) return;
    const blobUrl = await window.QMOffline.getBlobURL(first);
    if (!blobUrl) return;
    urlRef.current = blobUrl;
    const audio = new Audio(blobUrl);
    audioRef.current = audio;
    setPlaying(item.id);

    let idx = 0;
    audio.onended = async () => {
      idx++;
      if (!item.urls[idx] || audioRef.current !== audio) { stop(); return; }
      const next = await window.QMOffline.getBlobURL(item.urls[idx]);
      if (!next || audioRef.current !== audio) { stop(); return; }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next;
      audio.src = next;
      audio.play().catch(() => stop());
    };
    audio.onerror = () => stop();
    audio.play().catch(() => stop());
  }

  async function saveText(){
    if (textProg) { window.QMOffline.cacheQuranText.cancel && window.QMOffline.cacheQuranText.cancel(); return; }
    setTextProg({ done: 0, total: 114 });
    try {
      await window.QMOffline.cacheQuranText({
        api: QURAN_API,
        arabicEdition: ARABIC_EDITION,
        translationEditions: LANGUAGES.map((l) => l.edition),
        onProgress: (p) => setTextProg(p),
      });
    } catch {}
    setTextProg(null);
    refreshStorage();
  }

  const totalBytes = items.reduce((a, b) => a + (b.bytes || 0), 0);
  const pctUsed = usage && usage.quota ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;

  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">On this device</div>
          <h2>Offline downloads</h2>
        </div>
        <p>Save recitations and the Qur'an text to this device so everything keeps working with no connection at all. Downloads are kept separately from the app cache, so updating Quran Maar never deletes them.</p>
      </div>

      <div class="arch-card reveal" style=${{ cursor:'default', marginBottom:'18px' }}>
        <div class="eyebrow" style=${{ marginBottom:'10px' }}>Status</div>
        <div class="offline-row">
          <div class="o-main">
            <div class="o-title">${online ? 'Connected' : 'Offline'}</div>
            <div class="o-sub">${online
              ? 'New surahs and prayer times will update as you browse.'
              : 'Reading anything already saved below still works normally.'}</div>
          </div>
          <div class="o-acts"><${Icon} name=${online ? 'offline' : 'cloudOff'} size=${20} /></div>
        </div>
        <div class="offline-row">
          <div class="o-main">
            <div class="o-title">Storage used by this app</div>
            <div class="o-sub">
              ${usage ? `${fmt(usage.usage)} of about ${fmt(usage.quota)} available` : 'Your browser does not report a storage estimate.'}
              ${persisted === true ? ' \u00b7 protected from automatic cleanup' : ''}
              ${persisted === false ? ' \u00b7 best-effort storage' : ''}
            </div>
            ${usage ? html`<div class="storage-bar"><span style=${{ width: pctUsed + '%' }}></span></div>` : null}
          </div>
        </div>
        <div class="offline-row">
          <div class="o-main">
            <div class="o-title">Qur'an text & translation</div>
            <div class="o-sub">
              ${textProg
                ? `Saving\u2026 ${textProg.done} of ${textProg.total} surahs`
                : textStatus
                  ? `All 114 surahs saved in Arabic + all ${(textStatus.translationEditions || []).length || LANGUAGES.length} translation languages.`
                  : online
                    ? 'Saving automatically in the background \u2014 no action needed.'
                    : 'Will save automatically next time you\u2019re online.'}
            </div>
            ${textProg ? html`<div class="dl-progress"><span style=${{ width: Math.round((textProg.done/textProg.total)*100) + '%' }}></span></div>` : null}
          </div>
          <div class="o-acts">
            <button class=${'dl-btn' + (textStatus && !textProg ? ' done' : '')} onClick=${saveText} disabled=${!online && !textProg}>
              <${Icon} name=${textProg ? 'close' : (textStatus ? 'check' : 'download')} size=${12} />
              ${textProg ? 'Cancel' : (textStatus ? 'Saved \u00b7 refresh' : 'Save now')}
            </button>
          </div>
        </div>
      </div>

      <div class="arch-card reveal" style=${{ cursor:'default' }}>
        <div style=${{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', marginBottom:'6px' }}>
          <div class="eyebrow">Saved recitations ${items.length ? `\u00b7 ${items.length}` : ''}</div>
          ${items.length ? html`
            <button class=${'dl-btn' + (confirmAll ? ' pill-danger' : '')}
              onClick=${async () => {
                if (!confirmAll) { setConfirmAll(true); setTimeout(() => setConfirmAll(false), 4000); return; }
                stop(); await window.QMOffline.deleteAllDownloads(); setConfirmAll(false); refreshStorage();
              }}>
              <${Icon} name="trash" size=${12} /> ${confirmAll ? 'Tap again to confirm' : 'Delete all'}
            </button>
          ` : null}
        </div>
        ${items.length ? html`<div class="o-sub" style=${{ marginBottom:'6px', color:'var(--muted-2)', fontSize:'12.5px' }}>${fmt(totalBytes)} of audio stored on this device.</div>` : null}

        ${!ready ? html`<div class="center-msg"><div class="spinner"></div></div>` : null}
        ${ready && !items.length ? html`
          <div class="o-empty">
            Nothing downloaded yet.<br/>
            Open the Qur'an tab and tap <strong>Save</strong> on any surah to keep that recitation on your device.
          </div>
        ` : null}

        ${items.map((it) => html`
          <div class="offline-row" key=${it.id}>
            <div class="o-main">
              <div class="o-title">${it.surahNumber}. ${it.surahEnglish || it.surahName}</div>
              <div class="o-sub">
                ${it.reciterName}<span class="dot"></span>${fmt(it.bytes)}
                <span class="dot"></span>${it.files} ${it.files === 1 ? 'file' : 'files'}
                ${it.partial ? html`<span class="dot"></span><span style=${{color:'var(--danger)'}}>partial \u2014 ${it.expected - it.files} missing</span>` : null}
              </div>
            </div>
            <div class="o-acts">
              <button class=${'dl-btn' + (playing === it.id ? ' busy' : '')} onClick=${() => playing === it.id ? stop() : play(it)}>
                <${Icon} name=${playing === it.id ? 'pause' : 'play'} size=${12} filled=${true} />
                ${playing === it.id ? 'Stop' : 'Play'}
              </button>
              <button class="dl-btn pill-danger" onClick=${async () => { if (playing === it.id) stop(); await window.QMOffline.deleteDownload(it.id); refreshStorage(); }}>
                <${Icon} name="trash" size=${12} />
              </button>
            </div>
          </div>
        `)}
      </div>

      <div class="arch-card reveal" style=${{ cursor:'default', marginTop:'18px' }}>
        <div class="eyebrow" style=${{ marginBottom:'10px' }}>Good to know</div>
        <div class="surah-meta" style=${{ lineHeight:'1.75' }}>
          Verse-by-verse reciters store one audio file per ayah, so a long surah can be several hundred files and tens of megabytes \u2014 Al-Baqarah is the heaviest. Qari Shakir Qasmi and Abdul Rahman Mossad are single continuous recordings, so they download as one file.
          <br/><br/>
          Add Quran Maar to your home screen to let the browser reserve storage for it. Clearing your browser's site data will remove downloads, as will iOS reclaiming space from a web app you haven't opened in a while.
        </div>
      </div>
    </section>
  `;
}

function SettingsSection(){
  const ref = useReveal();
  const host = useRef(null);
  useEffect(() => {
    const q = window.QMCustomise;
    if (q && q.mount && host.current) q.mount(host.current);
    return () => { if (q && q.unmount) q.unmount(); };
  }, []);
  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">Settings</div>
          <h2>Make it yours</h2>
        </div>
        <p>Colours, animation and ease of access. Saved on this device only.</p>
      </div>
      <div ref=${host} class="qm-settings-host"></div>
    </section>
  `;
}

function AboutSection(){
  const ref = useReveal();
  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">About</div>
          <h2>Everything inside Quran Maar</h2>
        </div>
        <p>Free, private, and built to be used every day.</p>
      </div>
      <div class="surah-grid" style=${{marginBottom:'46px'}}>
        ${ABOUT_FEATURES.map((f, i) => html`
          <div key=${f.title} class="arch-card reveal" style=${{ cursor:'default', transitionDelay:(i*45)+'ms' }}>
            <div class="surah-top">
              <span class="surah-num"><${Icon} name=${f.icon} size=${14} /></span>
            </div>
            <div class="surah-en">${f.title}</div>
            <div class="surah-meta" style=${{lineHeight:'1.55'}}>${f.desc}</div>
          </div>
        `)}
      </div>

      <div class="section-head reveal">
        <div>
          <div class="eyebrow">Who built this</div>
        </div>
      </div>

      <${ProfileCard} img="Quran.Maar.jpg" alt="Md Adil Ahmed Rajon, creator and developer of Quran Maar" name="Md Adil Ahmed Rajon" gradient="linear-gradient(135deg,var(--gold),var(--emerald-hi))">
        <p>I am Md Adil Ahmed Rajon. I created this modern Islamic learning platform to help you read the Qur'an in Arabic and many other languages, check accurate prayer times with live countdowns, and follow a Hijri calendar. I designed it for simplicity and clarity, so you can explore the Qur'an and Islamic practices in an interactive and respectful way.</p>
        <p>To collaborate or work with me, you can call me at +44 07440445929 or email me at <a href="mailto:20rajona@gmail.com" style=${{color:'var(--gold-hi)', textDecoration:'underline'}}>20rajona@gmail.com</a>.</p>
        <p class="surah-meta">© 2026 Md Adil Ahmed Rajon</p>
      <//>

      <${ProfileCard} img="Quran.Maar2.jpg" alt="Adil Hasan, photography and media contributor for Quran Maar" name="Adil Hasan" gradient="linear-gradient(135deg,var(--emerald-hi),var(--gold))">
        <p>Hi! I'm Adil Hasan. I helped build this website by taking the pictures and media that were needed to make it complete. I'm glad I could contribute and help bring this project to life.</p>
      <//>
    </section>
  `;
}

/* ---------------------------------------------------------------
   13. BOOKMARKS DRAWER + FOOTER
--------------------------------------------------------------- */
function BookmarksDrawer({ open, onClose, bookmarks, remove, hadithBookmarks, removeHadith }){
  if (!open) return null;
  const empty = bookmarks.length === 0 && hadithBookmarks.length === 0;
  return html`
    <div class="bm-panel" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="bm-drawer">
        <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <span class="brand-text" style=${{fontSize:'20px'}}>Bookmarks</span>
          <button class="icon-btn" onClick=${onClose}><${Icon} name="close" size=${15} /></button>
        </div>
        ${empty ? html`<div class="center-msg">No bookmarks yet — tap the bookmark icon on any ayah or hadith.</div>` : null}

        ${bookmarks.length > 0 ? html`
          <div class="eyebrow" style=${{marginBottom:'10px'}}>Qur'an</div>
          ${bookmarks.map((b) => html`
            <div key=${`${b.surah}-${b.ayah}`} class="bm-item">
              <div class="bm-top"><span>${b.surahName} ${b.surah}:${b.ayah}</span><button class="mini-btn" style=${{width:'24px',height:'24px'}} onClick=${() => remove(b)}><${Icon} name="close" size=${11} /></button></div>
              <div class="bm-text">${b.text}</div>
            </div>
          `)}
        ` : null}

        ${hadithBookmarks.length > 0 ? html`
          <div class="eyebrow" style=${{margin:'18px 0 10px'}}>Hadith</div>
          ${hadithBookmarks.map((b) => html`
            <div key=${`${b.collectionId}-${b.number}`} class="bm-item">
              <div class="bm-top"><span>${b.collectionName} #${b.number}</span><button class="mini-btn" style=${{width:'24px',height:'24px'}} onClick=${() => removeHadith(b)}><${Icon} name="close" size=${11} /></button></div>
              <div class="bm-text" style=${{fontFamily:"'Plus Jakarta Sans',sans-serif", textAlign:'left', direction:'ltr', fontSize:'13.5px', color:'var(--muted)'}}>${b.text}</div>
            </div>
          `)}
        ` : null}
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------
   12b. VIDEOS — live uploads + view counts from both MAAR channels
   Data comes from /api/videos (see api/videos.js), which Vercel
   caches for 30 min. The last good response is kept in localStorage
   so the page still shows videos when the device is offline.
--------------------------------------------------------------- */
const YT_CACHE_KEY = 'yt_cache_v1';
/* The video feed is a Vercel function. Static hosts (GitHub Pages, file://)
   can't run it, so there the app calls the Vercel copy of the site. */
const YT_VERCEL_ORIGIN = 'https://quranmaar.vercel.app';
const YT_API_URL = (/(^|\.)github\.io$/.test(location.hostname) || location.protocol === 'file:')
  ? YT_VERCEL_ORIGIN + '/api/videos'
  : '/api/videos';
const YT_FALLBACK_CHANNELS = [
  { id:'nashid', name:'MAAR NASHID', handle:'MAAR-NASHID', url:'https://www.youtube.com/@MAAR-NASHID' },
  { id:'gojol',  name:'MAAR GOJOL',  handle:'MAARGOJOL',   url:'https://www.youtube.com/@MAARGOJOL' },
];
const ytCompact = new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:1 });
const ytWhole = new Intl.NumberFormat('en');
const ytViews = (n) => (n == null ? '—' : ytCompact.format(n));
function ytDuration(s){
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
function ytAgo(iso){
  const t = new Date(iso).getTime();
  if (!t) return '';
  const mins = (Date.now() - t) / 60000, hrs = mins / 60, days = hrs / 24;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric:'auto' });
  if (mins < 60) return rtf.format(-Math.max(1, Math.round(mins)), 'minute');
  if (hrs < 24) return rtf.format(-Math.round(hrs), 'hour');
  if (days < 30) return rtf.format(-Math.round(days), 'day');
  if (days < 365) return rtf.format(-Math.round(days / 30), 'month');
  return rtf.format(-Math.round(days / 365), 'year');
}
const ytIsNew = (iso) => Date.now() - new Date(iso).getTime() < 7 * 864e5;

/* Fetches + caches the feed; refreshes every 10 min and whenever the
   tab becomes visible again, so a left-open page never goes stale. */
function useYouTube(){
  const [data, setData] = useState(() => store.getJSON(YT_CACHE_KEY, null));
  const [status, setStatus] = useState('loading');
  const load = useCallback(async () => {
    try {
      const r = await fetch(YT_API_URL, { cache:'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (!j || !Array.isArray(j.videos)) throw new Error('bad payload');
      setData(j); setStatus('ok'); store.setJSON(YT_CACHE_KEY, j);
    } catch { setStatus('error'); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', load);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', load); };
  }, [load]);
  return { data, status, reload: load };
}


/* ---- Offline videos: files live in IndexedDB (inside the website's own
   storage), never in the phone gallery. Only videos you host yourself
   (listed in media.json) can be saved — YouTube embeds cannot. ---- */
const YTStore = {
  _db: null,
  open(){
    return this._db || (this._db = new Promise((res, rej) => {
      const r = indexedDB.open('qm-videos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  },
  async tx(mode, fn){
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode);
      const req = fn(t.objectStore('files'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  },
  get(id){ return this.tx('readonly', (s) => s.get(id)); },
  keys(){ return this.tx('readonly', (s) => s.getAllKeys()); },
  async put(id, v){ await this.tx('readwrite', (s) => s.put(v, id)); window.dispatchEvent(new Event('yt-saved-changed')); },
  async del(id){ await this.tx('readwrite', (s) => s.delete(id)); window.dispatchEvent(new Event('yt-saved-changed')); },
};

/* Saved videos not played for 28 days are deleted automatically to free
   storage. Dates live in localStorage (cheap), not inside the big file. */
const YT_STALE_MS = 28 * 864e5;
const ytMeta = {
  all(){ return store.getJSON('yt_saved_meta_v1', {}); },
  touch(id, patch){ const m = this.all(); m[id] = Object.assign({}, m[id], patch); store.setJSON('yt_saved_meta_v1', m); },
  drop(id){ const m = this.all(); delete m[id]; store.setJSON('yt_saved_meta_v1', m); },
};
let _ytCleaned = false;
async function ytCleanupStale(){
  if (_ytCleaned) return;
  _ytCleaned = true;
  try {
    const ids = await YTStore.keys();
    const meta = ytMeta.all();
    const now = Date.now();
    for (const id of ids) {
      const m = meta[id];
      if (!m) { ytMeta.touch(id, { savedAt: now, lastPlayedAt: now }); continue; } // start the clock for older saves
      if (now - (m.lastPlayedAt || m.savedAt || now) > YT_STALE_MS) { await YTStore.del(id); ytMeta.drop(id); }
    }
  } catch {}
}

async function ytDownload(video, media, onPct){
  const url = new URL(media.src, location.href).href;
  const kind = media.type === 'audio' ? 'audio' : 'video';
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = +r.headers.get('content-length') || 0;
  const chunks = []; let got = 0;
  if (r.body && r.body.getReader) {
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      if (onPct) onPct(total ? Math.round((got / total) * 100) : -1);
    }
  } else { chunks.push(new Uint8Array(await r.arrayBuffer())); }
  const blob = new Blob(chunks, { type: r.headers.get('content-type') || (kind === 'audio' ? 'audio/mpeg' : 'video/mp4') });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await YTStore.put(video.id, { blob, type: kind, title: video.title, savedAt: Date.now() });
  ytMeta.touch(video.id, { savedAt: Date.now(), lastPlayedAt: Date.now() });
}

/* media.json maps a YouTube video id to a file you host:
   { "VIDEO_ID": { "src": "media/name.mp3", "type": "audio" } }  (type: audio | video) */
function useYtOffline(){
  const [mediaMap, setMediaMap] = useState(() => store.getJSON('yt_media_v1', {}));
  const [savedIds, setSavedIds] = useState([]);
  const refresh = useCallback(() => { YTStore.keys().then(setSavedIds).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    ytCleanupStale().then(refresh);
    window.addEventListener('yt-saved-changed', refresh);
    fetch('media.json', { cache:'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j && typeof j === 'object') { setMediaMap(j); store.setJSON('yt_media_v1', j); }
    }).catch(() => {});
    return () => window.removeEventListener('yt-saved-changed', refresh);
  }, [refresh]);
  return { mediaMap, savedIds };
}

/* Keeps the screen from sleeping while `active`. The browser drops the lock
   whenever the page is hidden, so it is re-requested when the page returns. */
function useWakeLock(active){
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock = null, stopped = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (stopped) { l.release().catch(() => {}); } else { lock = l; }
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === 'visible' && !stopped) acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); if (lock) lock.release().catch(() => {}); };
  }, [active]);
}

/* ---- Custom player controls: a themed bar (play, time, seek, volume and a
   3-dot menu) that drives either the hosted file or the YouTube player. ---- */
const YT_BASE_ST = { playing:false, t:0, d:0, vol:1, muted:false, rate:1, loop:false };

function useNativeCtl(ref, active, dep){
  const [st, setSt] = useState(YT_BASE_ST);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const sync = () => setSt({ playing: !el.paused && !el.ended, t: el.currentTime || 0, d: isFinite(el.duration) ? el.duration : 0, vol: el.volume, muted: el.muted, rate: el.playbackRate, loop: el.loop });
    const evs = ['timeupdate','durationchange','loadedmetadata','play','pause','ended','volumechange','ratechange','seeked'];
    evs.forEach((e) => el.addEventListener(e, sync));
    sync();
    return () => evs.forEach((e) => el.removeEventListener(e, sync));
  }, [active, dep]);
  const ctl = useMemo(() => {
    const el = () => ref.current;
    return {
      play(){ const e = el(); if (e) e.play().catch(() => {}); },
      pause(){ const e = el(); if (e) e.pause(); },
      seek(t){ const e = el(); if (e) e.currentTime = t; },
      volume(v){ const e = el(); if (e) { e.volume = v; e.muted = v === 0; } },
      mute(m){ const e = el(); if (e) e.muted = m; },
      rate(r){ const e = el(); if (e) e.playbackRate = r; },
      loop(b){ const e = el(); if (e) { e.loop = b; setSt((s) => Object.assign({}, s, { loop: b })); } },
    };
  }, []);
  return { st, ctl };
}

let _ytApiP = null;
function loadYtApi(){
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  return _ytApiP || (_ytApiP = new Promise((res) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(window.YT); };
    const sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(sc);
  }));
}

function useYtApiCtl(hostRef, videoId, active){
  const [st, setSt] = useState(YT_BASE_ST);
  const pRef = useRef(null), loopRef = useRef(false);
  useEffect(() => {
    if (!active) return;
    let dead = false;
    const sync = () => {
      const p = pRef.current;
      if (!p || !p.getPlayerState) return;
      setSt((s) => Object.assign({}, s, { playing: p.getPlayerState() === 1, t: p.getCurrentTime() || 0, d: p.getDuration() || 0, vol: p.getVolume() / 100, muted: p.isMuted(), rate: p.getPlaybackRate() }));
    };
    loadYtApi().then((YT) => {
      if (dead || !hostRef.current) return;
      const mount = document.createElement('div');
      hostRef.current.appendChild(mount);
      pRef.current = new YT.Player(mount, {
        videoId, width:'100%', height:'100%', host:'https://www.youtube-nocookie.com',
        playerVars: { autoplay:1, controls:0, rel:0, modestbranding:1, playsinline:1, disablekb:1 },
        events: {
          onReady: (e) => { try { e.target.playVideo(); } catch {} sync(); },
          onStateChange: (e) => { if (e.data === 0 && loopRef.current) { e.target.seekTo(0); e.target.playVideo(); } sync(); },
        },
      });
    });
    const timer = setInterval(sync, 300);
    return () => { dead = true; clearInterval(timer); try { if (pRef.current && pRef.current.destroy) pRef.current.destroy(); } catch {} pRef.current = null; };
  }, [active, videoId]);
  const ctl = useMemo(() => {
    const p = () => pRef.current;
    return {
      play(){ const x = p(); if (x && x.playVideo) x.playVideo(); },
      pause(){ const x = p(); if (x && x.pauseVideo) x.pauseVideo(); },
      seek(t){ const x = p(); if (x && x.seekTo) x.seekTo(t, true); },
      volume(v){ const x = p(); if (x && x.setVolume) { x.setVolume(Math.round(v * 100)); if (v === 0) x.mute(); else x.unMute(); } },
      mute(m){ const x = p(); if (x && x.mute) { if (m) x.mute(); else x.unMute(); } },
      rate(r){ const x = p(); if (x && x.setPlaybackRate) x.setPlaybackRate(r); },
      loop(b){ loopRef.current = b; setSt((s) => Object.assign({}, s, { loop: b })); },
    };
  }, []);
  return { st, ctl };
}

function YtBar({ st, ctl, isSaved, busy, pct, onSave, onRemove, onDownload, videoId }){
  const [menu, setMenu] = useState(false);
  const [sub, setSub] = useState('');
  const [sleep, setSleep] = useState(0);
  useEffect(() => {
    if (!sleep) return;
    const t = setTimeout(() => { ctl.pause(); setSleep(0); }, sleep * 60000);
    return () => clearTimeout(t);
  }, [sleep]);
  const fmt = (n) => ytDuration(Math.max(0, Math.floor(n || 0)));
  const close = () => { setMenu(false); setSub(''); };
  const vol = st.muted ? 0 : st.vol;
  const done = st.d ? (st.t / st.d) * 100 : 0;
  const ck = (on) => (on ? html`<span class="ck"><${Icon} name="check" size=${14} /></span>` : null);
  return html`
    <div class="yt-ctl">
      <button class="yt-cb" onClick=${() => (st.playing ? ctl.pause() : ctl.play())} aria-label=${st.playing ? 'Pause' : 'Play'}>
        <${Icon} name=${st.playing ? 'pause' : 'play'} size=${20} filled=${true} />
      </button>
      <span class="yt-time">${fmt(st.t)} / ${fmt(st.d)}</span>
      <input class="yt-seek" type="range" min="0" max=${st.d || 0} step="0.1" value=${Math.min(st.t, st.d || 0)}
        style=${{ '--p': done + '%' }} aria-label="Seek" onInput=${(e) => ctl.seek(+e.target.value)} />
      <button class="yt-cb" onClick=${() => (vol === 0 ? ctl.volume(1) : ctl.mute(true))} aria-label=${vol === 0 ? 'Unmute' : 'Mute'}>
        <${Icon} name=${vol === 0 ? 'mute' : 'volume'} size=${20} />
      </button>
      <input class="yt-vol" type="range" min="0" max="1" step="0.05" value=${vol}
        style=${{ '--p': (vol * 100) + '%' }} aria-label="Volume" onInput=${(e) => ctl.volume(+e.target.value)} />
      <div class="yt-more">
        <button class="yt-cb" onClick=${() => { setMenu(!menu); setSub(''); }} aria-label="More options" aria-expanded=${menu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>
        </button>
        ${menu ? html`
          <div class="yt-scrim" onClick=${close}></div>
          <div class="yt-menu" role="menu">
            ${sub === '' ? html`
              <button role="menuitem" onClick=${() => { onDownload(); close(); }}>
                <${Icon} name="download" size=${16} /> Download
              </button>
              <button role="menuitem" disabled=${busy} onClick=${() => { if (isSaved) onRemove(); else onSave(); close(); }}>
                <${Icon} name=${isSaved ? 'trash' : 'offline'} size=${16} />
                ${isSaved ? 'Remove from app' : (busy ? (pct >= 0 ? `Saving… ${pct}%` : 'Saving…') : 'Save in app (offline)')}
              </button>
              <button role="menuitem" onClick=${() => setSub('speed')}>Playback speed <em>${st.rate}x</em></button>
              <button role="menuitem" onClick=${() => ctl.loop(!st.loop)}>Loop <em>${st.loop ? 'On' : 'Off'}</em></button>
              <button role="menuitem" onClick=${() => setSub('sleep')}>Sleep timer <em>${sleep ? sleep + ' min' : 'Off'}</em></button>
              <a role="menuitem" href=${`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener" onClick=${close}>Open on YouTube</a>
            ` : (sub === 'speed' ? html`
              <button role="menuitem" class="back" onClick=${() => setSub('')}>‹ Playback speed</button>
              ${[0.75, 1, 1.25, 1.5, 2].map((r) => html`<button key=${r} role="menuitem" onClick=${() => { ctl.rate(r); close(); }}>${r === 1 ? 'Normal' : r + 'x'} ${ck(st.rate === r)}</button>`)}
            ` : html`
              <button role="menuitem" class="back" onClick=${() => setSub('')}>‹ Sleep timer</button>
              ${[0, 15, 30, 60].map((m) => html`<button key=${m} role="menuitem" onClick=${() => { setSleep(m); close(); }}>${m ? m + ' minutes' : 'Off'} ${ck(sleep === m)}</button>`)}
            `)}
          </div>
        ` : null}
      </div>
    </div>
  `;
}

function YtPlayer({ video, channelName, onClose, onNext }){
  const { mediaMap, savedIds } = useYtOffline();
  const media = mediaMap[video.id];
  const isSaved = savedIds.includes(video.id);
  const [blobUrl, setBlobUrl] = useState('');
  const [savedType, setSavedType] = useState('');
  const [dl, setDl] = useState(null);
  const mediaRef = useRef(null);
  const frameRef = useRef(null);

  /* Saved copy → play from the browser's own storage (works offline). */
  useEffect(() => {
    let url = '', dead = false;
    if (isSaved) {
      YTStore.get(video.id).then((rec) => {
        if (dead || !rec) return;
        url = URL.createObjectURL(rec.blob);
        setSavedType(rec.type || ''); setBlobUrl(url);
      }).catch(() => {});
    } else { setBlobUrl(''); }
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [isSaved, video.id]);

  const native = !!(media || isSaved);
  const kind = (media && media.type === 'audio') || (!media && savedType === 'audio') ? 'audio' : 'video';
  const mediaUrl = media ? new URL(media.src, location.href).href : '';
  const src = blobUrl || (isSaved ? '' : mediaUrl);
  const nat = useNativeCtl(mediaRef, native, kind + '|' + src);
  const yt = useYtApiCtl(frameRef, video.id, !native);
  const { st, ctl } = native ? nat : yt;

  /* Screen stays on while watching video (YouTube or file). Audio-only
     playback lets the screen sleep so the battery isn't wasted. */
  useWakeLock(!(native && kind === 'audio'));

  /* Lock-screen / notification controls, so audio keeps going when locked. */
  useEffect(() => {
    if (!native || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const el = () => mediaRef.current;
    try {
      ms.metadata = new MediaMetadata({
        title: video.title, artist: channelName,
        artwork: video.thumb ? [{ src: video.thumb, sizes:'480x360', type:'image/jpeg' }] : [],
      });
      ms.setActionHandler('play', () => el() && el().play());
      ms.setActionHandler('pause', () => el() && el().pause());
      ms.setActionHandler('seekbackward', () => { if (el()) el().currentTime = Math.max(0, el().currentTime - 10); });
      ms.setActionHandler('seekforward', () => { if (el()) el().currentTime += 10; });
    } catch {}
    return () => { try { ['play','pause','seekbackward','seekforward'].forEach((a) => navigator.mediaSession.setActionHandler(a, null)); } catch {} };
  }, [native, video.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const markPlayed = () => { if (isSaved) ytMeta.touch(video.id, { lastPlayedAt: Date.now() }); };
  async function save(){
    if (dl && dl.pct !== undefined) return;
    if (!media) { setDl({ none: true }); return; }
    setDl({ pct: 0 });
    try { await ytDownload(video, media, (p) => setDl({ pct: p })); setDl(null); }
    catch { setDl({ error: true }); }
  }
  /* Chrome-style "Download": hands the file to the browser's normal download. */
  async function downloadFile(){
    try {
      let blob = null;
      if (isSaved) { const rec = await YTStore.get(video.id); blob = rec && rec.blob; }
      if (!blob && media) {
        const r = await fetch(mediaUrl);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        blob = await r.blob();
      }
      if (!blob) { setDl({ none: true }); return; }
      const fromSrc = media && /\.([a-z0-9]{2,4})$/i.exec(media.src);
      const ext = fromSrc ? fromSrc[1].toLowerCase() : (kind === 'audio' ? 'mp3' : 'mp4');
      const name = (video.title || video.id).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || video.id;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '.' + ext;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch { setDl({ error: true }); }
  }
  async function removeSaved(){ try { await YTStore.del(video.id); ytMeta.drop(video.id); } catch {} }

  return html`
    <div class="yt-modal" onClick=${onClose} role="dialog" aria-modal="true" aria-label=${video.title}>
      <div class="yt-modal-box" onClick=${(e) => e.stopPropagation()}>
        ${native ? (kind === 'audio' ? html`
          <div class="yt-audio">
            ${video.thumb ? html`<img src=${video.thumb} alt="" />` : null}
            <audio ref=${mediaRef} src=${src || undefined} onPlay=${markPlayed} autoplay preload="auto"></audio>
          </div>
        ` : html`
          <div class="yt-frame">
            <video ref=${mediaRef} src=${src || undefined} poster=${video.thumb} onPlay=${markPlayed}
              onClick=${() => (st.playing ? ctl.pause() : ctl.play())} autoplay playsinline preload="auto"></video>
          </div>
        `) : html`<div class="yt-frame" ref=${frameRef}></div>`}
        <${YtBar} st=${st} ctl=${ctl} isSaved=${isSaved} busy=${!!(dl && dl.pct !== undefined)} pct=${dl && dl.pct}
          onSave=${save} onRemove=${removeSaved} onDownload=${downloadFile} videoId=${video.id} />
        <div class="yt-modal-info">
          <div>
            <div class="yt-modal-title">${video.title}</div>
            <div class="yt-modal-meta">${[channelName, video.views != null ? `${ytWhole.format(video.views)} views` : '', video.publishedAt ? ytAgo(video.publishedAt) : '', isSaved ? 'saved offline' : ''].filter(Boolean).join(' · ')}</div>
            ${isSaved ? html`<div class="yt-modal-meta">Removed automatically if not played for 28 days.</div>` : null}
            ${dl && dl.none ? html`<div class="yt-dl-note">A downloadable copy of this video isn't available yet.</div>` : null}
            ${dl && dl.error ? html`<div class="yt-dl-note">Couldn't download. Check your connection and try again.</div>` : null}
          </div>
          <div class="yt-modal-actions">
            ${video.pulse ? html`<a class="btn btn-ghost" href=${video.pulse} target="_blank" rel="noopener">MAAR Pulse</a>` : null}
            <a class="btn btn-ghost" href=${`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener">YouTube</a>
            ${onNext ? html`<button class="btn btn-gold" onClick=${onNext}>Next part</button>` : null}
            <button class="btn btn-ghost" onClick=${onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function YtCard({ video, channelName, onPlay, index, saved, media }){
  const open = () => onPlay(video);
  return html`
    <div class="yt-card reveal" role="button" tabindex="0" style=${{ transitionDelay: ((index % 6) * 50) + 'ms' }}
      onClick=${open} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }} title=${video.title}>
      <span class="yt-thumb">
        <img src=${video.thumb} alt="" loading="lazy" decoding="async" />
        <span class="yt-play"><span><${Icon} name="play" size=${20} filled=${true} /></span></span>
        ${ytIsNew(video.publishedAt) ? html`<span class="yt-new">New</span>` : null}
        ${saved ? html`<span class="yt-saved">Saved</span>` : null}
        <span class="yt-tag">${channelName}</span>
        ${video.part ? html`<span class="yt-part">Part ${video.part}</span>` : null}
        ${video.watched ? html`<span class="yt-saved">Watched</span>` : null}
        ${video.duration != null ? html`<span class="yt-dur">${ytDuration(video.duration)}</span>` : null}
      </span>
      <span class="yt-body">
        <span class="yt-title">${video.title}</span>
        ${video.sub ? html`<span class="yt-meta"><span>${video.sub}</span></span>` : html`<span class="yt-meta">
          <span class="yt-views"><${Icon} name="eye" size=${14} /> ${ytViews(video.views)} views</span>
          <span class="yt-dot">·</span>
          <span>${ytAgo(video.publishedAt)}</span>
        </span>`}
      </span>
    </div>
  `;
}

function VideosSection(){
  const ref = useReveal();
  const { data, status, reload } = useYouTube();
  const { mediaMap, savedIds } = useYtOffline();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('new');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(18);
  const [playing, setPlaying] = useState(null);

  const channels = (data && data.channels && data.channels.length) ? data.channels : YT_FALLBACK_CHANNELS;
  const all = (data && data.videos) || [];
  const nameOf = (id) => (channels.find((c) => c.id === id) || {}).name || id;

  const list = useMemo(() => {
    let v = all.filter((x) => filter === 'all' || (filter === 'saved' ? savedIds.includes(x.id) : x.channel === filter));
    const s = q.trim().toLowerCase();
    if (s) v = v.filter((x) => (x.title || '').toLowerCase().includes(s));
    return [...v].sort(sort === 'top'
      ? (a, b) => (b.views || 0) - (a.views || 0)
      : (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }, [all, filter, sort, q, savedIds]);
  useEffect(() => { setLimit(18); }, [filter, sort, q]);

  const totalViews = all.reduce((n, v) => n + (v.views || 0), 0);
  const newCount = all.filter((v) => ytIsNew(v.publishedAt)).length;
  const loadingFirst = !data && status === 'loading';

  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">Videos</div>
          <h2>Nasheeds & Gojol, straight from YouTube</h2>
        </div>
        <p>Every upload from both MAAR channels, with live view counts. This page refreshes itself — no need to check YouTube.</p>
      </div>

      <div class="yt-channels reveal">
        ${channels.map((c) => html`
          <a key=${c.id} class="yt-channel" href=${c.url || `https://www.youtube.com/@${c.handle}`} target="_blank" rel="noopener">
            <span class="yt-avatar">
              ${c.avatar ? html`<img src=${c.avatar} alt="" />` : html`<${Icon} name="play" size=${22} filled=${true} />`}
            </span>
            <span class="yt-ch-text">
              <span class="yt-ch-name">${c.name}</span>
              <span class="yt-ch-meta">
                @${c.handle}${c.subscribers != null ? ` · ${ytCompact.format(c.subscribers)} subscribers` : ''}${c.videoCount ? ` · ${ytWhole.format(c.videoCount)} videos` : ''}
              </span>
            </span>
            <span class="yt-sub">Subscribe</span>
          </a>
        `)}
      </div>

      ${all.length ? html`
        <div class="yt-stats reveal">
          <div class="yt-stat"><b>${ytWhole.format(all.length)}</b><span>Videos</span></div>
          <div class="yt-stat"><b>${ytCompact.format(totalViews)}</b><span>Total views</span></div>
          <div class="yt-stat"><b>${ytWhole.format(newCount)}</b><span>New this week</span></div>
        </div>
      ` : null}

      <div class="yt-bar reveal">
        <div class="yt-chips" role="tablist" aria-label="Channel">
          <button class=${'yt-chip' + (filter === 'all' ? ' on' : '')} onClick=${() => setFilter('all')}>All</button>
          ${savedIds.length ? html`<button class=${'yt-chip' + (filter === 'saved' ? ' on' : '')} onClick=${() => setFilter('saved')}>Saved offline (${savedIds.length})</button>` : null}
          ${channels.map((c) => html`
            <button key=${c.id} class=${'yt-chip' + (filter === c.id ? ' on' : '')} onClick=${() => setFilter(c.id)}>${c.name}</button>
          `)}
        </div>
        <input class="yt-search" type="search" placeholder="Search videos" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search videos" />
        <select class="yt-select" value=${sort} onChange=${(e) => setSort(e.target.value)} aria-label="Sort videos">
          <option value="new">Newest first</option>
          <option value="top">Most viewed</option>
        </select>
      </div>

      ${loadingFirst ? html`
        <div class="yt-grid">
          ${[0,1,2,3,4,5].map((i) => html`<div key=${i} class="yt-skel"><span></span><i></i><i></i></div>`)}
        </div>
      ` : null}

      ${!data && status === 'error' ? html`
        <div class="yt-empty">
          <p>Couldn't load the videos right now.</p>
          <button class="btn btn-gold" onClick=${reload}>Try again</button>
        </div>
      ` : null}

      ${data ? html`
        <div class="yt-grid">
          ${list.slice(0, limit).map((v, i) => html`
            <${YtCard} key=${v.id} video=${v} index=${i} saved=${savedIds.includes(v.id)} media=${mediaMap[v.id]} channelName=${nameOf(v.channel)} onPlay=${setPlaying} />
          `)}
        </div>
        ${!list.length ? html`<div class="yt-empty"><p>No videos match your search.</p></div>` : null}
        ${list.length > limit ? html`
          <div style=${{ textAlign:'center', marginTop:'28px' }}>
            <button class="btn btn-ghost" onClick=${() => setLimit((n) => n + 18)}>Show more (${list.length - limit} left)</button>
          </div>
        ` : null}
        <div class="yt-foot">
          <span class=${'yt-live' + (status === 'error' ? ' off' : '')}></span>
          ${status === 'error' ? 'Offline — showing the last saved list' : 'Live'} · updated ${ytAgo(data.updatedAt)}
          ${data.mode === 'rss' ? ' · showing the latest uploads from each channel' : ''}
        </div>
      ` : null}

      ${playing ? html`<${YtPlayer} video=${playing} channelName=${nameOf(playing.channel)} onClose=${() => setPlaying(null)} />` : null}
    </section>
  `;
}

/* ---------------------------------------------------------------
   12b. DAILY — a to-do list of good deeds with a streak, a Qur'an
   khatam planner, and a library of Qur'anic duas. Everything is
   saved on the device only.
--------------------------------------------------------------- */
const DAILY_TASKS = [
  { id:'prayers',  title:'Pray all five prayers',            hint:'On time, as best you can.' },
  { id:'quran',    title:'Read at least one page of the Qur\'an', hint:'Even a single page counts.' },
  { id:'morning',  title:'Morning adhkar',                   hint:'After Fajr, until the sun is well up.' },
  { id:'evening',  title:'Evening adhkar',                   hint:'After Asr, until Maghrib.' },
  { id:'tasbih',   title:'Tasbih after a prayer',            hint:'SubhanAllah ×33 · Alhamdulillah ×33 · Allahu Akbar ×34.' },
  { id:'salawat',  title:'Send salawat on the Prophet ﷺ',    hint:'Say it ten times: Allahumma salli ala Muhammad.' },
  { id:'istighfar',title:'Istighfar ×100',                   hint:'Astaghfirullah — say it during the day, any time.' },
  { id:'sadaqah',  title:'Give sadaqah',                     hint:'Any amount, or a kind word or smile.' },
  { id:'kindness', title:'One act of kindness',              hint:'Call a relative, help someone, forgive someone.' },
];
const DAILY_KEY = 'daily_tasks_v1';
const KHATAM_KEY = 'khatam_v1';
const MUSHAF_PAGES = 604;
const dayKeyOf = (d) => localDayKey(d);
const dayShift = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return d; };

function tasksFor(date){
  const list = DAILY_TASKS.slice();
  if (date.getDay() === 5) list.push({ id:'kahf', title:'Read Surah Al-Kahf', hint:'A Friday sunnah.' });
  const h = hijriParts(date);
  if (h.m === 9) {
    list.push({ id:'fast', title:'Fast today', hint:'Suhoor before Fajr, iftar at Maghrib.' });
    list.push({ id:'taraweeh', title:'Taraweeh or Qiyam', hint:'Even a few rakahs at night.' });
    if (h.d >= 20) list.push({ id:'qadr', title:'Seek Laylat al-Qadr', hint:'Pray, make dua and read Qur\'an in the last ten nights.' });
  }
  return list;
}

function streakOf(log){
  const MIN = 3;
  const qualifies = (d) => (log[dayKeyOf(d)] || []).length >= MIN;
  let n = 0, d = new Date();
  if (!qualifies(d)) d = dayShift(-1);          // today isn't over yet
  while (qualifies(d)) { n++; d = dayShift(-1, d); }
  return n;
}

function Ring({ value, size = 120, stroke = 9, children }){
  const R = (size - stroke) / 2, C = 2 * Math.PI * R;
  return html`<div class="dl-ring" style=${{ width:size, height:size }}>
    <svg viewBox=${`0 0 ${size} ${size}`} width=${size} height=${size}>
      <defs><linearGradient id="dlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5f2ed"/><stop offset="1" stop-color="#cf3342"/></linearGradient></defs>
      <circle cx=${size/2} cy=${size/2} r=${R} class="dl-track" stroke-width=${stroke} />
      <circle cx=${size/2} cy=${size/2} r=${R} class="dl-prog" stroke-width=${stroke} stroke="url(#dlg)"
        stroke-dasharray=${C} stroke-dashoffset=${C * (1 - Math.min(1, Math.max(0, value)))} transform=${`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
    <div class="dl-ring-in">${children}</div>
  </div>`;
}

function DailyTasks(){
  const [log, setLog] = useState(() => store.getJSON(DAILY_KEY, {}));
  const today = new Date(), key = dayKeyOf(today);
  const tasks = tasksFor(today);
  const done = (log[key] || []).filter((id) => tasks.some((t) => t.id === id));
  const toggle = (id) => setLog((prev) => {
    const cur = prev[key] || [];
    const next = { ...prev, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    // keep ~120 days
    const keep = Object.keys(next).sort().slice(-120); const trimmed = {}; keep.forEach((k) => (trimmed[k] = next[k]));
    store.setJSON(DAILY_KEY, trimmed); return trimmed;
  });
  const streak = streakOf(log);
  const week = Array.from({ length: 7 }, (_, i) => { const d = dayShift(i - 6); return { d, n: (log[dayKeyOf(d)] || []).length }; });
  const all = done.length === tasks.length;
  return html`
    <div class="dl-card">
      <div class="dl-head">
        <${Ring} value=${done.length / tasks.length} size=${116}>
          <b>${done.length}/${tasks.length}</b><span>today</span>
        <//>
        <div class="dl-head-txt">
          <div class="eyebrow" style=${{ marginBottom: 6 }}>Today's goals</div>
          <h3>${all ? 'Mashallah — all done today' : 'Small deeds, done every day'}</h3>
          <div class="dl-streak"><b>${streak}</b> day streak <span>· do 3 or more goals a day to keep it</span></div>
          <div class="dl-week" aria-label="Last 7 days">
            ${week.map((w, i) => html`<span key=${i} class=${'dl-dot' + (w.n >= 3 ? ' on' : w.n ? ' some' : '') + (i === 6 ? ' today' : '')} title=${`${w.d.toLocaleDateString([], { weekday:'long' })}: ${w.n} done`}>${w.d.toLocaleDateString([], { weekday:'narrow' })}</span>`)}
          </div>
        </div>
      </div>
      <ul class="dl-list">
        ${tasks.map((t) => { const on = done.includes(t.id); return html`
          <li key=${t.id}>
            <button class=${'dl-task' + (on ? ' on' : '')} onClick=${() => toggle(t.id)} aria-pressed=${on}>
              <span class="dl-check"><${Icon} name="check" size=${14} /></span>
              <span class="dl-task-txt"><b>${t.title}</b><small>${t.hint}</small></span>
            </button>
          </li>`; })}
      </ul>
    </div>
  `;
}

function Khatam({ setTab }){
  const [plan, setPlan] = useState(() => store.getJSON(KHATAM_KEY, null));
  const [custom, setCustom] = useState('');
  const save = (p) => { setPlan(p); store.setJSON(KHATAM_KEY, p); };
  const start = (days) => { const n = Math.max(1, Math.min(365, parseInt(days, 10) || 0)); if (n) save({ days:n, start:localDayKey(), pages:0 }); };

  if (!plan) return html`
    <div class="dl-card">
      <div class="eyebrow">Khatam planner</div>
      <h3>Finish the whole Qur'an</h3>
      <p class="dl-sub">Pick how many days you want to take. We'll work out your daily pages and track your progress.</p>
      <div class="dl-presets">
        ${[[30,'30 days'],[60,'60 days'],[90,'90 days'],[180,'6 months']].map(([n, l]) => html`<button key=${n} class="btn btn-ghost" onClick=${() => start(n)}>${l} · ${Math.ceil(MUSHAF_PAGES / n)} pages/day</button>`)}
      </div>
      <div class="dl-custom">
        <input type="number" min="1" max="365" inputmode="numeric" placeholder="Custom days" value=${custom} onInput=${(e) => setCustom(e.target.value)} aria-label="Custom number of days" />
        <button class="btn btn-gold" onClick=${() => start(custom)} disabled=${!custom}>Start plan</button>
      </div>
    </div>`;

  const startDate = new Date(plan.start + 'T00:00:00');
  const dayNo = Math.max(1, Math.floor((new Date().setHours(0,0,0,0) - startDate.getTime()) / 864e5) + 1);
  const perDay = Math.ceil(MUSHAF_PAGES / plan.days);
  const expected = Math.min(MUSHAF_PAGES, perDay * Math.min(dayNo, plan.days));
  const diff = plan.pages - expected;
  const finished = plan.pages >= MUSHAF_PAGES;
  const left = Math.max(0, plan.days - dayNo + 1);
  const remaining = MUSHAF_PAGES - plan.pages;
  const needNow = left > 0 ? Math.ceil(remaining / left) : remaining;
  const add = (n) => save({ ...plan, pages: Math.max(0, Math.min(MUSHAF_PAGES, plan.pages + n)) });
  return html`
    <div class="dl-card">
      <div class="dl-head">
        <${Ring} value=${plan.pages / MUSHAF_PAGES} size=${128}><b>${Math.round(plan.pages / MUSHAF_PAGES * 100)}%</b><span>${plan.pages}/${MUSHAF_PAGES}</span><//>
        <div class="dl-head-txt">
          <div class="eyebrow" style=${{ marginBottom: 6 }}>Khatam planner · ${plan.days}-day plan</div>
          ${finished ? html`<h3>Khatam complete — Alhamdulillah</h3><p class="dl-sub">May Allah accept it from you. Start a new plan whenever you're ready.</p>` : html`
            <h3>Day ${Math.min(dayNo, plan.days)} of ${plan.days}</h3>
            <p class="dl-sub">Aim for <b>${perDay} pages</b> a day. ${diff === 0 ? "You're exactly on track." : diff > 0 ? `You're ${diff} page${diff === 1 ? '' : 's'} ahead.` : `You're ${-diff} page${diff === -1 ? '' : 's'} behind — about ${needNow} a day gets you back on plan.`}</p>`}
          <div class="dl-actions">
            ${!finished ? html`<button class="btn btn-gold" onClick=${() => add(perDay)}>+ ${perDay} pages (today's target)</button>` : null}
            <button class="btn btn-ghost" onClick=${() => add(1)}>+1 page</button>
            <button class="btn btn-ghost" onClick=${() => add(-1)} aria-label="Remove one page">−1</button>
            <button class="btn btn-ghost" onClick=${() => setTab('quran')}>Open the Qur'an</button>
            <button class="btn btn-ghost" onClick=${() => { if (confirm('Reset your khatam plan?')) save(null); }}>Reset</button>
          </div>
        </div>
      </div>
    </div>`;
}

/* Qur'anic duas — single ayahs, fetched from the same Qur'an API as the
   reader (text + transliteration + translation + audio) and cached. */
const DUA_GROUPS = [
  { id:'forgive', label:'Forgiveness', items:[['7:23','Adam and Hawwa'],['3:16','The believers'],['14:41','Ibrahim'],['71:28','Nuh'],['3:147','The believers before us']] },
  { id:'guide',   label:'Guidance',    items:[['1:6','Al-Fatihah'],['3:8','The people of knowledge'],['3:193','The believers'],['18:10','The People of the Cave'],['20:114','For knowledge']] },
  { id:'family',  label:'Family',      items:[['25:74','Servants of the Most Merciful'],['46:15','A believer at forty'],['14:40','Ibrahim'],['3:38','Zakariya'],['17:24','For our parents'],['2:128','Ibrahim and Ismail']] },
  { id:'relief',  label:'Hardship & relief', items:[['21:87','Yunus'],['21:83','Ayyub'],['28:24','Musa'],['20:25','Musa'],['2:250','Believers facing trial']] },
  { id:'life',    label:'This life & the next', items:[['2:201','Rabbana atina'],['2:286','End of Al-Baqarah'],['17:80','Entering and leaving'],['23:29','Nuh'],['23:97','Seeking refuge']] },
];
const DUA_CACHE_KEY = 'dua_cache_v1';
async function loadDua(ref){
  const cache = store.getJSON(DUA_CACHE_KEY, {});
  if (cache[ref]) return cache[ref];
  const r = await fetch(`${QURAN_API}/ayah/${ref}/editions/quran-uthmani,en.transliteration,en.sahih,ar.alafasy`);
  const j = await r.json();
  const [ar, tr, en, au] = j.data;
  const out = { ref, arabic: ar.text, translit: tr.text, english: en.text, audio: au && au.audio, surah: ar.surah.englishName, n: ar.surah.number, a: ar.numberInSurah };
  const next = store.getJSON(DUA_CACHE_KEY, {}); next[ref] = out; store.setJSON(DUA_CACHE_KEY, next);
  return out;
}

function DuaCard({ d, note }){
  const [playing, setPlaying] = useState(false);
  const aud = useRef(null);
  useEffect(() => () => { if (aud.current) aud.current.pause(); }, []);
  const toggle = () => {
    if (!d.audio) return;
    if (!aud.current) { aud.current = new Audio(d.audio); aud.current.onended = () => setPlaying(false); }
    if (playing) { aud.current.pause(); setPlaying(false); } else { aud.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };
  const copy = () => { try { navigator.clipboard.writeText(`${d.arabic}\n\n${d.translit}\n\n"${d.english}"\n— Qur'an ${d.n}:${d.a}`); } catch {} };
  return html`
    <article class="dl-dua">
      <header><span class="dl-dua-note">${note}</span><span class="dl-dua-ref">${d.surah} · ${d.n}:${d.a}</span></header>
      <p class="dl-dua-ar" lang="ar" dir="rtl">${d.arabic}</p>
      <p class="dl-dua-tr">${d.translit}</p>
      <p class="dl-dua-en">${d.english}</p>
      <footer>
        ${d.audio ? html`<button class="btn btn-ghost" onClick=${toggle}><${Icon} name=${playing ? 'pause' : 'play'} size=${14} filled=${!playing} /> ${playing ? 'Pause' : 'Listen'}</button>` : null}
        <button class="btn btn-ghost" onClick=${copy}>Copy</button>
      </footer>
    </article>`;
}

function Duas(){
  const [gid, setGid] = useState(DUA_GROUPS[0].id);
  const [data, setData] = useState({});
  const [status, setStatus] = useState('loading');
  const group = DUA_GROUPS.find((g) => g.id === gid);
  const load = useCallback(() => {
    let live = true; setStatus('loading');
    Promise.all(group.items.map(([ref]) => loadDua(ref).then((d) => [ref, d])))
      .then((pairs) => { if (!live) return; setData((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); setStatus('ok'); })
      .catch(() => { if (live) setStatus('error'); });
    return () => { live = false; };
  }, [gid]);
  useEffect(load, [gid]);
  return html`
    <div class="dl-card">
      <div class="eyebrow">Duas from the Qur'an</div>
      <h3>Words Allah taught us to ask with</h3>
      <div class="dl-chips" role="tablist">
        ${DUA_GROUPS.map((g) => html`<button key=${g.id} role="tab" aria-selected=${g.id === gid} class=${'dl-chip' + (g.id === gid ? ' on' : '')} onClick=${() => setGid(g.id)}>${g.label}</button>`)}
      </div>
      ${status === 'loading' && !group.items.every(([r]) => data[r]) ? html`<div class="center-msg" style=${{ padding:'30px 10px' }}><div class="spinner"></div></div>` : null}
      ${status === 'error' && !group.items.every(([r]) => data[r]) ? html`<div class="center-msg" style=${{ padding:'24px 10px' }}><p>Couldn't load these duas. Check your connection.</p><button class="btn btn-ghost" onClick=${load}>Try again</button></div>` : null}
      <div class="dl-dua-grid">
        ${group.items.filter(([r]) => data[r]).map(([r, note]) => html`<${DuaCard} key=${r} d=${data[r]} note=${note} />`)}
      </div>
    </div>`;
}

/* ---------------------------------------------------------------
   12d. HIJRI TOOLS — calendar, Ramadan banner, hifz helper.
   Dates are calculated (tabular), so they can differ by a day from
   the local moon sighting.
--------------------------------------------------------------- */
function hijriParts(date){
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const h = gregorianToHijriLocal(noon);
  return { y: h.year, m: HIJRI_MONTHS.indexOf(h.month.en) + 1, d: h.day, name: h.month.en };
}
function hijriEvents(h){
  const out = [];
  if (h.m === 1 && h.d === 1) out.push({ k:'new', label:'Islamic New Year' });
  if (h.m === 1 && h.d === 10) out.push({ k:'fast', label:'Day of Ashura' });
  if (h.m === 9 && h.d === 1) out.push({ k:'ram', label:'First day of Ramadan' });
  if (h.m === 9 && h.d === 21) out.push({ k:'ram', label:'Last ten nights begin' });
  if (h.m === 9 && h.d > 21 && h.d % 2 === 1) out.push({ k:'qadr', label:'Odd night — seek Laylat al-Qadr' });
  if (h.m === 10 && h.d === 1) out.push({ k:'eid', label:'Eid al-Fitr' });
  if (h.m === 12 && h.d === 9) out.push({ k:'fast', label:'Day of Arafah' });
  if (h.m === 12 && h.d === 10) out.push({ k:'eid', label:'Eid al-Adha' });
  if (h.d >= 13 && h.d <= 15 && !(h.m === 9) && !(h.m === 10 && h.d === 1)) out.push({ k:'white', label:'White Day — recommended fast' });
  return out;
}
function upcomingHijriEvents(limit = 6){
  const out = [], today = new Date();
  for (let i = 0; i < 420 && out.length < limit; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const h = hijriParts(d);
    hijriEvents(h).filter((e) => e.k !== 'white' && e.k !== 'qadr').forEach((e) => out.push({ ...e, date: d, h, inDays: i }));
  }
  return out.slice(0, limit);
}

function RamadanBanner({ prayer, setTab }){
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const h = hijriParts(now);
  const hasTimes = prayer && prayer.timings && /^\d{1,2}:\d{2}/.test(String(prayer.timings.Fajr || '')) && /^\d{1,2}:\d{2}/.test(String(prayer.timings.Maghrib || ''));
  if (h.m === 9) {
    const at = (k, off = 0) => { const [hh, mm] = prayer.timings[k].split(':').map((x) => parseInt(x, 10)); const d = new Date(now); d.setHours(hh, mm, 0, 0); d.setDate(d.getDate() + off); return d; };
    let label = '', target = null;
    if (hasTimes) {
      const fajr = at('Fajr'), mag = at('Maghrib');
      if (now < fajr) { label = 'Suhoor ends (Fajr)'; target = fajr; }
      else if (now < mag) { label = 'Iftar (Maghrib)'; target = mag; }
      else { label = 'Suhoor ends (Fajr)'; target = at('Fajr', 1); }
    }
    return html`
      <section class="section shell" style=${{ paddingBottom: 0 }}>
        <div class="rm-banner">
          <div class="rm-txt">
            <div class="eyebrow" style=${{ marginBottom: 6 }}>Ramadan Mubarak</div>
            <h3>Day ${h.d} of Ramadan, ${h.y} AH</h3>
            <p>${h.d >= 21 ? 'The last ten nights — seek Laylat al-Qadr.' : 'May Allah accept your fasting and prayers.'}</p>
          </div>
          ${target ? html`<div class="rm-count"><span>${label}</span><b>${fmtCountdown(target - now)}</b></div>` : null}
          <button class="btn btn-gold" onClick=${() => setTab('daily')}>Ramadan goals</button>
        </div>
      </section>`;
  }
  const next = upcomingHijriEvents(60).find((e) => e.k === 'ram' && e.h.d === 1);
  if (next && next.inDays <= 45) return html`
    <section class="section shell" style=${{ paddingBottom: 0 }}>
      <div class="rm-banner soft">
        <div class="rm-txt"><div class="eyebrow" style=${{ marginBottom: 6 }}>Coming soon</div><h3>Ramadan begins in about ${next.inDays} day${next.inDays === 1 ? '' : 's'}</h3><p>Calculated date — the exact day depends on the moon sighting.</p></div>
        <button class="btn btn-ghost" onClick=${() => setTab('daily')}>Plan your Ramadan</button>
      </div>
    </section>`;
  return null;
}

function HijriCalendar(){
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;                    // weeks start on Monday
  const todayKey = localDayKey();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) { const date = new Date(year, month, d); const h = hijriParts(date); cells.push({ date, h, ev: hijriEvents(h) }); }
  const a = hijriParts(new Date(year, month, 1)), b = hijriParts(new Date(year, month, days));
  const range = a.m === b.m ? `${a.name} ${a.y}` : `${a.name} – ${b.name} ${b.y}`;
  const up = useMemo(() => upcomingHijriEvents(6), []);
  const shift = (n) => setCursor(new Date(year, month + n, 1));
  const kinds = { eid:'Eid', ram:'Ramadan', qadr:'Odd night', fast:'Fast day', new:'New Year', white:'White Day' };
  return html`
    <div class="dl-card">
      <div class="cal-head">
        <div>
          <div class="eyebrow" style=${{ marginBottom: 6 }}>Hijri calendar</div>
          <h3 style=${{ marginBottom: 2 }}>${cursor.toLocaleDateString([], { month:'long', year:'numeric' })}</h3>
          <div class="dl-sub" style=${{ margin: 0 }}>${range} AH</div>
        </div>
        <div class="cal-nav">
          <button class="btn btn-ghost" onClick=${() => shift(-1)} aria-label="Previous month">‹</button>
          <button class="btn btn-ghost" onClick=${() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</button>
          <button class="btn btn-ghost" onClick=${() => shift(1)} aria-label="Next month">›</button>
        </div>
      </div>
      <div class="cal-grid" role="grid">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((w) => html`<div key=${w} class="cal-wd">${w}</div>`)}
        ${cells.map((c, i) => !c ? html`<div key=${'e' + i} class="cal-cell empty"></div>` : html`
          <div key=${i} class=${'cal-cell' + (localDayKey(c.date) === todayKey ? ' today' : '') + (c.date.getDay() === 5 ? ' fri' : '') + (c.ev.some((e) => e.k !== 'white') ? ' ev' : '')}
            title=${c.ev.map((e) => e.label).join(' · ') || undefined}>
            <b>${c.date.getDate()}</b>
            <span class="cal-h">${c.h.d}${c.h.d === 1 ? ' ' + c.h.name.split(' ')[0].replace(/^Rabi.*/,'Rabi\u2019') : ''}</span>
            <span class="cal-dots">${c.ev.map((e, j) => html`<i key=${j} class=${'k-' + e.k}></i>`)}</span>
          </div>`)}
      </div>
      <div class="cal-legend">
        ${Object.entries(kinds).map(([k, l]) => html`<span key=${k}><i class=${'k-' + k}></i>${l}</span>`)}
        <span><i class="k-fri"></i>Friday</span>
      </div>
      <div class="cal-up">
        <div class="eyebrow" style=${{ marginBottom: 10 }}>Coming up</div>
        ${up.map((e, i) => html`<div key=${i} class="cal-up-row"><span class=${'cal-up-dot k-' + e.k}></span><span class="cal-up-n">${e.label}</span><span class="cal-up-d">${e.date.toLocaleDateString([], { day:'numeric', month:'short' })} · ${e.inDays === 0 ? 'today' : e.inDays === 1 ? 'tomorrow' : `in ${e.inDays} days`}</span></div>`)}
      </div>
      <p class="pr-note">Dates are calculated and can differ by a day depending on the moon sighting in your area. Islamic days begin at Maghrib.</p>
    </div>`;
}

/* ---- Hifz helper: repeat ayahs on a loop, slow down, hide the text ---- */
const HIFZ_KEY = 'hifz_v1';
const HIFZ_RECITERS = [['ar.alafasy','Mishary Alafasy'],['ar.husary','Mahmoud Khalil Al-Husary'],['ar.abdulbasitmurattal','Abdul Basit (Murattal)']];
function Hifz(){
  const saved = useMemo(() => store.getJSON(HIFZ_KEY, {}), []);
  const [surahs, setSurahs] = useState([]);
  const [cfg, setCfg] = useState({ surah:1, from:1, to:7, reciter:'ar.alafasy', verseReps:3, rangeReps:1, speed:1, mode:'show', ...saved });
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [cur, setCur] = useState({ idx:0, rep:1, round:1 });
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState({});
  const audio = useRef(null);
  const st = useRef({});
  const timer = useRef(null);
  const upd = (patch) => setCfg((c) => { const n = { ...c, ...patch }; store.setJSON(HIFZ_KEY, n); return n; });

  useEffect(() => { fetch(`${QURAN_API}/surah`).then((r) => r.json()).then((j) => setSurahs(j.data || [])).catch(() => {}); }, []);
  const meta = surahs.find((x) => x.number === cfg.surah);
  const total = meta ? meta.numberOfAyahs : 286;

  useEffect(() => {
    let live = true; setStatus('loading'); setData(null); stop();
    fetch(`${QURAN_API}/surah/${cfg.surah}/editions/quran-uthmani,${cfg.reciter}`).then((r) => r.json()).then((j) => {
      if (!live) return;
      const [t, a] = j.data;
      // Same as the Qur'an reader: the API embeds the Bismillah in ayah 1 of every
      // surah except Al-Fatihah (1) and At-Tawbah (9) — strip it and show it as a header.
      setData(t.ayahs.map((x, i) => {
        let text = x.text;
        if (i === 0 && cfg.surah !== 1 && cfg.surah !== 9) { const c = text.replace(BISMILLAH_STRIP_RE, '').trim(); if (c) text = c; }
        return { n: x.numberInSurah, text, audio: a.ayahs[i] && a.ayahs[i].audio };
      }));
      setStatus('ok');
    }).catch(() => live && setStatus('error'));
    return () => { live = false; };
  }, [cfg.surah, cfg.reciter]);

  const from = Math.max(1, Math.min(cfg.from, total)), to = Math.max(from, Math.min(cfg.to, total));
  const range = data ? data.filter((x) => x.n >= from && x.n <= to) : [];
  st.current = { range, cfg, cur };

  function ensureAudio(){
    if (!audio.current) { audio.current = new Audio(); audio.current.onended = onEnded; }
    return audio.current;
  }
  function playAt(idx, rep, round){
    const { range, cfg } = st.current; const a = range[idx]; if (!a || !a.audio) return;
    clearTimeout(timer.current);
    setCur({ idx, rep, round }); st.current.cur = { idx, rep, round };
    const el = ensureAudio(); el.src = a.audio; el.playbackRate = cfg.speed; el.defaultPlaybackRate = cfg.speed;
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }
  function onEnded(){
    const { range, cfg, cur } = st.current;
    const gap = (fn) => { timer.current = setTimeout(fn, 700); };
    if (cur.rep < cfg.verseReps) return gap(() => playAt(cur.idx, cur.rep + 1, cur.round));
    if (cur.idx < range.length - 1) return gap(() => playAt(cur.idx + 1, 1, cur.round));
    if (cfg.rangeReps === 0 || cur.round < cfg.rangeReps) return gap(() => playAt(0, 1, cur.round + 1));
    setPlaying(false);
  }
  function stop(){ clearTimeout(timer.current); if (audio.current) { audio.current.pause(); } setPlaying(false); setCur({ idx:0, rep:1, round:1 }); }
  function toggle(){
    if (!range.length) return;
    if (playing) { clearTimeout(timer.current); audio.current && audio.current.pause(); setPlaying(false); }
    else if (audio.current && audio.current.src && audio.current.currentTime > 0 && !audio.current.ended) { audio.current.play().then(() => setPlaying(true)); }
    else playAt(st.current.cur.idx || 0, st.current.cur.rep || 1, st.current.cur.round || 1);
  }
  function jump(d){ const i = Math.max(0, Math.min(range.length - 1, cur.idx + d)); playAt(i, 1, cur.round); }
  useEffect(() => { if (audio.current) { audio.current.playbackRate = cfg.speed; } }, [cfg.speed]);
  useEffect(() => () => { clearTimeout(timer.current); audio.current && audio.current.pause(); }, []);
  useEffect(() => { stop(); setRevealed({}); }, [cfg.from, cfg.to, cfg.mode]);

  const shown = (a) => cfg.mode === 'first' && !revealed[a.n] ? a.text.split(' ')[0] + ' …' : a.text;
  const opts = (arr) => arr.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`);
  const num = (k, v) => upd({ [k]: Math.max(1, Math.min(total, parseInt(v, 10) || 1)) });
  return html`
    <div class="dl-card">
      <div class="eyebrow">Hifz helper</div>
      <h3>Memorise by repeating</h3>
      <p class="dl-sub">Choose the ayahs, how many times to repeat each, and play. Slow it down, or hide the text and test yourself.</p>
      <div class="hf-form">
        <label>Surah<select class="select-pill" value=${cfg.surah} onChange=${(e) => upd({ surah: +e.target.value, from:1, to: Math.min(5, (surahs.find((x) => x.number === +e.target.value) || { numberOfAyahs:5 }).numberOfAyahs) })}>
          ${(surahs.length ? surahs : [{ number:cfg.surah, englishName:'Loading…' }]).map((x) => html`<option key=${x.number} value=${x.number}>${x.number}. ${x.englishName}</option>`)}
        </select></label>
        <label>From ayah<input type="number" min="1" max=${total} value=${cfg.from} onChange=${(e) => num('from', e.target.value)} /></label>
        <label>To ayah<input type="number" min="1" max=${total} value=${cfg.to} onChange=${(e) => num('to', e.target.value)} /></label>
        <label>Repeat each ayah<select class="select-pill" value=${cfg.verseReps} onChange=${(e) => upd({ verseReps: +e.target.value })}>${opts([[1,'1×'],[3,'3×'],[5,'5×'],[7,'7×'],[10,'10×']])}</select></label>
        <label>Repeat the range<select class="select-pill" value=${cfg.rangeReps} onChange=${(e) => upd({ rangeReps: +e.target.value })}>${opts([[1,'Once'],[3,'3×'],[5,'5×'],[0,'Loop']])}</select></label>
        <label>Speed<select class="select-pill" value=${cfg.speed} onChange=${(e) => upd({ speed: +e.target.value })}>${opts([[0.7,'0.7× (slow)'],[0.85,'0.85×'],[1,'Normal'],[1.15,'1.15×']])}</select></label>
        <label>Reciter<select class="select-pill" value=${cfg.reciter} onChange=${(e) => upd({ reciter: e.target.value })}>${opts(HIFZ_RECITERS)}</select></label>
        <label>Text<select class="select-pill" value=${cfg.mode} onChange=${(e) => upd({ mode: e.target.value })}>${opts([['show','Show all'],['first','First word only'],['hide','Hide (tap to reveal)']])}</select></label>
      </div>

      ${status === 'loading' ? html`<div class="center-msg" style=${{ padding:'24px' }}><div class="spinner"></div></div>` : null}
      ${status === 'error' ? html`<div class="center-msg" style=${{ padding:'20px' }}><p>Couldn't load this surah. Check your connection.</p></div>` : null}
      ${status === 'ok' ? html`
        <div class="hf-bar">
          <button class="btn btn-gold" onClick=${toggle} disabled=${!range.length}><${Icon} name=${playing ? 'pause' : 'play'} size=${14} filled=${!playing} /> ${playing ? 'Pause' : 'Play'}</button>
          <button class="btn btn-ghost" onClick=${() => jump(-1)} disabled=${!range.length} aria-label="Previous ayah">Prev</button>
          <button class="btn btn-ghost" onClick=${() => jump(1)} disabled=${!range.length} aria-label="Next ayah">Next</button>
          <button class="btn btn-ghost" onClick=${stop}>Stop</button>
          <span class="hf-prog">Ayah ${range[cur.idx] ? range[cur.idx].n : '–'} · repeat ${cur.rep}/${cfg.verseReps} · round ${cur.round}${cfg.rangeReps ? '/' + cfg.rangeReps : ' (loop)'}</span>
        </div>
        <div class="hf-list">
          ${cfg.surah !== 1 && cfg.surah !== 9 && from === 1 && range.length ? html`
            <div class="bismillah-block">
              <div class="bismillah-ar">${BISMILLAH_AR}</div>
              <div class="bismillah-en">${BISMILLAH_EN}</div>
            </div>` : null}
          ${range.map((a, i) => html`
            <div key=${a.n} class=${'hf-ayah' + (playing && i === cur.idx ? ' now' : '')} onClick=${() => setRevealed((r) => ({ ...r, [a.n]: !r[a.n] }))}>
              <span class="hf-n">${a.n}</span>
              <p class=${'hf-ar' + (cfg.mode === 'hide' && !revealed[a.n] ? ' blur' : '')} lang="ar" dir="rtl">${shown(a)}</p>
            </div>`)}
        </div>` : null}
    </div>`;
}

/* ---- Qur'an search by word or topic, or jump straight to a verse ---- */
const AYAH_ALIASES = { 'ayat al kursi':'2:255', 'ayatul kursi':'2:255', 'ayat ul kursi':'2:255', 'kursi':'2:255', 'throne verse':'2:255', 'light verse':'24:35', 'ayat an nur':'24:35', 'ayat al nur':'24:35' };
const SEARCH_TOPICS = [['Patience','patience'],['Mercy','mercy'],['Forgiveness','forgive'],['Prayer','prayer'],['Charity','charity'],['Parents','parents'],['Paradise','paradise'],['Knowledge','knowledge'],['Gratitude','grateful'],['Trust in Allah','trust']];
function AyahSearch({ surahs, onOpen }){
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);       // { kind, items, count } | { error }
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 && !/^\d{1,3}\s*[:.]\s*\d{1,3}$/.test(term)) { setRes(null); setBusy(false); return; }
    const ctl = new AbortController(); setBusy(true);
    const t = setTimeout(async () => {
      try {
        const norm = term.toLowerCase().replace(/[-’']/g, ' ').replace(/^the\s+/, '').replace(/\s+/g, ' ');
        const m = term.match(/^(\d{1,3})\s*[:.]\s*(\d{1,3})$/);
        const ref = m ? `${+m[1]}:${+m[2]}` : AYAH_ALIASES[norm];
        if (ref) {
          const j = await (await fetch(`${QURAN_API}/ayah/${ref}/editions/quran-uthmani,en.sahih`, { signal: ctl.signal })).json();
          if (!Array.isArray(j.data)) { setRes({ error: 'verse' }); }
          else setRes({ kind:'verse', count:1, items:[{ n:j.data[0].surah.number, name:j.data[0].surah.englishName, a:j.data[0].numberInSurah, ar:j.data[0].text, en:j.data[1].text }] });
        } else {
          const j = await (await fetch(`${QURAN_API}/search/${encodeURIComponent(term)}/all/en.sahih`, { signal: ctl.signal })).json();
          const ms = j && j.data && Array.isArray(j.data.matches) ? j.data.matches : [];
          setRes({ kind:'word', count: j.data && j.data.count || 0, items: ms.slice(0, 25).map((x) => ({ n:x.surah.number, name:x.surah.englishName, a:x.numberInSurah, en:x.text })) });
        }
      } catch (e) { if (e.name !== 'AbortError') setRes({ error: 'net' }); }
      setBusy(false);
    }, 450);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const hl = (text) => {
    const w = q.trim(); if (res && res.kind !== 'word') return text;
    try { return text.split(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig')).map((p, i) => i % 2 ? html`<mark key=${i}>${p}</mark>` : p); } catch { return text; }
  };
  const open = (n) => { const s = surahs.find((x) => x.number === n); if (s) onOpen(s); };
  const copy = (it) => { try { navigator.clipboard.writeText(`${it.ar ? it.ar + '\n\n' : ''}"${it.en}"\n— Qur'an ${it.n}:${it.a}`); } catch {} };
  return html`
    <div class="as-wrap reveal">
      <div class="as-head">
        <div class="eyebrow" style=${{ marginBottom: 6 }}>Search the Qur'an</div>
        <div class="search-box">
          <${Icon} name="search" size=${15} />
          <input type="search" placeholder="Search a word or topic — patience, mercy… or a verse like 2:255, ayat al-kursi" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search the Qur'an by word or topic" />
        </div>
        <div class="dl-chips" style=${{ margin: '12px 0 0' }}>
          ${SEARCH_TOPICS.map(([l, k]) => html`<button key=${k} class=${'dl-chip' + (q.trim().toLowerCase() === k ? ' on' : '')} onClick=${() => setQ(k)}>${l}</button>`)}
        </div>
      </div>
      ${busy ? html`<div class="center-msg" style=${{ padding:'18px' }}><div class="spinner"></div></div>` : null}
      ${!busy && res && res.error ? html`<p class="as-note">${res.error === 'verse' ? "That verse doesn't exist." : "Couldn't search. Check your connection."}</p>` : null}
      ${!busy && res && !res.error && !res.items.length ? html`<p class="as-note">No ayahs found. Try a simpler word in English, like "patience" or "forgive".</p>` : null}
      ${!busy && res && !res.error && res.items.length ? html`
        <p class="as-note">${res.kind === 'verse' ? 'Verse' : `${res.count} ayah${res.count === 1 ? '' : 's'} found${res.count > res.items.length ? ` — showing the first ${res.items.length}` : ''}`} · English (Sahih International)</p>
        <div class="as-list">
          ${res.items.map((it) => html`
            <article key=${it.n + ':' + it.a} class="as-item">
              <header><b>${it.name}</b><span>${it.n}:${it.a}</span></header>
              ${it.ar ? html`<p class="as-ar" lang="ar" dir="rtl">${it.ar}</p>` : null}
              <p class="as-en">${hl(it.en)}</p>
              <footer><button class="btn btn-ghost" onClick=${() => open(it.n)}>Open surah</button><button class="btn btn-ghost" onClick=${() => copy(it)}>Copy</button></footer>
            </article>`)}
        </div>` : null}
    </div>`;
}

function DailySection({ setTab }){
  const ref = useReveal();
  const [view, setView] = useState('today');
  const views = [['today','Today\'s goals'],['khatam','Khatam planner'],['hifz','Hifz helper'],['calendar','Hijri calendar'],['duas','Duas']];
  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div><div class="eyebrow">Daily</div><h2>Build a daily rhythm</h2></div>
        <p>Good deeds to tick off each day, a plan to complete the Qur'an, a memorisation helper, the Hijri calendar and duas to keep. Saved only on your device.</p>
      </div>
      <div class="dl-chips dl-tabs reveal" role="tablist">
        ${views.map(([id, l]) => html`<button key=${id} role="tab" aria-selected=${view === id} class=${'dl-chip' + (view === id ? ' on' : '')} onClick=${() => setView(id)}>${l}</button>`)}
      </div>
      ${view === 'today' ? html`<${DailyTasks} />` : null}
      ${view === 'khatam' ? html`<${Khatam} setTab=${setTab} />` : null}
      ${view === 'hifz' ? html`<${Hifz} />` : null}
      ${view === 'calendar' ? html`<${HijriCalendar} />` : null}
      ${view === 'duas' ? html`<${Duas} />` : null}
    </section>
  `;
}

/* ---------------------------------------------------------------
   12c. SEERAH — the life of Prophet Muhammad ﷺ, in 11 parts.
   A fixed playlist (not part of the Videos feed). Plays through the
   same player as Videos, so offline saving works the same way.
   To add or reorder a part, edit SEERAH_IDS (YouTube video ids).
--------------------------------------------------------------- */
const SEERAH_IDS = [
  'DW-00ckCAPI', 'Qnzam5KcopM', 'dAZPkwAo0lE', 'jx9syOUU1Ms', 'eOYW4vKaKpc', 'zNpV3UqwyDU',
  'CPWL76pGaBI', 'QbV9WR28GCg', 'ebeAyx_E7pc', 'uSUxDtp-U0Q', 'pR65Sfhp-AY',
];
const SEERAH_PULSE = 'https://maar-puls.vercel.app';
const SEERAH_WATCHED_KEY = 'seerah_watched_v1';
const SEERAH_VIDEOS = SEERAH_IDS.map((id, i) => ({
  id, part: i + 1, channel: 'seerah',
  title: `Seerah of Prophet Muhammad ﷺ — Part ${i + 1}${i === SEERAH_IDS.length - 1 ? ' (Final part)' : ''}`,
  sub: i === SEERAH_IDS.length - 1 ? 'Final part' : `Part ${i + 1} of ${SEERAH_IDS.length}`,
  thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  pulse: `${SEERAH_PULSE}/watch/${id}`,
}));

function SeerahSection(){
  const ref = useReveal();
  const { mediaMap, savedIds } = useYtOffline();
  const [watched, setWatched] = useState(() => store.getArray(SEERAH_WATCHED_KEY));
  const [playing, setPlaying] = useState(null);

  const open = useCallback((v) => {
    setPlaying(v);
    setWatched((prev) => {
      if (prev.includes(v.id)) return prev;
      const next = [...prev, v.id]; store.setJSON(SEERAH_WATCHED_KEY, next); return next;
    });
  }, []);
  const list = SEERAH_VIDEOS.map((v) => ({ ...v, watched: watched.includes(v.id) }));
  const done = list.filter((v) => v.watched).length;
  const nextUp = list.find((v) => !v.watched) || list[0];
  const idx = playing ? SEERAH_VIDEOS.findIndex((v) => v.id === playing.id) : -1;
  const onNext = idx >= 0 && idx < SEERAH_VIDEOS.length - 1 ? () => open(SEERAH_VIDEOS[idx + 1]) : null;

  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">Seerah</div>
          <h2>The Seerah of Prophet Muhammad ﷺ</h2>
        </div>
        <p>The life of the Prophet ﷺ, told in order across ${SEERAH_VIDEOS.length} parts, from MAAR Pulse. Start at Part 1 and watch through to the final part.</p>
      </div>

      <div class="sr-hero reveal">
        <div class="sr-ar" lang="ar" dir="rtl">السيرة النبوية</div>
        <div class="sr-prog">
          <div class="sr-bar"><span style=${{ width: (done / list.length * 100) + '%' }}></span></div>
          <div class="sr-count">${done} of ${list.length} parts watched</div>
        </div>
        <button class="btn btn-gold" onClick=${() => open(nextUp)}>
          <${Icon} name="play" size=${14} filled=${true} /> ${done === 0 ? 'Start Part 1' : done >= list.length ? 'Watch again from Part 1' : `Continue · Part ${nextUp.part}`}
        </button>
        <a class="btn btn-ghost" href=${SEERAH_PULSE} target="_blank" rel="noopener">Open MAAR Pulse</a>
        ${done ? html`<button class="btn btn-ghost" onClick=${() => { store.setJSON(SEERAH_WATCHED_KEY, []); setWatched([]); }}>Reset progress</button>` : null}
      </div>

      <div class="yt-grid">
        ${list.map((v, i) => html`
          <${YtCard} key=${v.id} video=${v} index=${i} saved=${savedIds.includes(v.id)} media=${mediaMap[v.id]} channelName="MAAR Pulse" onPlay=${open} />
        `)}
      </div>

      ${playing ? html`<${YtPlayer} key=${playing.id} video=${playing} channelName="MAAR Pulse" onClose=${() => setPlaying(null)} onNext=${onNext} />` : null}
    </section>
  `;
}

/* Small "latest uploads" strip for the Home page. */
function VideosTeaser({ setTab }){
  const ref = useReveal();
  const { data } = useYouTube();
  const { mediaMap, savedIds } = useYtOffline();
  const [playing, setPlaying] = useState(null);
  if (!data || !data.videos || !data.videos.length) return null;
  const nameOf = (id) => ((data.channels || []).find((c) => c.id === id) || {}).name || id;
  const latest = data.videos.slice(0, 3);
  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">Latest on YouTube</div>
          <h2>Fresh nasheeds & gojol</h2>
        </div>
        <button class="btn btn-ghost" onClick=${() => setTab('videos')}>See all videos <${Icon} name="chev" size=${14} /></button>
      </div>
      <div class="yt-grid">
        ${latest.map((v, i) => html`<${YtCard} key=${v.id} video=${v} index=${i} saved=${savedIds.includes(v.id)} media=${mediaMap[v.id]} channelName=${nameOf(v.channel)} onPlay=${setPlaying} />`)}
      </div>
      ${playing ? html`<${YtPlayer} video=${playing} channelName=${nameOf(playing.channel)} onClose=${() => setPlaying(null)} />` : null}
    </section>
  `;
}

function Footer(){
  return html`
    <footer class="footer shell">
      <div class="footer-row">
        <span>Quran Maar · v6.0 — a free, private companion for the Qur'an, Hadith and daily prayer.</span>
        <span>Built by Md Adil Ahmed Rajon</span>
      </div>
      <div class="footer-row">
        <span>YouTube: <a href="https://www.youtube.com/@MAAR-NASHID" target="_blank" rel="noopener">MAAR NASHID</a> · <a href="https://www.youtube.com/@MAARGOJOL" target="_blank" rel="noopener">MAAR GOJOL</a></span>
        <span><a href="surah/">Read all 114 surahs</a> · <a href="ayat-al-kursi/">Ayat al-Kursi</a> · <a href="duas/">Duas</a> · <a href="prayer-times/">Prayer times</a> · <a href="qibla/">Qibla</a> · <a href="hadith/">Hadith</a> · <a href="seerah/">Seerah</a> · <a href="hijri-calendar/">Hijri calendar</a> · <a href="daily-goals/">Daily goals</a> · <a href="hifz/">Hifz</a></span>
      </div>
    </footer>
  `;
}

/* ---------------------------------------------------------------
   13. APP ROOT
--------------------------------------------------------------- */
/* Surfaces two transient states the user otherwise can't see: loss of
   connection, and a new app version sitting in the service worker
   waiting to take over. The update is offered, not forced. */
function NetBanner(){
  const online = useOnlineStatus();
  const [showOffline, setShowOffline] = useState(false);
  const [updateReg, setUpdateReg] = useState(null);

  useEffect(() => {
    if (online) { const t = setTimeout(() => setShowOffline(false), 300); return () => clearTimeout(t); }
    setShowOffline(true);
  }, [online]);

  useEffect(() => {
    const onUpdate = (e) => setUpdateReg(e.detail);
    window.addEventListener('qm-sw-update', onUpdate);
    return () => window.removeEventListener('qm-sw-update', onUpdate);
  }, []);

  if (updateReg) {
    return html`
      <div class="net-banner update show">
        A new version of Quran Maar is ready.
        <button onClick=${() => { updateReg.waiting && updateReg.waiting.postMessage({ type:'SKIP_WAITING' }); }}>Update</button>
        <button onClick=${() => setUpdateReg(null)}>Later</button>
      </div>
    `;
  }

  return html`
    <div class=${'net-banner' + (showOffline ? ' show' : '')}>
      <${Icon} name="cloudOff" size=${14} />
      You're offline \u2014 saved surahs and downloads still work.
    </div>
  `;
}

function App(){
  /* Manifest shortcuts and shared links land on ?tab=<id>; validated
     against NAV_ITEMS so a junk param can't blank the screen. */
  const [tab, setTab] = useState(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab');
      return NAV_ITEMS.some((n) => n.id === t) ? t : 'home';
    } catch { return 'home'; }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [bmOpen, setBmOpen] = useState(false);
  const [reciterId, setReciterId] = useLocalState('reciter', 'alafasy');
  const [langEdition, setLangEdition] = useLocalState('lang_edition', 'en.sahih');
  const [arabicFontIdx, setArabicFontIdx] = useLocalState('arabic_font_index', 0);
  const [bookmarks, setBookmarks] = useState(() => store.getArray('v5_bookmarks'));
  const [hadithBookmarks, setHadithBookmarks] = useState(() => store.getArray('v5_hadith_bookmarks'));
  const [surahCount, setSurahCount] = useState(114);
  const geo = useGeo();

  /* make sure the site-wide prayer colours have times even if the
     visitor never opens the Home tab */
  useEffect(() => {
    if (geo.status !== 'ready') return;
    const c = store.getJSON('prayer:last', null);
    if (c && c.day === new Date().toDateString() && c.timings) { window.QM_PRAYER = c.timings; window.dispatchEvent(new Event('qm-prayer')); return; }
    try { publishPrayer(computePrayerTimesLocal(new Date(), geo.lat, geo.lon)); } catch {}
  }, [geo.status, geo.lat, geo.lon]);

  useEffect(() => { document.documentElement.style.setProperty('--arabic-font', ARABIC_FONTS[arabicFontIdx]?.stack || ARABIC_FONTS[0].stack); }, [arabicFontIdx]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); }, [tab]);
  useEffect(() => {
    fetch(`${QURAN_API}/surah`).then(r => r.json()).then((j) => setSurahCount((j.data || []).length)).catch(() => {});
  }, []);

  /* Silently save the full Qur'an text — all 114 surahs, Arabic plus
     every translation language offered in the app (Bangla, Hindi, Urdu,
     the lot), not just whichever one is currently selected — for
     offline reading, no button, no prompt. Runs once shortly after load
     (delayed so it never competes with the surah the person actually
     opened first), and again whenever the device comes back online. */
  useEffect(() => {
    function ensureQuranTextOffline() {
      if (_autoTextSaveInFlight) return;
      if (!window.QMOffline || typeof navigator === 'undefined' || !navigator.onLine) return;
      _autoTextSaveInFlight = true;
      (async () => {
        try {
          const allEditions = LANGUAGES.map((l) => l.edition);
          const status = await window.QMOffline.quranTextStatus();
          const have = new Set((status && status.translationEditions) || []);
          const upToDate = status && status.complete && allEditions.every((e) => have.has(e));
          if (!upToDate) {
            await window.QMOffline.cacheQuranText({
              api: QURAN_API,
              arabicEdition: ARABIC_EDITION,
              translationEditions: allEditions,
              onProgress: () => {},
            });
          }
        } catch {}
        _autoTextSaveInFlight = false;
      })();
    }
    const t = setTimeout(ensureQuranTextOffline, 4000);
    window.addEventListener('online', ensureQuranTextOffline);
    return () => { clearTimeout(t); window.removeEventListener('online', ensureQuranTextOffline); };
  }, []);

  /* Same idea for Hadith: quietly fetch every collection (Bukhari,
     Muslim, Abu Dawood, Tirmidhi, an-Nasa'i, Ibn Majah) in Arabic and
     in the person's last-chosen Hadith language, once, in the
     background. The service worker's existing runtime cache for the
     hadith CDN then keeps these responses for offline reading — no
     separate storage layer needed, and no "Save" button to press. */
  useEffect(() => {
    if (_autoHadithSaveInFlight) return;
    const t = setTimeout(() => {
      if (_autoHadithSaveInFlight) return;
      if (!navigator.onLine) return;
      _autoHadithSaveInFlight = true;
      const savedLang = store.get('hadith_lang', 'eng') || 'eng';
      const langs = Array.from(new Set(['ara', savedLang]));
      (async () => {
        for (const col of HADITH_COLLECTIONS) {
          for (const l of langs) {
            if (!(HADITH_LANGS_BY_COLLECTION[col.id] || ['eng']).includes(l)) continue;
            try { await fetch(`${HADITH_CDN}/${l}-${col.id}.json`); } catch {}
            if (!navigator.onLine) { _autoHadithSaveInFlight = false; return; }
          }
        }
        _autoHadithSaveInFlight = false;
      })();
    }, 9000); // after the Qur'an text pass has had a head start
    return () => clearTimeout(t);
  }, []);

  const toggleBookmark = useCallback((surah, ayah) => {
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.surah === surah.number && b.ayah === ayah.numberInSurah);
      const next = exists
        ? prev.filter((b) => !(b.surah === surah.number && b.ayah === ayah.numberInSurah))
        : [...prev, { surah: surah.number, surahName: surah.englishName, ayah: ayah.numberInSurah, text: ayah.text }];
      store.setJSON('v5_bookmarks', next);
      return next;
    });
  }, []);
  const removeBookmark = useCallback((b) => {
    setBookmarks((prev) => { const next = prev.filter((x) => !(x.surah === b.surah && x.ayah === b.ayah)); store.setJSON('v5_bookmarks', next); return next; });
  }, []);

  const toggleHadithBookmark = useCallback((collection, number, text) => {
    const num = String(number);
    setHadithBookmarks((prev) => {
      const exists = prev.some((b) => b.collectionId === collection.id && b.number === num);
      const next = exists
        ? prev.filter((b) => !(b.collectionId === collection.id && b.number === num))
        : [...prev, { collectionId: collection.id, collectionName: collection.name, number: num, text }];
      store.setJSON('v5_hadith_bookmarks', next);
      return next;
    });
  }, []);
  const removeHadithBookmark = useCallback((b) => {
    setHadithBookmarks((prev) => { const next = prev.filter((x) => !(x.collectionId === b.collectionId && x.number === b.number)); store.setJSON('v5_hadith_bookmarks', next); return next; });
  }, []);

  let page;
  if (tab === 'home') page = html`<${HomeSection} setTab=${setTab} surahCount=${surahCount} geo=${geo} />`;
  else if (tab === 'quran') page = html`<${QuranSection}
      reciterId=${reciterId} setReciterId=${setReciterId}
      langEdition=${langEdition} setLangEdition=${setLangEdition}
      arabicFontIdx=${arabicFontIdx} setArabicFontIdx=${setArabicFontIdx}
      bookmarks=${bookmarks} toggleBookmark=${toggleBookmark}
    />`;
  else if (tab === 'hadith') page = html`<${HadithSection} hadithBookmarks=${hadithBookmarks} toggleHadithBookmark=${toggleHadithBookmark} />`;
  else if (tab === 'videos') page = html`<${VideosSection} />`;
  else if (tab === 'seerah') page = html`<${SeerahSection} />`;
  else if (tab === 'daily') page = html`<${DailySection} setTab=${setTab} />`;
  else if (tab === 'qibla') page = html`<${QiblaSection} geo=${geo} />`;
  else if (tab === 'offline') page = html`<${OfflineSection} />`;
  else if (tab === 'about') page = html`<${AboutSection} />`;
  else if (tab === 'settings') page = html`<${SettingsSection} />`;

  return html`
    <${React.Fragment}>
      <${NetBanner} />
      <${NavBar} tab=${tab} setTab=${setTab} onOpenMenu=${() => setMenuOpen(true)} onOpenBookmarks=${() => setBmOpen(true)} bookmarkCount=${bookmarks.length + hadithBookmarks.length} />
      <${MobileMenu} open=${menuOpen} onClose=${() => setMenuOpen(false)} tab=${tab} setTab=${setTab} />
      <main key=${tab} class="page-enter">${page}</main>
      <${Footer} />
      <${TabBar} tab=${tab} setTab=${setTab} />
      <${BookmarksDrawer} open=${bmOpen} onClose=${() => setBmOpen(false)} bookmarks=${bookmarks} remove=${removeBookmark} hadithBookmarks=${hadithBookmarks} removeHadith=${removeHadithBookmark} />
    <//>
  `;
}

/* ---------------------------------------------------------------
   14. ERROR BOUNDARY — catches render errors from any interaction
   (not just the first paint, which the surrounding try/catch below
   already covers) and shows a real message instead of a blank page.
--------------------------------------------------------------- */
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ console.error('Quran Maar crashed:', error, info && info.componentStack); }
  render(){
    if (this.state.error) {
      const msg = (this.state.error && this.state.error.message) ? this.state.error.message : String(this.state.error);
      return html`
        <div style=${{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'32px 20px', textAlign:'center' }}>
          <div style=${{ maxWidth:'440px' }}>
            <div style=${{ fontFamily:"'Instrument Serif',serif", fontStyle:'italic', fontSize:'26px', color:'#f5f2ed', marginBottom:'12px' }}>Something went wrong</div>
            <p style=${{ color:'#a29c95', fontSize:'13.5px', lineHeight:'1.7', marginBottom:'8px' }}>This screen stayed up instead of going blank so the problem can actually be fixed. Please share this message:</p>
            <p style=${{ color:'#cf3342', fontSize:'12.5px', fontFamily:'monospace', background:'rgba(245,242,237,.05)', border:'1px solid rgba(245,242,237,.1)', borderRadius:'10px', padding:'12px', marginBottom:'18px', wordBreak:'break-word', textAlign:'left' }}>${msg}</p>
            <button onClick=${() => window.location.reload()} style=${{ background:'#cf3342', color:'#f5f2ed', border:'none', borderRadius:'999px', padding:'12px 24px', fontWeight:700, fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>Reload the page</button>
          </div>
        </div>
      `;
    }
    return this.props.children;
  }
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${ErrorBoundary}><${App} /><//>`);
} catch (err) {
  console.error('Quran Maar failed to start:', err);
  document.getElementById('root').innerHTML =
    '<div style="padding:60px 24px;text-align:center;color:#f5f2ed;font-family:sans-serif;">' +
    '<h2 style="font-family:\'Instrument Serif\',serif;font-style:italic;">Something didn\'t load</h2>' +
    '<p style="color:#a29c95;max-width:420px;margin:10px auto;">Please refresh the page. If this keeps happening while opening the file directly, try running it through a local server instead of double-clicking it.</p>' +
    '</div>';
}
