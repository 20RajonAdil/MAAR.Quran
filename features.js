/* ============================================================
   QURAN MAAR — features.js
   Five additions, kept in their own file so app.js stays readable
   and the whole pack can be rolled back by removing one <script>:

     1. SkyClock          live sun/moon arc tied to the prayer times
     2. RevelationMap     Makki / Madani surahs on a map of the Hijaz
     3. SurahMedallion    illustration that draws itself as you read
     4. WordGlow +        word-by-word glow while a verse is recited,
        CalligraphyWave   plus a pen-stroke ribbon that pulses with it
     5. ReciteCheck       say a verse aloud, see which words matched

   Loaded as a classic script BEFORE app.js; everything is exposed on
   window.QMX and app.js picks the components up from there.
   ============================================================ */
(function () {
  'use strict';

  const { useState, useEffect, useRef, useMemo } = React;
  const html = htm.bind(React.createElement);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const R2 = (n) => Math.round(n * 100) / 100;

  /* ---------------------------------------------------------------
     Styles (injected once so index.html needs no changes)
  --------------------------------------------------------------- */
  const CSS = `
  .qmx-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:20px;position:relative;overflow:hidden;}
  .qmx-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px;}
  .qmx-head h2,.qmx-head h3{margin:0;font-family:'Instrument Serif',serif;font-weight:400;font-size:28px;line-height:1.1;}
  .qmx-note{font-size:12px;color:var(--muted-2);line-height:1.6;margin:12px 0 0;}
  .qmx-pillbtn{background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;transition:border-color .2s,background .2s;}
  .qmx-pillbtn:hover{border-color:var(--gold-dim);background:var(--card-hi);}
  .qmx-pillbtn.on{background:var(--gold);border-color:var(--gold);color:#f5f2ed;}

  /* ---- Sky clock ---- */
  .qmx-sky-stage{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--line);transition:background .6s linear;}
  .qmx-sky-svg{display:block;width:100%;height:auto;}
  .qmx-sky-time{position:absolute;left:14px;top:10px;pointer-events:none;text-shadow:0 1px 8px rgba(0,0,0,.55);}
  .qmx-sky-time b{display:block;font-family:'Instrument Serif',serif;font-weight:400;font-size:30px;line-height:1;color:#f5f2ed;}
  .qmx-sky-time span{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:rgba(245,242,237,.78);}
  .qmx-star{animation:qmxTw 3.4s ease-in-out infinite;}
  @keyframes qmxTw{0%,100%{opacity:.25}50%{opacity:1}}
  .qmx-chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px;margin-top:14px;}
  .qmx-chip{border:1px solid var(--line);border-radius:12px;padding:9px 10px;text-align:center;background:var(--card);}
  .qmx-chip.now{border-color:var(--gold);background:rgba(var(--accent-rgb),.14);}
  .qmx-chip .n{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
  .qmx-chip .t{font-size:14px;font-weight:700;margin-top:2px;}
  .qmx-scrub{display:flex;align-items:center;gap:12px;margin-top:14px;}
  .qmx-range{flex:1;-webkit-appearance:none;appearance:none;height:4px;border-radius:4px;background:var(--line);outline:none;}
  .qmx-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:var(--gold);border:2px solid #f5f2ed;cursor:pointer;}
  .qmx-range::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--gold);border:2px solid #f5f2ed;cursor:pointer;}
  .qmx-facts{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:12px;font-size:12.5px;color:var(--muted);}
  .qmx-facts b{color:var(--ink);font-weight:600;}

  /* ---- Revelation map ---- */
  .qmx-map{display:block;width:100%;height:auto;max-height:440px;border-radius:16px;background:radial-gradient(120% 90% at 30% 20%,rgba(var(--deep-rgb),.35),transparent 70%),#0e0c0c;border:1px solid var(--line);}
  .qmx-node{cursor:pointer;}
  .qmx-node circle.core{transition:r .2s;}
  .qmx-node:hover circle.core{r:11;}
  .qmx-pulse{transform-box:fill-box;transform-origin:center;animation:qmxPulse 2.4s ease-out infinite;}
  @keyframes qmxPulse{0%{transform:scale(.6);opacity:.8}100%{transform:scale(2.4);opacity:0}}
  .qmx-flow{animation:qmxFlow 1.4s linear infinite;}
  @keyframes qmxFlow{to{stroke-dashoffset:-24}}
  .qmx-tabs{display:flex;gap:8px;margin:14px 0 10px;flex-wrap:wrap;}
  .qmx-chiplist{display:flex;flex-wrap:wrap;gap:7px;max-height:210px;overflow-y:auto;padding:2px;}
  .qmx-sbtn{background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:6px 11px;font-size:12px;cursor:pointer;transition:border-color .2s,background .2s;}
  .qmx-sbtn:hover{border-color:var(--gold-dim);background:var(--card-hi);}
  .qmx-sbtn i{font-style:normal;color:var(--muted-2);margin-right:5px;}

  /* ---- Medallion ---- */
  .qmx-medal{flex:none;display:block;}
  .qmx-medal-bg{fill:rgba(245,242,237,.04);}
  .qmx-medal-ring-track{stroke:rgba(245,242,237,.10);stroke-width:1.6;}
  .qmx-medal-ring{stroke:var(--gold);stroke-width:2.2;stroke-linecap:round;transition:stroke-dashoffset .35s var(--ease);}
  .qmx-medal-ghost path{fill:none;stroke:rgba(245,242,237,.16);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round;}
  .qmx-medal-live path{fill:none;stroke:var(--ink);stroke-width:1.9;stroke-linejoin:round;stroke-linecap:round;transition:stroke-dashoffset .35s var(--ease),fill .8s;}
  .qmx-medal.is-done .qmx-medal-live path{fill:rgba(var(--gold-rgb),.2);stroke:var(--danger);}
  .qmx-medal.is-done{filter:drop-shadow(0 0 8px rgba(var(--gold-rgb),.45));}
  .qmx-readhead{display:flex;align-items:center;gap:13px;min-width:0;}

  /* ---- Word glow + wave ---- */
  .qmx-wave{display:block;width:100%;height:38px;background:var(--bg-raised);border-top:1px solid var(--line-soft);}
  .wg{transition:color .25s,text-shadow .25s;color:var(--muted);}
  .wg.wg-done{color:var(--ink);}
  .wg.wg-on{color:#fff;text-shadow:0 0 18px rgba(var(--gold-rgb),.9),0 0 4px rgba(255,255,255,.5);}

  /* ---- Recite & check ---- */
  .qmx-modal{position:fixed;inset:0;z-index:95;background:rgba(6,6,7,.82);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;}
  @media(min-width:760px){.qmx-modal{align-items:center;padding:24px;}}
  .qmx-sheet{width:100%;max-width:620px;background:var(--bg-soft);border:1px solid var(--line);border-radius:24px 24px 0 0;padding:20px 20px calc(22px + env(safe-area-inset-bottom,0px));max-height:92vh;overflow-y:auto;}
  @media(min-width:760px){.qmx-sheet{border-radius:24px;}}
  .qmx-sheet h3{margin:0;font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;font-size:22px;}
  .qmx-rc-words{direction:rtl;text-align:center;font-family:var(--arabic-font);font-size:30px;line-height:2.3;margin:14px 0 6px;}
  .qmx-rc-words span{display:inline-block;margin:0 6px;padding:0 4px;border-radius:8px;transition:color .25s,background .25s;color:var(--muted);}
  .qmx-rc-words span.ok{color:#7be0a0;background:rgba(95,208,138,.12);}
  .qmx-rc-words span.miss{color:var(--danger);background:rgba(255,138,148,.12);}
  .qmx-mic{width:78px;height:78px;border-radius:50%;border:none;background:var(--gold);color:#f5f2ed;display:flex;align-items:center;justify-content:center;cursor:pointer;margin:10px auto;position:relative;}
  .qmx-mic.on::after{content:'';position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--gold);animation:qmxPulse 1.4s ease-out infinite;}
  .qmx-heard{font-size:12.5px;color:var(--muted);text-align:center;min-height:20px;direction:rtl;}
  .qmx-score{text-align:center;font-size:14px;margin-top:6px;}
  .qmx-score b{font-family:'Instrument Serif',serif;font-size:30px;font-weight:400;display:block;}
  .qmx-err{color:var(--danger);font-size:13px;text-align:center;margin:6px 0;line-height:1.6;}
  .qmx-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px;}
  @media (prefers-reduced-motion:reduce){.qmx-star,.qmx-pulse,.qmx-flow,.qmx-mic.on::after{animation:none;}}
  `;
  (function injectStyles() {
    try {
      if (document.getElementById('qmx-style')) return;
      const s = document.createElement('style');
      s.id = 'qmx-style';
      s.textContent = CSS;
      document.head.appendChild(s);
    } catch (e) { /* non-browser environment (tests) */ }
  })();

  /* ---------------------------------------------------------------
     Shared helpers
  --------------------------------------------------------------- */
  function parseHM(str) {
    const m = /(\d{1,2}):(\d{2})/.exec(String(str || ''));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function fmt12(min) {
    const t = Math.round(((min % 1440) + 1440) % 1440);
    const h = Math.floor(t / 60), mm = t % 60;
    return (h % 12 || 12) + ':' + String(mm).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function fmtDur(min) {
    const t = Math.round(min);
    return Math.floor(t / 60) + 'h ' + String(t % 60).padStart(2, '0') + 'm';
  }

  /* Arabic normalisation used by Recite & Check: strips vowel marks,
     Quranic annotation signs and tatweel, and folds the letter shapes
     that speech recognition and Uthmani script disagree on. */
  function normAr(s) {
    return String(s || '')
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '')
      .replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/g, '\u0627')
      .replace(/[\u0649\u06CC\u0626]/g, '\u064A')
      .replace(/\u0624/g, '\u0648')
      .replace(/\u0629/g, '\u0647')
      .replace(/[^\u0621-\u064A\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  function sim(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    return 1 - lev(a, b) / Math.max(a.length, b.length);
  }
  /* Greedy in-order alignment of the words the recogniser heard against
     the words of the verse. Allows the reciter to skip up to three heard
     words (noise / extra syllables) before giving up on a target word. */
  function alignWords(target, heard, done) {
    const res = new Array(target.length).fill('pending');
    let j = 0, last = -1;
    for (let i = 0; i < target.length; i++) {
      let best = -1, bs = 0;
      for (let k = j; k < Math.min(heard.length, j + 4); k++) {
        const s = sim(target[i], heard[k]);
        if (s > bs) { bs = s; best = k; }
      }
      const thr = target[i].length <= 3 ? 0.66 : 0.7;
      if (best >= 0 && bs >= thr) { res[i] = 'ok'; j = best + 1; last = i; }
    }
    for (let i = 0; i < target.length; i++) {
      if (res[i] === 'pending' && (i < last || done)) res[i] = 'miss';
    }
    return res;
  }

  /* ===============================================================
     1. SKY CLOCK
     =============================================================== */
  const SKY = {
    night:   ['#04050a', '#0c0a12'],
    Fajr:    ['#0d1124', '#3a1d3a'],
    Sunrise: ['#243a63', '#c4573f'],
    Dhuhr:   ['#1f4a7a', '#6aa0c8'],
    Asr:     ['#25497a', '#a9b8b4'],
    Maghrib: ['#2a2a52', 'var(--gold)'],
    Isha:    ['#080a16', '#1c1330'],
  };
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lerpRGB = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgbCss = (c) => 'rgb(' + c.map((v) => Math.round(v)).join(',') + ')';

  function skyKeys(T) {
    const k = [
      { m: T.Isha - 1440, c: SKY.Isha },
      { m: T.Isha - 1440 + 90, c: SKY.night },
      { m: T.Fajr - 45, c: SKY.night },
      { m: T.Fajr, c: SKY.Fajr },
      { m: T.Sunrise, c: SKY.Sunrise },
      { m: T.Dhuhr, c: SKY.Dhuhr },
      { m: T.Asr, c: SKY.Asr },
      { m: T.Maghrib, c: SKY.Maghrib },
      { m: T.Isha, c: SKY.Isha },
      { m: T.Isha + 90, c: SKY.night },
      { m: T.Fajr + 1440 - 45, c: SKY.night },
      { m: T.Fajr + 1440, c: SKY.Fajr },
    ].sort((a, b) => a.m - b.m);
    return k;
  }
  function skyAt(keys, m) {
    let i = 0;
    while (i < keys.length - 2 && m >= keys[i + 1].m) i++;
    const a = keys[i], b = keys[i + 1];
    const t = clamp((m - a.m) / Math.max(1, b.m - a.m), 0, 1);
    return [0, 1].map((n) => rgbCss(lerpRGB(hex2rgb(a.c[n]), hex2rgb(b.c[n]), t)));
  }

  /* Sun altitude curve, fitted so it crosses the horizon exactly at the
     real sunrise, peaks at the real Dhuhr, and stretches with the day. */
  function makeAlt(T) {
    const D = T.Dhuhr, R = T.Sunrise;
    const c0 = Math.cos(TAU * (R - D) / 1440);
    const den = Math.max(0.05, 1 - c0);
    return (m) => (Math.cos(TAU * (m - D) / 1440) - c0) / den;
  }

  function moonPhaseLocal(date) {
    const syn = 29.530588861;
    let age = ((date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % syn;
    if (age < 0) age += syn;
    return { age, waxing: age < syn / 2, k: Math.cos(TAU * age / syn) };
  }
  /* Lit part of the moon as a path (terminator ellipse method). */
  function moonLitPath(cx, cy, r, ph) {
    const rx = R2(r * Math.abs(ph.k));
    if (ph.waxing) {
      return `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx} ${r} 0 0 ${ph.k > 0 ? 0 : 1} ${cx} ${cy - r}Z`;
    }
    return `M${cx} ${cy - r}A${r} ${r} 0 0 0 ${cx} ${cy + r}A${rx} ${r} 0 0 ${ph.k > 0 ? 1 : 0} ${cx} ${cy - r}Z`;
  }

  const STARS = (() => {
    let s = 20260;
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    return Array.from({ length: 42 }, () => ({ x: R2(rnd() * 600), y: R2(rnd() * 140 + 6), r: R2(rnd() * 1 + 0.5), d: R2(rnd() * 3) }));
  })();

  const WINDOW_LABEL = { Fajr: 'Fajr window', Sunrise: 'Morning (Duha)', Dhuhr: 'Dhuhr window', Asr: 'Asr window', Maghrib: 'Maghrib window', Isha: 'Isha & night' };
  const ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const LETTER = { Fajr: 'F', Sunrise: 'S', Dhuhr: 'D', Asr: 'A', Maghrib: 'M', Isha: 'I' };

  function SkyClock({ geo }) {
    const prayer = window.usePrayerTimes ? window.usePrayerTimes(geo) : { status: 'idle' };
    const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
    const [scrub, setScrub] = useState(null);
    useEffect(() => {
      const id = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 20000);
      return () => clearInterval(id);
    }, []);

    const W = 600, H = 170, SH = 260, AMP = 120, MAMP = 95;
    const px = (m) => R2((m / 1440) * W);

    const T = useMemo(() => {
      if (!prayer || prayer.status !== 'ready' || !prayer.timings) return null;
      const t = {};
      for (const k of ORDER) { const v = parseHM(prayer.timings[k]); if (v == null) return null; t[k] = v; }
      if (t.Isha < t.Maghrib) t.Isha += 1440;
      if (t.Isha > 1439) t.Isha = 1439;
      if (!(t.Fajr < t.Sunrise && t.Sunrise < t.Dhuhr && t.Dhuhr < t.Asr && t.Asr < t.Maghrib && t.Maghrib < t.Isha)) return null;
      return t;
    }, [prayer.status, prayer.timings]);

    const calc = useMemo(() => {
      if (!T) return null;
      const alt = makeAlt(T);
      const aMin = Math.min(-0.05, alt((T.Dhuhr + 720) % 1440));
      const sunY = (m) => R2(clamp(H - alt(m) * AMP, 6, SH));
      const moonY = (m) => R2(clamp(H - (alt(m) / aMin) * MAMP, 6, H));
      const seg = (yfn, pred) => {
        let d = '', pen = false;
        for (let m = 0; m <= 1440; m += 6) {
          if (pred(m)) { d += (pen ? 'L' : 'M') + px(m) + ' ' + yfn(m); pen = true; } else pen = false;
        }
        return d;
      };
      const nightLen = T.Fajr + 1440 - T.Maghrib;
      return {
        alt, aMin, sunY, moonY,
        sunPath: seg(sunY, (m) => alt(m) >= 0),
        moonPath: seg(moonY, (m) => alt(m) < 0),
        keys: skyKeys(T),
        lastThird: (T.Maghrib + (2 * nightLen) / 3) % 1440,
        dayLen: T.Maghrib - T.Sunrise,
        phase: moonPhaseLocal(new Date()),
      };
    }, [T]);

    if (geo.status !== 'ready' || prayer.status !== 'ready') {
      return html`<div class="qmx-card"><div class="center-msg" style=${{ padding: '34px 10px' }}>${geo.status === 'error' ? 'Allow location access to see the sky above you.' : html`<div class="spinner"></div>`}</div></div>`;
    }
    if (!T || !calc) {
      return html`<div class="qmx-card"><div class="center-msg">The sky clock needs a full set of prayer times — try again once they have loaded.</div></div>`;
    }

    const m = scrub == null ? nowMin : scrub;
    const a = calc.alt(m);
    const isDay = a >= -0.02;
    const [top, bottom] = skyAt(calc.keys, m);
    const bodyX = px(m);
    const bodyY = isDay ? calc.sunY(m) : calc.moonY(m);
    const starVis = clamp(-a * 5, 0, 1);
    let cur = 'Isha';
    for (const k of ORDER) if (m >= T[k]) cur = k;
    if (m < T.Fajr) cur = 'Isha';
    const isFriday = new Date().getDay() === 5;
    const label = (k) => (k === 'Dhuhr' && isFriday ? "Jumu'ah" : k);
    const nearHorizon = a < 0.25;

    return html`
      <div class="qmx-card">
        <div class="qmx-head">
          <div>
            <div class="eyebrow" style=${{ marginBottom: '6px' }}>Sky today</div>
            <h2>The day, drawn in light</h2>
          </div>
          ${scrub != null ? html`<button class="qmx-pillbtn on" onClick=${() => setScrub(null)}>Back to now</button>` : html`<span class="surah-meta">Drag the slider to scrub through the day</span>`}
        </div>

        <div class="qmx-sky-stage" style=${{ background: `linear-gradient(180deg, ${top}, ${bottom})` }}>
          <div class="qmx-sky-time"><b>${fmt12(m)}</b><span>${scrub != null ? 'Preview · ' : ''}${WINDOW_LABEL[cur].replace('Dhuhr window', isFriday ? "Jumu'ah window" : 'Dhuhr window')}</span></div>
          <svg class="qmx-sky-svg" viewBox=${`0 0 ${W} ${SH}`} role="img" aria-label="Sun and moon position across today, with the five prayer times marked">
            <defs>
              <radialGradient id="qmxSunGlow"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".95" /><stop offset="1" stop-color="#ffd9a0" stop-opacity="0" /></radialGradient>
              <radialGradient id="qmxMoonGlow"><stop offset="0" stop-color="#cfd8ff" stop-opacity=".55" /><stop offset="1" stop-color="#cfd8ff" stop-opacity="0" /></radialGradient>
            </defs>
            <g style=${{ opacity: starVis }}>
              ${STARS.map((s, i) => html`<circle key=${i} class="qmx-star" cx=${s.x} cy=${s.y} r=${s.r} fill="#f5f2ed" style=${{ animationDelay: s.d + 's' }} />`)}
            </g>
            <path d=${calc.moonPath} fill="none" stroke="rgba(207,216,255,.35)" stroke-width="1.4" stroke-dasharray="2 5" stroke-linecap="round" />
            <path d=${calc.sunPath} fill="none" stroke="rgba(255,226,170,.55)" stroke-width="1.6" stroke-linecap="round" />
            ${ORDER.map((k) => html`
              <g key=${k}>
                <line x1=${px(T[k])} x2=${px(T[k])} y1="30" y2=${H} stroke="rgba(245,242,237,.2)" stroke-dasharray="2 4" />
              </g>
            `)}
            ${isDay ? html`
              <g>
                <circle cx=${bodyX} cy=${bodyY} r="34" fill="url(#qmxSunGlow)" />
                <circle cx=${bodyX} cy=${bodyY} r="12" fill=${nearHorizon ? '#ff9a6b' : '#ffe3a8'} />
              </g>
            ` : html`
              <g>
                <circle cx=${bodyX} cy=${bodyY} r="30" fill="url(#qmxMoonGlow)" />
                <circle cx=${bodyX} cy=${bodyY} r="11" fill="#1b1d2b" stroke="rgba(245,242,237,.25)" />
                <path d=${moonLitPath(bodyX, bodyY, 11, calc.phase)} fill="#efe9dc" />
              </g>
            `}
            <rect x="0" y=${H} width=${W} height=${SH - H} fill="#0b0b0b" />
            <path d=${`M0 ${H}H${W}`} stroke="rgba(245,242,237,.3)" />
            <g fill="#050505" stroke="rgba(245,242,237,.18)" stroke-width="1">
              <path d=${`M268 ${H}a32 32 0 0 1 64 0Z`} />
              <rect x="236" y=${H - 54} width="9" height="54" />
              <path d=${`M236 ${H - 54}l4.5-12 4.5 12Z`} />
              <rect x="355" y=${H - 54} width="9" height="54" />
              <path d=${`M355 ${H - 54}l4.5-12 4.5 12Z`} />
              <rect x="150" y=${H - 14} width="70" height="14" />
              <rect x="382" y=${H - 18} width="86" height="18" />
              <rect x="40" y=${H - 10} width="64" height="10" />
              <rect x="500" y=${H - 12} width="70" height="12" />
            </g>
            ${ORDER.map((k) => html`
              <g key=${'l' + k}>
                <circle cx=${px(T[k])} cy=${H} r="4" fill=${k === cur ? 'var(--gold)' : '#f5f2ed'} />
                <text x=${px(T[k])} y=${H + 28} text-anchor="middle" font-size="14" font-weight="700" fill="#f5f2ed" opacity=".85">${LETTER[k]}</text>
              </g>
            `)}
            <circle cx=${px(calc.lastThird)} cy=${H + 48} r="4.5" fill="none" stroke="#f5f2ed" stroke-width="1.4" />
            <text x=${px(calc.lastThird)} y=${H + 68} text-anchor="middle" font-size="13" fill="#f5f2ed" opacity=".8">⅓</text>
            <line x1=${bodyX} x2=${bodyX} y1="8" y2=${SH - 6} stroke="rgba(245,242,237,.45)" stroke-width="1" stroke-dasharray="3 5" />
          </svg>
        </div>

        <div class="qmx-scrub">
          <input class="qmx-range" type="range" min="0" max="1439" step="1" value=${m} onInput=${(e) => setScrub(+e.target.value)} aria-label="Scrub through the day" />
        </div>

        <div class="qmx-chips">
          ${ORDER.map((k) => html`
            <div key=${k} class=${'qmx-chip' + (k === cur ? ' now' : '')}>
              <div class="n">${LETTER[k]} · ${label(k)}</div>
              <div class="t">${fmt12(T[k])}</div>
            </div>
          `)}
        </div>
        <div class="qmx-facts">
          <span>Daylight today: <b>${fmtDur(calc.dayLen)}</b></span>
          <span>Last third of the night begins: <b>${fmt12(calc.lastThird)}</b> ⅓</span>
        </div>
        <p class="qmx-note">Schematic view. The sun's curve is fitted to your real sunrise, Dhuhr and sunset, and the moon shows today's real phase. The last third of the night is counted from Maghrib to Fajr.</p>
      </div>
    `;
  }

  /* ===============================================================
     2. REVELATION MAP
     =============================================================== */
  const MAP = { W: 500, H: 420, lat0: 25.2, lon0: 36.0, k: 80 };
  const mx = (lon) => R2((lon - MAP.lon0) * MAP.k);
  const my = (lat) => R2((MAP.lat0 - lat) * MAP.k);
  const COAST = [[25.2, 37.2], [25.02, 37.27], [24.09, 38.06], [22.8, 39.03], [21.5, 39.17], [20.15, 40.27]];
  const COAST_D = COAST.map((p, i) => (i ? 'L' : 'M') + mx(p[1]) + ' ' + my(p[0])).join('');
  const LAND_D = COAST_D + `L${MAP.W} ${my(20.15)}L${MAP.W} 0Z`;
  const PLACES = {
    makkah: { x: mx(39.83), y: my(21.42) },
    madinah: { x: mx(39.61), y: my(24.47) },
    jeddah: { x: mx(39.17), y: my(21.54) },
    yanbu: { x: mx(38.06), y: my(24.09) },
    taif: { x: mx(40.41), y: my(21.27) },
  };
  const HIJRA_D = `M${PLACES.makkah.x} ${PLACES.makkah.y}C${PLACES.makkah.x - 10} ${PLACES.makkah.y + 38} 214 326 206 262S228 120 ${PLACES.madinah.x} ${PLACES.madinah.y}`;

  function RevelationMap({ surahs, onOpen, defaultOpen }) {
    const [open, setOpen] = useState(!!defaultOpen);
    const [sel, setSel] = useState('makkah');
    const list = surahs || [];
    const meccan = useMemo(() => list.filter((s) => /mecc/i.test(s.revelationType)), [list]);
    const medinan = useMemo(() => list.filter((s) => /medin/i.test(s.revelationType)), [list]);
    if (!list.length) return null;
    const shown = sel === 'makkah' ? meccan : medinan;
    const P = PLACES;
    const node = (id, name, sub, p, dx) => html`
      <g class="qmx-node" onClick=${() => { setSel(id); setOpen(true); }} role="button" aria-label=${name + ' — ' + sub}>
        <circle class="qmx-pulse" cx=${p.x} cy=${p.y} r="9" fill="none" stroke="var(--gold)" stroke-width="2" style=${{ display: sel === id ? 'block' : 'none' }} />
        <circle class="core" cx=${p.x} cy=${p.y} r=${sel === id ? 10 : 8} fill=${sel === id ? 'var(--gold)' : '#f5f2ed'} stroke="#0b0b0b" stroke-width="2" />
        <text x=${p.x + dx} y=${p.y - 2} font-size="17" font-weight="700" fill="#f5f2ed" text-anchor=${dx < 0 ? 'end' : 'start'}>${name}</text>
        <text x=${p.x + dx} y=${p.y + 15} font-size="12" fill="#a29c95" text-anchor=${dx < 0 ? 'end' : 'start'}>${sub}</text>
      </g>
    `;
    return html`
      <div class="qmx-card reveal" style=${{ marginBottom: '22px' }}>
        <div class="qmx-head">
          <div>
            <div class="eyebrow" style=${{ marginBottom: '6px' }}>Where it was revealed</div>
            <h3>Revelation map</h3>
          </div>
          <button class=${'qmx-pillbtn' + (open ? ' on' : '')} onClick=${() => setOpen(!open)}>${open ? 'Hide map' : 'Open the map'}</button>
        </div>
        ${!open ? html`<p class="surah-meta" style=${{ margin: 0 }}>${meccan.length} Makki surahs and ${medinan.length} Madani surahs — see them on the road between Makkah and Madinah.</p>` : html`
          <div>
          <svg class="qmx-map" viewBox=${`0 0 ${MAP.W} ${MAP.H}`} role="img" aria-label="Schematic map of the Hijaz showing Makkah, Madinah and the Hijra route">
            <path d=${LAND_D} fill="rgba(245,242,237,.045)" />
            <path d=${COAST_D} fill="none" stroke="rgba(245,242,237,.35)" stroke-width="1.6" />
            <text x="34" y="236" font-size="13" font-style="italic" fill="rgba(245,242,237,.3)">Red Sea</text>
            <path d=${HIJRA_D} fill="none" stroke="var(--gold)" stroke-width="2.2" stroke-dasharray="6 6" stroke-linecap="round" class="qmx-flow" />
            <text x="176" y="176" font-size="11" fill="var(--gold)" text-anchor="middle" transform="rotate(-72 176 176)">Hijra route (approx.)</text>
            ${[['Jeddah', P.jeddah, -10], ['Yanbu', P.yanbu, -10], ['Taif', P.taif, 10]].map(([n, p, dx]) => html`
              <g key=${n}><circle cx=${p.x} cy=${p.y} r="3" fill="rgba(245,242,237,.45)" /><text x=${p.x + dx} y=${p.y + 4} font-size="11" fill="rgba(245,242,237,.45)" text-anchor=${dx < 0 ? 'end' : 'start'}>${n}</text></g>
            `)}
            ${node('madinah', 'Madinah', `${medinan.length} Madani surahs · ~10 yrs`, P.madinah, 18)}
            ${node('makkah', 'Makkah', `${meccan.length} Makki surahs · ~13 yrs`, P.makkah, 18)}
          </svg>
          <div class="qmx-tabs">
            <button class=${'qmx-pillbtn' + (sel === 'makkah' ? ' on' : '')} onClick=${() => setSel('makkah')}>Makkah · ${meccan.length}</button>
            <button class=${'qmx-pillbtn' + (sel === 'madinah' ? ' on' : '')} onClick=${() => setSel('madinah')}>Madinah · ${medinan.length}</button>
          </div>
          <p class="surah-meta" style=${{ margin: '0 0 10px' }}>${sel === 'makkah'
            ? 'Before the Hijra: faith in One God, the Hereafter, the stories of earlier prophets.'
            : 'After the Hijra: building a community — law, family, society and the first state.'}</p>
          <div class="qmx-chiplist">
            ${shown.map((s) => html`<button key=${s.number} class="qmx-sbtn" onClick=${() => onOpen && onOpen(s)}><i>${s.number}</i>${s.englishName}</button>`)}
          </div>
          <p class="qmx-note">Schematic map. Surahs are grouped by the standard Makki / Madani split (revealed before / after the Hijra); a few surahs contain verses from both periods.</p>
          </div>
        `}
      </div>
    `;
  }

  /* ===============================================================
     3. SURAH MEDALLION — a roundel that draws itself as you read
     =============================================================== */
  function starPath(cx, cy, R, r, k) {
    let d = '';
    for (let i = 0; i < k * 2; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / k;
      const rad = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + R2(cx + rad * Math.cos(ang)) + ' ' + R2(cy + rad * Math.sin(ang));
    }
    return d + 'Z';
  }
  function hexPath(cx, cy, r) {
    let d = '';
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      d += (i ? 'L' : 'M') + R2(cx + r * Math.cos(a)) + ' ' + R2(cy + r * Math.sin(a));
    }
    return d + 'Z';
  }
  const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const CRESCENT = 'M40 12a20 20 0 1 0 0 40a16 16 0 1 1 0-40Z';
  const RAYS = 'M32 6V12M32 52V58M6 32H12M52 32H58M13.6 13.6l4.2 4.2M46.2 46.2l4.2 4.2M13.6 50.4l4.2-4.2M46.2 17.8l4.2-4.2';
  const DAWN = ['M14 42a18 18 0 0 1 36 0', 'M6 46H58', 'M32 12V18M14 20l4 4M50 20l-4 4M6 34h6M52 34h6'];

  /* Hand-drawn motifs for surahs with an unmistakable image. Everything
     else gets a star rosette whose point-count comes from its number. */
  const MOTIFS = {
    1: ['M8 18C18 12 26 12 32 18V52C26 47 18 47 8 52Z', 'M56 18C46 12 38 12 32 18V52C38 47 46 47 56 52Z'],
    2: ['M12 30H46C52 30 54 36 52 42V50H46V42H22V50H16V40C9 38 9 32 12 30Z', 'M46 30L54 24L58 30', 'M50 24L52 18M55 25L59 21'],
    12: [CRESCENT, starPath(47, 36, 6, 2.6, 5)],
    16: [hexPath(32, 22, 11), hexPath(22.5, 38.5, 11), hexPath(41.5, 38.5, 11)],
    17: ['M6 46Q32 2 58 46', 'M28 20a7 7 0 1 0 0 14a5.5 5.5 0 1 1 0-14Z'],
    18: ['M6 52L22 22L30 34L40 14L58 52Z', 'M27 52V44a5 5 0 0 1 10 0V52'],
    19: ['M32 56C30 42 35 30 32 18', 'M32 18C22 14 14 18 9 27', 'M32 18C42 14 50 18 55 27', 'M32 18C25 8 19 8 14 11', 'M32 18C39 8 45 8 50 11'],
    24: ['M32 10C22 22 22 33 32 40C42 33 42 22 32 10Z', 'M23 46H41M26 51H38', 'M32 3V6M13 14l3 3M51 14l-3 3'],
    29: ['M32 8V56M8 32H56M15 15L49 49M49 15L15 49', 'M32 20L40.5 23.5L44 32L40.5 40.5L32 44L23.5 40.5L20 32L23.5 23.5Z', 'M32 10L47.5 16.5L54 32L47.5 47.5L32 54L16.5 47.5L10 32L16.5 16.5Z'],
    36: ['M32 52C10 38 10 18 22 16C28 15 31 19 32 22C33 19 36 15 42 16C54 18 54 38 32 52Z'],
    53: [starPath(32, 32, 24, 10, 5)],
    54: [CRESCENT],
    55: [circ(32, 32, 11), RAYS],
    62: ['M12 52V36a20 20 0 0 1 40 0V52Z', 'M32 16V8M30 8h4', 'M6 52H58', 'M26 52V42a6 6 0 0 1 12 0V52'],
    67: ['M10 44L14 24L24 34L32 18L40 34L50 24L54 44Z', 'M10 50H54'],
    71: ['M8 36H56L48 48H16Z', 'M32 36V12', 'M32 14L48 32H32', 'M6 56q6-4 12 0t12 0t12 0t12 0'],
    86: [starPath(40, 24, 14, 5.5, 5), 'M30 34L8 56'],
    89: DAWN,
    91: [circ(32, 32, 11), RAYS],
    93: DAWN,
    96: ['M12 52L16 40L44 12L52 20L24 48Z', 'M40 16L48 24', 'M8 56H20'],
    97: [CRESCENT, starPath(48, 44, 5, 2.2, 5), starPath(16, 16, 4, 1.8, 5)],
    105: ['M10 40C10 26 24 20 36 22C50 22 54 32 52 44H46V52H40V44H26V52H20V44H10Z', 'M10 40C5 42 5 50 12 54', 'M36 28a6 6 0 0 1 0 12'],
    108: ['M6 24q6-5 12 0t12 0t12 0t12 0', 'M6 36q6-5 12 0t12 0t12 0t12 0', 'M6 48q6-5 12 0t12 0t12 0t12 0'],
    110: ['M14 54V28a18 18 0 0 1 36 0V54', 'M24 54V30a8 8 0 0 1 16 0V54', 'M32 4V9M12 12l3 3M52 12l-3 3'],
    112: [circ(32, 32, 22), circ(32, 32, 3)],
    113: DAWN,
    114: ['M32 8L52 16V32C52 44 44 52 32 56C20 52 12 44 12 32V16Z'],
  };
  function motifFor(n) {
    if (MOTIFS[n]) return MOTIFS[n];
    const k = 6 + (n % 7);
    return [starPath(32, 32, 26, 13, k), starPath(32, 32, 16, 8, k), circ(32, 32, 3)];
  }

  function SurahMedallion({ n, progress, size }) {
    const paths = motifFor(n);
    const p = clamp(progress || 0, 0, 1);
    const total = (1 - Math.pow(1 - p, 2)) * paths.length;
    const done = p >= 0.985;
    const fit = 'translate(32 32) scale(.74) translate(-32 -32)';
    return html`
      <svg class=${'qmx-medal' + (done ? ' is-done' : '')} width=${size || 56} height=${size || 56} viewBox="0 0 64 64" role="img" aria-label=${'Surah illustration, ' + Math.round(p * 100) + '% read'}>
        <circle cx="32" cy="32" r="30.5" class="qmx-medal-bg" />
        <circle cx="32" cy="32" r="30.5" fill="none" class="qmx-medal-ring-track" />
        <circle cx="32" cy="32" r="30.5" fill="none" class="qmx-medal-ring" pathLength="1" stroke-dasharray="1" stroke-dashoffset=${R2(1 - p)} transform="rotate(-90 32 32)" />
        <g class="qmx-medal-ghost" transform=${fit}>${paths.map((d, i) => html`<path key=${i} d=${d} />`)}</g>
        <g class="qmx-medal-live" transform=${fit}>
          ${paths.map((d, i) => {
            const pi = clamp(total - i, 0, 1);
            return html`<path key=${i} d=${d} pathLength="1" stroke-dasharray="1" stroke-dashoffset=${R2(1 - pi)} style=${{ opacity: pi > 0.01 ? 1 : 0 }} />`;
          })}
        </g>
      </svg>
    `;
  }

  /* ===============================================================
     4. WORD GLOW + CALLIGRAPHY WAVE
     =============================================================== */
  /* Splits a verse into words and lights them up in step with the
     audio element that is currently playing it. Timing is weighted by
     word length, since recitation gives longer words longer airtime. */
  function WordGlow({ text, audioRef, active }) {
    const words = useMemo(() => String(text || '').split(/\s+/).filter(Boolean), [text]);
    const [idx, setIdx] = useState(-1);
    useEffect(() => {
      if (!active) { setIdx(-1); return undefined; }
      const weights = words.map((w) => Math.max(2, normAr(w).length));
      const total = weights.reduce((x, y) => x + y, 0) || 1;
      let raf = 0;
      const tick = () => {
        const au = audioRef && audioRef.current;
        if (au && au.duration && isFinite(au.duration)) {
          const f = Math.min(0.999, au.currentTime / au.duration);
          let acc = 0, i = 0;
          for (; i < weights.length; i++) { acc += weights[i] / total; if (f < acc) break; }
          setIdx(Math.min(i, words.length - 1));
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
      return () => cancelAnimationFrame(raf);
    }, [active, words]);
    return words.map((w, i) => html`<span key=${i} class=${'wg' + (i < idx ? ' wg-done' : i === idx ? ' wg-on' : '')}>${w} </span>`);
  }

  /* A pen-stroke ribbon: thick-and-thin like a reed pen, calm when
     nothing plays and swelling while a recitation does. */
  function CalligraphyWave({ active }) {
    const ref = useRef(null);
    const S = useRef({ amp: 0, t: 0, raf: 0, on: false });
    S.current.on = !!active;
    useEffect(() => {
      const cv = ref.current;
      if (!cv) return undefined;
      const ctx = cv.getContext('2d');
      if (!ctx) return undefined;
      const s = S.current;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let W = 0, H = 0;
      function size() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = cv.clientWidth; H = cv.clientHeight;
        cv.width = W * dpr; cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      function draw() {
        ctx.clearRect(0, 0, W, H);
        const mid = H / 2;
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'rgba(var(--gold-rgb),0)');
        g.addColorStop(0.25, 'rgba(var(--gold-rgb),.85)');
        g.addColorStop(0.6, 'rgba(245,242,237,.9)');
        g.addColorStop(1, 'rgba(245,242,237,0)');
        ctx.fillStyle = g;
        const top = [], bot = [];
        for (let x = 0; x <= W; x += 3) {
          const u = x / W;
          const env = Math.pow(Math.sin(Math.PI * u), 0.8);
          const wob = Math.sin(x * 0.022 + s.t) + 0.55 * Math.sin(x * 0.051 - s.t * 1.35) + 0.3 * Math.sin(x * 0.11 + s.t * 2.1);
          const y = mid + wob * (H * 0.28) * (0.12 + 0.88 * s.amp) * env;
          const th = (1.1 + (2.6 + 3 * s.amp) * Math.abs(Math.cos(x * 0.022 + s.t + 0.6))) * (0.35 + 0.65 * env);
          top.push([x, y - th / 2]); bot.push([x, y + th / 2]);
        }
        ctx.beginPath();
        top.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
        for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
        ctx.closePath();
        ctx.fill();
      }
      function frame() {
        s.t += 0.035;
        s.amp += ((s.on ? 1 : 0) - s.amp) * 0.07;
        draw();
        s.raf = (s.on || s.amp > 0.012) ? requestAnimationFrame(frame) : 0;
      }
      const onResize = () => { size(); draw(); };
      size();
      window.addEventListener('resize', onResize);
      if (reduce) { s.amp = s.on ? 0.6 : 0; draw(); } else { s.raf = requestAnimationFrame(frame); }
      return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(s.raf); s.raf = 0; };
    }, [active]);
    return html`<canvas ref=${ref} class="qmx-wave" aria-hidden="true"></canvas>`;
  }

  /* ===============================================================
     5. RECITE & CHECK
     =============================================================== */
  function ReciteCheck({ ayah, surahName, onClose, onHear }) {
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    const words = useMemo(() => String(ayah.text || '').split(/\s+/).filter(Boolean), [ayah.text]);
    const target = useMemo(() => words.map(normAr), [words]);
    const [listening, setListening] = useState(false);
    const [heard, setHeard] = useState('');
    const [err, setErr] = useState('');
    const [finished, setFinished] = useState(false);
    const recRef = useRef(null);

    const status = useMemo(
      () => alignWords(target, normAr(heard).split(' ').filter(Boolean), finished),
      [target, heard, finished]
    );
    const okCount = status.filter((s) => s === 'ok').length;

    function start() {
      if (!SR) return;
      setErr(''); setHeard(''); setFinished(false);
      const rec = new SR();
      rec.lang = 'ar-SA';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let t = '';
        for (let i = 0; i < e.results.length; i++) t += ' ' + e.results[i][0].transcript;
        setHeard(t.trim());
      };
      rec.onerror = (e) => {
        const c = e && e.error;
        setErr(
          c === 'not-allowed' || c === 'service-not-allowed' ? 'Microphone permission is blocked. Allow it in your browser settings, then try again.'
          : c === 'no-speech' ? "I didn't hear anything — try again a little closer to the microphone."
          : c === 'network' ? 'Speech recognition needs an internet connection.'
          : c === 'aborted' ? ''
          : 'Speech recognition stopped (' + c + ').'
        );
      };
      rec.onend = () => { setListening(false); setFinished(true); };
      recRef.current = rec;
      try { rec.start(); setListening(true); } catch (e) { setErr('Could not start the microphone.'); }
    }
    function stop() { try { recRef.current && recRef.current.stop(); } catch (e) { /* already stopped */ } }

    useEffect(() => () => {
      try { if (recRef.current) { recRef.current.onend = null; recRef.current.abort(); } } catch (e) { /* ignore */ }
    }, []);
    useEffect(() => {
      if (listening && target.length && status.every((s) => s === 'ok')) stop();
    }, [status, listening]);

    const pct = target.length ? Math.round((okCount / target.length) * 100) : 0;
    const verdict = pct === 100 ? 'Every word matched — mashaAllah.' : pct >= 70 ? 'Nearly there — the red words need another go.' : 'Keep practising — listen once more, then try again.';

    return html`
      <div class="qmx-modal" onClick=${(e) => e.target === e.currentTarget && onClose()}>
        <div class="qmx-sheet" role="dialog" aria-label="Recite and check">
          <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3>Recite & Check</h3>
              <div class="surah-meta">${surahName} · ayah ${ayah.numberInSurah}</div>
            </div>
            <button class="icon-btn" onClick=${onClose} aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19" /></svg></button>
          </div>

          <div class="qmx-rc-words">${words.map((w, i) => html`<span key=${i} class=${status[i] === 'ok' ? 'ok' : status[i] === 'miss' ? 'miss' : ''}>${w}</span>`)}</div>

          ${!SR ? html`
            <div class="qmx-err">This browser has no speech recognition. Recite & Check works best in Chrome or Edge (Android or desktop); Safari support is limited.</div>
          ` : html`
            <button class=${'qmx-mic' + (listening ? ' on' : '')} onClick=${listening ? stop : start} aria-label=${listening ? 'Stop listening' : 'Start reciting'}>
              ${listening
                ? html`<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>`
                : html`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0M12 18v3M9 21h6" /></svg>`}
            </button>
            <div class="surah-meta" style=${{ textAlign: 'center' }}>${listening ? 'Listening… recite the ayah, then tap to stop' : finished && heard ? '' : 'Tap the microphone and recite this ayah'}</div>
            <div class="qmx-heard">${heard}</div>
          `}

          ${err ? html`<div class="qmx-err">${err}</div>` : null}
          ${finished && heard && !listening ? html`<div class="qmx-score"><b>${pct}%</b>${verdict}</div>` : null}

          <div class="qmx-row">
            <button class="qmx-pillbtn" onClick=${() => { stop(); onHear && onHear(); }}>Hear it recited</button>
            ${finished && heard && !listening ? html`<button class="qmx-pillbtn on" onClick=${start}>Try again</button>` : null}
          </div>
          <p class="qmx-note" style=${{ textAlign: 'center' }}>A practice aid, not a replacement for a teacher. Your browser handles the speech recognition (Chrome sends audio to its speech service); MAAR itself never records or stores your voice.</p>
        </div>
      </div>
    `;
  }

  window.QMX = {
    SkyClock, RevelationMap, SurahMedallion, WordGlow, CalligraphyWave, ReciteCheck,
    _test: { normAr, alignWords, moonLitPath, makeAlt, skyKeys, skyAt, motifFor, MOTIFS },
  };
})();
