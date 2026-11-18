/* Quran Maar - one-tap picture download.
   window.QMImg.download({ src | blob, name })   -> saves the ORIGINAL picture (Gallery in the app, a file on the web)
   - Android app: the native "QMImage" plugin fetches the original bytes (or copies the bundled file) straight into
     Pictures/Quran Maar through MediaStore. Nothing is screenshotted, resized or re-compressed.
   - Website: the original file is fetched and handed to the browser's normal download.
   While it runs a small progress card is shown; when it finishes the card offers View and Share (app) and a
   failure offers Try again. The same picture cannot be started twice at once.
   Long-pressing any content picture in the app also offers "Download image". */
(function () {
  'use strict';

  var cap = window.Capacitor;
  var isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  var plugin = null, readyP = null, listening = false;
  var jobs = {};                 /* key -> { promise, ui } */
  var byId = {};                 /* native job id -> ui */
  var seq = 0;

  /* ---------- helpers ---------- */
  function $(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var ICON = {
    dl: 'M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
    ok: 'M5 12.5l4.5 4.5L19 7.5',
    bad: 'M12 8v5m0 3.5h.01M10.3 3.9L2.6 17.2A2 2 0 004.3 20h15.4a2 2 0 001.7-2.8L13.7 3.9a2 2 0 00-3.4 0z'
  };
  function svg(d) {
    var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
    s.setAttribute('width', '20'); s.setAttribute('height', '20'); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.9');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    var p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.appendChild(p); return s;
  }

  /* ---------- the native side ---------- */
  function ready() {
    if (readyP) return readyP;
    readyP = new Promise(function (resolve) {
      if (!isNative) return resolve(false);
      try {
        plugin = cap.registerPlugin ? cap.registerPlugin('QMImage') : (cap.Plugins && cap.Plugins.QMImage);
        if (!plugin) return resolve(false);
        plugin.ping().then(function () {
          if (!listening && plugin.addListener) {
            listening = true;
            plugin.addListener('progress', function (e) { var ui = e && byId[e.id]; if (ui) ui.progress(e.received, e.total); });
          }
          resolve(true);
        }, function () { resolve(false); });      /* an older app build without the plugin */
      } catch (err) { resolve(false); }
    });
    return readyP;
  }

  /* ---------- what is the best (original) address for this picture? ---------- */
  function candidates(u) {
    var m = /^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//.exec(u);
    if (m) {   /* YouTube thumbnail: biggest first, the one in the page last */
      var b = 'https://i.ytimg.com/vi/' + m[1] + '/';
      return [b + 'maxresdefault.jpg', b + 'sddefault.jpg', b + 'hqdefault.jpg'];
    }
    var a = /^(https:\/\/(?:yt3\.ggpht|yt3\.googleusercontent|lh3\.googleusercontent)\.com\/.+?)=s\d+(.*)$/.exec(u);
    if (a) return [a[1] + '=s0' + a[2], u];     /* s0 = original size */
    return [u];
  }

  function baseName(u) {
    try { var p = new URL(u, document.baseURI).pathname; p = p.slice(p.lastIndexOf('/') + 1); return decodeURIComponent(p); } catch (e) { return ''; }
  }

  /* work out where the picture lives */
  function plan(o) {
    if (o.blob) return Promise.resolve({ mode: 'blob', blob: o.blob, key: 'blob:' + (o.name || '') + ':' + o.blob.size + ':' + o.blob.type });
    var src = String(o.src || '');
    if (!src) return Promise.reject(new Error('No picture to download'));
    if (/^(blob:|data:)/i.test(src)) {
      return fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
        return { mode: 'blob', blob: b, key: 'blob:' + src.slice(0, 120) };
      });
    }
    var u;
    try { u = new URL(src, document.baseURI); } catch (e) { return Promise.reject(new Error('That picture address is not valid')); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return Promise.reject(new Error('That picture address is not supported'));
    if (u.origin === location.origin) {
      var path = decodeURIComponent(u.pathname).replace(/^\//, '');
      return Promise.resolve({ mode: 'same', url: u.href, assetPath: path, key: 'asset:' + path });
    }
    var list = candidates(u.href);
    return Promise.resolve({ mode: 'remote', urls: list, key: 'url:' + list[0] });
  }

  /* ---------- the progress / result card ---------- */
  var stack = null;
  function getStack() {
    if (stack && document.body.contains(stack)) return stack;
    stack = $('div', 'dl-stack'); stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
    return stack;
  }

  function Card(title) {
    var el = $('div', 'dl-toast'); el.setAttribute('role', 'status');
    var row = $('div', 'dl-row'), ico = $('span', 'dl-ico'), txt = $('div', 'dl-text');
    var t = $('b', 'dl-title', title), s = $('span', 'dl-sub'), act = $('div', 'dl-actions');
    txt.appendChild(t); txt.appendChild(s); row.appendChild(ico); row.appendChild(txt); row.appendChild(act);
    var bar = $('div', 'dl-bar'), fill = $('i'); bar.appendChild(fill);
    el.appendChild(row); el.appendChild(bar);
    var st = getStack(); st.appendChild(el);
    while (st.children.length > 3) st.removeChild(st.firstChild);
    var timer = 0;
    var ui = {
      el: el,
      state: function (kind, head, sub) {
        el.setAttribute('data-state', kind); t.textContent = head; s.textContent = sub || '';
        ico.textContent = ''; ico.appendChild(svg(kind === 'done' ? ICON.ok : kind === 'error' ? ICON.bad : ICON.dl));
        act.textContent = '';
        clearTimeout(timer);
      },
      button: function (label, fn, primary) {
        var b = $('button', 'dl-btn' + (primary ? ' dl-btn-main' : ''), label); b.type = 'button';
        b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); });
        act.appendChild(b); return b;
      },
      progress: function (got, total) {
        if (el.getAttribute('data-state') !== 'progress') return;
        if (total > 0) {
          var pct = Math.max(0, Math.min(100, Math.round(got * 100 / total)));
          el.classList.remove('dl-ind'); fill.style.width = pct + '%'; s.textContent = (ui.name || '') + (ui.name ? ' \u00b7 ' : '') + pct + '%';
        } else { el.classList.add('dl-ind'); }
      },
      closeAfter: function (ms) { clearTimeout(timer); timer = setTimeout(ui.close, ms); },
      close: function () { clearTimeout(timer); el.classList.add('dl-out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220); },
      pulse: function () { el.classList.remove('dl-pulse'); void el.offsetWidth; el.classList.add('dl-pulse'); }
    };
    return ui;
  }

  function friendly(err) {
    var code = err && (err.code || (err.data && err.data.code));
    var msg = (err && err.message) || '';
    switch (code) {
      case 'offline': return 'You appear to be offline. Check your internet connection and try again.';
      case 'timeout': return 'The connection timed out. Please try again.';
      case 'network': return 'The connection was interrupted. Please try again.';
      case 'not_found': return 'That picture could not be found.';
      case 'not_image': return 'That address is not a picture.';
      case 'storage': return msg || 'The picture could not be saved. Check that the phone has free space.';
      case 'cancelled': return 'Download cancelled.';
      case 'http': return 'The picture server did not respond properly. Try again later.';
      default:
        if (/network|fetch|failed to load|load failed/i.test(msg)) return 'The connection failed. Check your internet and try again.';
        return msg || 'Something went wrong while saving the picture.';
    }
  }

  /* ---------- the download itself ---------- */
  function download(o) {
    o = o || {};
    return plan(o).then(function (p) {
      if (jobs[p.key]) { jobs[p.key].ui.pulse(); return jobs[p.key].promise; }   /* already running: no duplicate */
      var ui = Card('Downloading\u2026');
      var name = o.name || (p.blob ? '' : baseName(p.urls ? p.urls[p.urls.length - 1] : p.url)) || '';
      ui.name = name;
      var rec = { ui: ui };
      jobs[p.key] = rec;

      var run = (isNative ? ready() : Promise.resolve(false)).then(function (native) {
        ui.state('progress', 'Downloading\u2026', name);
        if (native) return viaNative(p, o, name, ui);
        return viaBrowser(p, o, name, ui);
      }).then(function (res) {
        showDone(ui, res, o);
        return res;
      }, function (err) {
        if (err && err.code === 'cancelled') { ui.close(); return null; }
        ui.state('error', 'Couldn\u2019t download', friendly(err));
        ui.button('Try again', function () { ui.close(); download(o); }, true);
        ui.button('\u2715', ui.close);
        ui.closeAfter(16000);
        return null;
      }).then(function (v) { delete jobs[p.key]; return v; });

      rec.promise = run;
      return run;
    }, function (err) {
      var ui = Card('Couldn\u2019t download'); ui.state('error', 'Couldn\u2019t download', friendly(err)); ui.button('\u2715', ui.close); ui.closeAfter(8000);
      return null;
    });
  }

  function viaNative(p, o, name, ui) {
    var id = 'qm' + (++seq) + '-' + Date.now();
    byId[id] = ui;
    var finish = function () { delete byId[id]; };
    ui.button('Cancel', function (b) { b.disabled = true; plugin.cancel({ id: id }); });
    var args = { id: id, name: name || undefined };
    var work;
    if (p.mode === 'remote') { args.urls = p.urls; work = plugin.download(args); }
    else if (p.mode === 'same') { args.assetPath = p.assetPath; work = plugin.download(args); }
    else work = sendBlob(p.blob, ui).then(function (stageId) { args.stageId = stageId; args.mime = p.blob.type; return plugin.download(args); });
    return work.then(function (r) { finish(); return r; }, function (e) { finish(); throw e; });
  }

  /* big pictures go to the phone in small pieces (one huge message can silently fail) */
  function sendBlob(blob, ui) {
    return plugin.begin().then(function (b) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onerror = function () { reject(new Error('Could not read the picture')); };
        fr.onload = function () {
          var s = String(fr.result), all = s.slice(s.indexOf(',') + 1), STEP = 196608, i = 0;
          (function next() {
            if (i >= all.length) return resolve(b.id);
            var chunk = all.slice(i, i + STEP); i += STEP;
            plugin.append({ id: b.id, chunk: chunk }).then(function () { ui.progress(Math.min(i, all.length), all.length); next(); }, reject);
          })();
        };
        fr.readAsDataURL(blob);
      });
    });
  }

  function extFor(type, fallback) {
    var m = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
    return m[(type || '').split(';')[0]] || fallback || 'jpg';
  }

  /* website: fetch the original file and give it to the browser's own download */
  function viaBrowser(p, o, name, ui) {
    var url = p.mode === 'blob' ? null : (p.urls ? p.urls[0] : p.url);
    var getBlob = p.mode === 'blob' ? Promise.resolve(p.blob) : fetchFirst(p.urls || [p.url]);
    return getBlob.then(function (blob) {
      var base = (name || 'quran-maar-image').replace(/\.(jpe?g|png|gif|webp|avif|svg|bmp)$/i, '').replace(/[\\/:*?"<>|]+/g, '_');
      var file = base + '.' + extFor(blob.type, 'jpg');
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
      return { web: true, name: file, bytes: blob.size, mime: blob.type };
    }, function (err) {
      /* the picture's server may not allow reading it from a page: let the browser open it so it can be saved */
      if (url && p.mode !== 'blob') {
        var a2 = document.createElement('a'); a2.href = (p.urls || [p.url])[p.urls ? p.urls.length - 1 : 0]; a2.target = '_blank'; a2.rel = 'noopener'; a2.download = name || '';
        document.body.appendChild(a2); a2.click(); a2.remove();
        return { web: true, opened: true, name: name };
      }
      throw err;
    });
  }

  function fetchFirst(urls) {
    var i = 0, lastErr;
    function next() {
      if (i >= urls.length) return Promise.reject(lastErr || new Error('The picture could not be downloaded'));
      return fetch(urls[i++]).then(function (r) {
        if (!r.ok) { lastErr = new Error('http ' + r.status); return next(); }
        return r.blob().then(function (b) { if (b.type && b.type.indexOf('image/') !== 0) { lastErr = new Error('not a picture'); return next(); } return b; });
      }, function (e) { lastErr = e; return next(); });
    }
    return next();
  }

  function showDone(ui, res, o) {
    if (res && res.web) {
      ui.state('done', res.opened ? 'Opened the picture' : 'Downloaded', res.opened ? 'Press and hold it, then choose Save image.' : 'Look in your Downloads folder.');
      ui.button('\u2715', ui.close); ui.closeAfter(7000); return;
    }
    ui.state('done', 'Saved to your Gallery', (res.name || '') + ' \u00b7 ' + (res.folder || 'Pictures/Quran Maar'));
    ui.button('View', function () { plugin.view({ uri: res.uri, mime: res.mime }).catch(function (e) { ui.state('error', 'Couldn\u2019t open it', friendly(e)); ui.button('\u2715', ui.close); }); }, true);
    ui.button('Share', function () { plugin.share({ uri: res.uri, mime: res.mime, text: o.shareText }).catch(function () {}); });
    ui.button('\u2715', ui.close);
    ui.closeAfter(10000);
  }

  /* ---------- long-press any content picture ---------- */
  var pill = null, pillTimer = 0;
  function hidePill() { clearTimeout(pillTimer); if (pill && pill.parentNode) pill.parentNode.removeChild(pill); pill = null; }
  function eligible(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.closest('.leaflet-container, [data-no-dl], .ay-thumb, .dl-toast')) return false;
    var r = img.getBoundingClientRect();
    return r.width >= 72 && r.height >= 72 && !!(img.currentSrc || img.src);
  }
  function showPill(img, x, y) {
    hidePill();
    pill = $('div', 'dl-pill');
    var b = $('button', 'dl-pill-btn'); b.type = 'button';
    b.appendChild(svg(ICON.dl)); b.appendChild(document.createTextNode(' Download image'));
    b.addEventListener('click', function (e) {
      e.stopPropagation(); hidePill();
      download({ src: img.currentSrc || img.src, name: (img.getAttribute('data-dl-name') || img.alt || '').trim() || undefined });
    });
    pill.appendChild(b); document.body.appendChild(pill);
    var w = pill.offsetWidth || 190, h = pill.offsetHeight || 46;
    pill.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px';
    pill.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y - h - 16)) + 'px';
    pillTimer = setTimeout(hidePill, 5000);
  }
  document.addEventListener('contextmenu', function (e) {
    var img = e.target && e.target.closest ? e.target.closest('img') : null;
    if (!eligible(img)) return;
    var touch = isNative || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (!touch) return;                         /* on a desktop keep the browser's own right-click menu */
    e.preventDefault();
    showPill(img, e.clientX || 0, e.clientY || 0);
  }, true);
  ['touchstart', 'scroll', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (pill && !(e.target && e.target.closest && e.target.closest('.dl-pill'))) hidePill(); }, { capture: true, passive: true });
  });

  window.QMImg = { download: download, ready: ready, isNative: isNative, candidates: candidates, _jobs: jobs };
})();
