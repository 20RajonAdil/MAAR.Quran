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
     6. Time-of-day atmosphere (from the sun at the visitor's place)

   Everything is vanilla JS so it works before React mounts.
   Settings live in localStorage under qm_custom.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'qm_custom';
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
    accent: '#cf3342', glow: '', introColor: '', back: 'black',
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

  function effectiveAccent() { return S.cvd ? '#2b8fd6' : S.accent; }

  function apply() {
    /* accent family */
    var acc = effectiveAccent();
    if (acc.toLowerCase() === DEFAULTS.accent) {
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
    setVar('--glow-rgb', glow || (acc.toLowerCase() === DEFAULTS.accent ? '179,32,47' : getComputedStyle(root).getPropertyValue('--accent-rgb').trim() || '179,32,47'));
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
    updateAtmos();
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
    'html.qm-big button:not(.qm-fab),html.qm-big .nav-pill{min-width:48px;}',
    /* motion */
    'html.qm-motion-reduced #bg-canvas,html.qm-motion-off #bg-canvas{display:none;}',
    'html.qm-motion-reduced *,html.qm-motion-reduced *::before,html.qm-motion-reduced *::after{animation-iteration-count:1 !important;scroll-behavior:auto !important;}',
    'html.qm-motion-off *,html.qm-motion-off *::before,html.qm-motion-off *::after{animation:none !important;transition:none !important;scroll-behavior:auto !important;}',
    '.qm-intro,.qm-atmos{display:block;}',
    'html.qm-motion-off .qm-intro{display:none;}'
  ].join('\n');

  /* ============================================================
     Time-of-day atmosphere
     Sun times come from the last location the app saved
     (qm_geo:last). Without one it falls back to the clock.
     ============================================================ */
  var atmosEl, atmosTimer;
  function sunTimes(d, lat, lon) {
    var rad = Math.PI / 180;
    var doy = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
    var B = 2 * Math.PI / 365 * (doy - 81);
    var eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var decl = 23.45 * Math.sin(B) * rad;
    var cosH = (Math.sin(-.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
    cosH = Math.max(-1, Math.min(1, cosH));
    var H = Math.acos(cosH) / rad;
    var base = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var noon = 720 - 4 * lon - eot;
    return { rise: base + (noon - 4 * H) * 6e4, noon: base + noon * 6e4, set: base + (noon + 4 * H) * 6e4 };
  }
  function phase(now) {
    var geo = null;
    try { geo = JSON.parse(localStorage.getItem('qm_geo:last') || 'null'); } catch (e) {}
    var rise, set, noon, M = 6e4, d = new Date(now);
    if (geo && isFinite(geo.lat) && isFinite(geo.lon)) {
      var t = sunTimes(d, geo.lat, geo.lon); rise = t.rise; set = t.set; noon = t.noon;
    } else {
      var m = new Date(now); m.setHours(6, 30, 0, 0); rise = m.getTime();
      m.setHours(18, 30, 0, 0); set = m.getTime(); noon = (rise + set) / 2;
    }
    /* the sun times above are for "today" in UTC terms; compare in a way
       that survives the day boundary by using the nearest day */
    var day = 864e5;
    while (now - noon > day / 2) { rise += day; set += day; noon += day; }
    while (noon - now > day / 2) { rise -= day; set -= day; noon -= day; }
    if (now < rise - 100 * M) return ['Night', '28,40,96'];
    if (now < rise - 10 * M)  return ['Fajr', '64,98,190'];
    if (now < rise + 90 * M)  return ['Sunrise', '222,150,72'];
    if (now < noon + 150 * M) return ['Day', '205,168,70'];
    if (now < set - 75 * M)   return ['Afternoon', '200,140,76'];
    if (now < set + 45 * M)   return ['Maghrib', '205,50,62'];
    if (now < set + 110 * M)  return ['Dusk', '96,54,150'];
    return ['Night', '28,40,96'];
  }
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
    atmosEl.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;transition:--ar 4s linear,--ag 4s linear,--ab 4s linear,opacity .6s;' +
      'background:radial-gradient(ellipse 85% 45% at 50% -8%,rgba(var(--ar),var(--ag),var(--ab),.22),transparent 70%),radial-gradient(ellipse 60% 40% at 105% 105%,rgba(var(--ar),var(--ag),var(--ab),.09),transparent 70%);';
    document.body.insertBefore(atmosEl, document.body.firstChild);
  }
  function updateAtmos() {
    clearInterval(atmosTimer);
    if (!S.atmos || motionLevel() === 'off') { if (atmosEl) atmosEl.style.opacity = '0'; return; }
    ensureAtmos(); if (!atmosEl) return;
    function tick() {
      var p = phase(Date.now()), c = p[1].split(',');
      atmosEl.style.setProperty('--ar', c[0]); atmosEl.style.setProperty('--ag', c[1]); atmosEl.style.setProperty('--ab', c[2]);
      atmosEl.style.opacity = '1'; atmosEl.setAttribute('data-phase', p[0]);
      var lab = document.getElementById('qm-phase'); if (lab) lab.textContent = p[0];
    }
    tick(); atmosTimer = setInterval(tick, 300000);
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
     Customise panel
     ============================================================ */
  var panel, fab, lastFocus, confirming = false;
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
  function set(k, v) { S[k] = v; save(); apply(); if (panel && panel.classList.contains('open')) refresh(); }

  var PANEL_CSS = [
    '.qm-fab{position:fixed;z-index:60;right:14px;bottom:calc(var(--tab-h,64px) + env(safe-area-inset-bottom,0px) + 14px);width:48px;height:48px;border-radius:50%;border:1px solid var(--gold);background:rgba(var(--bg-rgb,11,11,11),.88);color:var(--gold);display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(10px);box-shadow:0 6px 24px rgba(0,0,0,.45),0 0 18px rgba(var(--glow-rgb,179,32,47),.25);}',
    '@media(min-width:820px){.qm-fab{bottom:22px;right:22px;}}',
    '.qm-fab svg{width:22px;height:22px;}',
    '.qm-scrim{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .25s;}',
    '.qm-scrim.open{opacity:1;pointer-events:auto;}',
    '.qm-panel{position:fixed;z-index:9001;background:var(--bg-soft,#121010);border:1px solid var(--line);color:var(--ink);display:flex;flex-direction:column;transition:transform .32s cubic-bezier(.22,.68,.18,1);',
    'right:0;top:0;bottom:0;width:min(400px,100vw);border-radius:22px 0 0 22px;transform:translateX(105%);box-shadow:-20px 0 60px rgba(0,0,0,.5);}',
    '.qm-panel.open{transform:none;}',
    '@media(max-width:700px){.qm-panel{left:0;right:0;top:auto;bottom:0;width:auto;max-height:88vh;border-radius:22px 22px 0 0;transform:translateY(105%);}.qm-panel.open{transform:none;}}',
    '.qm-ph{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 12px;border-bottom:1px solid var(--line-soft);}',
    '.qm-ph h2{margin:0;font-family:"Instrument Serif",serif;font-weight:400;font-size:26px;}',
    '.qm-x{background:var(--card);border:1px solid var(--line);color:var(--ink);width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;}',
    '.qm-pb{overflow:auto;padding:6px 20px 24px;-webkit-overflow-scrolling:touch;}',
    '.qm-sec{margin-top:20px;}',
    '.qm-sec>h3{margin:0 0 10px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);font-weight:700;}',
    '.qm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft);font-size:14px;}',
    '.qm-row small{display:block;color:var(--muted);font-size:12px;margin-top:2px;line-height:1.45;}',
    '.qm-sw{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}',
    '.qm-dot{width:34px;height:34px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;outline-offset:3px;}',
    '.qm-dot.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--bg-soft,#121010) inset;}',
    '.qm-seg{display:flex;flex-wrap:wrap;gap:2px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:3px;}',
    '.qm-row.col{flex-direction:column;align-items:stretch;gap:8px;}',
    '.qm-seg button{flex:1 1 auto;}',
    '.qm-seg button{background:none;border:none;color:var(--muted);font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;cursor:pointer;}',
    '.qm-seg button.on{background:var(--gold);color:#f5f2ed;}',
    '.qm-tg{position:relative;width:46px;height:26px;flex:none;border-radius:999px;border:1px solid var(--line);background:var(--card-hi);cursor:pointer;padding:0;transition:background .2s;}',
    '.qm-tg::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:var(--ink);transition:transform .2s;}',
    '.qm-tg[aria-checked="true"]{background:var(--gold);border-color:var(--gold);}',
    '.qm-tg[aria-checked="true"]::after{transform:translateX(20px);}',
    '.qm-range{width:100%;accent-color:var(--gold);}',
    '.qm-color{display:flex;align-items:center;gap:8px;}',
    '.qm-color input[type=color]{width:38px;height:32px;border:1px solid var(--line);border-radius:8px;background:none;padding:2px;cursor:pointer;}',
    '.qm-link{background:none;border:none;color:var(--muted);text-decoration:underline;cursor:pointer;font-size:12.5px;padding:4px;}',
    '.qm-reset{margin-top:22px;width:100%;background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:14px;padding:13px;font-weight:700;font-size:14px;cursor:pointer;}',
    '.qm-reset:hover{border-color:var(--gold);}',
    '.qm-confirm{margin-top:22px;padding:16px;border:1px solid var(--gold);border-radius:16px;background:rgba(var(--accent-rgb,179,32,47),.10);}',
    '.qm-confirm b{font-size:15px;}.qm-confirm p{margin:6px 0 14px;font-size:13px;line-height:1.55;color:var(--muted);}',
    '.qm-confirm-btns{display:flex;gap:10px;}.qm-confirm-btns button{flex:1;border-radius:12px;padding:12px;font-weight:700;font-size:14px;cursor:pointer;}',
    '.qm-yes{background:var(--gold);color:#f5f2ed;border:1px solid var(--gold);}.qm-no{background:var(--card);color:var(--ink);border:1px solid var(--line);}',
    '.qm-prev{margin-top:10px;font-family:var(--arabic-font);font-size:26px;direction:rtl;text-align:right;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card);line-height:1.9;}'
  ].join('\n');

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8.2-9-8.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.2" r="1"/><circle cx="15" cy="7.2" r="1"/></svg>';

  function row(label, hint, control) {
    return h('div', { class: 'qm-row' }, [h('div', {}, [label, hint ? h('small', { text: hint }) : null]), control]);
  }
  function toggle(key, label, hint) {
    var b = h('button', { type: 'button', class: 'qm-tg', role: 'switch', 'aria-checked': String(!!S[key]), 'aria-label': label,
      onclick: function () { set(key, !S[key]); } });
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
    return row(label, hint, h('div', { class: 'qm-color' }, [inp, S[key] ? rst : null]));
  }
  function slider(key, label, min, max, step, hint) {
    var out = h('b', { text: S[key] + '%' });
    var inp = h('input', { type: 'range', class: 'qm-range', min: min, max: max, step: step, value: S[key], 'aria-label': label,
      oninput: function (e) { S[key] = +e.target.value; out.textContent = S[key] + '%'; save(); apply(); } });
    return h('div', { class: 'qm-row', style: 'flex-direction:column;align-items:stretch;' }, [
      h('div', { style: 'display:flex;justify-content:space-between;' }, [h('span', { text: label }), out]), inp, hint ? h('small', { text: hint }) : null]);
  }

  function build() {
    var st = h('style', { text: PANEL_CSS }); document.head.appendChild(st);
    fab = h('button', { type: 'button', class: 'qm-fab', 'aria-label': 'Customise colours, animations and accessibility', 'aria-haspopup': 'dialog', onclick: open });
    fab.innerHTML = ICON;
    var scrim = h('div', { class: 'qm-scrim', onclick: close });
    panel = h('div', { class: 'qm-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qm-ptitle', tabindex: '-1' });
    document.body.appendChild(scrim); document.body.appendChild(panel); document.body.appendChild(fab);
    panel._scrim = scrim;
    document.addEventListener('keydown', function (e) {
      if (!panel.classList.contains('open')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        var f = panel.querySelectorAll('button,input,select,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
    refresh();
  }

  function refresh() {
    var top = panel.querySelector('.qm-pb'); var st = top ? top.scrollTop : 0;
    panel.innerHTML = '';
    panel.appendChild(h('div', { class: 'qm-ph' }, [h('h2', { id: 'qm-ptitle', text: 'Customise' }),
      h('button', { type: 'button', class: 'qm-x', 'aria-label': 'Close customise panel', text: '\u00d7', onclick: close })]));
    var body = h('div', { class: 'qm-pb' });

    /* colours */
    var sw = h('div', { class: 'qm-sw', role: 'group', 'aria-label': 'Accent colour' });
    ACCENTS.forEach(function (a) {
      var on = S.accent.toLowerCase() === a[1];
      sw.appendChild(h('button', { type: 'button', class: 'qm-dot' + (on ? ' on' : ''), style: 'background:' + a[1], 'aria-label': a[0], 'aria-pressed': String(on), onclick: function () { set('accent', a[1]); } }));
    });
    sw.appendChild(h('input', { type: 'color', class: 'qm-dot', value: S.accent, 'aria-label': 'Pick any accent colour', style: 'padding:0;border:2px solid var(--line);background:none;', oninput: function (e) { S.accent = e.target.value; save(); apply(); } }));
    body.appendChild(h('div', { class: 'qm-sec' }, [h('h3', { text: 'Colours' }), sw,
      h('div', { class: 'qm-prev', text: '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650' }),
      colorRow('glow', 'Animation glow', 'Background glow and the moving light', '#b3202f'),
      colorRow('introColor', 'Opening Bismillah colour', 'The colour the calligraphy is drawn in', '#cf3342'),
      seg('back', 'Background', Object.keys(BACKS).map(function (k) { return [k, BACKS[k].label]; }))
    ]));
    /* animation */
    body.appendChild(h('div', { class: 'qm-sec' }, [h('h3', { text: 'Animation' }),
      seg('motion', 'Animation level', [['auto', 'Device'], ['full', 'Full'], ['reduced', 'Calm'], ['off', 'Off']], 'Device follows your phone or computer\u2019s reduce-motion setting.'),
      toggle('intro', 'Opening Bismillah', 'Plays once per visit'),
      toggle('atmos', 'Time-of-day glow', 'The sky tint follows the sun where you are'),
      h('div', { class: 'qm-row', style: 'border:none;' }, [h('small', { style: 'margin:0;' }, ['Right now: ', h('b', { id: 'qm-phase', text: atmosEl ? (atmosEl.getAttribute('data-phase') || '\u2014') : '\u2014' })])])
    ]));
    /* access */
    body.appendChild(h('div', { class: 'qm-sec' }, [h('h3', { text: 'Ease of access' }),
      slider('uiScale', 'Text & layout size', 90, 140, 5, 'Makes the whole site larger, like zooming.'),
      slider('arScale', 'Arabic text size', 80, 160, 5, 'Applied on top of the size above.'),
      toggle('spacing', 'Extra line spacing', 'More room between lines of Arabic and translation'),
      toggle('contrast', 'High contrast', 'Brighter text, stronger borders, underlined links'),
      toggle('cvd', 'Colour-blind friendly colours', 'Uses a blue accent and orange warnings'),
      toggle('dyslexia', 'Dyslexia-friendly font', 'Lexend for English and Bangla text'),
      toggle('bigTargets', 'Larger buttons', 'Bigger tap targets, easier on small screens'),
      toggle('focus', 'Strong keyboard focus', 'A thick outline shows where you are when using Tab')
    ]));
    if (confirming) {
      var box = h('div', { class: 'qm-confirm', role: 'alertdialog', 'aria-labelledby': 'qm-ctitle', 'aria-describedby': 'qm-cdesc' }, [
        h('b', { id: 'qm-ctitle', text: 'Are you sure?' }),
        h('p', { id: 'qm-cdesc', text: 'This puts every colour, animation and accessibility setting back to the original Quran Maar look.' }),
        h('div', { class: 'qm-confirm-btns' }, [
          h('button', { type: 'button', class: 'qm-yes', text: 'Yes, reset everything', onclick: function () { confirming = false; reset(); } }),
          h('button', { type: 'button', class: 'qm-no', id: 'qm-cancel', text: 'Cancel', onclick: function () { confirming = false; refresh(); } })
        ])
      ]);
      body.appendChild(box);
    } else {
      body.appendChild(h('button', { type: 'button', class: 'qm-reset', text: 'Reset to original look', onclick: function () { confirming = true; refresh(); } }));
    }
    body.appendChild(h('p', { class: 'qm-note', style: 'font-size:12px;color:var(--muted-2);line-height:1.6;margin:12px 0 0;', text: 'Saved on this device only. Colours you pick are kept readable on the dark background automatically.' }));
    panel.appendChild(body);
    if (confirming) { var c = panel.querySelector('#qm-cancel'); if (c) { c.focus(); c.scrollIntoView({ block: 'nearest' }); } } else { body.scrollTop = st; }
  }

  function open() {
    lastFocus = document.activeElement;
    refresh(); panel.classList.add('open'); panel._scrim.classList.add('open');
    setTimeout(function () { var x = panel.querySelector('.qm-x'); if (x) x.focus(); }, 60);
  }
  function close() {
    confirming = false;
    panel.classList.remove('open'); panel._scrim.classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function reset() {
    S = JSON.parse(JSON.stringify(DEFAULTS)); save(); apply(); refresh();
  }

  window.QMCustomise = { get: function () { return JSON.parse(JSON.stringify(S)); }, set: set, reset: reset, open: function () { if (panel) open(); } };

  /* apply immediately (before first paint), build the UI once the DOM exists */
  apply();
  function ready() { build(); apply(); runIntro(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
