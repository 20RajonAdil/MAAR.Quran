/* ============================================================
   QURAN MAAR — customise.js
   Visitor-controlled look & access settings, kept in one file so
   it can be removed by deleting a single <script> tag.

     1. Accent / glow / intro colours      (CSS variables)
     2. Background styles                  (black, midnight, ...)
     3. Animation level: full / reduced / off  (follows the device)
     4. Accessibility: text size, Arabic size, spacing, contrast,
        colour-blind-friendly palette, dyslexia-friendly font,
        larger tap targets, strong keyboard focus
     5. Bismillah draw-on intro (once per session)
     6. Prayer-time colours: the site's glow (and accent, unless the
        visitor picks their own) changes with the real prayer period

   Everything is vanilla JS so it works before React mounts.
   Settings live in localStorage under qm_custom.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'qm_custom';
  var ORIGINAL = '#cf3342';
  var phaseInfo = null;
  var root = document.documentElement;

  var ACCENTS = [
    ['Crimson', '#cf3342'], ['Amber', '#c9871c'], ['Emerald', '#1f9d6b'],
    ['Sky', '#2b8fd6'], ['Violet', '#7c5cf0'], ['Rose', '#d6457f']
  ];
  var BACKS = {
    black:    { label: 'Black',    bg: '#0b0b0b', soft: '#121010', raised: '#181414', top: '#08090b' },
    midnight: { label: 'Midnight', bg: '#070b14', soft: '#0c1220', raised: '#111a2c', top: '#05080f' },
    forest:   { label: 'Forest',   bg: '#07100b', soft: '#0c1612', raised: '#121f19', top: '#050b08' },
    plum:     { label: 'Plum',     bg: '#0d0810', soft: '#140d18', raised: '#1b1220', top: '#09050c' },
    pure:     { label: 'Pure black', bg: '#000000', soft: '#0a0a0a', raised: '#111111', top: '#000000' }
  };
  var DEFAULTS = {
    accent: 'auto', glow: '', introColor: '', back: 'black',
    motion: 'auto', intro: true, atmos: true,
    uiScale: 100, arScale: 100, spacing: false,
    contrast: false, cvd: false, dyslexia: false, bigTargets: false, focus: true
  };

  var S = load();
  function load() {
    var o = {}, k;
    try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { o = {}; }
    var r = {};
    for (k in DEFAULTS) r[k] = (k in o && typeof o[k] === typeof DEFAULTS[k]) ? o[k] : DEFAULTS[k];
    return r;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- colour helpers ---------- */
  function hexToRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) {
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    function f(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    if (!s) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (x) { return Math.round(x * 255); });
  }
  function toHex(c) { return '#' + c.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }

  /* Keep any chosen colour readable on the dark ground and under the
     off-white button text: lightness is clamped to a middle band. */
  function safeAccent(hex) {
    var hsl = rgbToHsl.apply(null, hexToRgb(hex));
    hsl[2] = Math.min(.58, Math.max(.38, hsl[2]));
    hsl[1] = Math.max(.35, hsl[1]);
    return hsl;
  }

  /* ---------- apply ---------- */
  var styleEl;
  function css() {
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'qm-custom-css'; (document.head || root).appendChild(styleEl); }
    return styleEl;
  }
  function setVar(n, v) { if (v === null) root.style.removeProperty(n); else root.style.setProperty(n, v); }

  function effectiveAccent() {
    if (S.cvd) return '#2b8fd6';
    if (S.accent === 'auto') return (S.atmos && phaseInfo) ? PHASES[phaseInfo.name].hex : ORIGINAL;
    return S.accent;
  }

  function apply() {
    /* accent family */
    var acc = effectiveAccent();
    if (acc.toLowerCase() === ORIGINAL) {
      ['--gold', '--gold-rgb', '--accent-rgb', '--deep-rgb', '--emerald', '--emerald-hi'].forEach(function (n) { setVar(n, null); });
    } else {
      var hsl = safeAccent(acc), h = hsl[0], s = hsl[1], l = hsl[2];
      var gold = hslToRgb(h, s, l), mid = hslToRgb(h, s, l * .86), deep = hslToRgb(h, s * .85, .14), hi = hslToRgb(h, s * .9, l * .52);
      setVar('--gold', toHex(gold)); setVar('--gold-rgb', gold.join(','));
      setVar('--accent-rgb', mid.join(',')); setVar('--deep-rgb', deep.join(','));
      setVar('--emerald', toHex(deep)); setVar('--emerald-hi', toHex(hi));
    }
    /* animation colours (fall back to the accent) */
    var glow = S.glow ? hexToRgb(S.glow).join(',') : null;
    var glowFallback = (S.atmos && phaseInfo) ? PHASES[phaseInfo.name].rgb : (acc.toLowerCase() === ORIGINAL ? '179,32,47' : (getComputedStyle(root).getPropertyValue('--accent-rgb').trim() || '179,32,47'));
    setVar('--glow-rgb', glow || glowFallback);
    setVar('--intro-rgb', S.introColor ? hexToRgb(S.introColor).join(',') : null);
    setVar('--danger', S.cvd ? '#ffb454' : null);

    /* background */
    var b = BACKS[S.back] || BACKS.black, br = hexToRgb(b.bg).join(',');
    if (S.back === 'black') { ['--bg', '--bg-soft', '--bg-raised', '--bg-rgb'].forEach(function (n) { setVar(n, null); }); }
    else { setVar('--bg', b.bg); setVar('--bg-soft', b.soft); setVar('--bg-raised', b.raised); setVar('--bg-rgb', br); }

    /* contrast */
    if (S.contrast) {
      setVar('--muted', '#d8d2ca'); setVar('--muted-2', '#bdb7af');
      setVar('--line', 'rgba(245,242,237,.38)'); setVar('--line-soft', 'rgba(245,242,237,.26)');
      setVar('--card', 'rgba(245,242,237,.07)'); setVar('--card-hi', 'rgba(245,242,237,.12)');
    } else { ['--muted', '--muted-2', '--line', '--line-soft', '--card', '--card-hi'].forEach(function (n) { setVar(n, null); }); }

    /* scales */
    setVar('--qm-ui-scale', String(S.uiScale / 100));
    setVar('--qm-ar-scale', String(S.arScale / 100));

    /* classes */
    var cl = root.classList;
    cl.toggle('qm-spacing', !!S.spacing); cl.toggle('qm-contrast', !!S.contrast);
    cl.toggle('qm-big', !!S.bigTargets); cl.toggle('qm-focus', !!S.focus);
    cl.toggle('qm-dys', !!S.dyslexia); cl.toggle('qm-nobgstyle', S.back === 'black');
    var mo = motionLevel();
    cl.toggle('qm-motion-reduced', mo === 'reduced'); cl.toggle('qm-motion-off', mo === 'off');
    if (S.dyslexia) loadDyslexiaFont();

    css().textContent = STATIC_CSS.replace(/__TOP__/g, b.top);
    var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', b.bg);
    document.dispatchEvent(new CustomEvent('qm-customise', { detail: S }));
    syncAtmos();
  }

  function motionLevel() {
    if (S.motion === 'full' || S.motion === 'reduced' || S.motion === 'off') return S.motion;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'; } catch (e) { return 'full'; }
  }

  var dysLoaded = false;
  function loadDyslexiaFont() {
    if (dysLoaded) return; dysLoaded = true;
    var l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }

  var STATIC_CSS = [
    /* scales */
    'html{--qm-ui-scale:1;--qm-ar-scale:1;}',
    'body{zoom:var(--qm-ui-scale);}',
    '.ayah-ar,.ay-ar,.hadith-ar,.bismillah-ar,.surah-ar,.hf-ar,.as-ar,.dl-dua-ar,.bm-item .bm-text,.qmx-rc-words{zoom:var(--qm-ar-scale);}',
    /* background style (skipped for the default black) */
    'html:not(.qm-nobgstyle) .bg-vignette{background:radial-gradient(ellipse 60% 40% at 50% 0%,rgba(var(--glow-rgb),.10),transparent 60%),radial-gradient(ellipse 70% 50% at 90% 100%,rgba(var(--deep-rgb),.22),transparent 60%),linear-gradient(180deg,__TOP__ 0%,var(--bg) 40%,var(--bg) 100%);}',
    'body{background:var(--bg);}',
    /* spacing */
    'html.qm-spacing .ayah-ar,html.qm-spacing .ay-ar{line-height:2.7 !important;word-spacing:.12em;}',
    'html.qm-spacing p,html.qm-spacing .ay-tr,html.qm-spacing .ayah-tr{line-height:2 !important;letter-spacing:.015em;}',
    /* contrast + focus */
    'html.qm-contrast a{text-decoration:underline;text-underline-offset:3px;}',
    'html.qm-contrast body{color:#fff;}',
    'html.qm-focus :focus-visible{outline:3px solid var(--gold) !important;outline-offset:3px !important;border-radius:6px;}',
    /* dyslexia-friendly (English/Bangla UI text only; Arabic untouched) */
    'html.qm-dys body{font-family:"Lexend","Plus Jakarta Sans",system-ui,sans-serif;letter-spacing:.02em;word-spacing:.09em;}',
    'html.qm-dys .display,html.qm-dys .brand-text{font-family:"Lexend",sans-serif;font-style:normal;}',
    /* larger tap targets */
    'html.qm-big button,html.qm-big [role="button"],html.qm-big .nav-pill,html.qm-big select,html.qm-big input{min-height:48px;}',
    'html.qm-big button,html.qm-big .nav-pill{min-width:48px;}',
    /* motion */
    'html.qm-motion-reduced #bg-canvas,html.qm-motion-off #bg-canvas{display:none;}',
    'html.qm-motion-reduced *,html.qm-motion-reduced *::before,html.qm-motion-reduced *::after{animation-iteration-count:1 !important;scroll-behavior:auto !important;}',
    'html.qm-motion-off *,html.qm-motion-off *::before,html.qm-motion-off *::after{animation:none !important;transition:none !important;scroll-behavior:auto !important;}',
    '.qm-intro,.qm-atmos{display:block;}',
    'html.qm-motion-off .qm-intro{display:none;}'
  ].join('\n');

  /* ============================================================
     Prayer-time colours
     The five prayers + sunrise each have a colour (the same ones the
     Home prayer ring uses). The overlay glow and, unless the visitor
     chose their own accent, the accent change at each real prayer
     time. Times come from the app (window.QM_PRAYER / qm_prayer:last);
     before the app has them, plain clock times are used.
     ============================================================ */
  var NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  var PHASES = {
    Fajr:    { rgb: '194,106,154', hex: '#c26a9a', note: 'Pre-dawn' },
    Sunrise: { rgb: '240,162,74',  hex: '#f0a24a', note: 'Morning light' },
    Dhuhr:   { rgb: '255,143,110', hex: '#ff8f6e', note: 'Midday' },
    Asr:     { rgb: '232,160,80',  hex: '#e8a050', note: 'Afternoon' },
    Maghrib: { rgb: '255,106,90',  hex: '#ff6a5a', note: 'Sunset' },
    Isha:    { rgb: '160,58,96',   hex: '#a03a60', note: 'Night' }
  };
  var atmosEl;

  function todaysTimings() {
    var t = window.QM_PRAYER;
    if (!t) { try { var c = JSON.parse(localStorage.getItem('qm_prayer:last') || 'null'); if (c && c.day === new Date().toDateString()) t = c.timings; } catch (e) {} }
    var ok = t && NAMES.every(function (k) { return /^\d{1,2}:\d{2}/.test(String(t[k] || '')); });
    if (ok) return { t: t, real: true };
    return { real: false, t: { Fajr: '05:00', Sunrise: '06:30', Dhuhr: '12:30', Asr: '15:30', Maghrib: '18:30', Isha: '20:00' } };
  }
  function currentPhase(nowMs) {
    var src = todaysTimings(), t = src.t, now = new Date(nowMs);
    function at(k, off) {
      var p = String(t[k]).split(':'), d = new Date(now);
      d.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0); d.setDate(d.getDate() + (off || 0)); return d;
    }
    var marks = [['Isha', at('Isha', -1)], ['Fajr', at('Fajr')], ['Sunrise', at('Sunrise')], ['Dhuhr', at('Dhuhr')],
      ['Asr', at('Asr')], ['Maghrib', at('Maghrib')], ['Isha', at('Isha')], ['Fajr', at('Fajr', 1)]];
    var i = 0; while (i < marks.length - 1 && marks[i + 1][1] <= now) i++;
    var next = null;
    for (var j = i + 1; j < marks.length; j++) { if (marks[j][0] !== 'Sunrise') { next = marks[j]; break; } }
    return { name: marks[i][0], next: next ? next[0] : 'Fajr', nextAt: next ? next[1] : null, real: src.real };
  }
  function hhmm(d) { return d ? ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) : ''; }

  function ensureAtmos() {
    if (atmosEl || !document.body) return;
    try {
      if (window.CSS && CSS.registerProperty) {
        ['--ar', '--ag', '--ab'].forEach(function (n) {
          try { CSS.registerProperty({ name: n, syntax: '<number>', inherits: true, initialValue: '0' }); } catch (e) {}
        });
      }
    } catch (e) {}
    atmosEl = document.createElement('div');
    atmosEl.className = 'qm-atmos'; atmosEl.setAttribute('aria-hidden', 'true');
    atmosEl.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0;transition:--ar 3s linear,--ag 3s linear,--ab 3s linear,opacity .8s;' +
      'background:radial-gradient(ellipse 90% 50% at 50% -6%,rgba(var(--ar),var(--ag),var(--ab),.34),transparent 72%),' +
      'radial-gradient(ellipse 70% 45% at 105% 105%,rgba(var(--ar),var(--ag),var(--ab),.16),transparent 70%),' +
      'linear-gradient(180deg,rgba(var(--ar),var(--ag),var(--ab),.07),transparent 55%);';
    document.body.insertBefore(atmosEl, document.body.firstChild);
  }
  function syncAtmos() {
    ensureAtmos(); if (!atmosEl) return;
    if (!S.atmos || motionLevel() === 'off' || !phaseInfo) { atmosEl.style.opacity = '0'; return; }
    var c = (S.glow ? hexToRgb(S.glow).join(',') : PHASES[phaseInfo.name].rgb).split(',');
    atmosEl.style.setProperty('--ar', c[0]); atmosEl.style.setProperty('--ag', c[1]); atmosEl.style.setProperty('--ab', c[2]);
    atmosEl.style.opacity = '1'; atmosEl.setAttribute('data-phase', phaseInfo.name);
  }
  function phaseLabel() {
    if (!phaseInfo) return;
    var p = phaseInfo;
    var hn = document.getElementById('qm-hero-name'), hx = document.getElementById('qm-hero-next');
    if (hn) hn.textContent = p.name + ' \u00b7 ' + PHASES[p.name].note;
    if (hx) hx.textContent = p.nextAt ? 'Next: ' + p.next + ' ' + hhmm(p.nextAt) : '';
    var el = document.getElementById('qm-phase'); if (!el) return;
    el.textContent = p.name + ' \u00b7 ' + PHASES[p.name].note + (p.nextAt ? ' \u2014 next: ' + p.next + ' at ' + hhmm(p.nextAt) : '') + (p.real ? '' : ' (estimated until your location loads)');
  }
  function tick() {
    var p = currentPhase(Date.now()), changed = !phaseInfo || phaseInfo.name !== p.name;
    phaseInfo = p;
    if (changed) apply(); else syncAtmos();
    phaseLabel();
  }
  function startAtmos() {
    tick();
    setInterval(tick, 30000);
    window.addEventListener('qm-prayer', tick);
  }

  /* ============================================================
     Bismillah draw-on intro (once per browser session)
     ============================================================ */
  function runIntro() {
    if (!S.intro || motionLevel() !== 'full') return;
    try { if (sessionStorage.getItem('qm_intro_seen')) return; } catch (e) {}
    if (location.hash && location.hash.length > 1) return;   /* deep links go straight to content */

    var ov = document.createElement('div');
    ov.className = 'qm-intro'; ov.setAttribute('role', 'presentation');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;' +
      'background:radial-gradient(ellipse 70% 50% at 50% 40%,rgba(var(--intro-rgb,var(--glow-rgb)),.16),transparent 70%),var(--bg);transition:opacity .7s ease;';
    ov.innerHTML =
      '<style>' +
      '.qm-intro svg{width:min(88vw,760px);height:auto;overflow:visible;}' +
      '.qm-intro text{font-family:"Amiri","Noto Naskh Arabic",serif;font-size:92px;stroke:rgb(var(--intro-rgb,var(--glow-rgb)));stroke-width:1.4;stroke-linejoin:round;' +
      'fill:var(--ink);fill-opacity:0;stroke-dasharray:1400;stroke-dashoffset:1400;' +
      'filter:drop-shadow(0 0 14px rgba(var(--intro-rgb,var(--glow-rgb)),.55));' +
      'animation:qmDraw 2.3s cubic-bezier(.4,.1,.2,1) .2s forwards,qmFill 1s ease 1.9s forwards;}' +
      '.qm-intro .qm-in-sub{font-family:"Instrument Serif",serif;font-style:italic;font-size:19px;color:var(--muted);opacity:0;animation:qmSub 1s ease 2.4s forwards;text-align:center;padding:0 20px;}' +
      '.qm-intro .qm-in-skip{position:absolute;right:16px;top:calc(env(safe-area-inset-top,0px) + 14px);background:var(--card);border:1px solid var(--line);color:var(--muted);border-radius:999px;padding:8px 16px;font-size:12.5px;font-weight:600;cursor:pointer;}' +
      '.qm-intro .qm-in-brand{position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 34px);font-family:"Instrument Serif",serif;font-size:22px;letter-spacing:.02em;color:var(--ink);opacity:0;animation:qmSub 1s ease 2.8s forwards;}' +
      '.qm-intro .qm-in-brand b{color:rgb(var(--intro-rgb,var(--glow-rgb)));font-weight:400;}' +
      '.qm-intro .qm-in-bar{position:absolute;left:0;bottom:0;height:3px;width:100%;transform-origin:left;transform:scaleX(0);background:linear-gradient(90deg,transparent,rgb(var(--intro-rgb,var(--glow-rgb))));animation:qmBar 4.2s linear forwards;}' +
      '@keyframes qmBar{to{transform:scaleX(1);}}' +
      '@keyframes qmDraw{to{stroke-dashoffset:0;}}@keyframes qmFill{to{fill-opacity:1;stroke-opacity:.35;}}@keyframes qmSub{to{opacity:1;}}' +
      '</style>' +
      '<button class="qm-in-skip" type="button" aria-label="Skip the opening animation">Skip</button>' +
      '<svg viewBox="0 0 900 190" role="img" aria-label="Bismillah ir-Rahman ir-Rahim"><text x="450" y="130" text-anchor="middle" direction="rtl">\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650</text></svg>' +
      '<div class="qm-in-sub">In the name of Allah, the Most Gracious, the Most Merciful</div>' +
      '<div class="qm-in-brand">Quran <b>Maar</b></div><i class="qm-in-bar"></i>';

    var done = false;
    function end() {
      if (done) return; done = true;
      try { sessionStorage.setItem('qm_intro_seen', '1'); } catch (e) {}
      ov.style.opacity = '0';
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 750);
    }
    function start() {
      document.body.appendChild(ov);
      ov.querySelector('.qm-in-skip').addEventListener('click', end);
      ov.addEventListener('click', end);
      document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { end(); document.removeEventListener('keydown', esc); } });
      setTimeout(end, 4300);
    }
    var ready = (document.fonts && document.fonts.load) ? Promise.race([document.fonts.load('80px Amiri', '\u0628'), new Promise(function (r) { setTimeout(r, 1400); })]) : Promise.resolve();
    ready.then(start, start);
  }

  /* ============================================================
     Settings page (mounted by app.js into the Settings tab)
     Built once; controls update in place so the sliding / springy
     animations play instead of the page being rebuilt on each tap.
     ============================================================ */
  var host = null, toastEl = null, toastT = 0;
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function ico(path, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
  }
  function icn(name, size) { return name === 'arabic' ? '<span style="font-family:var(--arabic-font);font-size:' + ((size || 20) + 2) + 'px;line-height:1;">\u0639</span>' : ico(I[name], size); }
  var I = {
    palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8.2-9-8.2zM7.5 11h.01M10.5 7.5h.01M15 7.5h.01',
    sun: 'M12 4.5v-2M12 21.5v-2M4.5 12h-2M21.5 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    wave: 'M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0',
    play: 'M7 4.5v15l13-7.5-13-7.5z',
    size: 'M4 18 9 6l5 12M6 14h6M16 18l2.5-6 2.5 6M17 16h3',
    arabic: 'M4 15c3 4 9 4 12 0M16 15c2-1 3-3 3-6M12 9v3M9 6h.01M15 6h.01',
    lines: 'M4 7h16M4 12h16M4 17h10',
    contrast: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    book: 'M4 5.5c2.5-1.2 5-1.2 8 0v13c-3-1.2-5.5-1.2-8 0v-13zM20 5.5c-2.5-1.2-5-1.2-8 0v13c3-1.2 5.5-1.2 8 0v-13z',
    tap: 'M5 3l14 7-6 2-2 6L5 3z',
    focus: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    reset: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5',
    check: 'M5 12.5 10 17.5 19 7'
  };

  var PAGE_CSS = [
    '.qm-settings-host{max-width:760px;margin:0 auto;padding:0 0 40px;--qm-r:26px;}',
    '@media(max-width:819px){.qm-settings-host{padding-bottom:104px;}}',
    '.qm-settings-host button{font-family:inherit;-webkit-tap-highlight-color:transparent;}',
    '.qm-settings-host [hidden]{display:none !important;}',

    /* live preview */
    '.qm-hero{position:relative;overflow:hidden;border-radius:30px;padding:20px 20px 22px;margin-bottom:14px;border:1px solid var(--line);',
    'background:radial-gradient(120% 95% at 50% -10%,rgba(var(--glow-rgb),.42),transparent 62%),radial-gradient(70% 60% at 100% 110%,rgba(var(--deep-rgb),.45),transparent 70%),var(--bg-soft,#121010);',
    'box-shadow:0 30px 70px -34px rgba(var(--glow-rgb),.55),inset 0 1px 0 rgba(255,255,255,.07);transition:box-shadow .6s;}',
    '.qm-hero-top{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;color:var(--muted);}',
    '.qm-chip{display:inline-flex;align-items:center;gap:8px;padding:7px 12px 7px 10px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:var(--ink);font-weight:600;backdrop-filter:blur(8px);}',
    '.qm-live{width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 0 rgba(var(--gold-rgb),.6);animation:qmPulse 2.4s infinite;}',
    '@keyframes qmPulse{70%{box-shadow:0 0 0 9px rgba(var(--gold-rgb),0);}100%{box-shadow:0 0 0 0 rgba(var(--gold-rgb),0);}}',
    '.qm-hero-ar{font-family:var(--arabic-font);direction:rtl;text-align:center;font-size:clamp(30px,8vw,42px);line-height:1.9;margin:16px 0 14px;color:var(--gold-hi);text-shadow:0 0 28px rgba(var(--glow-rgb),.45);}',
    '.qm-hero-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}',
    '.qm-pill{padding:11px 18px;border-radius:999px;font-size:13.5px;font-weight:700;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--ink);}',
    '.qm-pill.solid{background:linear-gradient(135deg,var(--gold),rgba(var(--accent-rgb),1));border-color:transparent;color:#f5f2ed;box-shadow:0 10px 26px -10px rgba(var(--gold-rgb),.8);}',

    /* chips */
    '.qm-chips{display:flex;gap:8px;overflow-x:auto;margin:0 -2px 16px;padding:2px;scrollbar-width:none;}',
    '.qm-chips::-webkit-scrollbar{display:none;}',
    '.qm-chips button{flex:none;display:inline-flex;align-items:center;gap:7px;padding:10px 15px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:13.5px;font-weight:600;cursor:pointer;transition:transform .15s,border-color .2s,background .2s;}',
    '.qm-chips button:active{transform:scale(.96);}',
    '.qm-chips button:hover{border-color:var(--gold);}',
    '.qm-chips svg{color:var(--gold);}',

    /* cards */
    '.qm-card{scroll-margin-top:84px;position:relative;border-radius:var(--qm-r);padding:20px 18px 8px;margin-bottom:16px;border:1px solid var(--line-soft);',
    'background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
    'box-shadow:0 24px 60px -34px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06);}',
    '.qm-card-h{display:flex;align-items:center;gap:12px;margin-bottom:6px;}',
    '.qm-card-h .qm-ic{width:42px;height:42px;border-radius:14px;}',
    '.qm-card-h h3{margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em;}',
    '.qm-card-h p{margin:2px 0 0;font-size:13px;color:var(--muted);line-height:1.4;}',
    '.qm-ic{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:12px;color:var(--gold);background:rgba(var(--accent-rgb),.16);border:1px solid rgba(var(--accent-rgb),.28);}',

    /* rows */
    '.qm-row{display:flex;align-items:center;gap:14px;padding:15px 2px;min-height:60px;cursor:pointer;user-select:none;}',
    '.qm-row+.qm-row,.qm-block+.qm-row,.qm-row+.qm-block{border-top:1px solid var(--line-soft);}',
    '.qm-row .qm-txt{flex:1;min-width:0;font-size:15.5px;font-weight:600;line-height:1.3;}',
    '.qm-row small,.qm-block small{display:block;margin-top:3px;font-size:12.5px;font-weight:400;color:var(--muted);line-height:1.5;}',
    '.qm-block{padding:14px 2px;}',
    '.qm-block>.qm-lab{display:flex;align-items:center;gap:12px;font-size:15.5px;font-weight:600;margin-bottom:12px;}',
    '.qm-block>.qm-lab span.qm-t{flex:1;}',
    '.qm-val{font-variant-numeric:tabular-nums;color:var(--gold);font-weight:700;font-size:14px;}',

    /* toggle (spring) */
    '.qm-tg{position:relative;flex:none;width:54px;height:32px;border-radius:999px;border:1px solid var(--line);background:var(--card-hi);cursor:pointer;padding:0;transition:background .25s,border-color .25s,box-shadow .25s;}',
    '.qm-tg::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.45);transition:transform .35s cubic-bezier(.3,1.5,.5,1),width .2s;}',
    '.qm-tg:active::after{width:28px;}',
    '.qm-tg[aria-checked="true"]{background:var(--gold);border-color:var(--gold);box-shadow:0 0 18px -2px rgba(var(--gold-rgb),.55);}',
    '.qm-tg[aria-checked="true"]::after{transform:translateX(22px);}',
    '.qm-tg[aria-checked="true"]:active::after{transform:translateX(18px);}',

    /* sliding segmented control */
    '.qm-seg{position:relative;display:grid;grid-template-columns:repeat(var(--n),1fr);padding:4px;border-radius:18px;background:rgba(0,0,0,.28);border:1px solid var(--line-soft);}',
    '.qm-seg-thumb{position:absolute;top:4px;bottom:4px;left:4px;width:calc((100% - 8px)/var(--n));border-radius:14px;transform:translateX(calc(var(--i)*100%));',
    'background:linear-gradient(135deg,var(--gold),rgba(var(--accent-rgb),1));box-shadow:0 8px 20px -8px rgba(var(--gold-rgb),.8);transition:transform .38s cubic-bezier(.3,1.25,.5,1);}',
    '.qm-seg button{position:relative;z-index:1;background:none;border:none;color:var(--muted);font-size:13.5px;font-weight:700;padding:12px 4px;border-radius:14px;cursor:pointer;transition:color .2s;}',
    '.qm-seg button.on{color:#f5f2ed;}',

    /* colour tiles */
    '.qm-sw{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}',
    '@media(min-width:520px){.qm-sw{grid-template-columns:repeat(8,1fr);}}',
    '.qm-dot{position:relative;aspect-ratio:1;border-radius:18px;border:2px solid transparent;padding:0;cursor:pointer;display:grid;place-items:center;color:#fff;transition:transform .2s cubic-bezier(.3,1.5,.5,1),box-shadow .25s;}',
    '.qm-dot:active{transform:scale(.92);}',
    '.qm-dot svg{opacity:0;transform:scale(.4);transition:opacity .2s,transform .3s cubic-bezier(.3,1.6,.5,1);filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));}',
    '.qm-dot.on{box-shadow:0 0 0 2px var(--bg-soft,#121010),0 0 0 4px var(--ink);transform:scale(1.04);}',
    '.qm-dot.on svg{opacity:1;transform:none;}',
    '.qm-dot.auto{background:conic-gradient(#c26a9a,#f0a24a,#ff8f6e,#e8a050,#ff6a5a,#a03a60,#c26a9a);}',
    '.qm-dot.custom{overflow:hidden;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);}',
    '.qm-dot.custom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;}',
    '.qm-sub{margin:0 0 12px;font-size:12.5px;color:var(--muted);line-height:1.5;}',
    '.qm-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
    '.qm-pick{position:relative;display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:18px;border:1px solid var(--line-soft);background:rgba(0,0,0,.22);}',
    '.qm-pick .sw{width:34px;height:34px;border-radius:11px;flex:none;border:1px solid rgba(255,255,255,.18);}',
    '.qm-pick span.t{font-size:13px;font-weight:600;line-height:1.25;min-width:0;}',
    '.qm-pick span.t em{display:block;font-style:normal;font-weight:400;color:var(--muted);font-size:11.5px;}',
    '.qm-pick input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;}',
    '.qm-pick .qm-auto{position:relative;z-index:2;margin-left:auto;background:none;border:none;color:var(--gold);font-size:12px;font-weight:700;cursor:pointer;padding:6px;}',

    /* background tiles */
    '.qm-bgs{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}',
    '.qm-bg{border:1px solid var(--line-soft);border-radius:16px;padding:8px 6px 9px;background:rgba(0,0,0,.2);color:var(--muted);font-size:11.5px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:7px;transition:transform .2s cubic-bezier(.3,1.5,.5,1),border-color .2s,color .2s;}',
    '.qm-bg:active{transform:scale(.94);}',
    '.qm-bg i{display:block;width:100%;aspect-ratio:1.25;border-radius:10px;border:1px solid rgba(255,255,255,.12);}',
    '.qm-bg.on{border-color:var(--gold);color:var(--ink);box-shadow:0 0 0 1px var(--gold);}',
    '@media(max-width:420px){.qm-bgs{gap:7px;}.qm-bg{font-size:10.5px;padding:7px 4px 8px;}}',

    /* slider */
    '.qm-range{-webkit-appearance:none;appearance:none;width:100%;height:30px;background:transparent;margin:0;cursor:pointer;--p:0%;}',
    '.qm-range::-webkit-slider-runnable-track{height:8px;border-radius:99px;background:linear-gradient(90deg,var(--gold) var(--p),var(--card-hi) var(--p));}',
    '.qm-range::-moz-range-track{height:8px;border-radius:99px;background:var(--card-hi);}',
    '.qm-range::-moz-range-progress{height:8px;border-radius:99px;background:var(--gold);}',
    '.qm-range::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;margin-top:-10px;border-radius:50%;background:#fff;border:none;box-shadow:0 3px 10px rgba(0,0,0,.5),0 0 0 4px rgba(var(--gold-rgb),.28);}',
    '.qm-range::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:#fff;border:none;box-shadow:0 3px 10px rgba(0,0,0,.5),0 0 0 4px rgba(var(--gold-rgb),.28);}',

    /* reset + confirm */
    '.qm-reset{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;border-radius:20px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-weight:700;font-size:15px;cursor:pointer;transition:transform .15s,border-color .2s;}',
    '.qm-reset:active{transform:scale(.98);}.qm-reset:hover{border-color:var(--gold);}',
    '.qm-confirm{padding:20px;border-radius:24px;border:1px solid var(--gold);background:linear-gradient(180deg,rgba(var(--accent-rgb),.16),rgba(var(--accent-rgb),.06));animation:qmPop .35s cubic-bezier(.3,1.4,.5,1);}',
    '@keyframes qmPop{from{opacity:0;transform:translateY(10px) scale(.97);}to{opacity:1;transform:none;}}',
    '.qm-confirm b{font-size:17px;}.qm-confirm p{margin:6px 0 16px;font-size:13.5px;line-height:1.55;color:var(--muted);}',
    '.qm-confirm-btns{display:flex;gap:10px;}.qm-confirm-btns button{flex:1;border-radius:16px;padding:15px 10px;font-weight:700;font-size:14.5px;cursor:pointer;transition:transform .15s;}',
    '.qm-confirm-btns button:active{transform:scale(.97);}',
    '.qm-yes{background:linear-gradient(135deg,var(--gold),rgba(var(--accent-rgb),1));color:#f5f2ed;border:none;box-shadow:0 10px 24px -10px rgba(var(--gold-rgb),.8);}',
    '.qm-no{background:var(--card);color:var(--ink);border:1px solid var(--line);}',
    '.qm-foot{margin:14px 4px 0;text-align:center;font-size:12px;color:var(--muted-2);line-height:1.6;}',

    /* toast */
    '.qm-toast{position:fixed;left:50%;bottom:calc(var(--tab-h,64px) + env(safe-area-inset-bottom,0px) + 18px);transform:translate(-50%,20px);opacity:0;z-index:70;pointer-events:none;display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:rgba(var(--bg-rgb,11,11,11),.92);border:1px solid var(--gold);color:var(--ink);font-size:13px;font-weight:600;backdrop-filter:blur(12px);box-shadow:0 12px 34px rgba(0,0,0,.5);transition:opacity .25s,transform .35s cubic-bezier(.3,1.4,.5,1);}',
    '.qm-toast.show{opacity:1;transform:translate(-50%,0);}',
    '.qm-toast svg{color:var(--gold);}',
    '@media(min-width:820px){.qm-toast{bottom:28px;}}'
  ].join('\n');

  function persist() { save(); apply(); syncSel(); toast(); }
  function set(k, v) { S[k] = v; persist(); }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.querySelector('span').textContent = msg || 'Saved';
    toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl && toastEl.classList.remove('show'); }, 1300);
  }

  /* ---- builders ---- */
  function card(icon, title, sub, id, kids) {
    var c = h('section', { class: 'qm-card', id: id }, [
      h('div', { class: 'qm-card-h' }, [h('span', { class: 'qm-ic', html: icn(icon, 22) }), h('div', {}, [h('h3', { text: title }), sub ? h('p', { text: sub }) : null])])
    ].concat(kids));
    return c;
  }
  function toggleRow(key, icon, label, hint) {
    var sw = h('button', { type: 'button', class: 'qm-tg', role: 'switch', 'data-tg': key, 'aria-label': label, 'aria-checked': String(!!S[key]) });
    var r = h('div', { class: 'qm-row', onclick: function () { S[key] = !S[key]; persist(); } }, [
      h('span', { class: 'qm-ic', html: icn(icon) }),
      h('div', { class: 'qm-txt' }, [label, hint ? h('small', { text: hint }) : null]), sw]);
    return r;
  }
  function segBlock(key, icon, label, opts, hint) {
    var w = h('div', { class: 'qm-seg', role: 'group', 'aria-label': label, 'data-seg': key, style: '--n:' + opts.length + ';--i:0' }, [h('span', { class: 'qm-seg-thumb' })]);
    opts.forEach(function (o) {
      w.appendChild(h('button', { type: 'button', 'data-key': key, 'data-val': o[0], text: o[1], onclick: function () { S[key] = o[0]; persist(); } }));
    });
    return h('div', { class: 'qm-block' }, [h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-ic', html: icn(icon) }), h('span', { class: 'qm-t', text: label })]), w,
      hint ? h('small', { text: hint, style: 'margin-top:10px;' }) : null]);
  }
  function sliderBlock(key, icon, label, min, max, step, hint) {
    var out = h('span', { class: 'qm-val', 'data-out': key });
    var inp = h('input', { type: 'range', class: 'qm-range', min: min, max: max, step: step, 'data-range': key, 'aria-label': label,
      oninput: function (e) { S[key] = +e.target.value; save(); apply(); paintRange(e.target); out.textContent = S[key] + '%'; toast(); } });
    return h('div', { class: 'qm-block' }, [h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-ic', html: icn(icon) }), h('span', { class: 'qm-t', text: label }), out]), inp,
      hint ? h('small', { text: hint, style: 'margin-top:6px;' }) : null]);
  }
  function paintRange(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }
  function pickBlock(key, label, hint, fallback) {
    var sw = h('span', { class: 'sw', 'data-sw': key });
    var inp = h('input', { type: 'color', 'data-color': key, 'aria-label': label, oninput: function (e) { S[key] = e.target.value; save(); apply(); syncSel(); toast(); } });
    var auto = h('button', { type: 'button', class: 'qm-auto', 'data-auto': key, text: 'Auto', 'aria-label': label + ': back to automatic', onclick: function (e) { e.stopPropagation(); S[key] = ''; persist(); } });
    var d = h('div', { class: 'qm-pick' }, [sw, h('span', { class: 't' }, [label, h('em', { text: hint })]), auto, inp]);
    d._fallback = fallback; sw._fallback = fallback;
    return d;
  }

  function syncSel() {
    if (!host) return;
    var els = host.querySelectorAll('[data-key][data-val]');
    Array.prototype.forEach.call(els, function (b) {
      var on = String(S[b.getAttribute('data-key')]) === b.getAttribute('data-val');
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-seg]'), function (w) {
      var i = 0, btns = w.querySelectorAll('button');
      Array.prototype.forEach.call(btns, function (b, n) { if (b.classList.contains('on')) i = n; });
      w.style.setProperty('--i', i);
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-tg]'), function (t) { t.setAttribute('aria-checked', String(!!S[t.getAttribute('data-tg')])); });
    Array.prototype.forEach.call(host.querySelectorAll('[data-range]'), function (r) {
      var k = r.getAttribute('data-range'); r.value = S[k]; paintRange(r);
      var o = host.querySelector('[data-out="' + k + '"]'); if (o) o.textContent = S[k] + '%';
    });
    /* accent tiles */
    var autoOn = S.accent === 'auto';
    Array.prototype.forEach.call(host.querySelectorAll('[data-acc]'), function (b) {
      var v = b.getAttribute('data-acc'), on = v === 'auto' ? autoOn : (!autoOn && S.accent.toLowerCase() === v);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    var ci = host.querySelector('[data-customtile]'); if (ci) {
      var preset = ACCENTS.some(function (a) { return a[1] === S.accent.toLowerCase(); });
      ci.classList.toggle('on', !autoOn && !preset);
      ci.setAttribute('aria-pressed', String(!autoOn && !preset));
    }
    var hint = host.querySelector('#qm-acc-hint');
    if (hint) hint.textContent = autoOn ? 'Auto: the colour changes with each prayer time. Pick a colour to keep it fixed.' : 'Fixed colour. Choose the rainbow tile to follow the prayer times again.';
    /* glow / intro pickers */
    Array.prototype.forEach.call(host.querySelectorAll('[data-sw]'), function (sw) {
      var k = sw.getAttribute('data-sw');
      sw.style.background = S[k] || (k === 'glow' ? 'rgb(' + (getComputedStyle(root).getPropertyValue('--glow-rgb').trim() || '179,32,47') + ')' : 'var(--gold)');
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-auto]'), function (b) { b.hidden = !S[b.getAttribute('data-auto')]; });
    Array.prototype.forEach.call(host.querySelectorAll('[data-color]'), function (i) { i.value = S[i.getAttribute('data-color')] || '#cf3342'; });
    phaseLabel();
  }

  function build() {
    host.innerHTML = '';
    if (!document.getElementById('qm-page-css')) document.head.appendChild(h('style', { id: 'qm-page-css', text: PAGE_CSS }));

    /* live preview */
    host.appendChild(h('div', { class: 'qm-hero', 'aria-label': 'Live preview of your colours' }, [
      h('div', { class: 'qm-hero-top' }, [h('span', { class: 'qm-chip' }, [h('i', { class: 'qm-live' }), h('span', { id: 'qm-hero-name', text: '' })]), h('span', { id: 'qm-hero-next', text: '' })]),
      h('div', { class: 'qm-hero-ar', text: '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650' }),
      h('div', { class: 'qm-hero-btns' }, [h('span', { class: 'qm-pill solid', text: 'Open the Qur\u2019an' }), h('span', { class: 'qm-pill', text: 'Prayer times' })])
    ]));

    /* jump chips */
    function chip(icon, label, id) {
      return h('button', { type: 'button', html: ico(I[icon], 16) + '<span>' + label + '</span>', onclick: function () {
        var t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: motionLevel() === 'off' ? 'auto' : 'smooth', block: 'start' }); } });
    }
    host.appendChild(h('div', { class: 'qm-chips', role: 'navigation', 'aria-label': 'Jump to a settings group' }, [
      chip('palette', 'Colours', 'qm-s-colours'), chip('sun', 'Prayer colours', 'qm-s-prayer'), chip('wave', 'Motion', 'qm-s-motion'), chip('eye', 'Access', 'qm-s-access')]));

    /* colours */
    var sw = h('div', { class: 'qm-sw', role: 'group', 'aria-label': 'Accent colour' });
    sw.appendChild(h('button', { type: 'button', class: 'qm-dot auto', 'data-acc': 'auto', 'aria-label': 'Auto: follows the prayer times', html: ico(I.check, 22), onclick: function () { S.accent = 'auto'; persist(); } }));
    ACCENTS.forEach(function (a) {
      sw.appendChild(h('button', { type: 'button', class: 'qm-dot', style: 'background:' + a[1], 'data-acc': a[1], 'aria-label': a[0], html: ico(I.check, 22), onclick: function () { S.accent = a[1]; persist(); } }));
    });
    var ctile = h('div', { class: 'qm-dot custom', 'data-customtile': '1', role: 'group' }, [
      h('input', { type: 'color', 'aria-label': 'Pick any accent colour', value: '#cf3342', oninput: function (e) { S.accent = e.target.value; save(); apply(); syncSel(); toast(); } })]);
    ctile.style.background = 'conic-gradient(#ff3b3b,#ffd23b,#3bff7a,#3bd8ff,#6a3bff,#ff3bd8,#ff3b3b)';
    sw.appendChild(ctile);

    var bgs = h('div', { class: 'qm-bgs', role: 'group', 'aria-label': 'Background' });
    Object.keys(BACKS).forEach(function (k) {
      var b = BACKS[k];
      bgs.appendChild(h('button', { type: 'button', class: 'qm-bg', 'data-key': 'back', 'data-val': k, onclick: function () { S.back = k; persist(); } },
        [h('i', { style: 'background:linear-gradient(160deg,' + b.top + ',' + b.soft + ')' }), b.label.replace('Pure black', 'Pure')]));
    });

    host.appendChild(card('palette', 'Colours', 'Pick the look. Your choices are saved on this device.', 'qm-s-colours', [
      h('div', { class: 'qm-block' }, [h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-t', text: 'Accent colour' })]), h('p', { class: 'qm-sub', id: 'qm-acc-hint' }), sw]),
      h('div', { class: 'qm-block' }, [h('div', { class: 'qm-pair' }, [pickBlock('glow', 'Glow', 'Background light', '#b3202f'), pickBlock('introColor', 'Bismillah', 'Opening colour', '#cf3342')])]),
      h('div', { class: 'qm-block' }, [h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-t', text: 'Background' })]), bgs])
    ]));

    host.appendChild(card('sun', 'Prayer-time colours', 'The site changes colour with the real prayer times.', 'qm-s-prayer', [
      toggleRow('atmos', 'spark', 'Colours follow the prayer times', 'Glow and Auto accent shift at Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha.'),
      h('div', { class: 'qm-block' }, [h('small', { style: 'margin:0;' }, [h('b', { style: 'color:var(--gold);', text: 'Now: ' }), h('span', { id: 'qm-phase', text: '' })])])
    ]));

    host.appendChild(card('wave', 'Motion', 'Animations and the opening screen.', 'qm-s-motion', [
      segBlock('motion', 'wave', 'Animation level', [['auto', 'Device'], ['full', 'Full'], ['reduced', 'Calm'], ['off', 'Off']], 'Device follows your phone or computer\u2019s reduce-motion setting.'),
      toggleRow('intro', 'play', 'Opening Bismillah', 'Plays once per visit')
    ]));

    host.appendChild(card('eye', 'Reading & access', 'Make the site comfortable for you.', 'qm-s-access', [
      sliderBlock('uiScale', 'size', 'Text & layout size', 90, 140, 5, 'Makes the whole site larger, like zooming.'),
      sliderBlock('arScale', 'arabic', 'Arabic text size', 80, 160, 5, 'Applied on top of the size above.'),
      toggleRow('spacing', 'lines', 'Extra line spacing', 'More room between lines of Arabic and translation'),
      toggleRow('contrast', 'contrast', 'High contrast', 'Brighter text, stronger borders, underlined links'),
      toggleRow('cvd', 'eye', 'Colour-blind friendly colours', 'Blue accent and orange warnings'),
      toggleRow('dyslexia', 'book', 'Dyslexia-friendly font', 'Lexend for English and Bangla text'),
      toggleRow('bigTargets', 'tap', 'Larger buttons', 'Bigger tap targets on small screens'),
      toggleRow('focus', 'focus', 'Strong keyboard focus', 'A thick outline shows where you are when using Tab')
    ]));

    /* reset with confirmation */
    var resetBtn = h('button', { type: 'button', class: 'qm-reset', html: ico(I.reset, 18) + '<span>Reset to original look</span>' });
    var confirmBox = h('div', { class: 'qm-confirm', role: 'alertdialog', 'aria-labelledby': 'qm-ctitle', 'aria-describedby': 'qm-cdesc', hidden: '' }, [
      h('b', { id: 'qm-ctitle', text: 'Are you sure?' }),
      h('p', { id: 'qm-cdesc', text: 'This puts every colour, animation and accessibility setting back to the original Quran Maar look.' }),
      h('div', { class: 'qm-confirm-btns' }, [
        h('button', { type: 'button', class: 'qm-no', id: 'qm-cancel', text: 'Cancel', onclick: function () { confirmBox.hidden = true; resetBtn.hidden = false; resetBtn.focus(); } }),
        h('button', { type: 'button', class: 'qm-yes', text: 'Yes, reset everything', onclick: function () { confirmBox.hidden = true; resetBtn.hidden = false; reset(); } })
      ])
    ]);
    resetBtn.addEventListener('click', function () { resetBtn.hidden = true; confirmBox.hidden = false; document.getElementById('qm-cancel').focus(); });
    host.appendChild(resetBtn); host.appendChild(confirmBox);
    host.appendChild(h('p', { class: 'qm-foot', text: 'Saved on this device only. Colours you pick stay readable on the dark background automatically.' }));

    toastEl = h('div', { class: 'qm-toast', role: 'status', 'aria-live': 'polite' }, [h('span', { text: 'Saved' })]);
    toastEl.insertBefore(h('i', { html: ico(I.check, 16), style: 'display:inline-flex;' }), toastEl.firstChild);
    document.body.appendChild(toastEl);
    syncSel();
  }

  function reset() { S = JSON.parse(JSON.stringify(DEFAULTS)); save(); apply(); syncSel(); toast('Back to the original look'); }
  function mount(el) { host = el; build(); }
  function unmount() { host = null; if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl); toastEl = null; }

  window.QMCustomise = { get: function () { return JSON.parse(JSON.stringify(S)); }, set: set, reset: reset, mount: mount, unmount: unmount };

  /* apply immediately (before first paint) using the cached prayer times */
  phaseInfo = currentPhase(Date.now());
  apply();
  function ready() { startAtmos(); runIntro(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
