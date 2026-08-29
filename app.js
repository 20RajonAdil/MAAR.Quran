/* ============================================================
   QURAN MAAR v5 — app.js
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
      ctx.fillStyle = `rgba(244,239,228,${a.toFixed(3)})`;
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
const AUDIO_EDITION = 'ar.alafasy';
const BISMILLAH_AR = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
const BISMILLAH_EN = 'In the name of Allah, the Most Gracious, the Most Merciful';
const BISMILLAH_STRIP_RE = /^بِسْمِ\s?اللَّهِ\s?الرَّحْمَٰنِ\s?الرَّحِيمِ\s*/;
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
  setJSON(key, value){ try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch {} },
};

/* ---------------------------------------------------------------
   3. HOOKS
--------------------------------------------------------------- */
/** Adds `.in` to an element once it scrolls into view, for the
 *  `.reveal` fade-up used across every section. */
function useReveal(deps = []){
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nodes = el.classList?.contains('reveal') ? [el] : el.querySelectorAll('.reveal');
    const targets = nodes.length ? nodes : [el];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, deps);
  return ref;
}

function useLocalState(key, initial){
  const [val, setVal] = useState(() => store.get(key, initial));
  useEffect(() => { store.set(key, val); }, [key, val]);
  return [val, setVal];
}

/** Geolocation: browser GPS first (accurate), IP lookup as fallback
 *  — same two-tier strategy v4 used. */
function useGeo(){
  const [state, setState] = useState({ status: 'loading', lat: null, lon: null, city: '', source: '' });
  useEffect(() => {
    let cancelled = false;
    function fromIp(){
      fetch('https://ipapi.co/json/').then(r => r.json()).then(j => {
        if (cancelled) return;
        if (j && j.latitude) setState({ status:'ready', lat:j.latitude, lon:j.longitude, city:[j.city,j.country_name].filter(Boolean).join(', '), source:'ip' });
        else throw new Error('no-ip');
      }).catch(() => {
        fetch('https://ipwho.is/').then(r => r.json()).then(j => {
          if (cancelled) return;
          if (j && j.latitude) setState({ status:'ready', lat:j.latitude, lon:j.longitude, city:[j.city,j.country].filter(Boolean).join(', '), source:'ip' });
          else setState((s) => ({ ...s, status:'error' }));
        }).catch(() => !cancelled && setState((s) => ({ ...s, status:'error' })));
      });
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const { latitude, longitude } = pos.coords;
          setState({ status:'ready', lat:latitude, lon:longitude, city:'', source:'gps' });
          fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
            .then(r => r.json()).then(j => {
              if (cancelled) return;
              const city = [j.city || j.locality, j.countryName].filter(Boolean).join(', ');
              if (city) setState((s) => ({ ...s, city }));
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
  pause: 'M7 4.5h4v15H7v-15Zm6 0h4v15h-4v-15Z',
  x: 'M5 5l14 14M19 5 5 19',
  chev: 'M9 6l6 6-6 6',
  save: 'M5 4.5h11l3 3v12H5v-15Zm2 0v5h8v-5M8 14.5h8v5H8v-5Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v.01M12 11v6',
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
  { id:'qibla', label:'Qibla', icon:'compass' },
  { id:'about', label:'About', icon:'info' },
];

function LocalStoreBadge(){
  return html`
    <div class="local-store-badge" title="Your reciter, bookmarks and settings are saved only in this browser — never sent anywhere.">
      <span class="ls-dot"></span>
      <${Icon} name="save" size=${13} />
      <span>Local Store</span>
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
          <${LocalStoreBadge} />
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
        <div style=${{ marginBottom:'14px' }}><${LocalStoreBadge} /></div>
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
function Hero({ setTab, surahCount }){
  const ref = useReveal();
  return html`
    <section class="hero shell" ref=${ref}>
      <div class="hero-arch" aria-hidden="true"></div>
      <div class="reveal in">
        <div class="hero-kicker">Bismillah — Light · Time · Guidance</div>
        <h1>Read, listen<br/>and return<br/>to <em>stillness.</em></h1>
        <p class="hero-sub">The Qur'an in Arabic with translations in 20 languages, multi-reciter audio, live prayer times, a Qibla finder, Hadith collections and the real-time moon — 100% free, and saved only on your device.</p>
        <div class="hero-cta">
          <button class="btn btn-gold" onClick=${() => setTab('quran')}><${Icon} name="book" size=${16} /> Open the Qur'an</button>
          <button class="btn btn-ghost" onClick=${() => document.getElementById('home-today')?.scrollIntoView({ behavior:'smooth', block:'start' })}><${Icon} name="sun" size=${16} /> Today's prayer times</button>
        </div>
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

/* ---- Home: Today panel — live prayer ticker + clocks, 12-hour format ---- */
function HomePrayerPanel({ geo }){
  const prayer = usePrayerTimes(geo);
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
        <div class="loc-pill" style=${{marginBottom:'12px'}}><${Icon} name="compass" size=${12} /> ${geo.city || `${geo.lat.toFixed(2)}, ${geo.lon.toFixed(2)}`}</div>
        <div class="mini-prayer-ticker">
          ${PRAYER_ORDER.map((k) => html`
            <div key=${k} class=${'mini-prayer-pill' + (next && k === next.name ? ' now' : '')}>
              <div class="p-name">${k}</div>
              <div class="p-time">${to12h(prayer.timings[k])}</div>
            </div>
          `)}
        </div>
        ${next ? html`<div class="surah-meta" style=${{textAlign:'center'}}>Next — <b style=${{color:'var(--gold-hi)'}}>${next.name}</b> at ${to12h(next.time)} · in ${fmtCountdown(next.msLeft)}</div>` : null}
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
  return html`
    <${React.Fragment}>
      <${Hero} setTab=${setTab} surahCount=${surahCount} />
      <section id="home-today" class="section shell" ref=${ref}>
        <div class="home-grid">
          <${HomePrayerPanel} geo=${geo} />
          <${HomeMoonPanel} geo=${geo} />
        </div>
      </section>
      <${QuickLinks} setTab=${setTab} />
    <//>
  `;
}

/* ---------------------------------------------------------------
   7. QUR'AN — surah grid, reciter picker, reader overlay
--------------------------------------------------------------- */
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

function SurahCard({ s, i, reciter, onOpen }){
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
    </div>
  `;
}

function QuranSection({ reciterId, setReciterId, langEdition, setLangEdition, arabicFontIdx, setArabicFontIdx, bookmarks, toggleBookmark }){
  const [surahs, setSurahs] = useState([]);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [openSurah, setOpenSurah] = useState(null);
  const ref = useReveal([surahs.length]);

  useEffect(() => {
    fetch(`${QURAN_API}/surah`).then(r => r.json()).then((j) => {
      setSurahs(j.data || []);
      setStatus('ready');
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

      ${status === 'loading' ? html`<div class="center-msg"><div class="spinner"></div><div style=${{marginTop:'10px'}}>Loading surahs…</div></div>` : null}
      ${status === 'error' ? html`<div class="center-msg">Couldn't reach the Qur'an API just now. Please check your connection and reload.</div>` : null}

      ${status === 'ready' ? html`
        <div class="surah-grid">
          ${filtered.map((s, i) => html`<${SurahCard} key=${s.number} s=${s} i=${i} reciter=${getReciter(reciterId)} onOpen=${setOpenSurah} />`)}
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

function ReaderOverlay({ surah, onClose, reciterId, langEdition, bookmarks, toggleBookmark }){
  const [ayahs, setAyahs] = useState(null);
  const [status, setStatus] = useState('loading');
  const [playingId, setPlayingId] = useState(null);
  const [playingWhole, setPlayingWhole] = useState(false);
  const audioRef = useRef(null);
  const reciter = getReciter(reciterId);

  useEffect(() => {
    setStatus('loading'); setAyahs(null);
    Promise.all([
      fetch(`${QURAN_API}/surah/${surah.number}/${ARABIC_EDITION}`).then(r => r.json()),
      fetch(`${QURAN_API}/surah/${surah.number}/${langEdition}`).then(r => r.json()),
    ]).then(([arRes, trRes]) => {
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
    }).catch(() => setStatus('error'));

    return () => { audioRef.current && audioRef.current.pause(); };
  }, [surah.number, langEdition]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);

  function stopAudio(){
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
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
  function playWholeSurah(){
    stopAudio();
    const url = surahAudioForReciter(reciterId, surah.number);
    if (!url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingWhole(true);
    audio.play().catch(() => {});
    audio.onended = () => setPlayingWhole(false);
    audio.onerror = () => setPlayingWhole(false);
  }

  const isBookmarked = (a) => bookmarks.some((b) => b.surah === surah.number && b.ayah === a.numberInSurah);

  return html`
    <div class="reader-overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="reader-panel">
        <div class="reader-head">
          <div>
            <h3>${surah.englishName}</h3>
            <div class="surah-meta">${surah.englishNameTranslation} · ${surah.numberOfAyahs} ayahs · ${surah.revelationType}</div>
          </div>
          <button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="close" size=${16} /></button>
        </div>
        <div class="reader-body">
          ${status === 'loading' ? html`<div class="center-msg"><div class="spinner"></div></div>` : null}
          ${status === 'error' ? html`<div class="center-msg">Couldn't load this surah. Please try again.</div>` : null}
          ${status === 'ready' && surah.number !== 1 && surah.number !== 9 ? html`
            <div class="bismillah-block">
              <div class="bismillah-ar">${BISMILLAH_AR}</div>
              <div class="bismillah-en">${BISMILLAH_EN}</div>
            </div>
          ` : null}
          ${status === 'ready' ? ayahs.map((a) => html`
            <div key=${a.numberInSurah} class="ayah-row">
              <div class="ayah-top">
                <span class="ayah-badge">${surah.number}:${a.numberInSurah}</span>
                <div class="ayah-actions">
                  <button class=${'mini-btn' + (isBookmarked(a) ? ' active' : '')} onClick=${() => toggleBookmark(surah, a)} aria-label="Bookmark this ayah">
                    <${Icon} name="bookmark" size=${13} filled=${isBookmarked(a)} />
                  </button>
                  <button class=${'mini-btn' + (playingId === a.numberInSurah ? ' active' : '')} onClick=${() => playingId === a.numberInSurah ? stopAudio() : playAyah(a)} aria-label="Play this ayah">
                    <${Icon} name=${playingId === a.numberInSurah ? 'pause' : 'play'} size=${13} filled=${true} />
                  </button>
                </div>
              </div>
              <div class="ayah-ar">${a.text}</div>
              <div class="ayah-tr">${a.translation}</div>
            </div>
          `) : null}
        </div>
        <div class="reader-player">
          <button class="player-play" onClick=${() => playingWhole ? stopAudio() : playWholeSurah()} aria-label="Play full surah">
            <${Icon} name=${playingWhole ? 'pause' : 'play'} size=${16} filled=${true} />
          </button>
          <div class="player-info">${reciter.name} — ${playingWhole ? 'playing full surah…' : 'play full surah'}</div>
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
  const ref = useReveal([items.length]);
  const PAGE_SIZE = 20;

  const collection = HADITH_COLLECTIONS.find((c) => c.id === collectionId) || HADITH_COLLECTIONS[0];
  const availableLangs = HADITH_LANG_PREFIXES.filter((l) => (HADITH_LANGS_BY_COLLECTION[collectionId] || ['eng']).includes(l.prefix));

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
        return html`
          <div key=${num} class="arch-card hadith-card reveal" style=${{ cursor:'default', transitionDelay:(i*40)+'ms' }}>
            <button class="mini-btn hadith-bm-btn" onClick=${() => toggleHadithBookmark(collection, num, text)} aria-label="Bookmark this hadith">
              <${Icon} name="bookmark" size=${13} filled=${bookmarked} />
            </button>
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
    </section>
  `;
}

/* ---------------------------------------------------------------
   9. PRAYER TIMES
--------------------------------------------------------------- */
const PRAYER_ORDER = ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'];

function usePrayerTimes(geo){
  const [state, setState] = useState({ status:'idle', timings:null, date:null });
  useEffect(() => {
    if (geo.status !== 'ready') return;
    setState((s) => ({ ...s, status:'loading' }));
    fetch(`https://api.aladhan.com/v1/timings?latitude=${geo.lat}&longitude=${geo.lon}&method=3`)
      .then(r => r.json())
      .then((j) => setState({ status:'ready', timings:j.data.timings, date:j.data.date }))
      .catch(() => setState((s) => ({ ...s, status:'error' })));
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
    pathLine.current = L.polyline([[coords.lat, coords.lon], [KAABA.lat, KAABA.lon]], { color: '#c6a15b', weight: 3, opacity: .85, dashArray: '2 8' }).addTo(map);
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
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=6&q=${encodeURIComponent(q)}`)
      .then((r) => r.json()).then((j) => setSearchResults(j || [])).catch(() => setSearchResults([]));
  }
  function pickResult(r){
    setCoords({ lat: parseFloat(r.lat), lon: parseFloat(r.lon) });
    setPlaceName(r.display_name.split(',').slice(0, 2).join(', '));
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
          <div class="qb-info-box"><div class="qb-info-val" style=${{fontSize:'14px'}}>${placeName || `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`}</div><div class="qb-info-lbl">Detected location</div></div>
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
                ${searchResults.map((r, i) => html`<div key=${i} class="qb-search-result" onClick=${() => pickResult(r)}>${r.display_name}</div>`)}
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

function AboutSection(){
  const ref = useReveal();
  return html`
    <section class="section shell" ref=${ref}>
      <div class="section-head reveal">
        <div>
          <div class="eyebrow">About</div>
          <h2>Who built this</h2>
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

function Footer(){
  return html`
    <footer class="footer shell">
      <div class="footer-row">
        <span>Quran Maar · v5 — a free, private companion for the Qur'an, Hadith and daily prayer.</span>
        <span>Built by Md Adil Ahmed Rajon</span>
      </div>
    </footer>
  `;
}

/* ---------------------------------------------------------------
   13. APP ROOT
--------------------------------------------------------------- */
function App(){
  const [tab, setTab] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [bmOpen, setBmOpen] = useState(false);
  const [reciterId, setReciterId] = useLocalState('reciter', 'alafasy');
  const [langEdition, setLangEdition] = useLocalState('lang_edition', 'en.sahih');
  const [arabicFontIdx, setArabicFontIdx] = useLocalState('arabic_font_index', 0);
  const [bookmarks, setBookmarks] = useState(() => store.getJSON('v5_bookmarks', []));
  const [hadithBookmarks, setHadithBookmarks] = useState(() => store.getJSON('v5_hadith_bookmarks', []));
  const [surahCount, setSurahCount] = useState(114);
  const geo = useGeo();

  useEffect(() => { document.documentElement.style.setProperty('--arabic-font', ARABIC_FONTS[arabicFontIdx]?.stack || ARABIC_FONTS[0].stack); }, [arabicFontIdx]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); }, [tab]);
  useEffect(() => {
    fetch(`${QURAN_API}/surah`).then(r => r.json()).then((j) => setSurahCount((j.data || []).length)).catch(() => {});
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
  else if (tab === 'qibla') page = html`<${QiblaSection} geo=${geo} />`;
  else if (tab === 'about') page = html`<${AboutSection} />`;

  return html`
    <${React.Fragment}>
      <${NavBar} tab=${tab} setTab=${setTab} onOpenMenu=${() => setMenuOpen(true)} onOpenBookmarks=${() => setBmOpen(true)} bookmarkCount=${bookmarks.length + hadithBookmarks.length} />
      <${MobileMenu} open=${menuOpen} onClose=${() => setMenuOpen(false)} tab=${tab} setTab=${setTab} />
      <main key=${tab} class="page-enter">${page}</main>
      <${Footer} />
      <${TabBar} tab=${tab} setTab=${setTab} />
      <${BookmarksDrawer} open=${bmOpen} onClose=${() => setBmOpen(false)} bookmarks=${bookmarks} remove=${removeBookmark} hadithBookmarks=${hadithBookmarks} removeHadith=${removeHadithBookmark} />
    <//>
  `;
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
} catch (err) {
  console.error('Quran Maar failed to start:', err);
  document.getElementById('root').innerHTML =
    '<div style="padding:60px 24px;text-align:center;color:#f4efe4;font-family:sans-serif;">' +
    '<h2 style="font-family:\'Instrument Serif\',serif;font-style:italic;">Something didn\'t load</h2>' +
    '<p style="color:#9b9587;max-width:420px;margin:10px auto;">Please refresh the page. If this keeps happening while opening the file directly, try running it through a local server instead of double-clicking it.</p>' +
    '</div>';
}
