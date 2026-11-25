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

console.log('readalong tests passed');
