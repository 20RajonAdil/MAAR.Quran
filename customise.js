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
    var el = document.getElementById('qm-phase'); if (!el || !phaseInfo) return;
    var p = phaseInfo;
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
      '@keyframes qmDraw{to{stroke-dashoffset:0;}}@keyframes qmFill{to{fill-opacity:1;stroke-opacity:.35;}}@keyframes qmSub{to{opacity:1;}}' +
      '</style>' +
      '<button class="qm-in-skip" type="button" aria-label="Skip the opening animation">Skip</button>' +
      '<svg viewBox="0 0 900 190" role="img" aria-label="Bismillah ir-Rahman ir-Rahim"><text x="450" y="130" text-anchor="middle" direction="rtl">\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650</text></svg>' +
      '<div class="qm-in-sub">In the name of Allah, the Most Gracious, the Most Merciful</div>';

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
     ============================================================ */
  var host = null, confirming = false;
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function set(k, v) { S[k] = v; save(); apply(); refresh(); }

  var PAGE_CSS = [
    '.qm-settings-host{max-width:720px;margin:0 auto;padding-bottom:40px;}',
    '@media(max-width:819px){.qm-settings-host{padding-bottom:96px;}}',
    '.qm-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:8px 18px 14px;margin-bottom:16px;}',
    '.qm-card>h3{margin:12px 0 4px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);font-weight:700;}',
    '.qm-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid var(--line-soft);font-size:15px;min-height:56px;}',
    '.qm-row:last-child{border-bottom:none;}',
    '.qm-row.col{flex-direction:column;align-items:stretch;gap:10px;}',
    '.qm-row small{display:block;color:var(--muted);font-size:12.5px;margin-top:3px;line-height:1.5;}',
    '.qm-sw{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 0 6px;}',
    '.qm-dot{width:40px;height:40px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;outline-offset:3px;flex:none;}',
    '.qm-dot.on{border-color:var(--ink);box-shadow:inset 0 0 0 3px var(--bg-soft,#121010);}',
    '.qm-seg{display:flex;flex-wrap:wrap;gap:3px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:3px;}',
    '.qm-seg button{flex:1 1 auto;background:none;border:none;color:var(--muted);font-size:13.5px;font-weight:600;padding:11px 12px;border-radius:14px;cursor:pointer;}',
    '.qm-seg button.on{background:var(--gold);color:#f5f2ed;}',
    '.qm-tg{position:relative;width:52px;height:30px;flex:none;border-radius:999px;border:1px solid var(--line);background:var(--card-hi);cursor:pointer;padding:0;transition:background .2s;}',
    '.qm-tg::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--ink);transition:transform .2s;}',
    '.qm-tg[aria-checked="true"]{background:var(--gold);border-color:var(--gold);}',
    '.qm-tg[aria-checked="true"]::after{transform:translateX(22px);}',
    '.qm-range{width:100%;height:32px;accent-color:var(--gold);}',
    '.qm-color{display:flex;align-items:center;gap:10px;flex:none;}',
    '.qm-color input[type=color]{width:46px;height:40px;border:1px solid var(--line);border-radius:10px;background:none;padding:3px;cursor:pointer;}',
    '.qm-link{background:none;border:none;color:var(--muted);text-decoration:underline;cursor:pointer;font-size:13px;padding:8px;}',
    '.qm-reset{width:100%;background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:16px;padding:15px;font-weight:700;font-size:15px;cursor:pointer;}',
    '.qm-reset:hover{border-color:var(--gold);}',
    '.qm-confirm{padding:16px;border:1px solid var(--gold);border-radius:18px;background:rgba(var(--accent-rgb,179,32,47),.10);}',
    '.qm-confirm b{font-size:16px;}.qm-confirm p{margin:6px 0 14px;font-size:13.5px;line-height:1.55;color:var(--muted);}',
    '.qm-confirm-btns{display:flex;gap:10px;}.qm-confirm-btns button{flex:1;border-radius:14px;padding:14px 10px;font-weight:700;font-size:14.5px;cursor:pointer;}',
    '.qm-yes{background:var(--gold);color:#f5f2ed;border:1px solid var(--gold);}.qm-no{background:var(--card);color:var(--ink);border:1px solid var(--line);}',
    '.qm-prev{margin:6px 0 4px;font-family:var(--arabic-font);font-size:28px;direction:rtl;text-align:center;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card);line-height:1.9;color:var(--gold-hi);}',
    '.qm-now{margin:12px 0 4px;padding:12px 14px;border-radius:14px;border:1px solid var(--gold-dim);background:rgba(var(--accent-rgb,179,32,47),.10);font-size:13.5px;line-height:1.5;}',
    '.qm-now b{color:var(--gold);}',
    '@media(max-width:520px){.qm-card{padding:6px 14px 12px;border-radius:20px;}.qm-row{font-size:14.5px;}}'
  ].join('\n');

  function row(label, hint, control) {
    return h('div', { class: 'qm-row' }, [h('div', { style: 'min-width:0;' }, [label, hint ? h('small', { text: hint }) : null]), control]);
  }
  function toggle(key, label, hint) {
    var b = h('button', { type: 'button', class: 'qm-tg', role: 'switch', 'aria-checked': String(!!S[key]), 'aria-label': label, onclick: function () { set(key, !S[key]); } });
    return row(label, hint, b);
  }
  function seg(key, label, opts, hint) {
    var w = h('div', { class: 'qm-seg', role: 'group', 'aria-label': label });
    opts.forEach(function (o) {
      w.appendChild(h('button', { type: 'button', class: S[key] === o[0] ? 'on' : '', 'aria-pressed': String(S[key] === o[0]), text: o[1], onclick: function () { set(key, o[0]); } }));
    });
    var r = row(label, hint, w); r.classList.add('col'); return r;
  }
  function colorRow(key, label, hint, fallback) {
    var inp = h('input', { type: 'color', value: S[key] || fallback, 'aria-label': label, oninput: function (e) { S[key] = e.target.value; save(); apply(); } });
    var rst = h('button', { type: 'button', class: 'qm-link', text: 'Auto', 'aria-label': label + ': back to automatic', onclick: function () { set(key, ''); } });
    return row(label, hint, h('div', { class: 'qm-color' }, [S[key] ? rst : null, inp]));
  }
  function slider(key, label, min, max, step, hint) {
    var out = h('b', { text: S[key] + '%' });
    var inp = h('input', { type: 'range', class: 'qm-range', min: min, max: max, step: step, value: S[key], 'aria-label': label,
      oninput: function (e) { S[key] = +e.target.value; out.textContent = S[key] + '%'; save(); apply(); } });
    return h('div', { class: 'qm-row col' }, [
      h('div', { style: 'display:flex;justify-content:space-between;' }, [h('span', { text: label }), out]), inp, hint ? h('small', { text: hint }) : null]);
  }

  function refresh() {
    if (!host) return;
    var keepY = window.scrollY;
    host.innerHTML = '';
    if (!document.getElementById('qm-page-css')) { var st = h('style', { id: 'qm-page-css', text: PAGE_CSS }); document.head.appendChild(st); }

    /* colours */
    var sw = h('div', { class: 'qm-sw', role: 'group', 'aria-label': 'Accent colour' });
    var autoOn = S.accent === 'auto';
    sw.appendChild(h('button', { type: 'button', class: 'qm-dot' + (autoOn ? ' on' : ''), style: 'background:conic-gradient(#c26a9a,#f0a24a,#ff8f6e,#e8a050,#ff6a5a,#a03a60,#c26a9a)',
      'aria-label': 'Auto: follows the prayer times', 'aria-pressed': String(autoOn), onclick: function () { set('accent', 'auto'); } }));
    ACCENTS.forEach(function (a) {
      var on = !autoOn && S.accent.toLowerCase() === a[1];
      sw.appendChild(h('button', { type: 'button', class: 'qm-dot' + (on ? ' on' : ''), style: 'background:' + a[1], 'aria-label': a[0], 'aria-pressed': String(on), onclick: function () { set('accent', a[1]); } }));
    });
    sw.appendChild(h('input', { type: 'color', class: 'qm-dot', value: autoOn ? ORIGINAL : S.accent, 'aria-label': 'Pick any accent colour',
      style: 'padding:0;border:2px solid var(--line);background:none;', oninput: function (e) { S.accent = e.target.value; save(); apply(); } }));

    host.appendChild(h('div', { class: 'qm-card' }, [h('h3', { text: 'Colours' }),
      h('div', { class: 'qm-prev', text: '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650' }),
      h('div', { class: 'qm-row col', style: 'border:none;padding-bottom:0;' }, [h('span', { text: 'Accent colour' }),
        h('small', { text: autoOn ? 'Auto: the colour changes with each prayer time. Pick a colour to keep it fixed.' : 'Fixed colour. Choose the rainbow circle to follow the prayer times again.' })]),
      sw,
      colorRow('glow', 'Animation glow', 'Colour of the background glow', '#b3202f'),
      colorRow('introColor', 'Opening Bismillah colour', 'The colour the calligraphy is drawn in', '#cf3342'),
      seg('back', 'Background', Object.keys(BACKS).map(function (k) { return [k, BACKS[k].label]; }))
    ]));

    /* prayer colours + animation */
    host.appendChild(h('div', { class: 'qm-card' }, [h('h3', { text: 'Prayer-time colours' }),
      toggle('atmos', 'Colours follow the prayer times', 'The glow (and the accent, when set to Auto) shifts at Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha.'),
      h('div', { class: 'qm-now' }, [h('b', { text: 'Now: ' }), h('span', { id: 'qm-phase', text: '' })]),
      h('h3', { text: 'Animation' }),
      seg('motion', 'Animation level', [['auto', 'Device'], ['full', 'Full'], ['reduced', 'Calm'], ['off', 'Off']], 'Device follows your phone or computer\u2019s reduce-motion setting.'),
      toggle('intro', 'Opening Bismillah', 'Plays once per visit')
    ]));

    /* access */
    host.appendChild(h('div', { class: 'qm-card' }, [h('h3', { text: 'Ease of access' }),
      slider('uiScale', 'Text & layout size', 90, 140, 5, 'Makes the whole site larger, like zooming.'),
      slider('arScale', 'Arabic text size', 80, 160, 5, 'Applied on top of the size above.'),
      toggle('spacing', 'Extra line spacing', 'More room between lines of Arabic and translation'),
      toggle('contrast', 'High contrast', 'Brighter text, stronger borders, underlined links'),
      toggle('cvd', 'Colour-blind friendly colours', 'Uses a blue accent and orange warnings'),
      toggle('dyslexia', 'Dyslexia-friendly font', 'Lexend for English and Bangla text'),
      toggle('bigTargets', 'Larger buttons', 'Bigger tap targets, easier on small screens'),
      toggle('focus', 'Strong keyboard focus', 'A thick outline shows where you are when using Tab')
    ]));

    /* reset with confirmation */
    var resetBox;
    if (confirming) {
      resetBox = h('div', { class: 'qm-confirm', role: 'alertdialog', 'aria-labelledby': 'qm-ctitle', 'aria-describedby': 'qm-cdesc' }, [
        h('b', { id: 'qm-ctitle', text: 'Are you sure?' }),
        h('p', { id: 'qm-cdesc', text: 'This puts every colour, animation and accessibility setting back to the original Quran Maar look.' }),
        h('div', { class: 'qm-confirm-btns' }, [
          h('button', { type: 'button', class: 'qm-yes', text: 'Yes, reset everything', onclick: function () { confirming = false; reset(); } }),
          h('button', { type: 'button', class: 'qm-no', id: 'qm-cancel', text: 'Cancel', onclick: function () { confirming = false; refresh(); } })
        ])
      ]);
    } else {
      resetBox = h('button', { type: 'button', class: 'qm-reset', text: 'Reset to original look', onclick: function () { confirming = true; refresh(); } });
    }
    host.appendChild(resetBox);
    phaseLabel();
    if (confirming) { var c = document.getElementById('qm-cancel'); if (c) c.focus({ preventScroll: false }); }
    else window.scrollTo(0, keepY);
  }

  function reset() { S = JSON.parse(JSON.stringify(DEFAULTS)); save(); apply(); refresh(); }
  function mount(el) { host = el; confirming = false; refresh(); }
  function unmount() { host = null; confirming = false; }

  window.QMCustomise = { get: function () { return JSON.parse(JSON.stringify(S)); }, set: set, reset: reset, mount: mount, unmount: unmount };

  /* apply immediately (before first paint) using the cached prayer times */
  phaseInfo = currentPhase(Date.now());
  apply();
  function ready() { startAtmos(); runIntro(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
