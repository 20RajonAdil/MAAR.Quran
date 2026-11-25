/* Run: node tests/readalong.test.cjs
   Checks the Read Along matcher: mistakes are tolerated, conversation is ignored, ayah end is detected. */
const fs = require('fs'), path = require('path'), assert = require('assert');
global.window = {}; global.React = { useState() {}, useEffect() {}, useRef() {}, useMemo() {} }; global.htm = { bind: () => () => {} };
require('vm').runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'features.js'), 'utf8'));
const { normAr, raAlign, raComplete, raIsRecitation } = window.QMX._test;
const words = (t) => t.split(/\s+/).filter(Boolean).map(normAr);
const heard = (t) => normAr(t).split(' ').filter(Boolean);

const A3 = 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const A5 = 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ';
const A7 = 'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ';
const run = (ayah, said) => { const r = raAlign(words(ayah), heard(said)); return { r, done: raComplete(r), rec: raIsRecitation(r) }; };

// 1. perfect recitation (recogniser output has no diacritics)
let x = run(A7, 'صراط الذين انعمت عليهم غير المغضوب عليهم ولا الضالين');
assert(x.done && x.rec, 'perfect recitation completes');

// 2. mistakes: wrong/garbled words, one word dropped, extra noise word
x = run(A7, 'صراط الذين انعمة عليهم غير المقضوب عليهم ولا الضالين');
assert(x.done, 'garbled words still complete');
x = run(A7, 'صراط الذين عليهم غير المغضوب عليهم ولا الضالين');
assert(x.done, 'a dropped word still completes');
x = run(A7, 'صراط ايه الذين انعمت عليهم غير المغضوب عليهم ولا الضالين');
assert(x.done, 'an extra noise word still completes');

// 3. halfway through: recognised but not complete
x = run(A7, 'صراط الذين انعمت عليهم');
assert(x.rec && !x.done, 'half an ayah is recitation but not done');

// 4. conversation (Arabic everyday talk / unrelated words) is ignored
x = run(A7, 'كيف حالك اليوم هل ذهبت الى العمل من الصباح');
assert(!x.rec && !x.done, 'ordinary Arabic chat is ignored');
x = run(A5, 'هل انت جاهز للذهاب الان يا صديقي');
assert(!x.rec && !x.done, 'chat vs short ayah is ignored');
x = run(A7, 'ولا');
assert(!x.done, 'a single stray word never advances');

// 5. short ayah needs both words
x = run(A3, 'الرحمن');
assert(!x.done, 'two-word ayah needs both words');
x = run(A3, 'الرحمن الرحيم');
assert(x.done && x.rec, 'two-word ayah completes');

// 6. chatter first, then reading
x = run(A5, 'هل انت جاهز للذهاب الان يا صديقي اياك نعبد واياك نستعين');
assert(x.done, 'chatter before the ayah does not block it');

// 7. recogniser glued/split words
x = run(A5, 'اياك نعبد و اياك نستعين');
assert(x.done, 'split word is fine');


// 8. Tajweed slips (heavy/light letters, ayn as alif, stretched letters) still count
x = run(A7, 'سراط الزين انعمت عليهم خير المقدوب عليهم ولا الدالين');
assert(x.done, 'sound-alike Tajweed slips still complete');
x = run(A5, 'ياك نابد وياك نستاين');
assert(x.done, 'ayn read as alif still completes');

// 9. wrong words hold the page
x = run(A7, 'صراط الذين كتب الله لكم بعد ذلك غير المغضوب');
assert(!x.done, 'wrong words and no ending do not advance');
x = run(A7, 'كتب الله لكم بعد ذلك الضالين');
assert(!x.done, 'only the last word heard does not advance');
x = run(A5, 'اياك نعبد');
assert(!x.done, 'half a short ayah does not advance');
x = run(A5, 'اياك نعبد وسبحان ربي العظيم');
assert(!x.done, 'a different ayah does not advance a short one');
x = run(A7, 'الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين');
assert(!x.done, 'an entirely different ayah never advances');

console.log('readalong tests passed');
// ---- long-surah regressions (raStep / raFlatten) ----
const { raStep, raFlatten } = window.QMX._test;
const K255 = 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ';
const K256 = 'لَا إِكْرَاهَ فِي الدِّينِ ۖ قَدْ تَّبَيَّنَ الرُّشْدُ مِنَ الْغَيِّ';
const K257 = 'اللَّهُ وَلِيُّ الَّذِينَ آمَنُوا يُخْرِجُهُم مِّنَ الظُّلُمَاتِ إِلَى النُّورِ';
const T = [K255, K256, K257].map(words);
const full255 = 'الله لا اله الا هو الحي القيوم لا تاخذه سنة ولا نوم له ما في السماوات وما في الارض من ذا الذي يشفع عنده الا باذنه يعلم ما بين ايديهم وما خلفهم ولا يحيطون بشيء من علمه الا بما شاء وسع كرسيه السماوات والارض ولا يؤده حفظهما وهو العلي العظيم';

// long ayah said cleanly moves on
let st = raStep(T, 0, heard(full255));
assert(st.idx === 1, 'long ayah said cleanly advances');

// long ayah with several words the recogniser butchered still advances (was: stuck)
const mangled = full255.replace('يشفع عنده','يشبه عندي').replace('ايديهم وما','اديهم و').replace('يحيطون','يحطون').replace('كرسيه','كرسي').replace('حفظهما','حفضما');
st = raStep(T, 0, heard(mangled));
assert(st.idx === 1, 'long ayah with 5+ mangled words still advances');

// ayah only partly recognised, then the NEXT ayah starts: must follow, not freeze (the main bug)
const partial = 'الله لا اله الا هو الحي القيوم لا تاخذه سنة ولا نوم له ما في السماوات وما في الارض من ذا الذي يشفع عنده يعلم ما بين ايديهم وما خلفهم ولا يحيطون بشيء من علمه وسع كرسيه السماوات والارض ولا يؤده حفظهما وهو العلي العظيم';
const droppedTail = partial.split(' ').slice(0, -2).join(' ');  // lost "العلي العظيم"
st = raStep(T, 0, heard(droppedTail + ' لا اكراه في الدين قد تبين الرشد'));
assert(st.idx === 1, 'next ayah is followed even if the end of the previous one was not heard');

// halfway through a long ayah: stays put and shows progress
st = raStep(T, 0, heard('الله لا اله الا هو الحي القيوم لا تاخذه سنة ولا نوم'));
assert(st.idx === 0 && st.hearing && !st.done, 'half a long ayah holds the page');

// conversation never moves it
st = raStep(T, 0, heard('كيف حالك اليوم هل ذهبت الى العمل من الصباح'));
assert(st.idx === 0 && !st.hearing, 'chat is ignored on long ayah');

// flows through two ayat in one burst
st = raStep(T, 0, heard(full255 + ' لا اكراه في الدين قد تبين الرشد من الغي'));
assert(st.idx === 2, 'two ayat in one burst advance twice');

// Android duplicated transcripts: every result repeats the previous one
const dup = raFlatten(['لا اكراه في', 'لا اكراه في الدين', 'لا اكراه في الدين قد تبين']);
assert(dup.join(' ') === 'لا اكراه في الدين قد تبين', 'cumulative re-sent results collapse to one list');
const sep = raFlatten(['لا اكراه في الدين', 'قد تبين الرشد']);
assert(sep.length === 7, 'separate results are kept');

console.log('long-surah tests passed');

// ---- unclear-voice / dictation-style leniency, Ar-Rahman ----
const R13 = 'فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ';
const R14 = 'خَلَقَ ٱلْإِنسَٰنَ مِن صَلْصَٰلٍ كَٱلْفَخَّارِ';
x = run(R13, 'فباي الاء ربكما تكذبان');
assert(x.done && x.rec, 'refrain, clear');
x = run(R13, 'فباي ال ربكم تكذبن');
assert(x.done, 'refrain with mumbled middle and ending still done');
x = run(R13, 'باي الا ربكما تكذبا');
assert(x.done, 'dropped first letter / last letter still done');
x = run(R14, 'خلق الانسن من سلسال كافخار');
assert(x.done, 'mumbled long-ish ayah still done');
x = run(R14, 'خلق الانسان من');
assert(!x.done, 'half of it is not done');
x = run(R13, 'كيف حالك اليوم يا صديقي');
assert(!x.done && !x.rec, 'chat against the refrain is ignored');
// refrain twice in a row moves two ayat
const TR = [R13, R14, R13].map(words);
st = raStep(TR, 0, heard('فباي الاء ربكما تكذبان خلق الانسان من صلصال كالفخار'));
assert(st.idx === 2, 'two ayat in one burst, unclear marks fine');

console.log('dictation tests passed');
