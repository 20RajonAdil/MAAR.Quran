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

  /* ------------------------ translation engine ------------------------ */
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  var textState = new WeakMap(); // text node -> { orig, applied }

  function table() { return current === 'en' ? null : (DATA[current] || null); }

  function lookup(str, t) {
    if (!t) return null;
    var core = str.replace(/^\s+|\s+$/g, '');
    if (!core || core.length > 400) return null;
    var hit = t[core];
    if (hit === undefined) return null;
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
      if (n.classList && (n.classList.contains('ay-ar') || n.classList.contains('ayah-ar') || n.classList.contains('ayah-tr') || n.classList.contains('notranslate'))) return true;
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
    }
    if (!t) return;
    var out = lookup(cur, t);
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
