/* ============================================================
   QURAN MAAR — adhan.js
   Plays the adhan at each prayer time (while the app or site is
   open) and lets people turn it off, per prayer or completely.

   - Times come from the app's own prayer times (qm_prayer:last /
     window.QM_PRAYER, published by app.js).
   - Settings card is added to the Settings page via
     QMCustomise.addSection (see customise.js).
   - Sound: adhan/Adan1.mp3 at Fajr, adhan/Adan2.mp3 at the other four
     prayers (the site owner uploads these).
   - Honest limit: a web page cannot wake a phone while closed.
     Inside a native wrapper with Capacitor LocalNotifications the
     same schedule is handed to the phone's alarm system (see
     ANDROID-ADHAN.md). That bridge is untested.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'qm_adhan', FIRED = 'qm_adhan_fired';
  var PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  /* Fajr has its own recording; the other four prayers share a second one.
     Both files are uploaded by the site owner into the adhan/ folder. */
  var SRC_FAJR = 'adhan/Adan1.mp3', SRC_OTHER = 'adhan/Adan2.mp3';
  function srcFor(label) { return label === 'Fajr' ? SRC_FAJR : SRC_OTHER; }
  function altFor(label) { return label === 'Fajr' ? SRC_OTHER : SRC_FAJR; }   /* only used if the first file will not load */
  var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  var WINDOW_MS = 90 * 1000;     /* still play if the page wakes up this soon after the time */

  /* ---------- settings ---------- */
  var S = load();
  function load() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
    var r = { on: !!o.on, prayers: {}, volume: typeof o.volume === 'number' ? Math.max(5, Math.min(100, o.volume)) : 85, notify: o.notify !== false };
    PRAYERS.forEach(function (p) { r.prayers[p] = !(o.prayers && o.prayers[p] === false); });
    return r;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- prayer times ---------- */
  function readTimes() {
    var t = window.QM_PRAYER, base = new Date(); base.setHours(0, 0, 0, 0);
    if (!t) {
      try {
        var c = JSON.parse(localStorage.getItem('qm_prayer:last') || 'null');
        if (c && c.timings) { t = c.timings; var d = new Date(c.day); if (!isNaN(d)) { d.setHours(0, 0, 0, 0); base = d; } }
      } catch (e) {}
    }
    if (!t || !PRAYERS.every(function (k) { return /^\d{1,2}:\d{2}/.test(String(t[k] || '')); })) return null;
    return { t: t, base: base };
  }
  function ymd(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function events(now) {
    var src = readTimes(); if (!src) return [];
    var out = [];
    for (var k = 0; k <= 8; k++) {
      PRAYERS.forEach(function (n) {
        var p = String(src.t[n]).split(':'), d = new Date(src.base);
        d.setDate(d.getDate() + k); d.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0);
        out.push({ name: n, at: d.getTime(), key: ymd(d) + '-' + n });
      });
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out.filter(function (e) { return e.at > now - WINDOW_MS; });
  }
  function nextEvent(now) {
    var ev = events(now);
    for (var i = 0; i < ev.length; i++) if (ev[i].at > now && S.prayers[ev[i].name]) return ev[i];
    return null;
  }
  function wasFired(key) { try { return (localStorage.getItem(FIRED) || '').split('|').indexOf(key) > -1; } catch (e) { return false; } }
  function markFired(key) {
    try { var a = (localStorage.getItem(FIRED) || '').split('|').filter(Boolean); a.push(key); localStorage.setItem(FIRED, a.slice(-12).join('|')); } catch (e) {}
  }

  /* ---------- audio ---------- */
  var audio = null, unlocked = false, pill = null, banner = null;
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(); audio.preload = 'none';
    audio.addEventListener('ended', function () { setPlaying(false); });
    audio.addEventListener('error', function () { fallback(); });
    return audio;
  }
  /* The chosen file is missing or unreadable: try the other file once. */
  function fallback() {
    var a = audio;
    if (!a || !a._active) { setPlaying(false); return; }
    var alt = altFor(a._label);
    if (a._fb || a.getAttribute('data-src') === alt) { setPlaying(false); return; }
    a._fb = true; a.src = alt; a.setAttribute('data-src', alt); a.volume = S.volume / 100;
    var p = a.play();
    if (p && p.then) p.then(function () { setPlaying(true, a._label); }, function (e) { if (e && e.name === 'NotAllowedError') showBlocked(a._label); else setPlaying(false); });
  }
  /* Browsers only allow sound after a tap. One quiet play() inside the first
     tap/keypress "unlocks" the element so later timed playback is allowed. */
  function unlock() {
    if (unlocked) return; unlocked = true;
    try {
      var a = ensureAudio(); a.muted = true; a.src = SILENT;
      var p = a.play();
      var done = function () { try { a.pause(); } catch (e) {} a.muted = false; a.removeAttribute('data-src'); };
      if (p && p.then) p.then(done, done); else done();
    } catch (e) {}
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, unlock, { once: true, passive: true, capture: true }); });

  function resolveSrc(label) { return Promise.resolve(srcFor(label)); }
  function play(label) {
    var a = ensureAudio();
    return resolveSrc(label).then(function (src) {
      a._active = true; a._fb = false; a._label = label;
      if (a.getAttribute('data-src') !== src) { a.src = src; a.setAttribute('data-src', src); }
      a.muted = false; a.volume = S.volume / 100;
      try { a.currentTime = 0; } catch (e) {}
      var p = a.play();
      if (p && p.then) return p.then(function () { setPlaying(true, label); }, function (e) {
        if (e && e.name === 'NotAllowedError') showBlocked(label); else fallback();
      });
      setPlaying(true, label);
    });
  }
  function stop() { if (audio) { try { audio.pause(); audio.currentTime = 0; } catch (e) {} } setPlaying(false); }

  function setPlaying(on, label) {
    hideBlocked();
    if (!on) { if (audio) audio._active = false; if (pill && pill.parentNode) pill.parentNode.removeChild(pill); pill = null; refreshCard(); return; }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'Adhan \u2014 ' + label, artist: 'Quran Maar', artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
        navigator.mediaSession.setActionHandler('stop', stop); navigator.mediaSession.setActionHandler('pause', stop);
      } catch (e) {}
    }
    if (!pill) {
      css();
      pill = document.createElement('div'); pill.className = 'qm-ad-pill'; pill.setAttribute('role', 'status');
      pill.innerHTML = '<span class="qm-ad-dot"></span><span class="qm-ad-txt"></span><button type="button" aria-label="Stop the adhan">Stop</button>';
      pill.querySelector('button').addEventListener('click', stop);
      document.body.appendChild(pill);
    }
    pill.querySelector('.qm-ad-txt').textContent = 'Adhan \u00b7 ' + label;
    refreshCard();
  }
  function showBlocked(label) {
    css(); hideBlocked();
    banner = document.createElement('div'); banner.className = 'qm-ad-pill qm-ad-blocked'; banner.setAttribute('role', 'alert');
    banner.innerHTML = '<span class="qm-ad-txt">It\u2019s time for ' + label + '</span><button type="button">Play adhan</button>';
    banner.querySelector('button').addEventListener('click', function () { hideBlocked(); play(label); });
    document.body.appendChild(banner);
  }
  function hideBlocked() { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null; }

  /* ---------- notification ---------- */
  function supported() { return 'Notification' in window; }
  function perm() { return supported() ? Notification.permission : 'unsupported'; }
  function showNote(title, opts) {
    var viaSW;
    try {
      viaSW = (navigator.serviceWorker && navigator.serviceWorker.ready)
        ? Promise.race([navigator.serviceWorker.ready, new Promise(function (_, rej) { setTimeout(rej, 1500); })])
        : Promise.reject();
    } catch (e) { viaSW = Promise.reject(); }
    viaSW.then(function (r) { return r.showNotification(title, opts); })
      .catch(function () { try { new Notification(title, opts); } catch (e) {} });
  }
  function notify(name) {
    if (!S.notify || perm() !== 'granted') return;
    showNote(name + ' \u2014 time to pray', { body: 'It\u2019s time for ' + name + ' prayer.', icon: 'icon-192.png', badge: 'favicon-48.png', tag: 'qm-adhan-' + name, vibrate: [300, 120, 300] });
  }
  function welcome() {
    if (perm() !== 'granted') return;
    showNote('Prayer reminders are on', { body: 'You\u2019ll be notified at each prayer time while Quran Maar is open.', icon: 'icon-192.png', badge: 'favicon-48.png', tag: 'qm-adhan-welcome' });
  }
  function requestPerm() {
    return new Promise(function (res) {
      try {
        var r = Notification.requestPermission(function (p) { res(p); });   /* older Safari uses a callback */
        if (r && r.then) r.then(res, function () { res('denied'); });
      } catch (e) { res('denied'); }
    });
  }
  /* One tap: ask the phone for permission and, if allowed, switch everything on. */
  function enableAll(done) {
    unlock();
    if (!supported()) { S.on = true; S.notify = false; save(); start(); refreshCard(); if (done) done('unsupported'); return; }
    requestPerm().then(function (p) {
      if (p === 'granted') { S.on = true; S.notify = true; save(); start(); welcome(); }
      refreshCard();
      if (done) done(p);
    });
  }
  function soundOnly(done) { unlock(); S.on = true; S.notify = false; save(); start(); refreshCard(); if (done) done('sound'); }
  try {
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'notifications' }).then(function (st) { st.onchange = function () { refreshCard(); }; }, function () {});
  } catch (e) {}

  /* ---------- scheduler ---------- */
  var timer = 0, tickIv = 0;
  function fire(e) { play(e.name); notify(e.name); }
  function tick() {
    clearTimeout(timer);
    if (!S.on) return;
    var now = Date.now(), ev = events(now), i;
    for (i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.at <= now && now - e.at <= WINDOW_MS && S.prayers[e.name] && !wasFired(e.key)) { markFired(e.key); fire(e); break; }
    }
    var nx = nextEvent(now);
    if (nx) timer = setTimeout(tick, Math.min(Math.max(nx.at - now + 300, 500), 2147000000));
    refreshCard(); syncNative();
  }
  /* Fetching once while online lets the service worker keep a copy for offline. */
  function warm() {
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
    [SRC_FAJR, SRC_OTHER].forEach(function (u) { try { fetch(u).catch(function () {}); } catch (e) {} });
  }
  function start() {
    warm();
    clearInterval(tickIv);
    tickIv = setInterval(tick, 15000);
    tick();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  window.addEventListener('focus', tick);
  window.addEventListener('online', tick);
  window.addEventListener('qm-prayer', tick);

  /* ---------- optional native bridge (Capacitor LocalNotifications) ---------- */
  var nativeBusy = false;
  function nativeLN() {
    var C = window.Capacitor;
    try { return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications) || null; } catch (e) { return null; }
  }
  function syncNative() {
    var LN = nativeLN(); if (!LN || nativeBusy) return;
    nativeBusy = true;
    var now = Date.now(), list = [], id = 7000;
    events(now).forEach(function (e) {
      if (e.at > now && S.on && S.prayers[e.name] && list.length < 40) {
        list.push({ id: id + list.length, title: e.name + ' \u2014 time to pray', body: 'It\u2019s time for ' + e.name + ' prayer.', schedule: { at: new Date(e.at), allowWhileIdle: true }, sound: e.name === 'Fajr' ? 'adan1.mp3' : 'adan2.mp3', channelId: e.name === 'Fajr' ? 'adhan_fajr' : 'adhan' });
      }
    });
    var cancelAll = LN.getPending ? LN.getPending().then(function (r) {
      var mine = (r.notifications || []).filter(function (n) { return n.id >= 7000 && n.id < 7100; });
      return mine.length ? LN.cancel({ notifications: mine.map(function (n) { return { id: n.id }; }) }) : null;
    }) : Promise.resolve();
    cancelAll.then(function () {
      if (!list.length) return null;
      return Promise.resolve(LN.requestPermissions ? LN.requestPermissions() : null)
        .then(function () { return LN.createChannel ? LN.createChannel({ id: 'adhan_fajr', name: 'Adhan (Fajr)', description: 'Call to prayer at Fajr', importance: 5, sound: 'adan1.mp3', vibration: true, visibility: 1 }) : null; })
        .then(function () { return LN.createChannel ? LN.createChannel({ id: 'adhan', name: 'Adhan', description: 'Call to prayer', importance: 5, sound: 'adan2.mp3', vibration: true, visibility: 1 }) : null; })
        .then(function () { return LN.schedule({ notifications: list }); });
    }).catch(function () {}).then(function () { nativeBusy = false; });
  }

  /* ============================================================
     Settings card
     ============================================================ */
  var cardEl = null;
  function css() {
    if (document.getElementById('qm-adhan-css')) return;
    var st = document.createElement('style'); st.id = 'qm-adhan-css';
    st.textContent = [
      '.qm-ad-pill{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--tab-h,64px) + env(safe-area-inset-bottom,0px) + 14px);z-index:9000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:10px 10px 10px 16px;border-radius:999px;background:rgba(var(--bg-rgb,11,11,11),.94);border:1px solid var(--gold);color:var(--ink);font-size:14px;font-weight:600;backdrop-filter:blur(14px);box-shadow:0 14px 40px rgba(0,0,0,.55),0 0 24px -4px rgba(var(--gold-rgb,207,51,66),.45);}',
      '@media(min-width:820px){.qm-ad-pill{bottom:26px;}}',
      '.qm-ad-pill button{border:none;border-radius:999px;padding:10px 18px;font-weight:700;font-size:13.5px;cursor:pointer;color:#f5f2ed;background:linear-gradient(135deg,var(--gold),rgba(var(--accent-rgb,179,32,47),1));}',
      '.qm-ad-dot{width:9px;height:9px;border-radius:50%;background:var(--gold);animation:qmAdPulse 1.6s infinite;flex:none;}',
      '@keyframes qmAdPulse{70%{box-shadow:0 0 0 10px rgba(var(--gold-rgb,207,51,66),0);}}',
      '.qm-ad-chips{display:flex;flex-wrap:wrap;gap:8px;padding:2px 0 4px;}',
      '.qm-ad-chips button{padding:11px 16px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--muted);font-weight:700;font-size:13.5px;cursor:pointer;transition:transform .15s,background .2s,color .2s;}',
      '.qm-ad-chips button:active{transform:scale(.95);}',
      '.qm-ad-chips button[aria-pressed="true"]{background:linear-gradient(135deg,var(--gold),rgba(var(--accent-rgb,179,32,47),1));border-color:transparent;color:#f5f2ed;}',
      '.qm-ad-btns{display:flex;flex-wrap:wrap;gap:10px;}',
      '.qm-ad-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 16px;border-radius:16px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;transition:transform .15s,border-color .2s;}',
      '.qm-ad-btn:active{transform:scale(.97);}.qm-ad-btn:hover{border-color:var(--gold);}',
      '.qm-ad-btn.primary{border:none;color:#f5f2ed;background:linear-gradient(135deg,var(--gold),rgba(var(--accent-rgb,179,32,47),1));box-shadow:0 10px 24px -12px rgba(var(--gold-rgb,207,51,66),.8);}',
      '.qm-ad-next{margin:4px 0 2px;padding:13px 14px;border-radius:16px;border:1px solid var(--gold-dim,rgba(207,51,66,.4));background:rgba(var(--accent-rgb,179,32,47),.10);font-size:14px;line-height:1.5;}',
      '.qm-ad-next b{color:var(--gold);}',
      '.qm-ad-note{margin:8px 2px 4px;font-size:12.5px;color:var(--muted);line-height:1.55;}',
      '.qm-ad-permt{font-size:16px;font-weight:700;margin-bottom:2px;}',
      '.qm-ad-ask{position:fixed;left:12px;right:12px;margin:0 auto;max-width:460px;bottom:calc(var(--tab-h,64px) + env(safe-area-inset-bottom,0px) + 12px);z-index:9000;padding:18px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02)),var(--bg-soft,#121010);border:1px solid var(--gold);color:var(--ink);box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 30px -6px rgba(var(--gold-rgb,207,51,66),.4);animation:qmAskIn .45s cubic-bezier(.22,.9,.3,1);}',
      '@keyframes qmAskIn{from{opacity:0;transform:translateY(24px);}}',
      '@media(min-width:820px){.qm-ad-ask{left:auto;right:24px;bottom:24px;margin:0;}}',
      '.qm-ad-ask b{display:block;font-size:16.5px;margin-bottom:4px;}',
      '.qm-ad-ask p{margin:0 0 14px;font-size:13.5px;line-height:1.5;color:var(--muted);}',
      '.qm-ad-ask .qm-ad-btns{flex-wrap:nowrap;}.qm-ad-ask .qm-ad-btn{flex:1;justify-content:center;}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function fmtIn(ms) {
    var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
    return h ? h + 'h ' + (m % 60) + 'm' : m + ' min';
  }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  function refreshCard() {
    if (askEl && !askEl._busy && (S.on || perm() !== 'default')) closeAsk();
    if (!cardEl || !document.body.contains(cardEl)) return;
    var q = function (s) { return cardEl.querySelector(s); };
    var master = q('[data-ad="on"]'); if (master) master.setAttribute('aria-checked', String(S.on));
    var notif = q('[data-ad="notify"]'); if (notif) notif.setAttribute('aria-checked', String(S.notify));
    Array.prototype.forEach.call(cardEl.querySelectorAll('[data-prayer]'), function (b) { b.setAttribute('aria-pressed', String(!!S.prayers[b.getAttribute('data-prayer')])); });
    var vol = q('[data-ad="vol"]'); if (vol) { vol.value = S.volume; vol.style.setProperty('--p', ((S.volume - vol.min) / (vol.max - vol.min) * 100) + '%'); }
    var vo = q('[data-ad="volout"]'); if (vo) vo.textContent = S.volume + '%';
    var nx = q('[data-ad="next"]');
    if (nx) {
      var now = Date.now();
      if (!S.on) nx.innerHTML = 'The adhan is <b>off</b>. Turn it on above and it will sound at each prayer you leave selected.';
      else if (!readTimes()) nx.innerHTML = 'Waiting for your prayer times. Open <b>Home</b> once so they can load for your location.';
      else {
        var n = nextEvent(now);
        nx.innerHTML = n ? 'Next adhan: <b>' + n.name + '</b> at <b>' + hhmm(n.at) + '</b> \u00b7 in ' + fmtIn(n.at - now) : 'No prayers are selected below.';
      }
    }
    var pb = q('[data-ad="perm"]');
    if (pb) {
      var pm = perm(), t = q('[data-ad="permtitle"]'), m = q('[data-ad="permmsg"]'), al = q('[data-ad="allow"]'), so = q('[data-ad="soundonly"]'), rc = q('[data-ad="recheck"]');
      var title = '', msg = '', showAllow = true, allowText = 'Allow notifications & turn on', showSo = false, showRc = false;
      if (pm === 'unsupported') {
        title = 'Notifications aren\u2019t available here';
        msg = 'On iPhone, add Quran Maar to your Home Screen first (Share, then Add to Home Screen) and open it from there. The adhan can still sound while the app is open.';
        allowText = S.on ? '' : 'Turn on the adhan (sound only)'; showAllow = !S.on;
      } else if (pm === 'granted') {
        if (S.on && S.notify) { title = '\u2713 Notifications are on'; msg = 'You\u2019ll get a notification and the adhan at each prayer you leave selected below.'; showAllow = false; }
        else { title = 'Notifications are allowed'; msg = 'Turn on the adhan to start your prayer reminders.'; allowText = 'Turn on prayer reminders'; }
      } else if (pm === 'denied') {
        title = 'Notifications are blocked';
        msg = 'Allow them for this site in your browser or phone settings (tap the lock icon next to the address bar, then Notifications, then Allow). Then tap the button below.';
        showAllow = false; showRc = true; showSo = !S.on;
      } else {
        title = 'Get a reminder at every prayer time';
        msg = 'Tap the button, then choose Allow when your phone asks. After that the adhan is on.';
      }
      if (t) t.textContent = title; if (m) m.textContent = msg;
      if (al) { al.hidden = !showAllow; var sp = al.querySelector('span'); if (sp) sp.textContent = allowText; }
      if (so) so.hidden = !showSo; if (rc) rc.hidden = !showRc;
    }
    var warn = q('[data-ad="warn"]');
    if (warn) {
      var permState = perm();
      warn.textContent = (S.notify && permState === 'denied') ? 'Notifications are blocked for this site in your browser settings, so only the sound will play.' : '';
      warn.hidden = !warn.textContent;
    }
  }

  function buildCard(api) {
    css(); closeAsk();
    var h = api.h;
    function row(icon, label, hint, control, click) {
      return h('div', { class: 'qm-row', onclick: click || null }, [
        h('span', { class: 'qm-ic', html: api.icn(icon) }),
        h('div', { class: 'qm-txt' }, [label, hint ? h('small', { text: hint }) : null]), control]);
    }
    function sw(dataAd, label) { return h('button', { type: 'button', class: 'qm-tg', role: 'switch', 'data-ad': dataAd, 'aria-label': label, 'aria-checked': 'false' }); }

    /* master switch */
    var master = row('bell', 'Play the adhan at prayer time', 'Turn it off any time.', sw('on', 'Play the adhan at prayer time'), function () {
      if (S.on) { S.on = false; save(); clearTimeout(timer); clearInterval(tickIv); stop(); syncNative(); api.toast('Adhan is off'); refreshCard(); return; }
      if (supported() && perm() === 'default' && S.notify) { enableAll(function (p) { api.toast(p === 'granted' ? 'Notifications are on' : 'Notifications were not allowed'); }); return; }
      S.on = true; save(); unlock(); start(); api.toast('Adhan is on'); refreshCard();
    });

    var permBox = h('div', { class: 'qm-block', 'data-ad': 'perm' }, [
      h('div', { class: 'qm-ad-permt', 'data-ad': 'permtitle' }),
      h('p', { class: 'qm-ad-note', 'data-ad': 'permmsg' }),
      h('div', { class: 'qm-ad-btns' }, [
        h('button', { type: 'button', class: 'qm-ad-btn primary', 'data-ad': 'allow', html: api.icn('bell', 18) + '<span></span>', onclick: function () {
          enableAll(function (p) { api.toast(p === 'granted' ? 'Notifications are on' : p === 'denied' ? 'Notifications were not allowed' : 'Adhan is on'); }); } }),
        h('button', { type: 'button', class: 'qm-ad-btn', 'data-ad': 'soundonly', hidden: '', text: 'Turn on without notifications', onclick: function () { soundOnly(function () { api.toast('Adhan is on'); }); } }),
        h('button', { type: 'button', class: 'qm-ad-btn', 'data-ad': 'recheck', hidden: '', text: 'I\u2019ve allowed it \u2014 check again', onclick: function () {
          if (perm() === 'granted') enableAll(function () { api.toast('Notifications are on'); }); else { refreshCard(); api.toast('Still blocked'); } } })
      ])]);

    var next = h('div', { class: 'qm-block' }, [h('div', { class: 'qm-ad-next', 'data-ad': 'next' })]);

    /* per-prayer chips */
    var chips = h('div', { class: 'qm-ad-chips', role: 'group', 'aria-label': 'Which prayers play the adhan' });
    PRAYERS.forEach(function (p) {
      chips.appendChild(h('button', { type: 'button', 'data-prayer': p, 'aria-pressed': 'true', text: p, onclick: function () { S.prayers[p] = !S.prayers[p]; save(); tick(); refreshCard(); } }));
    });
    var which = h('div', { class: 'qm-block' }, [h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-ic', html: api.icn('sun') }), h('span', { class: 'qm-t', text: 'Prayers' })]), chips]);

    /* volume */
    var out = h('span', { class: 'qm-val', 'data-ad': 'volout' });
    var vol = h('input', { type: 'range', class: 'qm-range', min: 5, max: 100, step: 5, 'data-ad': 'vol', 'aria-label': 'Adhan volume',
      oninput: function (e) { S.volume = +e.target.value; save(); if (audio) audio.volume = S.volume / 100; refreshCard(); } });
    var volume = h('div', { class: 'qm-block' }, [h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-ic', html: api.icn('volume') }), h('span', { class: 'qm-t', text: 'Volume' }), out]), vol]);

    /* notification */
    var notifRow = row('bell', 'Show a notification', 'A pop-up at prayer time, along with the sound.', sw('notify', 'Show a notification'), function () {
      S.notify = !S.notify; save();
      if (S.notify && supported() && perm() === 'default') requestPerm().then(refreshCard);
      refreshCard();
    });
    var warn = h('p', { class: 'qm-ad-note', 'data-ad': 'warn', hidden: '' });

    var note = h('div', { class: 'qm-block' }, [h('p', { class: 'qm-ad-note', style: 'margin:0;', text: 'Phones pause websites in the background, so the adhan sounds while Quran Maar is open (screen on). Keep the app open, or leave it on the lock screen with the phone charging.' })]);

    cardEl = api.card('bell', 'Adhan', 'The call to prayer at each prayer time.', 'qm-s-adhan', [permBox, master, next, which, volume, notifRow, warn, note]);
    setTimeout(refreshCard, 0);   /* the card is not in the page yet at this moment */
    var iv = setInterval(function () { if (!document.body.contains(cardEl)) { clearInterval(iv); return; } refreshCard(); }, 30000);
    return cardEl;
  }

  /* ---------- one-time friendly prompt ---------- */
  var ASK = 'qm_adhan_ask', askEl = null;
  function canAsk() {
    if (!supported() || S.on || perm() !== 'default') return false;
    try { if (Date.now() - (+localStorage.getItem(ASK) || 0) < 14 * 864e5) return false; } catch (e) {}
    return true;
  }
  function closeAsk() { if (askEl && askEl.parentNode) askEl.parentNode.removeChild(askEl); askEl = null; }
  function maybeAsk(tries) {
    if (!canAsk() || askEl || document.getElementById('qm-s-adhan')) return;
    if (document.querySelector('.qm-intro') && tries < 30) { setTimeout(function () { maybeAsk(tries + 1); }, 1000); return; }
    css();
    askEl = document.createElement('div'); askEl.className = 'qm-ad-ask'; askEl.id = 'qm-ad-ask'; askEl.setAttribute('role', 'region'); askEl.setAttribute('aria-label', 'Prayer reminders');
    askEl.innerHTML = '<b>Get a reminder at every prayer time?</b><p>Allow notifications and Quran Maar will sound the adhan when it\u2019s time. You can turn it off any time in Settings.</p>' +
      '<div class="qm-ad-btns"><button type="button" class="qm-ad-btn" data-a="no">Not now</button><button type="button" class="qm-ad-btn primary" data-a="yes">Turn on</button></div>';
    askEl.querySelector('[data-a="no"]').addEventListener('click', function () { try { localStorage.setItem(ASK, String(Date.now())); } catch (e) {} closeAsk(); });
    askEl.querySelector('[data-a="yes"]').addEventListener('click', function () {
      var box = askEl; box._busy = true;
      enableAll(function (p) {
        if (!box) return;
        box.innerHTML = '<b>' + (p === 'granted' ? '\u2713 Prayer reminders are on' : 'Notifications weren\u2019t allowed') + '</b><p>' + (p === 'granted' ? 'The adhan will sound at each prayer time while Quran Maar is open.' : 'You can turn them on later in Settings, then Adhan.') + '</p>';
        if (p !== 'granted') { try { localStorage.setItem(ASK, String(Date.now())); } catch (e) {} }
        setTimeout(closeAsk, 3200);
      });
    });
    document.body.appendChild(askEl);
  }

  /* hook into the Settings page */
  if (window.QMCustomise && window.QMCustomise.addSection) window.QMCustomise.addSection(buildCard);

  /* run the scheduler whenever the adhan is on */
  function boot() { if (S.on) start(); setTimeout(function () { maybeAsk(0); }, 6000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.QMAdhan = { play: function (l) { unlock(); return play(l || 'Dhuhr'); }, state: function () { return audio ? { paused: audio.paused, src: audio.getAttribute('data-src'), error: !!audio.error, t: audio.currentTime } : null; }, stop: stop, get: function () { return JSON.parse(JSON.stringify(S)); }, next: function () { return nextEvent(Date.now()); } };
})();
