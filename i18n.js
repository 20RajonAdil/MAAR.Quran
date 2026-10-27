/* ============================================================
   QURAN MAAR — i18n.js
   Site-wide interface language.

   1. If the visitor has CHOSEN a language (Settings → Language) it is
      saved on the device and used every time, whatever country they
      are in, and it survives app updates.
   2. Otherwise the language follows the visitor's COUNTRY (looked up
      from their IP, the same two services the prayer-time fallback
      already uses) and is re-checked about twice a day.
   3. Strings missing from i18n-data.js simply stay in English.

   Works by translating text already on the page (and placeholder /
   aria-label / title / alt attributes), so React keeps full control
   of the DOM. Quran text, Hadith text and translations are never
   touched: only exact matches of known interface strings change.
   ============================================================ */
(function () {
  'use strict';

  var KEY_USER = 'qm_ui_lang';        // explicit choice — always wins
  var KEY_AUTO = 'qm_ui_lang_auto';   // last country-detected language
  var KEY_CHECK = 'qm_ui_lang_check'; // when we last asked for the country

  /* code, native name, text direction, Qur'an translation edition, hadith edition */
  var LANGS = [
    { code: 'en', name: 'English',            dir: 'ltr', edition: 'en.sahih',       hadith: 'eng' },
    { code: 'ar', name: 'العربية',            dir: 'rtl', edition: null,             hadith: 'ara' },
    { code: 'bn', name: 'বাংলা',              dir: 'ltr', edition: 'bn.bengali',     hadith: 'ben' },
    { code: 'ur', name: 'اردو',               dir: 'rtl', edition: 'ur.jalandhry',   hadith: 'urd' },
    { code: 'hi', name: 'हिन्दी',              dir: 'ltr', edition: 'hi.hindi',       hadith: null },
    { code: 'tr', name: 'Türkçe',             dir: 'ltr', edition: 'tr.diyanet',     hadith: 'tur' },
    { code: 'id', name: 'Bahasa Indonesia',   dir: 'ltr', edition: 'id.indonesian',  hadith: 'ind' },
    { code: 'ms', name: 'Bahasa Melayu',      dir: 'ltr', edition: 'ms.basmeih',     hadith: null },
    { code: 'fa', name: 'فارسی',              dir: 'rtl', edition: 'fa.makarem',     hadith: null },
    { code: 'fr', name: 'Français',           dir: 'ltr', edition: 'fr.hamidullah',  hadith: 'fra' },
    { code: 'de', name: 'Deutsch',            dir: 'ltr', edition: 'de.bubenheim',   hadith: null },
    { code: 'es', name: 'Español',            dir: 'ltr', edition: 'es.cortes',      hadith: null },
    { code: 'it', name: 'Italiano',           dir: 'ltr', edition: 'it.piccardo',    hadith: null },
    { code: 'ru', name: 'Русский',            dir: 'ltr', edition: 'ru.kuliev',      hadith: 'rus' },
    { code: 'zh', name: '中文',                dir: 'ltr', edition: 'zh.jian',        hadith: null },
    { code: 'ja', name: '日本語',              dir: 'ltr', edition: 'ja.japanese',    hadith: null },
    { code: 'ko', name: '한국어',              dir: 'ltr', edition: 'ko.korean',      hadith: null },
    { code: 'th', name: 'ไทย',                dir: 'ltr', edition: 'th.thai',        hadith: null },
    { code: 'sw', name: 'Kiswahili',          dir: 'ltr', edition: 'sw.barwani',     hadith: null },
    { code: 'ta', name: 'தமிழ்',               dir: 'ltr', edition: 'ta.tamil',       hadith: 'tam' },
    { code: 'ml', name: 'മലയാളം',             dir: 'ltr', edition: 'ml.abdulhameed', hadith: null }
  ];
  var BY_CODE = {};
  LANGS.forEach(function (l) { BY_CODE[l.code] = l; });

  /* language -> countries that use it as their main language */
  var COUNTRIES = {
    ar: 'SA AE EG IQ JO KW QA BH OM YE SY LB LY TN DZ MA SD PS MR DJ',
    bn: 'BD',
    ur: 'PK',
    hi: 'IN',
    tr: 'TR',
    id: 'ID',
    ms: 'MY BN',
    fa: 'IR AF TJ',
    fr: 'FR MC SN CI CM CD CG GN BF NE TD HT GA MG BJ TG',
    de: 'DE AT CH LI',
    es: 'ES MX AR CO PE VE CL EC GT CU BO DO HN PY SV NI CR PA UY GQ',
    it: 'IT SM VA',
    ru: 'RU BY KZ KG',
    zh: 'CN TW HK MO',
    ja: 'JP',
    ko: 'KR KP',
    th: 'TH',
    sw: 'KE TZ'
  };
  var COUNTRY_LANG = {};
  Object.keys(COUNTRIES).forEach(function (code) {
    COUNTRIES[code].split(' ').forEach(function (c) { COUNTRY_LANG[c] = code; });
  });

  function ls(get, k, v) {
    try {
      if (get === 'get') return localStorage.getItem(k);
      if (get === 'set') localStorage.setItem(k, v);
      if (get === 'del') localStorage.removeItem(k);
    } catch (e) {}
    return null;
  }
  function valid(code) { return !!(code && BY_CODE[code]); }

  var DATA = window.QM_I18N_DATA || {};   // { code: { 'English string': 'translation' } }
  var current = 'en';
  var listeners = [];

  function userLang() { var c = ls('get', KEY_USER); return valid(c) ? c : null; }
  function autoLang() { var c = ls('get', KEY_AUTO); return valid(c) ? c : null; }
  function isAuto() { return !userLang(); }

  /* India is multilingual: if the browser says Tamil/Malayalam/Bangla/Urdu, use that. */
  function languageFor(country) {
    var base = COUNTRY_LANG[country] || 'en';
    if (country === 'IN' && navigator.languages) {
      for (var i = 0; i < navigator.languages.length; i++) {
        var n = String(navigator.languages[i]).toLowerCase().split('-')[0];
        if ((n === 'ta' || n === 'ml' || n === 'bn' || n === 'ur') && valid(n)) return n;
      }
    }
    return base;
  }


  /* ------------------------ machine translation fallback ------------------------
     Strings that have no hand-written translation (long paragraphs, dates,
     countdowns, About text...) are translated on the fly, so the WHOLE site
     changes language. Order of preference:
       1. the browser's own on-device translator (Chrome) — nothing leaves the device
       2. Google Translate's public endpoint, interface text only
     Every result is saved on the device (per language), so the next visit —
     even offline — needs no request at all. Turn it off any time with
     QMI18n.setMachine(false) / the switch in Settings → Language.
     Qur'an, Hadith and video text is never sent (see SKIP classes below). */
  var MT_OFF_KEY = 'qm_mt_off';
  /* The site's own name is never translated, in any language or sentence. */
  var BRAND = /Quran[\s\u00A0]+Maar|Qur['\u2019]an[\s\u00A0]+Maar|MAAR\.Quran|MAAR[\s\u00A0]+Quran|BMet[\s\u00A0]+Prayer(?:[\s\u00A0]+(?:Time|Web))?|\bMAAR\b/gi;
  function brandOnly(core) { return /^(quran|maar)$/i.test(core) || (/\bMAAR\b/i.test(core) && core.split(/\s+/).length <= 4); }
  var TOKENS = 'abcdefghij';
  function protect(src) {
    var found = [];
    var text = src.replace(BRAND, function (m) { found.push(m); return 'Xqmbrand' + TOKENS.charAt((found.length - 1) % 10); });
    return { text: text, found: found };
  }
  function restore(out, found) {
    var n = 0;
    var res = String(out).replace(/Xqmbrand([a-j])/gi, function (m, ch) { n++; return found[TOKENS.indexOf(ch.toLowerCase())] || m; });
    return n === found.length ? res : null;   // a token got lost: don't trust this translation
  }
  try { // older caches may contain a translated site name
    for (var ki = localStorage.length - 1; ki >= 0; ki--) {
      var kn = localStorage.key(ki);
      if (kn && /^qm_mt_[a-z]{2}$/.test(kn)) localStorage.removeItem(kn);
    }
  } catch (e) {}
  var mtCache = {};
  var mtSaveTimer = null;
  var mtQueue = [], mtInflight = 0, mtSeen = {}, mtBlockedUntil = 0, mtRequests = 0, mtDoneTimer = null;
  var MT_MAX_REQUESTS = 1500;
  var churn = new WeakMap();

  function mtLoad(lang) {
    if (!mtCache[lang]) {
      try { mtCache[lang] = JSON.parse(ls('get', 'qm_mt2_' + lang) || '{}') || {}; } catch (e) { mtCache[lang] = {}; }
    }
    return mtCache[lang];
  }
  function mtSave(lang) {
    clearTimeout(mtSaveTimer);
    mtSaveTimer = setTimeout(function () {
      var s = '{}';
      try { s = JSON.stringify(mtCache[lang] || {}); if (s.length > 1400000) { mtCache[lang] = {}; s = '{}'; } } catch (e) {}
      try { localStorage.setItem('qm_mt2_' + lang, s); } catch (e) { mtCache[lang] = {}; }
    }, 800);
  }
  function mtOn() { return ls('get', MT_OFF_KEY) !== '1' && window.QM_MT !== false; }

  function eligible(core) {
    if (core.length < 3 || core.length > 600) return false;
    if (!/[A-Za-z]{3,}/.test(core)) return false;                 // needs a real word
    if (brandOnly(core)) return false;                            // the site's own name
    if (/^(https?:|www\.)|@|\.(com|app|io|org|net)\b/i.test(core)) return false;
    if (/\d{1,2}:\d{2}:\d{2}/.test(core)) return false;           // live countdowns
    var letters = core.match(/[A-Za-z\u00C0-\uFFFF]/g) || [], latin = core.match(/[A-Za-z]/g) || [];
    if (letters.length && latin.length / letters.length < 0.7) return false; // already another script
    return true;
  }

  var chromeTr = {};
  function chromeTranslator(lang) {
    if (chromeTr[lang]) return chromeTr[lang];
    chromeTr[lang] = new Promise(function (resolve) {
      try {
        if (typeof Translator === 'undefined' || !Translator.availability) return resolve(null);
        Translator.availability({ sourceLanguage: 'en', targetLanguage: lang }).then(function (a) {
          if (a !== 'available') return resolve(null);
          return Translator.create({ sourceLanguage: 'en', targetLanguage: lang }).then(resolve);
        }).catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
    return chromeTr[lang];
  }
  function googleTranslate(lang, text) {
    var g = lang === 'zh' ? 'zh-CN' : lang;
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t&tl=' + g + '&q=' + encodeURIComponent(text);
    return fetchWithTimeout(url, 10000).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j[0]) throw new Error('bad');
      return j[0].map(function (x) { return x && x[0] ? x[0] : ''; }).join('');
    });
  }
  function mtTranslate(lang, text) {
    return chromeTranslator(lang).then(function (tr) {
      return tr ? tr.translate(text) : googleTranslate(lang, text);
    });
  }

  function mtRequest(src) {
    if (mtRequests >= MT_MAX_REQUESTS || !mtOn()) return;
    var k = current + '\u0000' + src;
    if (mtSeen[k]) return;
    mtSeen[k] = 1;
    mtQueue.push({ lang: current, src: src });
    mtPump();
  }
  function mtPump() {
    var wait = mtBlockedUntil - Date.now();
    if (wait > 0) { setTimeout(mtPump, wait + 50); return; }
    while (mtInflight < 4 && mtQueue.length) {
      var job = mtQueue.shift();
      if (job.lang !== current) { delete mtSeen[job.lang + '\u0000' + job.src]; continue; }
      mtInflight++; mtRequests++;
      (function (j) {
        var pr = protect(j.src);
        mtTranslate(j.lang, pr.text).then(function (out) {
          out = pr.found.length ? restore(String(out || '').trim(), pr.found) : String(out || '').trim();
          if (out && out !== j.src) {
            mtLoad(j.lang)[j.src] = out; mtSave(j.lang);
            if (j.lang === current) {
              clearTimeout(mtDoneTimer);
              mtDoneTimer = setTimeout(function () { if (document.body) queue(document.body); }, 250);
            }
          }
        }).catch(function () {
          delete mtSeen[j.lang + '\u0000' + j.src];
          mtBlockedUntil = Date.now() + 90 * 1000;   // rate-limited or offline: pause, retry later
        }).then(function () { mtInflight--; mtPump(); });
      })(job);
    }
  }

  /* ------------------------ translation engine ------------------------ */
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  var textState = new WeakMap(); // text node -> { orig, applied }

  function table() { return current === 'en' ? null : (DATA[current] || {}); }

  function lookup(str, t, node) {
    if (!t) return null;
    var core = str.replace(/^\s+|\s+$/g, '');
    if (!core || core.length > 600) return null;
    var hit = t[core];
    if (hit === undefined) {
      if (current === 'en' || !mtOn()) return null;
      hit = mtLoad(current)[core];
      if (hit === undefined) {
        if (eligible(core) && !(node && (churn.get(node) || 0) > 6)) mtRequest(core);
        return null;
      }
    }
    var lead = str.slice(0, str.indexOf(core));
    var trail = str.slice(lead.length + core.length);
    return lead + hit + trail;
  }

  /* attrMode: the element's own attributes (placeholder etc.) are fine to
     translate even on <input>/<textarea>; only their value/text is left alone. */
  function skipEl(el, attrMode) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP_TAGS[n.tagName] && !(attrMode && n === el && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA'))) return true;
      if (n.hasAttribute && n.hasAttribute('data-no-i18n')) return true;
      if (n.classList && (n.classList.contains('ay-ar') || n.classList.contains('ayah-ar') || n.classList.contains('ayah-tr') || n.classList.contains('ay-en') || n.classList.contains('hadith-en') || n.classList.contains('hadith-ar') || n.classList.contains('yt-title') || n.classList.contains('yt-modal-title') || n.classList.contains('notranslate'))) return true;
    }
    return false;
  }

  function doText(node, t) {
    var st = textState.get(node);
    var cur = node.nodeValue;
    if (st && cur === st.applied) {
      // our own earlier output: restore, then translate again for the current language
      cur = st.orig;
      if (!t) { node.nodeValue = cur; textState.delete(node); return; }
    } else if (st) {
      textState.delete(node); // React wrote fresh text
      churn.set(node, (churn.get(node) || 0) + 1);
    }
    if (!t) return;
    var out = lookup(cur, t, node);
    if (out !== null) {
      if (out !== node.nodeValue) node.nodeValue = out;
      textState.set(node, { orig: cur, applied: out });
    } else if (st) {
      node.nodeValue = cur; textState.delete(node);
    }
  }

  function doAttrs(el, t) {
    var store = el.__qmI18n || (el.__qmI18n = {});
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) { delete store[a]; continue; }
      var cur = el.getAttribute(a), st = store[a];
      if (st && cur === st.applied) {
        cur = st.orig;
        if (!t) { el.setAttribute(a, cur); delete store[a]; continue; }
      } else if (st) { delete store[a]; }
      if (!t) continue;
      var out = lookup(cur, t);
      if (out !== null) {
        if (out !== el.getAttribute(a)) el.setAttribute(a, out);
        store[a] = { orig: cur, applied: out };
      } else if (st) { el.setAttribute(a, cur); }
    }
  }

  function walk(root, t) {
    if (!root) return;
    if (root.nodeType === 3) { if (root.parentNode && !skipEl(root.parentNode)) doText(root, t); return; }
    if (root.nodeType !== 1) return;
    if (!skipEl(root, true)) doAttrs(root, t);
    if (skipEl(root)) return;
    var tw = document.createTreeWalker(root, 1 | 4, null);
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) {
        if (n.parentNode && !skipEl(n.parentNode)) doText(n, t);
      } else if (!skipEl(n, true)) {
        doAttrs(n, t);
      }
    }
  }

  var pending = [];
  var scheduled = false;
  function flush() {
    scheduled = false;
    var t = table();
    var batch = pending; pending = [];
    for (var i = 0; i < batch.length; i++) {
      var n = batch[i];
      if (n.isConnected === false) continue;
      walk(n, t);
    }
  }
  function queue(node) {
    pending.push(node);
    if (!scheduled) {
      scheduled = true;
      (window.requestAnimationFrame || setTimeout)(flush);
    }
  }

  var observer = null;
  function startObserver() {
    if (observer || !document.body || !window.MutationObserver) return;
    observer = new MutationObserver(function (muts) {
      if (current === 'en' && !hasTranslated) return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) queue(m.addedNodes[j]);
        } else if (m.type === 'characterData') {
          queue(m.target);
        } else if (m.type === 'attributes') {
          queue(m.target);
        }
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  var hasTranslated = false;

  function applyDocument() {
    var l = BY_CODE[current];
    var el = document.documentElement;
    el.setAttribute('lang', current);
    el.setAttribute('dir', l.dir);
    el.classList.toggle('qm-rtl', l.dir === 'rtl');
    if (current !== 'en') hasTranslated = true;
    if (document.body) { startObserver(); walk(document.body, table()); }
  }

  function setCurrent(code, notify) {
    if (!valid(code)) code = 'en';
    var changed = code !== current;
    current = code;
    applyDocument();
    if (notify && changed) {
      listeners.slice().forEach(function (fn) { try { fn(current, isAuto() ? 'auto' : 'user'); } catch (e) {} });
    }
  }

  /* ------------------------ country detection ------------------------ */
  function fetchWithTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
      fetch(url, { cache: 'no-store' }).then(function (r) {
        if (done) return; done = true; clearTimeout(timer);
        if (!r.ok) return reject(new Error('http'));
        resolve(r);
      }, function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    });
  }
  function detectCountry() {
    return fetchWithTimeout('https://ipapi.co/country/', 6000)
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        txt = String(txt).trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(txt)) throw new Error('bad');
        return txt;
      })
      .catch(function () {
        return fetchWithTimeout('https://ipwho.is/?fields=success,country_code', 6000)
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var c = j && j.country_code ? String(j.country_code).toUpperCase() : '';
            if (!/^[A-Z]{2}$/.test(c)) throw new Error('bad');
            return c;
          });
      });
  }

  var CHECK_EVERY = 12 * 60 * 60 * 1000;
  function autoDetect(force) {
    if (userLang()) return Promise.resolve(); // a chosen language is never overridden
    var last = parseInt(ls('get', KEY_CHECK) || '0', 10) || 0;
    if (!force && autoLang() && Date.now() - last < CHECK_EVERY) return Promise.resolve();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
    return detectCountry().then(function (country) {
      ls('set', KEY_CHECK, String(Date.now()));
      var code = languageFor(country);
      ls('set', KEY_AUTO, code);
      if (!userLang()) setCurrent(code, true);
    }).catch(function () {
      // no country available: if we never detected anything, use the browser's language
      if (!autoLang() && !userLang()) {
        var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
        var code = String(nav).toLowerCase().split('-')[0];
        if (valid(code)) { ls('set', KEY_AUTO, code); setCurrent(code, true); }
      }
    });
  }

  /* ------------------------ public API ------------------------ */
  var API = {
    langs: LANGS,
    info: function (code) { return BY_CODE[code] || null; },
    get: function () { return current; },
    isAuto: isAuto,
    /* set('bn') = the visitor's own choice (kept forever); set('auto') = follow country again */
    set: function (code) {
      if (code === 'auto') {
        ls('del', KEY_USER);
        var a = autoLang();
        if (a) setCurrent(a, true);
        autoDetect(true);
        listeners.slice().forEach(function (fn) { try { fn(current, 'auto'); } catch (e) {} });
        return;
      }
      if (!valid(code)) return;
      ls('set', KEY_USER, code);
      var prev = current;
      setCurrent(code, true);
      if (prev === code) listeners.slice().forEach(function (fn) { try { fn(current, 'user'); } catch (e) {} });
    },
    onChange: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    machine: function () { return mtOn(); },
    setMachine: function (on) {
      if (on) ls('del', MT_OFF_KEY); else ls('set', MT_OFF_KEY, '1');
      mtSeen = {}; mtQueue = [];
      setCurrent(current, false);
      listeners.slice().forEach(function (fn) { try { fn(current, 'machine'); } catch (e) {} });
    },
    refresh: function () { if (document.body) walk(document.body, table()); },
    languageFor: languageFor,
    _detect: autoDetect
  };
  window.QMI18n = API;

  /* ------------------------ boot ------------------------ */
  // Decide the starting language synchronously so the first paint is already right.
  var start = userLang() || autoLang() || 'en';
  current = start;
  var l0 = BY_CODE[start];
  document.documentElement.setAttribute('lang', start);
  document.documentElement.setAttribute('dir', l0.dir);
  if (l0.dir === 'rtl') document.documentElement.classList.add('qm-rtl');
  if (start !== 'en') hasTranslated = true;

  function boot() {
    startObserver();
    if (document.body) walk(document.body, table());
    autoDetect(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // when the person comes back to the tab (e.g. after travelling), look again — only if they never chose
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) autoDetect(false);
  });
  window.addEventListener('online', function () { autoDetect(false); });
})();
