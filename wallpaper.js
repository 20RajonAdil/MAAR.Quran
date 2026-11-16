/* ============================================================
   QURAN MAAR — wallpaper.js
   Android app only: "Daily wallpaper". When switched on, the phone's
   wallpaper changes every day to a calm background with the ayah of
   the day (Arabic + the translation in the app's current language).
   The work is done by the native "DailyWallpaper" plugin, so it keeps
   working with the app closed. On the website this file does nothing.
   ============================================================ */
(function () {
  'use strict';

  function isNative() {
    try { var C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'android' && C.registerPlugin); } catch (e) { return false; }
  }
  if (!isNative()) return;

  var KEY = 'qm_wallpaper';
  var P = null;
  try { P = window.Capacitor.registerPlugin('DailyWallpaper'); } catch (e) { return; }

  var S = { on: false, target: 'both' };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') { S.on = !!raw.on; if (/^(both|home|lock)$/.test(raw.target)) S.target = raw.target; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* the language the whole app is using right now (picked by the person, or by their country) */
  function payload(apply) {
    var i = window.QMI18n, code = (i && i.get && i.get()) || 'en', l = (i && i.info && i.info(code)) || null;
    var d = window.QM_I18N_DATA || {}, title = (d[code] && d[code]['Ayah of the day']) || 'Ayah of the day';
    return { edition: (l && l.edition) || '', lang: code, rtl: !!(l && l.dir === 'rtl'), title: title, target: S.target, apply: apply !== false };
  }

  var cardEl = null, busy = false, last = null;
  function q(s) { return cardEl ? cardEl.querySelector(s) : null; }
  function note(msg) { var n = q('[data-wp="note"]'); if (n) { n.textContent = msg || ''; n.hidden = !msg; } }

  function paint() {
    if (!cardEl) return;
    var tg = q('[data-wp="on"]'); if (tg) tg.setAttribute('aria-checked', String(S.on));
    var opts = q('[data-wp="opts"]'); if (opts) opts.hidden = !S.on;
    cardEl.querySelectorAll('[data-target]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-target') === S.target)); });
    var now = q('[data-wp="now"]'); if (now) { now.disabled = busy; now.textContent = busy ? 'Working\u2026' : 'Change it now'; }
    var m = '';
    if (S.on && last) {
      if (last.allowed === false) m = 'Android does not allow this app to change the wallpaper on this phone.';
      else if (last.error === 'offline') m = 'No internet right now. It will update by itself as soon as you are online.';
      else if (last.error === 'failed') m = 'Could not set the wallpaper. Try \u201cChange it now\u201d.';
      else if (last.ref) m = 'Today\u2019s ayah: ' + last.ref;
    }
    note(m);
  }

  function call(fn) {
    busy = true; paint();
    return fn().then(function (r) { last = r || last; busy = false; paint(); return r; }, function () { busy = false; last = { error: 'failed' }; paint(); });
  }

  function turnOn() { S.on = true; save(); return call(function () { return P.enable(payload(true)); }); }
  function turnOff() { S.on = false; save(); last = null; return P.disable().then(function (r) { last = null; paint(); }, function () { paint(); }); }
  function setTarget(t) { S.target = t; save(); if (S.on) call(function () { return P.enable(payload(true)); }); else paint(); }

  function css() {
    if (document.getElementById('qm-wp-css')) return;
    var s = document.createElement('style'); s.id = 'qm-wp-css';
    s.textContent = [
      '.qm-wp-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}',
      '.qm-wp-btn{flex:1 1 auto;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;transition:transform .15s,border-color .2s;}',
      '.qm-wp-btn:active{transform:scale(.97);}',
      '.qm-wp-btn[aria-pressed="true"]{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset;}',
      '.qm-wp-btn:disabled{opacity:.6;}',
      '.qm-wp-note{margin:12px 2px 0;font-size:13px;color:var(--muted);line-height:1.5;}',
      '.qm-wp-fine{margin:12px 2px 0;font-size:12.5px;color:var(--muted);line-height:1.5;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function buildCard(api) {
    css();
    var h = api.h;
    var sw = h('button', { type: 'button', class: 'qm-tg', role: 'switch', 'data-wp': 'on', 'aria-label': 'Change my wallpaper every day', 'aria-checked': String(S.on) });
    var master = h('div', { class: 'qm-row', onclick: function () { if (busy) return; if (S.on) turnOff(); else turnOn(); } }, [
      h('span', { class: 'qm-ic', html: api.icn('spark') }),
      h('div', { class: 'qm-txt' }, ['Change my wallpaper every day', h('small', { text: 'A new calm background and an ayah, in your language.' })]), sw]);

    var btns = h('div', { class: 'qm-wp-btns', role: 'group', 'aria-label': 'Where to show it' }, [
      ['both', 'Home + lock screen'], ['home', 'Home screen'], ['lock', 'Lock screen']
    ].map(function (o) { return h('button', { type: 'button', class: 'qm-wp-btn', 'data-target': o[0], 'aria-pressed': 'false', text: o[1], onclick: function () { if (!busy) setTarget(o[0]); } }); }));
    var now = h('button', { type: 'button', class: 'qm-wp-btn', 'data-wp': 'now', text: 'Change it now', onclick: function () { if (busy) return; call(function () { return P.applyNow(); }).then(function (r) { api.toast(r && r.ok ? 'Wallpaper updated' : 'Will update when online'); }); } });
    var opts = h('div', { class: 'qm-block', 'data-wp': 'opts', hidden: '' }, [
      btns, h('div', { class: 'qm-wp-btns' }, [now]),
      h('p', { class: 'qm-wp-note', 'data-wp': 'note', hidden: '' }),
      h('p', { class: 'qm-wp-fine', text: 'It changes a few minutes after midnight and follows the app language. Your current wallpaper is replaced; turn this off and pick your own in your phone\u2019s settings any time. Some phones have their own wallpaper changer that can override this.' })
    ]);

    cardEl = api.card('spark', 'Daily wallpaper', 'The ayah of the day on your phone\u2019s wallpaper.', 'qm-s-wallpaper', [master, opts]);
    setTimeout(function () { P.status().then(function (r) { last = r; if (r && r.enabled !== S.on) { S.on = !!r.enabled; save(); } paint(); }, paint); }, 0);
    paint();
    return cardEl;
  }

  if (window.QMCustomise && window.QMCustomise.addSection) window.QMCustomise.addSection(buildCard);

  /* the app language changed (by the person, or by country detection): redraw today's wallpaper in it */
  if (window.QMI18n && window.QMI18n.onChange) window.QMI18n.onChange(function () { if (S.on && !busy) call(function () { return P.enable(payload(true)); }); });

  /* app start: keep the native side in step (language, schedule) without redrawing */
  function boot() { if (S.on) P.enable(payload(false)).then(function (r) { last = r; paint(); }, function () {}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
