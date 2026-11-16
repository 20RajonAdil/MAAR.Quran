/* ============================================================
   QURAN MAAR — update.js
   Android app only. When a newer build has been published on GitHub
   (a new "apk-<number>" release), the version the person already has
   installed shows an "Update available" card with a Download button.
   Settings also gets an "App updates" card with "Check for updates".
   On the website this file does nothing.
   ============================================================ */
(function () {
  'use strict';

  function isNative() {
    try { var C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'android' && C.registerPlugin); } catch (e) { return false; }
  }
  if (!isNative()) return;

  var API = 'https://api.github.com/repos/20RajonAdil/MAAR.Quran/releases/latest';
  var LAST = 'qm_upd_last', SKIP = 'qm_upd_skip', EVERY = 6 * 3600 * 1000;
  var P = null;
  try { P = window.Capacitor.registerPlugin('AppUpdate'); } catch (e) { return; }

  var me = null;      /* { versionCode, versionName } installed */
  var found = null;   /* { n, name, url } newest published */
  var bar = null;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  function css() {
    if (document.getElementById('qm-up-css')) return;
    var s = document.createElement('style'); s.id = 'qm-up-css';
    s.textContent = [
      '.qm-up{position:fixed;left:12px;right:12px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:9998;max-width:520px;margin:0 auto;padding:16px 16px 14px;border-radius:22px;background:var(--card,#181414);color:var(--ink,#f5f2ed);border:1px solid var(--gold,#cf3342);box-shadow:0 18px 50px -12px rgba(0,0,0,.7);font-family:inherit;}',
      '@media(min-width:820px){.qm-up{bottom:24px;}}',
      '.qm-up b{display:block;font-size:15px;margin-bottom:4px;}',
      '.qm-up p{margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--muted,#bbb);}',
      '.qm-up-btns{display:flex;gap:8px;justify-content:flex-end;}',
      '.qm-up-btn{padding:11px 16px;border-radius:14px;border:1px solid var(--line,#333);background:transparent;color:inherit;font:inherit;font-weight:700;font-size:14px;cursor:pointer;}',
      '.qm-up-btn.primary{background:var(--gold,#cf3342);border-color:var(--gold,#cf3342);color:#fff;}',
      '.qm-up-btn:active{transform:scale(.97);}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function closeBar() { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); bar = null; }

  function showBar() {
    if (bar || !found) return;
    css();
    bar = document.createElement('div'); bar.className = 'qm-up'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Update available');
    bar.innerHTML = '<b>Update available</b><p>A newer version of Quran Maar is ready (build ' + found.n + (me ? ', you have ' + me.versionCode : '') + '). Download it, open the file and tap Install. If Android says it conflicts with the installed copy, uninstall Quran Maar first.</p>' +
      '<div class="qm-up-btns"><button type="button" class="qm-up-btn" data-a="later">Later</button><button type="button" class="qm-up-btn primary" data-a="go">Download update</button></div>';
    bar.querySelector('[data-a="later"]').addEventListener('click', function () { ls(SKIP, String(found.n)); closeBar(); });
    bar.querySelector('[data-a="go"]').addEventListener('click', function () { P.open({ url: found.url }).catch(function () {}); closeBar(); });
    document.body.appendChild(bar);
  }

  /* resolves { status: 'new'|'current'|'error' } */
  function check(manual) {
    var p0 = me ? Promise.resolve() : P.info().then(function (r) { me = r; });
    return p0.then(function () {
      return fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
    }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(function (j) {
      ls(LAST, String(Date.now()));
      var m = /^apk-(\d+)/.exec(j && j.tag_name || ''), n = m ? parseInt(m[1], 10) : 0;
      var a = (j.assets || []).filter(function (x) { return x && x.name === 'Quran.MAAR.apk'; })[0];
      if (!n || !a || !a.browser_download_url) return { status: 'error' };
      if (n > (me && me.versionCode || 0)) {
        found = { n: n, name: j.name || '', url: a.browser_download_url };
        if (manual || ls(SKIP) !== String(n)) showBar();
        return { status: 'new', build: n };
      }
      return { status: 'current' };
    }).catch(function () { return { status: 'error' }; });
  }

  /* Settings card */
  function buildCard(api) {
    css();
    var h = api.h, msg = h('p', { class: 'qm-wp-note', style: 'margin:12px 2px 0;font-size:13px;color:var(--muted);line-height:1.5;', text: '' });
    var btn = h('button', { type: 'button', class: 'qm-up-btn', text: 'Check for updates', onclick: function () {
      btn.disabled = true; msg.textContent = 'Checking\u2026';
      check(true).then(function (r) {
        btn.disabled = false;
        msg.textContent = r.status === 'new' ? 'A newer version (build ' + r.build + ') is available.' : r.status === 'current' ? 'You have the latest version.' : 'Could not check right now. Try again when you are online.';
      });
    } });
    var el = api.card('spark', 'App updates', 'Get the newest version of Quran Maar.', 'qm-s-updates', [h('div', { class: 'qm-block' }, [msg, h('div', { style: 'margin-top:12px;' }, [btn])])]);
    P.info().then(function (r) { me = r; msg.textContent = 'Installed version: ' + (r.versionName || r.versionCode); }, function () {});
    return el;
  }
  if (window.QMCustomise && window.QMCustomise.addSection) window.QMCustomise.addSection(buildCard);

  /* on start: look for a newer build (at most every 6 hours, and never blocks the app) */
  function boot() {
    var last = parseInt(ls(LAST) || '0', 10);
    if (Date.now() - last < EVERY) { return; }
    setTimeout(function () { check(false); }, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.QMUpdate = { check: function () { return check(true); } };
})();
