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
     Inside the Android app (Capacitor) the same schedule is handed to
     the native "AdhanNative" plugin: exact Android alarms + a foreground
     audio service that plays the full adhan with the app closed or the
     screen locked (see ANDROID-ADHAN.md). On the web / PWA nothing
     below changes. The native path has NOT yet been tested on a real
     device.
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
    var r = { on: !!o.on, prayers: {}, notifyPrayers: {}, volume: typeof o.volume === 'number' ? Math.max(5, Math.min(100, o.volume)) : 85, notify: o.notify !== false };
    PRAYERS.forEach(function (p) { r.prayers[p] = !(o.prayers && o.prayers[p] === false); r.notifyPrayers[p] = !(o.notifyPrayers && o.notifyPrayers[p] === false); });
    var MODES = ['off', 'adhan', 'notify', 'vibrate', 'silent'];
    r.pm = {}; r.sounds = { fajr: 'adan1', other: 'adan2' };   /* Adhan 1 is always Fajr, Adhan 2 is every other prayer */
    PRAYERS.forEach(function (p) {
      var m = o.pm && o.pm[p];
      r.pm[p] = MODES.indexOf(m) > -1 ? m : (r.prayers[p] ? 'adhan' : (r.notifyPrayers[p] ? 'notify' : 'off'));
    });
    derive(r);
    return r;
  }
  /* The older code paths read prayers[] / notifyPrayers[] as plain "is this prayer enabled" flags. */
  function derive(r) { PRAYERS.forEach(function (p) { r.prayers[p] = r.pm[p] !== 'off'; r.notifyPrayers[p] = r.pm[p] !== 'off'; }); }
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

  /* ---------- native (Android app) helpers ---------- */
  function isNative() {
    try { var C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'android'); } catch (e) { return false; }
  }
  var NP_ = null;
  function NP() {
    if (NP_) return NP_;
    if (!isNative() || !window.Capacitor.registerPlugin) return null;
    try { NP_ = window.Capacitor.registerPlugin('AdhanNative'); } catch (e) { NP_ = null; }
    return NP_;
  }
  var diag = null;
  var nstate = { known: false, notifications: false, notifState: 'prompt', exactAlarms: true, batteryUnrestricted: false, playing: false, name: '', sdk: 0 };
  function applyStatus(r) {
    if (!r) return;
    ['notifications', 'notifState', 'exactAlarms', 'batteryUnrestricted', 'overlay', 'playing', 'name', 'sdk'].forEach(function (k) { if (r[k] !== undefined && r[k] !== null) nstate[k] = r[k]; });
    nstate.known = true;
  }
  function refreshNative(cb) {
    var P = NP();
    if (!P) { if (cb) cb(); return; }
    P.status().then(function (r) { applyStatus(r); refreshCard(); if (cb) cb(); }, function () { if (cb) cb(); });
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
  function stop() {
    var P = NP();
    if (P && nstate.playing) { P.stop().then(applyStatus, function () {}); nstate.playing = false; }
    if (audio) { try { audio.pause(); audio.currentTime = 0; } catch (e) {} }
    setPlaying(false);
  }

  function setPlaying(on, label) {
    hideBlocked();
    if (!on) { if (audio) audio._active = false; if (pill && pill.parentNode) pill.parentNode.removeChild(pill); pill = null; refreshCard(); return; }
    if (!isNative() && 'mediaSession' in navigator) {
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
  function supported() { return isNative() || 'Notification' in window; }
  function perm() {
    if (isNative()) return nstate.notifications ? 'granted' : (/^prompt/.test(String(nstate.notifState)) && !nstate.asked ? 'default' : 'denied');
    return supported() ? Notification.permission : 'unsupported';
  }
  function showNote(title, opts) {
    if (isNative()) return;   /* the Android app shows its own native notifications */
    var viaSW;
    try {
      viaSW = (navigator.serviceWorker && navigator.serviceWorker.ready)
        ? Promise.race([navigator.serviceWorker.ready, new Promise(function (_, rej) { setTimeout(rej, 1500); })])
        : Promise.reject();
    } catch (e) { viaSW = Promise.reject(); }
    viaSW.then(function (r) { return r.showNotification(title, opts); })
      .catch(function () { try { new Notification(title, opts); } catch (e) {} });
  }
  function notify(name, force) {
    if ((!S.notify && !force) || S.notifyPrayers[name] === false || perm() !== 'granted') return;
    showNote(name + ' \u2014 time to pray', { body: 'It\u2019s time for ' + name + ' prayer.', icon: 'icon-192.png', badge: 'favicon-48.png', tag: 'qm-adhan-' + name, vibrate: [300, 120, 300] });
  }
  function welcome() {
    if (perm() !== 'granted') return;
    showNote('Prayer reminders are on', { body: 'You\u2019ll be notified at each prayer time while Quran Maar is open.', icon: 'icon-192.png', badge: 'favicon-48.png', tag: 'qm-adhan-welcome' });
  }
  function requestPerm() {
    if (isNative()) {
      var P = NP(); nstate.asked = true;
      if (!P) return Promise.resolve('denied');
      return P.requestNotificationPermission().then(function () { return new Promise(function (res) { refreshNative(function () { res(perm()); }); }); }, function () { return 'denied'; });
    }
    return new Promise(function (res) {
      try {
        var r = Notification.requestPermission(function (p) { res(p); });   /* older Safari uses a callback */
        if (r && r.then) r.then(res, function () { res('denied'); });
      } catch (e) { res('denied'); }
    });
  }
  /* One tap: ask the phone for permission and, if allowed, switch everything on. */
  function enableAll(done) {
    if (isNative()) { nativeEnable(done); return; }   /* the app plays audio natively: no browser audio unlock needed */
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
  function fire(e) {
    var m = S.pm[e.name];
    if (m === 'adhan') play(e.name);
    if (m !== 'adhan' || S.notify) notify(e.name, m !== 'adhan');
    if (m === 'vibrate' && navigator.vibrate) { try { navigator.vibrate([600, 300, 600, 300, 900]); } catch (er) {} }
  }
  function tick() {
    clearTimeout(timer);
    if (isNative()) { syncNative(); refreshCard(); return; }   /* Android app: native alarms do the ringing, so no duplicate from JavaScript */
    if (!S.on) return;
    var now = Date.now(), ev = events(now), i;
    for (i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.at <= now && now - e.at <= WINDOW_MS && S.prayers[e.name] && !wasFired(e.key)) { markFired(e.key); fire(e); break; }
    }
    var nx = nextEvent(now);
    if (nx) timer = setTimeout(tick, Math.min(Math.max(nx.at - now + 300, 500), 2147000000));
    refreshCard(); syncNativeLN();
  }
  /* Fetching once while online lets the service worker keep a copy for offline. */
  function warm() {
    if (isNative()) return;   /* the audio files are packaged inside the app */
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
    [SRC_FAJR, SRC_OTHER].forEach(function (u) { try { fetch(u).catch(function () {}); } catch (e) {} });
  }
  function start() {
    warm();
    if (isNative()) { bindNative(); forceSync(); ensureCal(); }
    clearInterval(tickIv);
    tickIv = setInterval(tick, 15000);
    tick();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { if (isNative()) { forceSync(); refreshNative(); ensureCal(); } tick(); } });
  window.addEventListener('focus', function () { if (isNative()) refreshNative(function () { if (awaitingSettings && nstate.notifications) { awaitingSettings = false; if (!S.on) nativeEnable(function (p) { resultCard(p); }); else resultCard('granted'); } else nextStep(); }); tick(); });
  window.addEventListener('online', tick);
  window.addEventListener('qm-prayer', tick);

  /* ---------- native bridge (Android app) ---------- */
  var CAL = 'qm_adhan_cal', calBusy = false, lastSig = '', lastSyncAt = 0, bound = false, testEvents = [];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymdPad(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function forceSync() { lastSig = ''; }

  /* Exact per-day prayer times (same API and method as the Home page), kept for
     the next ~2 weeks so the alarms are right on every day, not just today's time repeated. */
  function readCal() { try { var c = JSON.parse(localStorage.getItem(CAL) || 'null'); return c && c.days ? c : null; } catch (e) { return null; } }
  function readGeo() { try { var g = JSON.parse(localStorage.getItem('qm_geo:last') || 'null'); return g && isFinite(g.lat) && isFinite(g.lon) ? g : null; } catch (e) { return null; } }
  function ensureCal() {
    if (!isNative() || calBusy || !navigator.onLine) return;
    var g = readGeo(); if (!g) return;
    var c = readCal(), now = new Date(), far = new Date(now.getTime() + 13 * 864e5);
    var moved = c && (Math.abs(c.lat - g.lat) > 0.05 || Math.abs(c.lon - g.lon) > 0.05);
    if (c && !moved && c.days[ymdPad(far)] && c.days[ymdPad(now)] && Date.now() - (c.at || 0) < 7 * 864e5) return;
    calBusy = true;
    var months = [[now.getMonth() + 1, now.getFullYear()]];
    if (far.getMonth() !== now.getMonth()) months.push([far.getMonth() + 1, far.getFullYear()]);
    var days = {};
    Promise.all(months.map(function (m) {
      return fetch('https://api.aladhan.com/v1/calendar?latitude=' + g.lat + '&longitude=' + g.lon + '&method=3&month=' + m[0] + '&year=' + m[1])
        .then(function (r) { return r.json(); })
        .then(function (j) {
          (j.data || []).forEach(function (it) {
            var gd = it && it.date && it.date.gregorian && it.date.gregorian.date, t = it.timings, p = (gd || '').split('-'), o = {}, ok = true;
            if (p.length !== 3 || !t) return;
            PRAYERS.forEach(function (n) { var x = /^(\d{1,2}):(\d{2})/.exec(String(t[n] || '')); if (x) o[n] = pad(+x[1]) + ':' + x[2]; else ok = false; });
            if (ok) days[p[2] + '-' + p[1] + '-' + p[0]] = o;
          });
        });
    })).then(function () {
      if (Object.keys(days).length) { try { localStorage.setItem(CAL, JSON.stringify({ lat: g.lat, lon: g.lon, at: Date.now(), days: days })); } catch (e) {} forceSync(); syncNative(); }
    }).catch(function () {}).then(function () { calBusy = false; });
  }

  /* One entry per prayer per day, as wall-clock date + time. The phone converts these using its
     CURRENT time zone every time it sets the alarms, so daylight saving and zone changes are handled. */
  function nativeList(now) {
    var out = [], cal = readCal(), src = readTimes(), today = new Date(); today.setHours(0, 0, 0, 0);
    for (var k = 0; k <= 13; k++) {
      var d = new Date(today); d.setDate(d.getDate() + k);
      var key = ymdPad(d), t = cal && cal.days[key] ? cal.days[key] : (k <= 7 && src ? src.t : null);
      if (!t) continue;
      PRAYERS.forEach(function (n) {
        var m = /^(\d{1,2}):(\d{2})/.exec(String(t[n] || '')); if (!m) return;
        var time = pad(+m[1]) + ':' + m[2];
        var at = new Date(d); at.setHours(+m[1], +m[2], 0, 0);
        if (at.getTime() < now - 5 * 60000) return;
        var md = S.pm[n]; if (md === 'off') return;
        out.push({ date: key, name: n, time: time, mode: md, play: md === 'adhan', notify: md === 'adhan' ? !!S.notify : true, vibrate: md === 'vibrate' });
      });
    }
    testEvents = testEvents.filter(function (e) { return e.at > now - 5 * 60000; });
    testEvents.forEach(function (e) { out.push({ date: e.date, name: e.name, time: e.time, mode: 'adhan', play: true, notify: true, vibrate: false }); });
    return out;
  }
  function syncNative() {
    var P = NP(); if (!P) return;
    var now = Date.now(), payload = { enabled: !!S.on, volume: S.volume, events: S.on ? nativeList(now) : [] };
    var sig = JSON.stringify(payload);
    if (sig === lastSig && now - lastSyncAt < 6 * 3600e3) return;
    lastSig = sig; lastSyncAt = now;
    P.schedule(payload).then(function (r) { applyStatus(r); refreshCard(); }, function () { lastSig = ''; });
  }
  /* One tap in the Android app: ask for notifications, switch the adhan on for every prayer,
     hand the schedule to the phone, then ask Android to let the app run in the background. */
  /* Android shows one permission dialog at a time. The site asks for location when it opens, so wait for that
     dialog to be answered before showing the notification dialog. */
  function afterLocation(cb) {
    var done = false;
    function go() {
      if (done) return; done = true;
      var tries = 0;
      (function waitIntro() {
        if (document.querySelector('.qm-intro') && tries++ < 30) { setTimeout(waitIntro, 1000); return; }
        setTimeout(cb, 600);
      })();
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
          if (st.state !== 'prompt') { setTimeout(go, 2500); return; }
          st.onchange = function () { setTimeout(go, 400); };
          setTimeout(go, readGeo() ? 6000 : 25000);
        }, function () { setTimeout(go, 5000); });
        return;
      }
    } catch (e) {}
    setTimeout(go, 6000);
  }
  /* A small message card (same look as the other pop-ups) */
  function flashCard(title, text, ms) {
    css(); closeAsk();
    askEl = document.createElement('div'); askEl.className = 'qm-ad-ask'; askEl.id = 'qm-ad-ask'; askEl.setAttribute('role', 'status');
    askEl.innerHTML = '<b>' + title + '</b><p>' + text + '</p>';
    document.body.appendChild(askEl);
    clearTimeout(flashT); flashT = setTimeout(closeAsk, ms || 3500);
  }
  function resultCard(p) {
    if (p === 'granted') flashCard('\u2713 The adhan is on', 'It will play at every prayer time, even with the app closed.');
    else flashCard('The adhan is on, but notifications are off', 'It will still play at prayer time. Allow notifications for Quran Maar to also see the reminder.', 4500);
  }
  /* Notifications are blocked (Android will not show its dialog again): send the user to the app's notification settings. */
  var awaitingSettings = false;
  function showBlocked() {
    var P = NP(); if (!P || askEl) return;
    css();
    askEl = document.createElement('div'); askEl.className = 'qm-ad-ask'; askEl.id = 'qm-ad-ask'; askEl.setAttribute('role', 'dialog');
    askEl.innerHTML = '<b>Notifications are blocked</b><p>Turn on notifications for Quran Maar so the adhan and prayer reminders can appear at prayer time. Tap Open settings, switch notifications on, then come back.</p>' +
      '<div class="qm-ad-btns"><button type="button" class="qm-ad-btn" data-a="no">Not now</button><button type="button" class="qm-ad-btn primary" data-a="go">Open settings</button></div>';
    askEl.querySelector('[data-a="no"]').addEventListener('click', function () { try { localStorage.setItem(ASK, String(Date.now())); } catch (e) {} closeAsk(); });
    askEl.querySelector('[data-a="go"]').addEventListener('click', function () {
      awaitingSettings = true; try { localStorage.setItem(ASK, String(Date.now())); } catch (e) {}
      closeAsk(); P.openNotificationSettings().catch(function () {});
    });
    document.body.appendChild(askEl);
  }
  /* What to do each time the app opens (Android app only). */
  var BATT = 'qm_adhan_batt';
  /* Explains why, then shows Android's real "allow to run in the background" dialog (like WeMuslim's "Enable App Background"). */
  function askBattery(force) {
    var P = NP();
    if (!P || nstate.batteryUnrestricted) return Promise.resolve();
    try {
      if (!force && Date.now() - (+localStorage.getItem(BATT) || 0) < 3 * 864e5) return Promise.resolve();
      localStorage.setItem(BATT, String(Date.now()));
    } catch (e) {}
    if (askEl && askEl._busy) return Promise.resolve();
    closeAsk(); css();
    return new Promise(function (res) {
      askEl = document.createElement('div'); askEl.className = 'qm-ad-ask'; askEl.id = 'qm-ad-ask'; askEl.setAttribute('role', 'dialog');
      askEl.innerHTML = '<b>Keep the adhan working when the app is closed</b><p>Android must let Quran Maar run in the background so it can sound the adhan at prayer time. On the next screen choose <b>Allow</b>. On Samsung phones also open Settings, Apps, Quran Maar, Battery and choose <b>Unrestricted</b>.</p>' +
        '<div class="qm-ad-btns"><button type="button" class="qm-ad-btn" data-a="no">Not now</button><button type="button" class="qm-ad-btn primary" data-a="go">Enable</button></div>';
      askEl.querySelector('[data-a="no"]').addEventListener('click', function () { closeAsk(); res(); });
      askEl.querySelector('[data-a="go"]').addEventListener('click', function () { closeAsk(); P.requestIgnoreBatteryOptimizations().catch(function () {}); res(); });
      document.body.appendChild(askEl);
    });
  }
  var OVL = 'qm_adhan_ovl';
  /* Explains "Appear on top", then opens Android's real settings screen for it (as WeMuslim does). */
  function askOverlay(force) {
    var P = NP();
    if (!P || nstate.overlay !== false) return Promise.resolve();
    try {
      if (!force && Date.now() - (+localStorage.getItem(OVL) || 0) < 3 * 864e5) return Promise.resolve();
      localStorage.setItem(OVL, String(Date.now()));
    } catch (e) {}
    if (askEl && askEl._busy) return Promise.resolve();
    closeAsk(); css();
    return new Promise(function (res) {
      askEl = document.createElement('div'); askEl.className = 'qm-ad-ask'; askEl.id = 'qm-ad-ask'; askEl.setAttribute('role', 'dialog');
      askEl.innerHTML = '<b>Show the adhan over the lock screen</b><p>Turn on <b>Appear on top</b> for Quran Maar. It lets Android open the adhan screen (with a Stop button) at prayer time even when the app is closed and the phone is locked. On the next screen switch it on, then come back.</p>' +
        '<div class="qm-ad-btns"><button type="button" class="qm-ad-btn" data-a="no">Not now</button><button type="button" class="qm-ad-btn primary" data-a="go">Open settings</button></div>';
      askEl.querySelector('[data-a="no"]').addEventListener('click', function () { closeAsk(); res(); });
      askEl.querySelector('[data-a="go"]').addEventListener('click', function () { closeAsk(); P.openOverlaySettings().catch(function () {}); res(); });
      document.body.appendChild(askEl);
    });
  }
  /* After the notification and background steps, the "Appear on top" step; run on launch and each time the app returns. */
  function nextStep() {
    if (!isNative() || !S.on || askEl) return;
    if (!nstate.batteryUnrestricted) { askBattery(false); return; }
    if (nstate.overlay === false) askOverlay(false);
  }
  var AUTO = 'qm_adhan_auto';
  function flagGet(k) { try { return !!localStorage.getItem(k); } catch (e) { return false; } }
  function flagSet(k) { try { localStorage.setItem(k, String(Date.now())); } catch (e) {} }
  /* Like the location pop-up: on launch, Android's own notification pop-up appears right away, the adhan is switched
     on, then the "run in the background" step follows. Nothing is hidden behind a delay. */
  function nativeLaunchFlow() {
    var P = NP(); if (!P) return;
    afterLocation(function () {
      refreshNative(function () {
        if (askEl) return;
        var st = String(nstate.notifState), first = !flagGet(AUTO), allowed = !!nstate.notifications;
        if (!allowed && (st === 'prompt' || st === 'prompt-with-rationale')) {
          flagSet(AUTO);
          nativeEnable(function (p) { if (nstate.batteryUnrestricted) resultCard(p); });
          return;
        }
        if (!allowed) {                                                   /* blocked in Android settings */
          if (first) { flagSet(AUTO); S.on = true; S.notify = true; save(); start(); forceSync(); syncNative(); refreshCard(); }
          var recent = false;
          try { recent = Date.now() - (+localStorage.getItem(ASK) || 0) < 864e5; } catch (e) {}
          if (!recent) showBlocked();
          return;
        }
        if (first && !S.on) { flagSet(AUTO); nativeEnable(function (p) { if (nstate.batteryUnrestricted) resultCard(p); }); return; }
        if (S.on) { forceSync(); nextStep(); }
      });
    });
  }
  function nativeEnable(done) {
    var P = NP();
    if (!P) { S.on = true; save(); start(); refreshCard(); if (done) done('unsupported'); return; }
    nstate.asked = true;
    P.requestNotificationPermission().catch(function () {})
      .then(function () { return P.status(); })
      .then(applyStatus, function () {})
      .then(function () {
        var granted = !!nstate.notifications;
        S.on = true; S.notify = true; save(); start(); forceSync(); syncNative(); refreshCard();
        if (done) done(granted ? 'granted' : 'denied');
        return askBattery(true);
      })
      .then(function () { setTimeout(function () { refreshNative(function () { nextStep(); }); }, 1500); });
  }
  function bindNative() {
    var P = NP(); if (!P || bound) return; bound = true;
    try {
      P.addListener('adhanState', function (st) {
        nstate.playing = !!(st && st.playing); nstate.name = (st && st.name) || '';
        if (nstate.playing) setPlaying(true, nstate.name); else setPlaying(false);
      });
    } catch (e) {}
    refreshNative(function () {
      if (nstate.playing) setPlaying(true, nstate.name);
      if (S.on) setTimeout(function () { if (!document.hidden) askBattery(false); }, 4000);   /* re-asks at most every 14 days */
    });
  }
  /* Console-only helper for real-device testing (no button in the app):
     QMAdhan.nativeTest(2) schedules a Dhuhr adhan + notification 2 minutes from now. */
  function nativeTest(mins, name) {
    var d = new Date(Date.now() + Math.max(1, mins || 2) * 60000);
    testEvents.push({ date: ymdPad(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()), name: name || 'Dhuhr', at: d.getTime() });
    forceSync(); syncNative();
    return testEvents[testEvents.length - 1];
  }

  /* Older fallback (only used if a build ships Capacitor LocalNotifications but not the AdhanNative plugin). */
  var nativeBusy = false;
  function nativeLN() {
    var C = window.Capacitor;
    try { return (!NP() && C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications) || null; } catch (e) { return null; }
  }
  function syncNativeLN() {
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
      '.qm-ad-tip{padding:16px;border-radius:18px;border:1px solid var(--gold-dim,rgba(207,51,66,.4));background:rgba(var(--accent-rgb,179,32,47),.10);}',
      '.qm-ad-tip b{display:block;font-size:16px;line-height:1.35;margin-bottom:5px;}',
      '.qm-ad-tip p{margin:0 0 12px;font-size:13.5px;color:var(--muted);line-height:1.5;}',
      '.qm-ad-tip ul{list-style:none;padding:0;margin:0 0 12px;display:grid;gap:10px;}',
      '.qm-ad-tip li{display:flex;gap:11px;align-items:flex-start;font-size:14.5px;line-height:1.4;font-weight:600;}',
      '.qm-ad-tip li i{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:13px;color:#fff;margin-top:0;}',
      '.qm-ad-tip li.ok i{background:#1f9d6b;}.qm-ad-tip li.no i{background:#d6453d;}',
      '.qm-ad-tip p.foot{margin:0;font-size:12.5px;}',
      '.qm-ad-ask .qm-ad-tip{padding:0;border:none;background:none;}',
      '.qm-ad-ask .qm-ad-tip p.foot{margin-bottom:14px;}',
      '.qm-ad-ask{position:fixed;left:12px;right:12px;margin:0 auto;max-width:460px;bottom:calc(var(--tab-h,64px) + env(safe-area-inset-bottom,0px) + 12px);z-index:9000;padding:18px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02)),var(--bg-soft,#121010);border:1px solid var(--gold);color:var(--ink);box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 30px -6px rgba(var(--gold-rgb,207,51,66),.4);animation:qmAskIn .45s cubic-bezier(.22,.9,.3,1);}',
      '@keyframes qmAskIn{from{opacity:0;transform:translateY(24px);}}',
      '@media(min-width:820px){.qm-ad-ask{left:auto;right:24px;bottom:24px;margin:0;}}',
      '.qm-ad-ask b{display:block;font-size:16.5px;margin-bottom:4px;}',
      '.qm-ad-ask p{margin:0 0 14px;font-size:13.5px;line-height:1.5;color:var(--muted);}',
      '.qm-ad-ask .qm-ad-btns{flex-wrap:nowrap;}.qm-ad-ask .qm-ad-btn{flex:1;justify-content:center;}',
      '.qm-ad-sel{max-width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:inherit;font:inherit;font-size:14px;font-weight:600;}',
      '.qm-ad-prow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;}.qm-ad-prow>span{font-weight:700;font-size:14.5px;}',
      '.qm-ad-srow{display:grid;gap:8px;padding:10px 0;border-top:1px solid var(--line);}.qm-ad-srow:first-of-type{border-top:none;}',
      '.qm-ad-srow .t{font-weight:700;font-size:14.5px;}',
      '.qm-ad-dg{display:grid;gap:8px;margin-top:10px;}',
      '.qm-ad-di{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:14px;border:1px solid var(--line);font-size:13.5px;line-height:1.45;}',
      '.qm-ad-di i{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:12px;color:#fff;}',
      '.qm-ad-di.ok i{background:#1f9d6b;}.qm-ad-di.bad i{background:#d6453d;}.qm-ad-di.warn i{background:#d9962b;}',
      '.qm-ad-di small{display:block;color:var(--muted);margin-top:2px;}.qm-ad-di button{margin-top:6px;}',
      '.qm-ad-nat{display:grid;gap:10px;}',
      '.qm-ad-nrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:var(--card);}',
      '.qm-ad-nrow .t{flex:1;min-width:0;font-weight:700;font-size:14px;line-height:1.35;}',
      '.qm-ad-nrow .t small{display:block;font-weight:500;font-size:12.5px;color:var(--muted);margin-top:2px;}',
      '.qm-ad-nrow .t small.ok{color:#1f9d6b;}.qm-ad-nrow .t small.no{color:#d6453d;}',
      '.qm-ad-nrow button{flex:none;border:none;border-radius:999px;padding:10px 14px;font-weight:700;font-size:13px;cursor:pointer;color:#f5f2ed;background:linear-gradient(135deg,var(--gold),rgba(var(--accent-rgb,179,32,47),1));}'
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
    Array.prototype.forEach.call(cardEl.querySelectorAll('[data-pm]'), function (el) { el.value = S.pm[el.getAttribute('data-pm')]; });
    Array.prototype.forEach.call(cardEl.querySelectorAll('[data-prev]'), function (pv) {
      pv.textContent = (nstate.playing && nstate.name === 'Preview') ? 'Stop preview' : pv.getAttribute('data-label');
    });
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
        msg = isNative() ? 'Notifications are turned off for Quran Maar in Android settings. Tap the button, switch them on, then come back.' : 'Allow them for this site in your browser or phone settings (tap the lock icon next to the address bar, then Notifications, then Allow). Then tap the button below.';
        showAllow = false; showRc = true; showSo = !S.on;
      } else {
        title = 'Get a reminder at every prayer time';
        msg = 'Tap the button, then choose Allow when your phone asks. After that the adhan is on.';
      }
      if (t) t.textContent = title; if (m) m.textContent = msg;
      if (al) { al.hidden = !showAllow; var sp = al.querySelector('span'); if (sp) sp.textContent = allowText; }
      if (so) so.hidden = !showSo; if (rc) { rc.hidden = !showRc; rc.textContent = isNative() ? 'Open notification settings' : 'I\u2019ve allowed it \u2014 check again'; }
    }
    var warn = q('[data-ad="warn"]');
    if (warn) {
      var permState = perm();
      warn.textContent = (S.notify && permState === 'denied') ? (isNative() ? 'Notifications are turned off for Quran Maar in Android settings, so only the sound will play.' : 'Notifications are blocked for this site in your browser settings, so only the sound will play.') : '';
      warn.hidden = !warn.textContent;
    }
  }

  function fill(el, opts) {
    var cur = el.value; el.innerHTML = '';
    opts.forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; el.appendChild(op); });
    el.value = cur;
  }
  function previewSlot(slot, api) {
    var P = NP();
    if (!P) { unlock(); play(slot === 'fajr' ? 'Fajr' : 'Dhuhr'); return; }
    if (nstate.playing && nstate.name === 'Preview') { P.stop().then(applyStatus, function () {}); return; }
    P.preview({ slot: slot }).then(function () {}, function (e) { api.toast((e && e.message) || 'Could not play the preview'); });
  }

  /* Reads the real state from Android and explains anything that would stop the adhan. */
  function runDiagnostics(listEl, api) {
    var P = NP(); if (!P) return;
    listEl.innerHTML = '';
    P.diagnostics().then(function (r) {
      applyStatus(r); diag = r;
      var items = [];
      function add(state, title, detail, fixLabel, fix) { items.push({ s: state, t: title, d: detail, fl: fixLabel, fx: fix }); }
      var openNotif = function () { P.openNotificationSettings().catch(function () {}); };
      add(S.on && r.enabledNative ? 'ok' : 'bad', S.on ? (r.enabledNative ? 'The adhan is switched on' : 'The phone has not received your schedule yet') : 'The adhan is switched off',
        S.on ? (r.enabledNative ? '' : 'Open the Home page once so your prayer times load, then check again.') : 'Turn on \u201cPlay the adhan at prayer time\u201d above.');
      add(r.notifications ? 'ok' : 'bad', r.notifications ? 'Notifications are allowed' : 'Notifications are blocked',
        r.notifications ? '' : 'The adhan can still play, but Android may stop the audio service and you will not see the Stop button.', r.notifications ? '' : 'Open notification settings', openNotif);
      if (r.playingChannelBlocked) add('bad', 'The \u201cAdhan playing\u201d notification type is switched off', 'Android will not let the adhan play without it.', 'Open notification settings', openNotif);
      add(r.exactAlarms ? 'ok' : 'bad', r.exactAlarms ? 'Exact alarms are allowed' : 'Exact alarms are not allowed',
        r.exactAlarms ? (r.sdk >= 33 ? 'Granted automatically on Android 13 and newer.' : '') : 'Alarms can be late by several minutes. Turn on \u201cAlarms & reminders\u201d for Quran Maar.',
        r.exactAlarms ? '' : 'Open alarm settings', function () { P.openExactAlarmSettings().catch(function () {}); });
      if (r.fullScreenAllowed === false) add('warn', 'The lock-screen adhan screen is not allowed', 'Without it the adhan still plays, but the Stop screen will not appear over the lock screen.', 'Allow full-screen alerts', function () { P.openFullScreenSettings().catch(function () {}); });
      add(r.overlay ? 'ok' : 'warn', r.overlay ? '\u201cAppear on top\u201d is allowed' : '\u201cAppear on top\u201d is off',
        r.overlay ? 'Android can open the adhan screen over the lock screen even when the app is closed.' : 'Turn it on so the adhan screen can open over the lock screen when the app is closed.',
        r.overlay ? '' : 'Open Appear on top settings', function () { P.openOverlaySettings().catch(function () {}); });
      if (S.on) {
        var nx = r.nextAlarmAt ? new Date(r.nextAlarmAt) : null;
        add(r.pendingAlarms > 0 ? 'ok' : 'bad', r.pendingAlarms > 0 ? r.pendingAlarms + ' prayer alarms are set with Android' : 'No prayer alarms are set',
          r.pendingAlarms > 0 ? (nx ? 'Next: ' + pad(nx.getHours()) + ':' + pad(nx.getMinutes()) + ' on ' + ymdPad(nx) : '') : 'Open the Home page so prayer times load, make sure at least one prayer is not Off, then check again.');
      }
      if (typeof r.alarmVolume === 'number') add(r.alarmVolume > 0 ? 'ok' : 'bad', 'Alarm volume: ' + r.alarmVolume + ' of ' + r.alarmVolumeMax,
        r.alarmVolume > 0 ? 'The adhan plays on the alarm volume (not the media or ringer volume).' : 'The alarm volume is zero, so the adhan would be silent. Press a volume key and raise the Alarm slider.');
      if (r.dndFilter === 3) add('bad', 'Do Not Disturb is set to \u201cTotal silence\u201d', 'That blocks alarms too. Change it to allow alarms, or turn Do Not Disturb off.');
      else if (r.dndFilter === 2) add('warn', 'Do Not Disturb is on (priority only)', 'Alarms are normally allowed, but check that Alarms is ticked in your Do Not Disturb settings.');
      add(r.batteryUnrestricted ? 'ok' : 'warn', r.batteryUnrestricted ? 'Battery use is unrestricted' : 'Battery optimisation may delay the adhan',
        r.batteryUnrestricted ? '' : 'Choose \u201cUnrestricted\u201d for Quran Maar so Android does not stop it in the background.', r.batteryUnrestricted ? '' : 'Allow background use', function () { P.requestIgnoreBatteryOptimizations().catch(function () {}); });
      if (r.backgroundRestricted) add('bad', 'Background activity is restricted for this app', 'Settings, Apps, Quran Maar, Battery: choose Unrestricted.');
      if (r.standbyBucket >= 45) add('bad', 'Android has put the app in its most restricted standby group', 'Open the app regularly and set Battery to Unrestricted.');
      if (S.on) add(r.keepAlive ? 'ok' : 'warn', r.keepAlive ? 'The \u201cAdhan is on\u201d background service is running' : 'The \u201cAdhan is on\u201d background service is not running right now',
        r.keepAlive ? 'It shows in Samsung\u2019s \u201cCheck background activity\u201d list and helps the alarms survive.' : 'Open the app once more, and make sure the adhan is switched on. If you have just opened the app, wait a moment and check again.');
      add(r.soundFajr ? 'ok' : 'bad', 'Fajr sound: ' + (r.soundFajr || 'file missing'), r.soundFajr ? '' : 'The adhan audio file could not be found inside the app. Reinstall the app.');
      add(r.soundOther ? 'ok' : 'bad', 'Other prayers sound: ' + (r.soundOther || 'file missing'), r.soundOther ? '' : 'The adhan audio file could not be found inside the app. Reinstall the app.');
      var mf = String(r.manufacturer || '').toLowerCase();
      if (/xiaomi|redmi|poco|huawei|honor|oppo|realme|oneplus|vivo|samsung/.test(mf)) add('warn', 'Your phone brand (' + r.manufacturer + ') is known for stopping background apps',
        'Also look for \u201cAutostart\u201d or \u201cApp launch\u201d in the phone\u2019s settings and allow Quran Maar, and do not swipe the app away if alarms stop.');
      var logs = Array.isArray(r.log) ? r.log : [];
      items.forEach(function (it) {
        var box = document.createElement('div'); box.className = 'qm-ad-di ' + it.s;
        var mark = document.createElement('i'); mark.textContent = it.s === 'ok' ? '\u2713' : it.s === 'bad' ? '\u2715' : '!';
        var body = document.createElement('div'); var b = document.createElement('b'); b.textContent = it.t; body.appendChild(b);
        if (it.d) { var sm = document.createElement('small'); sm.textContent = it.d; body.appendChild(sm); }
        if (it.fl && it.fx) { var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'qm-ad-btn'; bt.textContent = it.fl; bt.addEventListener('click', it.fx); body.appendChild(bt); }
        box.appendChild(mark); box.appendChild(body); listEl.appendChild(box);
      });
      var lg = document.createElement('div'); lg.className = 'qm-ad-di warn'; lg.style.display = 'block';
      var lb = document.createElement('b'); lb.textContent = 'What the adhan did recently (newest first)'; lg.appendChild(lb);
      if (!logs.length) { var em = document.createElement('small'); em.textContent = 'Nothing yet. After a prayer time passes with the app closed, come back and check: you will see whether Android fired the alarm.'; lg.appendChild(em); }
      logs.forEach(function (e) {
        var d = new Date(e.t), ln = document.createElement('small');
        ln.textContent = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '  ' + e.m;
        lg.appendChild(ln);
      });
      listEl.appendChild(lg);
    }, function () { listEl.textContent = 'Could not read the phone\u2019s state.'; });
  }

  function buildCard(api) {
    css(); closeAsk(); closeTip();
    var h = api.h;
    function row(icon, label, hint, control, click) {
      return h('div', { class: 'qm-row', onclick: click || null }, [
        h('span', { class: 'qm-ic', html: api.icn(icon) }),
        h('div', { class: 'qm-txt' }, [label, hint ? h('small', { text: hint }) : null]), control]);
    }
    function sw(dataAd, label) { return h('button', { type: 'button', class: 'qm-tg', role: 'switch', 'data-ad': dataAd, 'aria-label': label, 'aria-checked': 'false' }); }

    /* master switch */
    var master = row('bell', 'Play the adhan at prayer time', 'Turn it off any time.', sw('on', 'Play the adhan at prayer time'), function () {
      if (S.on) { S.on = false; save(); clearTimeout(timer); clearInterval(tickIv); stop(); syncNative(); syncNativeLN(); api.toast('Adhan is off'); refreshCard(); return; }
      if (supported() && perm() === 'default' && S.notify) { enableAll(function (p) { api.toast(p === 'granted' ? 'Notifications are on' : 'Notifications were not allowed'); if (p === 'granted') showKeepTip(); }); return; }
      S.on = true; save(); unlock(); start(); api.toast('Adhan is on'); refreshCard(); showKeepTip();
    });

    var permBox = h('div', { class: 'qm-block', 'data-ad': 'perm' }, [
      h('div', { class: 'qm-ad-permt', 'data-ad': 'permtitle' }),
      h('p', { class: 'qm-ad-note', 'data-ad': 'permmsg' }),
      h('div', { class: 'qm-ad-btns' }, [
        h('button', { type: 'button', class: 'qm-ad-btn primary', 'data-ad': 'allow', html: api.icn('bell', 18) + '<span></span>', onclick: function () {
          enableAll(function (p) { api.toast(p === 'granted' ? 'Notifications are on' : p === 'denied' ? 'Notifications were not allowed' : 'Adhan is on'); if (p === 'granted' || p === 'unsupported') showKeepTip(); }); } }),
        h('button', { type: 'button', class: 'qm-ad-btn', 'data-ad': 'soundonly', hidden: '', text: 'Turn on without notifications', onclick: function () { soundOnly(function () { api.toast('Adhan is on'); showKeepTip(); }); } }),
        h('button', { type: 'button', class: 'qm-ad-btn', 'data-ad': 'recheck', hidden: '', text: 'I\u2019ve allowed it \u2014 check again', onclick: function () {
          if (perm() === 'granted') enableAll(function () { api.toast('Notifications are on'); showKeepTip(); });
          else if (isNative() && NP()) { NP().openNotificationSettings().catch(function () {}); }
          else { refreshCard(); api.toast('Still blocked'); } } })
      ])]);

    var next = h('div', { class: 'qm-block' }, [h('div', { class: 'qm-ad-next', 'data-ad': 'next' })]);

    function mkSel(attrs, onchange) {
      var el = document.createElement('select'); el.className = 'qm-ad-sel';
      Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
      el.addEventListener('change', function () { onchange(el.value); });
      return el;
    }
    function btn(label, cls, fn, attrs) {
      var attr = { type: 'button', class: 'qm-ad-btn' + (cls ? ' ' + cls : ''), text: label, onclick: fn };
      Object.keys(attrs || {}).forEach(function (k) { attr[k] = attrs[k]; });
      return h('button', attr);
    }

    /* what each prayer does (replaces the old two rows of chips) */
    var MODE_OPTS = [['adhan', 'Full adhan'], ['notify', 'Notification sound'], ['vibrate', 'Vibration only'], ['silent', 'Silent notification'], ['off', 'Off']];
    var modeRows = [h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-ic', html: api.icn('sun') }), h('span', { class: 'qm-t', text: 'What happens at each prayer' })])];
    PRAYERS.forEach(function (p) {
      var sel = mkSel({ 'data-pm': p, 'aria-label': p + ': what happens at prayer time' }, function (v) {
        S.pm[p] = v; derive(S); save(); forceSync(); tick(); refreshCard();
      });
      fill(sel, MODE_OPTS);
      modeRows.push(h('div', { class: 'qm-ad-prow' }, [h('span', { text: p }), sel]));
    });
    modeRows.push(h('p', { class: 'qm-ad-note', text: 'Full adhan plays the recording (alarm volume, works when the phone is locked). The other choices only show a notification: with the phone\u2019s notification sound, a vibration, or nothing audible.' }));
    var which = h('div', { class: 'qm-block' }, modeRows);
    var nwhich = null;

    /* the two recordings (Android app only): Adhan 1 = Fajr, Adhan 2 = the other four. Preview only, nothing to choose. */
    var sounds = null;
    if (isNative()) {
      sounds = h('div', { class: 'qm-block' }, [
        h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-ic', html: api.icn('volume') }), h('span', { class: 'qm-t', text: 'Adhan recordings' })]),
        h('p', { class: 'qm-ad-note', text: 'Adhan 1 plays at Fajr. Adhan 2 plays at Dhuhr, Asr, Maghrib and Isha.' }),
        h('div', { class: 'qm-ad-btns' }, [
          btn('Preview Adhan 1 (Fajr)', '', function () { previewSlot('fajr', api); }, { 'data-prev': 'fajr', 'data-label': 'Preview Adhan 1 (Fajr)' }),
          btn('Preview Adhan 2 (other prayers)', '', function () { previewSlot('other', api); }, { 'data-prev': 'other', 'data-label': 'Preview Adhan 2 (other prayers)' })
        ])
      ]);
    }

    var nat = null;   /* (the old Android settings box was removed: one "Allow" pop-up does the setup) */

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

    var note = h('div', { class: 'qm-block' }, [h('div', { class: 'qm-ad-tip', html: tipInner() })]);

    /* test buttons */
    var testBlock = h('div', { class: 'qm-block' }, [
      h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-ic', html: api.icn('bell') }), h('span', { class: 'qm-t', text: 'Test the adhan' })]),
      h('div', { class: 'qm-ad-btns' }, [
        btn('Play the adhan now', 'primary', function () {
          var P = NP();
          if (P) P.test({ name: 'Dhuhr' }).then(function () {}, function (e) { api.toast((e && e.message) || 'Could not play'); });
          else { unlock(); play('Dhuhr'); }
        }),
        btn('Stop', '', function () { stop(); }),
        isNative() ? btn('Test alarm in 1 minute', '', function () {
          if (!S.on) { api.toast('Turn the adhan on first'); return; }
          var t = nativeTest(1, 'Dhuhr'); api.toast('Alarm set for ' + t.time + '. Close the app and lock your phone.');
        }) : null
      ]),
      h('p', { class: 'qm-ad-note', text: isNative() ? '\u201cPlay the adhan now\u201d uses the same audio service as a real prayer alarm. \u201cTest alarm in 1 minute\u201d goes through Android\u2019s alarm clock: after tapping it, close Quran Maar completely and lock the phone to check the real thing.' : 'Plays the adhan in this page so you can check your volume.' })
    ]);

    /* diagnostics (Android app only) */
    var diagBox = null;
    if (isNative()) {
      var diagList = h('div', { class: 'qm-ad-dg', 'data-ad': 'diag' });
      diagBox = h('div', { class: 'qm-block' }, [
        h('div', { class: 'qm-lab' }, [h('span', { class: 'qm-ic', html: api.icn('bell') }), h('span', { class: 'qm-t', text: 'Why might the adhan not play?' })]),
        h('div', { class: 'qm-ad-btns' }, [btn('Check my phone now', 'primary', function () { runDiagnostics(diagList, api); })]),
        diagList
      ]);
    }

    var licence = h('div', { class: 'qm-block' }, [h('p', { class: 'qm-ad-note', text: 'Adhan recordings: Adan1.mp3 (Fajr) and Adan2.mp3 (other prayers) are bundled with the app. Their source, licence and attribution are listed in ADHAN-LICENCES.md in the project. Files you choose yourself stay on your phone only.' })]);

    cardEl = api.card('bell', 'Adhan', 'The call to prayer at each prayer time.', 'qm-s-adhan', [permBox, master, next, which].concat(sounds ? [sounds] : [], [volume], isNative() ? [] : [notifRow], [warn, testBlock], diagBox ? [diagBox] : [], nat ? [nat] : [], [note, licence]));
    setTimeout(refreshCard, 0);   /* the card is not in the page yet at this moment */
    var iv = setInterval(function () { if (!document.body.contains(cardEl)) { clearInterval(iv); return; } refreshCard(); }, 30000);
    return cardEl;
  }

  /* ---------- "keep it running" message ---------- */
  var TIP = 'qm_adhan_tip', tipEl = null;
  function platform() {
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) ? 'ios' : /android/i.test(ua) ? 'android' : 'desktop';
  }
  function tipInner() {
    var pl = platform(), ok, no;
    if (isNative()) {
      function li2(cls, mark, txt) { return '<li class="' + cls + '"><i aria-hidden="true">' + mark + '</i><span>' + txt + '</span></li>'; }
      return '<b>The adhan can sound with the app closed</b>' +
        '<p>Quran Maar sets Android alarms for each prayer. To make sure they are on time:</p>' +
        '<ul>' + li2('ok', '\u2713', 'Allow notifications, and let Android run the app in the background when it asks.') +
        li2('ok', '\u2713', 'Keep your ALARM volume up. The adhan plays on the alarm volume, so it still sounds in silent mode but not if the alarm volume is zero.') +
        li2('no', '\u2715', 'Don\u2019t use \u201cForce stop\u201d on the app. That cancels all alarms until you open it again.') + '</ul>' +
        '<p class="foot">Open the app now and then (about every two weeks) so it can refresh your prayer times.</p>';
    }
    if (pl === 'desktop') {
      ok = ['Minimise the window or switch to another tab. Quran Maar keeps running.', 'Keep your volume up and Do Not Disturb off.'];
      no = ['Don\u2019t close the tab or the window.'];
    } else {
      ok = [pl === 'ios' ? 'Swipe up to the Home Screen to leave the app.' : 'Press the Home button to leave the app.', 'Keep your volume up and Do Not Disturb off.'];
      no = ['Don\u2019t swipe Quran Maar away from your recent apps (the minimised screen).'];
    }
    function li(cls, mark, txt) { return '<li class="' + cls + '"><i aria-hidden="true">' + mark + '</i><span>' + txt + '</span></li>'; }
    return '<b>Keep Quran Maar running so you never miss the adhan</b>' +
      '<p>The call to prayer can only sound while the app is still running. Please:</p>' +
      '<ul>' + ok.map(function (t) { return li('ok', '\u2713', t); }).join('') + no.map(function (t) { return li('no', '\u2715', t); }).join('') + '</ul>' +
      '<p class="foot">If the app is closed, the adhan stays silent until you open it again.</p>';
  }
  function tipAcknowledged() { try { return !!localStorage.getItem(TIP); } catch (e) { return false; } }
  function ackTip() { try { localStorage.setItem(TIP, '1'); } catch (e) {} }
  function closeTip() { if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl); tipEl = null; }
  /* shown once, right after the adhan is switched on, until the person taps "Got it" */
  function showKeepTip() {
    if (tipEl || tipAcknowledged() || isNative()) return;
    css();
    tipEl = document.createElement('div'); tipEl.className = 'qm-ad-ask'; tipEl.id = 'qm-ad-tip'; tipEl.setAttribute('role', 'dialog'); tipEl.setAttribute('aria-label', 'Keep Quran Maar running');
    tipEl.innerHTML = '<div class="qm-ad-tip">' + tipInner() + '</div><div class="qm-ad-btns"><button type="button" class="qm-ad-btn primary" data-a="ok">Got it</button></div>';
    tipEl.querySelector('[data-a="ok"]').addEventListener('click', function () { ackTip(); closeTip(); });
    document.body.appendChild(tipEl);
  }

  /* ---------- one-time friendly prompt ---------- */
  var ASK = 'qm_adhan_ask', askEl = null;
  function canAsk() {
    if (!supported() || S.on) return false;
    if (!isNative() && perm() !== 'default') return false;
    try { if (Date.now() - (+localStorage.getItem(ASK) || 0) < (isNative() ? 2 : 14) * 864e5) return false; } catch (e) {}
    return true;
  }
  var flashT = 0;
  function closeAsk() { clearTimeout(flashT); if (askEl && askEl.parentNode) askEl.parentNode.removeChild(askEl); askEl = null; }
  function maybeAsk(tries) {
    if (!canAsk() || askEl || document.getElementById('qm-s-adhan')) return;
    if (document.querySelector('.qm-intro') && tries < 30) { setTimeout(function () { maybeAsk(tries + 1); }, 1000); return; }
    css();
    askEl = document.createElement('div'); askEl.className = 'qm-ad-ask'; askEl.id = 'qm-ad-ask'; askEl.setAttribute('role', 'region'); askEl.setAttribute('aria-label', 'Prayer reminders');
    askEl.innerHTML = '<b>Get a reminder at every prayer time?</b><p>Allow notifications and Quran Maar will sound the adhan when it\u2019s time. You can turn it off any time in Settings.</p>' +
      '<div class="qm-ad-btns"><button type="button" class="qm-ad-btn" data-a="no">Not now</button><button type="button" class="qm-ad-btn primary" data-a="yes">Turn on</button></div>';
    if (isNative()) askEl.innerHTML = '<b>Allow notifications to hear the adhan?</b><p>Quran Maar will play the full adhan at every prayer time, even when the app is closed or your phone is locked. You can change this any time in Settings.</p>' +
      '<div class="qm-ad-btns"><button type="button" class="qm-ad-btn" data-a="no">Not now</button><button type="button" class="qm-ad-btn primary" data-a="yes">Allow</button></div>';
    askEl.querySelector('[data-a="no"]').addEventListener('click', function () { try { localStorage.setItem(ASK, String(Date.now())); } catch (e) {} closeAsk(); });
    askEl.querySelector('[data-a="yes"]').addEventListener('click', function () {
      var box = askEl; box._busy = true;
      enableAll(function (p) {
        if (!box) return;
        if (isNative()) { closeAsk(); if (p !== 'granted' && String(nstate.notifState) === 'denied') showBlocked(); else resultCard(p); return; }
        if (p === 'granted' && !tipAcknowledged()) {
          box.innerHTML = '<div class="qm-ad-tip">' + tipInner() + '</div><div class="qm-ad-btns"><button type="button" class="qm-ad-btn primary" data-a="ok">Got it</button></div>';
          box.querySelector('[data-a="ok"]').addEventListener('click', function () { ackTip(); closeAsk(); });
          return;
        }
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
  function boot() { if (isNative()) { bindNative(); if (S.on) start(); nativeLaunchFlow(); return; } if (S.on) start(); setTimeout(function () { maybeAsk(0); }, 6000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.QMAdhan = { play: function (l) { unlock(); return play(l || 'Dhuhr'); }, state: function () { return audio ? { paused: audio.paused, src: audio.getAttribute('data-src'), error: !!audio.error, t: audio.currentTime } : null; }, stop: stop, get: function () { return JSON.parse(JSON.stringify(S)); }, next: function () { return nextEvent(Date.now()); }, native: function () { return isNative() ? JSON.parse(JSON.stringify(nstate)) : null; }, nativeTest: nativeTest };
})();
