/* ============================================================
   QURAN MAAR - wallpaper.js
   Android app only: "Daily Quran Wallpaper".

   This is the website side of a REAL Android live wallpaper. The work is done by the native
   "DailyWallpaper" plugin and Android's own wallpaper service, so a new ayah appears every day
   with the app closed. On the website (or in a browser) this file does nothing.

   Rules this file follows:
   - "Enable" opens ANDROID's own wallpaper preview / "Set wallpaper" screen. Nothing here pretends to be it.
   - Success is only shown after Android itself says Quran Maar is the wallpaper.
   - The lock screen is only called active when Android confirms it.
   ============================================================ */
(function () {
  'use strict';

  function isNative() {
    try { var C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'android' && C.registerPlugin); } catch (e) { return false; }
  }
  var APK = 'https://github.com/20RajonAdil/MAAR.Quran/releases/latest/download/Quran.MAAR.apk';

  /* Not the Android app (website / home-screen shortcut): still show the card, so nobody is left wondering where it is. */
  if (!isNative()) {
    if (window.QMCustomise && window.QMCustomise.addSection) window.QMCustomise.addSection(function (api) {
      var h = api.h, plat = 'web';
      try { if (window.Capacitor && window.Capacitor.getPlatform) plat = window.Capacitor.getPlatform(); } catch (e) {}
      return api.card('spark', 'Daily Quran Wallpaper', 'A new verse of the Qur\u2019an on your wallpaper, every day.', 'qm-s-wallpaper', [
        h('div', { class: 'qm-block' }, [
          h('p', { style: 'margin:0 0 12px;font-size:14px;line-height:1.6;', text: 'This works only in the Quran Maar Android app, because it needs Android\u2019s real wallpaper system. You are using the website version, so it is switched off here.' }),
          h('a', { href: APK, style: 'display:inline-block;padding:13px 18px;border-radius:16px;background:var(--gold,#cf3342);color:#fff;font-weight:700;font-size:14px;text-decoration:none;', text: 'Download the Android app' }),
          h('p', { style: 'margin:12px 0 0;font-size:12px;opacity:.7;', text: 'Detected: ' + plat + ' (no Android app bridge)' })
        ])
      ]);
    });
    return;
  }

  var P = null;
  try { P = window.Capacitor.registerPlugin('DailyWallpaper'); } catch (e) { P = null; }
  var lastErr = '';
  function errText(e) { return (e && (e.message || e.errorMessage)) || String(e || 'unknown error'); }

  var ASKED = 'qm_wp_asked', MIGRATE = 'qm_wp_migrate_asked';
  var st = null;        /* last status from Android / the native side */
  var cur = null;       /* what is on the wallpaper: verse + preview picture */
  var busy = '';        /* '', 'enable', 'disable', 'refresh', 'download' */
  var cardEl = null, H = null, askEl = null, sayEl = null, sayT = 0, tries = 0;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function q(s) { return cardEl ? cardEl.querySelector(s) : null; }

  /* the language the whole app is using right now (picked by the person, or by their country) */
  function payload() {
    var i = window.QMI18n, code = (i && i.get && i.get()) || 'en', l = (i && i.info && i.info(code)) || null;
    var d = window.QM_I18N_DATA || {}, title = (d[code] && d[code]['Ayah of the day']) || 'Ayah of the day';
    return { edition: (l && l.edition) || '', lang: code, rtl: !!(l && l.dir === 'rtl'), title: title };
  }

  function isOn() { return !!(st && st.enabled && st.active); }

  /* ---------------- small messages ---------------- */
  function say(msg) {
    css();
    if (sayEl && sayEl.parentNode) sayEl.parentNode.removeChild(sayEl);
    sayEl = document.createElement('div'); sayEl.className = 'qm-wp-say'; sayEl.setAttribute('role', 'status'); sayEl.textContent = msg;
    document.body.appendChild(sayEl);
    clearTimeout(sayT); sayT = setTimeout(function () { if (sayEl && sayEl.parentNode) sayEl.parentNode.removeChild(sayEl); sayEl = null; }, 7000);
  }

  function fmtDate(ms) {
    if (!ms) return '';
    try { return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(ms).toString(); }
  }

  /* ---------------- talking to the native side ---------------- */
  function loadStatus() {
    return P.status().then(function (r) { lastErr = ''; st = r; paint(); return r; }, function (e) { lastErr = errText(e); paint(); });
  }
  function loadCurrent() {
    return P.getCurrent().then(function (r) { lastErr = ''; cur = r; st = r; paint(); return r; }, function (e) { lastErr = errText(e); paint(); });
  }

  function turnOn() {
    if (busy) return Promise.resolve();
    ls(ASKED, '1'); busy = 'enable'; paint();
    var p = payload();
    return P.enable(p).then(function (r) {
      busy = ''; st = r || st;
      if (r && r.activated) {
        var where = r.homeActive && r.lockKnown && r.lockActive ? 'your home and lock screens'
          : r.homeActive ? 'your home screen' : (r.lockActive ? 'your lock screen' : 'your wallpaper');
        say('Daily Quran Wallpaper is on. Android confirmed Quran Maar is ' + where + '.');
      } else if (r && r.reason === 'unsupported') {
        say('This phone does not support live wallpapers, so Daily Quran Wallpaper is not available.');
      } else if (r && r.reason === 'no_picker') {
        say('Could not open Android\u2019s wallpaper screen. Open Android Settings \u203A Wallpaper, choose Live wallpapers, then Quran Maar.');
      } else if (r && r.reason === 'busy') {
        say('Android\u2019s wallpaper screen is already open.');
      } else {
        say('Nothing was changed: Android did not confirm Quran Maar as your wallpaper. You can try again any time.');
      }
      paint(); return loadCurrent();
    }, function () { busy = ''; say('Could not start Daily Quran Wallpaper. Please try again.'); paint(); });
  }

  function turnOff() {
    if (busy) return Promise.resolve();
    busy = 'disable'; paint();
    return P.disable().then(function (r) {
      busy = ''; st = r || st;
      say('Daily changes stopped. Your current wallpaper stays as it is. To replace it, choose another wallpaper in Android settings.');
      paint(); return loadCurrent();
    }, function () { busy = ''; paint(); });
  }

  function refreshNow() {
    if (busy) return Promise.resolve();
    busy = 'refresh'; paint();
    return P.refresh().then(function (r) {
      busy = ''; st = r || st;
      say(r && r.ok === false ? 'No internet right now. The rest will finish by itself when you are online.' : 'Wallpaper is up to date.');
      paint(); return loadCurrent();
    }, function () { busy = ''; say('Could not update right now.'); paint(); });
  }

  function download() {
    if (busy) return Promise.resolve();
    busy = 'download'; paint();
    return P.download().then(function (r) {
      busy = ''; paint();
      say('Saved the wallpaper image (' + (r.width || '') + '\u00D7' + (r.height || '') + ') to ' + (r.folder || 'Pictures') + '.');
    }, function (e) { busy = ''; paint(); say((e && e.message) || 'Could not save the wallpaper.'); });
  }

  /* ---------------- styles ---------------- */
  function css() {
    if (document.getElementById('qm-wp-css')) return;
    var s = document.createElement('style'); s.id = 'qm-wp-css';
    s.textContent = [
      '.qm-wp-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}',
      '.qm-wp-btn{flex:1 1 auto;padding:13px 14px;border-radius:16px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;transition:transform .15s,border-color .2s,opacity .2s;}',
      '.qm-wp-btn:active{transform:scale(.97);}',
      '.qm-wp-btn:disabled{opacity:.55;}',
      '.qm-wp-btn.primary{background:var(--gold,#cf3342);border-color:var(--gold,#cf3342);color:#fff;}',
      '.qm-wp-note{margin:12px 2px 0;font-size:13px;color:var(--muted);line-height:1.55;}',
      '.qm-wp-warn{margin:12px 0 0;padding:12px 14px;border-radius:14px;border:1px solid var(--gold,#cf3342);font-size:13px;line-height:1.55;color:var(--ink);background:rgba(207,51,66,.08);}',
      '.qm-wp-fine{margin:14px 2px 0;font-size:12.5px;color:var(--muted);line-height:1.55;}',
      '.qm-wp-line{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;padding:9px 2px;font-size:14px;}',
      '.qm-wp-line+.qm-wp-line{border-top:1px solid var(--line-soft,var(--line));}',
      '.qm-wp-line b{font-weight:600;flex:none;}',
      '.qm-wp-chip{text-align:right;font-size:12.5px;line-height:1.45;color:var(--muted);max-width:68%;}',
      '.qm-wp-chip.ok{color:#58c98a;font-weight:600;}',
      '.qm-wp-prev{display:flex;gap:16px;align-items:flex-start;margin-top:14px;}',
      '.qm-wp-img{flex:none;width:min(42%,190px);aspect-ratio:9/19.5;border-radius:18px;border:1px solid var(--line);object-fit:cover;background:#0b0b0b;box-shadow:0 14px 34px -14px rgba(0,0,0,.7);}',
      '.qm-wp-v{flex:1;min-width:0;}',
      '.qm-wp-cap{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold,#cf3342);font-weight:700;margin:0 0 8px;}',
      '.qm-wp-ar{font-family:var(--arabic-font,"Amiri Quran",serif);font-size:21px;line-height:2;direction:rtl;text-align:right;margin:0 0 8px;color:var(--ink);}',
      '.qm-wp-tr{font-size:13.5px;line-height:1.6;color:var(--ink);opacity:.92;margin:0 0 8px;}',
      '.qm-wp-ref{font-size:13px;font-weight:700;margin:0 0 2px;}',
      '.qm-wp-meta{font-size:12px;color:var(--muted);line-height:1.5;margin:0;}',
      '@media(max-width:420px){.qm-wp-prev{flex-direction:column;align-items:center;}.qm-wp-img{width:min(60%,210px);}.qm-wp-v{width:100%;}}',
      '.qm-wp-ask{position:fixed;left:12px;right:12px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:9997;max-width:520px;margin:0 auto;padding:18px 16px 14px;border-radius:22px;background:var(--card,#181414);color:var(--ink,#f5f2ed);border:1px solid var(--gold,#cf3342);box-shadow:0 18px 50px -12px rgba(0,0,0,.7);}',
      '@media(min-width:820px){.qm-wp-ask{bottom:24px;}}',
      '.qm-wp-ask b{display:block;font-size:16px;margin-bottom:6px;}',
      '.qm-wp-ask p{margin:0 0 14px;font-size:13.5px;line-height:1.55;color:var(--muted,#bbb);}',
      '.qm-wp-ask .qm-wp-btns{justify-content:flex-end;margin-top:0;}',
      '.qm-wp-ask .qm-wp-btn{flex:0 0 auto;}',
      '.qm-wp-say{position:fixed;left:12px;right:12px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:9998;max-width:520px;margin:0 auto;padding:14px 16px;border-radius:16px;background:var(--card,#181414);color:var(--ink,#f5f2ed);border:1px solid var(--line,#333);box-shadow:0 14px 40px -12px rgba(0,0,0,.7);font-size:13.5px;line-height:1.5;}',
      '@media(min-width:820px){.qm-wp-say{bottom:24px;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------------- first-run question, and the one-time "please confirm again" for older installs ---------------- */
  function closeAsk() { if (askEl && askEl.parentNode) askEl.parentNode.removeChild(askEl); askEl = null; }

  function maybeAsk(migrate) {
    if (askEl || (migrate ? ls(MIGRATE) : ls(ASKED))) return;
    if (isOn()) return;
    /* wait while another pop-up (location, notifications, update) is showing, so they never stack */
    if (document.querySelector('.qm-ad-ask, .qm-up, .qm-ad-pill') && tries++ < 8) { setTimeout(function () { maybeAsk(migrate); }, 6000); return; }
    css();
    askEl = document.createElement('div'); askEl.className = 'qm-wp-ask'; askEl.setAttribute('role', 'dialog'); askEl.setAttribute('aria-label', 'Daily Quran Wallpaper');
    var title = migrate ? 'Finish setting up Daily Quran Wallpaper' : 'Daily Quran Wallpaper';
    var text = migrate
      ? 'Daily Quran Wallpaper now uses Android\u2019s real live-wallpaper system. Android needs you to confirm Quran Maar once more on its own screen. Until then your wallpaper will not change.'
      : 'Receive a beautiful new Quranic verse on your phone\u2019s wallpaper every day, automatically, without opening the app. Android will show its own preview screen; you confirm once and it does the rest. You can turn it off any time in Settings.';
    askEl.innerHTML = '<b></b><p></p><div class="qm-wp-btns"><button type="button" class="qm-wp-btn" data-a="no"></button><button type="button" class="qm-wp-btn primary" data-a="yes"></button></div>';
    askEl.querySelector('b').textContent = title;
    askEl.querySelector('p').textContent = text;
    askEl.querySelector('[data-a="no"]').textContent = 'Maybe Later';
    askEl.querySelector('[data-a="yes"]').textContent = 'Enable Daily Wallpaper';
    askEl.querySelector('[data-a="no"]').addEventListener('click', function () { ls(migrate ? MIGRATE : ASKED, '1'); closeAsk(); });
    askEl.querySelector('[data-a="yes"]').addEventListener('click', function () { ls(migrate ? MIGRATE : ASKED, '1'); closeAsk(); turnOn(); });
    document.body.appendChild(askEl);
  }

  /* ---------------- the Settings section ---------------- */
  function line(label, text, ok) {
    return H('div', { class: 'qm-wp-line' }, [H('b', { text: label }), H('span', { class: 'qm-wp-chip' + (ok ? ' ok' : ''), text: text })]);
  }

  function statusBlock() {
    var kids = [];
    if (lastErr) kids.push(H('div', { class: 'qm-wp-warn', text: 'Could not talk to Android: ' + lastErr + '. If this says the plugin is not implemented, this app is an older build: install the latest from Download for Android.' }));
    if (busy === 'enable') kids.push(H('p', { class: 'qm-wp-note', text: 'Waiting for Android\u2019s wallpaper screen\u2026 tap \u201CSet wallpaper\u201D there to confirm.' }));
    if (st && st.enabled && !st.active) {
      kids.push(H('div', { class: 'qm-wp-warn', text: 'Android is not using Quran Maar as your wallpaper right now (it may have been changed). Turn Daily Quran Wallpaper on to confirm it with Android again.' }));
    }
    if (st) {
      kids.push(line('Home screen', st.homeActive ? 'Active \u00B7 confirmed by Android' : 'Not set', st.homeActive));
      kids.push(line('Lock screen', st.lockActive ? 'Active \u00B7 confirmed by Android'
        : (st.lockKnown ? 'Not set' : 'Not confirmed. Android does not tell apps about the lock screen on this phone, so lock your phone to check.'), st.lockActive));
      if (st.enabled && st.active && st.exact === false && st.needsInternet) {
        kids.push(H('p', { class: 'qm-wp-note', text: 'Your language\u2019s translation will download when you are online. English is shown until then.' }));
      }
    }
    return H('div', { class: 'qm-block' }, kids);
  }

  function previewBlock() {
    var v = cur.verse || {}, on = isOn();
    var surah = v.surahEn || '';
    var meta = on && st.updatedAt ? 'Last updated: ' + fmtDate(st.updatedAt)
      : (st && st.updatedAt ? 'Last applied: ' + fmtDate(st.updatedAt) : 'Not applied to your phone yet');
    return H('div', { class: 'qm-wp-prev' }, [
      H('img', { class: 'qm-wp-img', alt: 'Preview of the Quran Maar wallpaper', src: cur.preview || '' }),
      H('div', { class: 'qm-wp-v' }, [
        H('p', { class: 'qm-wp-cap', text: on ? 'On your wallpaper now' : 'Today\u2019s ayah (not applied)' }),
        H('p', { class: 'qm-wp-ar', lang: 'ar', dir: 'rtl', text: v.arabic || '' }),
        v.translation ? H('p', { class: 'qm-wp-tr', text: v.translation }) : null,
        H('p', { class: 'qm-wp-ref', text: 'Surah ' + surah + ' \u00B7 Ayah ' + (v.ayahNo || '') + '  (' + (v.ref || '') + ')' }),
        H('p', { class: 'qm-wp-meta', text: meta })
      ])
    ]);
  }

  function btn(cls, text, fn) {
    var a = { type: 'button', class: cls, text: text, onclick: fn };
    if (busy) a.disabled = '';          /* h() sets every attribute it is given, so only add this one when needed */
    return H('button', a);
  }

  function buttons() {
    var kids = [];
    if (st && st.supported !== false) {
      if (!isOn()) kids.push(btn('qm-wp-btn', busy === 'enable' ? 'Waiting for Android\u2026' : 'Enable Daily Wallpaper', turnOn));
      else kids.push(btn('qm-wp-btn', busy === 'refresh' ? 'Updating\u2026' : 'Update now', refreshNow));
    }
    kids.push(btn('qm-wp-btn primary', busy === 'download' ? 'Saving\u2026' : 'Download Wallpaper', download));
    return H('div', { class: 'qm-wp-btns' }, kids);
  }

  function fine() {
    return H('p', { class: 'qm-wp-fine', text:
      'Android shows its own preview screen and you confirm once. After that a new ayah appears every day, usually within minutes after midnight in your time zone. ' +
      'If your phone is off, asleep or offline then, it changes as soon as the wallpaper is next shown. It works without internet in English and Arabic; other translation languages download when you are online. ' +
      'Turning this off stops the daily changes but leaves your current wallpaper in place. ' +
      'Some phones limit live wallpapers on the lock screen or have their own wallpaper changer that can override this.' });
  }

  function paint() {
    if (!cardEl || !H) return;
    var tg = q('[data-wp="on"]'); if (tg) tg.setAttribute('aria-checked', String(isOn()));
    var body = q('[data-wp="body"]'); if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    if (st && st.supported === false) {
      body.appendChild(H('p', { class: 'qm-wp-note', text: 'This phone does not support live wallpapers, so Daily Quran Wallpaper is not available here. You can still download today\u2019s wallpaper image below.' }));
    }
    body.appendChild(statusBlock());
    if (cur) body.appendChild(previewBlock());
    body.appendChild(buttons());
    body.appendChild(fine());
  }

  function buildCard(api) {
    css();
    if (!P) lastErr = 'the wallpaper plugin could not be loaded';
    H = api.h;
    var sw = H('button', { type: 'button', class: 'qm-tg', role: 'switch', 'data-wp': 'on', 'aria-label': 'Daily Quran Wallpaper', 'aria-checked': String(isOn()) });
    var master = H('div', { class: 'qm-row', onclick: function () { if (busy) return; if (isOn()) turnOff(); else turnOn(); } }, [
      H('span', { class: 'qm-ic', html: api.icn('spark') }),
      H('div', { class: 'qm-txt' }, ['Daily Quran Wallpaper', H('small', { text: 'A new ayah on your phone\u2019s real Android wallpaper every day.' })]), sw]);
    var body = H('div', { class: 'qm-block', 'data-wp': 'body' });
    cardEl = api.card('spark', 'Daily Quran Wallpaper', 'A new verse of the Qur\u2019an on your wallpaper, every day.', 'qm-s-wallpaper', [master, body]);
    paint();
    if (P) loadStatus().then(loadCurrent);
    return cardEl;
  }

  if (window.QMCustomise && window.QMCustomise.addSection) window.QMCustomise.addSection(buildCard);

  /* the app language changed (by the person, or by country detection): the wallpaper follows it */
  if (P && window.QMI18n && window.QMI18n.onChange) window.QMI18n.onChange(function () {
    P.configure(payload()).then(function (r) { st = r; return loadCurrent(); }, function () {});
  });

  /* coming back to the app (for example from Android's settings): ask Android again what is really set */
  document.addEventListener('visibilitychange', function () {
    if (P && document.visibilityState === 'visible' && cardEl && cardEl.isConnected && !busy) loadStatus().then(loadCurrent);
  });

  /* app start: keep the native side in step with the app language, then see where we stand */
  function boot() {
    if (!P) return;
    P.configure(payload()).then(function (r) {
      st = r;
      if (r && r.supported === false) return;
      if (r && r.enabled && !r.active) setTimeout(function () { maybeAsk(true); }, 9000);   /* an older install that must confirm with Android */
      else if (!(r && r.enabled)) setTimeout(function () { maybeAsk(false); }, 9000);
    }, function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
