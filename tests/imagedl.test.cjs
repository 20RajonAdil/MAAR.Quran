/* Run:  npm i --no-save jsdom   then   node tests/imagedl.test.cjs
   Loads imagedl.js in a fake phone browser with a fake native plugin and checks the whole user flow. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), assert = require('assert');
const code = fs.readFileSync(path.join(__dirname, '..', 'imagedl.js'), 'utf8');
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function boot({ native = true, pingFails = false, url = 'https://localhost/' } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, calls = [], listeners = {};
  const plugin = {
    ping: () => (pingFails ? Promise.reject({ code: 'UNIMPLEMENTED' }) : Promise.resolve({ version: 1 })),
    addListener: (n, f) => { listeners[n] = f; },
    download: (a) => { calls.push(['download', a]); return plugin._dl(a); },
    _dl: (a) => Promise.resolve({ uri: 'content://media/external/images/media/7', name: (a.name || 'pic') + '.jpg', mime: 'image/jpeg', bytes: 1234, folder: 'Pictures/Quran Maar' }),
    cancel: (a) => { calls.push(['cancel', a]); return Promise.resolve(); },
    view: (a) => { calls.push(['view', a]); return Promise.resolve(); },
    share: (a) => { calls.push(['share', a]); return Promise.resolve(); },
    begin: () => Promise.resolve({ id: 'stage-1' }),
    append: (a) => { calls.push(['append', a.chunk.length]); return Promise.resolve(); },
  };
  w.Capacitor = { isNativePlatform: () => native, registerPlugin: () => plugin };
  w.matchMedia = () => ({ matches: native });
  w.eval(code);
  return { w, dom, plugin, calls, listeners, doc: w.document };
}
const toast = (d) => d.querySelector('.dl-toast');
const text = (e) => e.textContent.replace(/\s+/g, ' ');

const tests = {
  async 'YouTube thumbnails are upgraded to the biggest size, with fallbacks'() {
    const { w } = boot();
    assert.deepStrictEqual(Array.from(w.QMImg.candidates('https://i.ytimg.com/vi/DW-00ckCAPI/hqdefault.jpg')), [
      'https://i.ytimg.com/vi/DW-00ckCAPI/maxresdefault.jpg', 'https://i.ytimg.com/vi/DW-00ckCAPI/sddefault.jpg', 'https://i.ytimg.com/vi/DW-00ckCAPI/hqdefault.jpg']);
    assert.deepStrictEqual(Array.from(w.QMImg.candidates('https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj')), [
      'https://yt3.ggpht.com/abc=s0-c-k-c0x00ffffff-no-rj', 'https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj']);
    assert.deepStrictEqual(Array.from(w.QMImg.candidates('https://example.com/a.png')), ['https://example.com/a.png']);
  },

  async 'one tap: progress, then Saved with View and Share'() {
    const { w, plugin, calls, listeners, doc } = boot();
    let release; plugin._dl = (a) => new Promise((res) => { release = () => res({ uri: 'content://x/1', name: 'My video.jpg', mime: 'image/jpeg', bytes: 99, folder: 'Pictures/Quran Maar' }); });
    const p = w.QMImg.download({ src: 'https://i.ytimg.com/vi/DW-00ckCAPI/hqdefault.jpg', name: 'My video' });
    await tick(5);
    assert.strictEqual(toast(doc).getAttribute('data-state'), 'progress');
    const sent = calls.find((c) => c[0] === 'download')[1];
    assert.strictEqual(sent.urls[0], 'https://i.ytimg.com/vi/DW-00ckCAPI/maxresdefault.jpg');
    listeners.progress({ id: sent.id, received: 50, total: 200 });
    assert.ok(/25%/.test(text(toast(doc))), text(toast(doc)));
    release(); await p;
    const t = toast(doc);
    assert.strictEqual(t.getAttribute('data-state'), 'done');
    assert.ok(/Saved to your Gallery/.test(text(t)) && /Pictures\/Quran Maar/.test(text(t)));
    const btn = (l) => [...t.querySelectorAll('button')].find((b) => b.textContent === l);
    btn('View').click(); btn('Share').click(); await tick();
    assert.ok(calls.some((c) => c[0] === 'view' && c[1].uri === 'content://x/1' && c[1].mime === 'image/jpeg'));
    assert.ok(calls.some((c) => c[0] === 'share'));
  },

  async 'a second tap while downloading does not start a second download'() {
    const { w, plugin, calls, doc } = boot();
    let release; plugin._dl = () => new Promise((res) => { release = () => res({ uri: 'u', name: 'a.jpg', mime: 'image/jpeg', bytes: 1 }); });
    const a = w.QMImg.download({ src: 'https://example.com/a.jpg' }), b = w.QMImg.download({ src: 'https://example.com/a.jpg' });
    await tick(5); release(); await Promise.all([a, b]);
    assert.strictEqual(calls.filter((c) => c[0] === 'download').length, 1);
    assert.strictEqual(doc.querySelectorAll('.dl-toast').length, 1);
    // after it finished the same picture can be downloaded again
    plugin._dl = (x) => Promise.resolve({ uri: 'u2', name: 'a.jpg', mime: 'image/jpeg', bytes: 1 });
    await w.QMImg.download({ src: 'https://example.com/a.jpg' });
    assert.strictEqual(calls.filter((c) => c[0] === 'download').length, 2);
  },

  async 'failures show a friendly message and Try again works'() {
    const { w, plugin, calls, doc } = boot();
    plugin._dl = () => Promise.reject({ code: 'offline', message: 'No internet connection' });
    await w.QMImg.download({ src: 'https://example.com/a.jpg' });
    const t = toast(doc);
    assert.strictEqual(t.getAttribute('data-state'), 'error');
    assert.ok(/offline|internet/i.test(text(t)), text(t));
    plugin._dl = () => Promise.resolve({ uri: 'u', name: 'a.jpg', mime: 'image/jpeg', bytes: 1 });
    [...t.querySelectorAll('button')].find((b) => b.textContent === 'Try again').click();
    await tick(20);
    assert.strictEqual(calls.filter((c) => c[0] === 'download').length, 2);
    assert.strictEqual(doc.querySelector('.dl-toast[data-state=done]') !== null, true);
  },

  async 'each error code has its own plain-English message'() {
    for (const [code, re] of [['timeout', /timed out/], ['network', /interrupted/], ['not_found', /could not be found/], ['not_image', /not a picture/], ['storage', /space|saved/i]]) {
      const { w, plugin, doc } = boot();
      plugin._dl = () => Promise.reject({ code, message: '' });
      await w.QMImg.download({ src: 'https://example.com/' + code + '.jpg' });
      assert.ok(re.test(text(toast(doc))), code + ': ' + text(toast(doc)));
    }
  },

  async 'a picture bundled in the app is copied by its file path (no base64, no re-encoding)'() {
    const { w, calls } = boot();
    await w.QMImg.download({ src: 'daily-ayah-img/sunset-arch.jpg', name: 'Sunset' });
    const a = calls.find((c) => c[0] === 'download')[1];
    assert.strictEqual(a.assetPath, 'daily-ayah-img/sunset-arch.jpg');
    assert.ok(!a.urls && !a.stageId);
  },

  async 'a picture the page made (blob) is sent in small pieces, then filed'() {
    const { w, calls } = boot();
    const blob = new w.Blob([new Uint8Array(500000).fill(7)], { type: 'image/jpeg' });
    await w.QMImg.download({ blob, name: 'ayah-card' });
    const chunks = calls.filter((c) => c[0] === 'append');
    assert.ok(chunks.length >= 3, 'chunks: ' + chunks.length);
    assert.ok(chunks.every((c) => c[1] <= 196608 && c[1] > 0));
    const a = calls.find((c) => c[0] === 'download')[1];
    assert.strictEqual(a.stageId, 'stage-1');
    assert.strictEqual(a.mime, 'image/jpeg');
  },

  async 'cancel button asks the phone to stop and removes the card'() {
    const { w, plugin, calls, doc } = boot();
    plugin._dl = (a) => new Promise((_, rej) => { plugin._stop = () => rej({ code: 'cancelled', message: 'x' }); });
    const p = w.QMImg.download({ src: 'https://example.com/big.jpg' });
    await tick(5);
    [...toast(doc).querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
    assert.ok(calls.some((c) => c[0] === 'cancel'));
    plugin._stop(); await p; await tick(300);
    assert.strictEqual(doc.querySelectorAll('.dl-toast').length, 0);
  },

  async 'an older app build without the plugin falls back to a normal browser download'() {
    const { w, doc } = boot({ pingFails: true });
    const png = new w.Blob([new Uint8Array(10)], { type: 'image/png' });
    w.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(png) });
    w.URL.createObjectURL = () => 'blob:fake'; w.URL.revokeObjectURL = () => {};
    let clicked; w.HTMLAnchorElement.prototype.click = function () { clicked = { download: this.download, href: this.href }; };
    await w.QMImg.download({ src: 'https://example.com/pic.png', name: 'pic' });
    assert.deepStrictEqual(clicked, { download: 'pic.png', href: 'blob:fake' });
    assert.strictEqual(toast(doc).getAttribute('data-state'), 'done');
  },

  async 'website: the real file type decides the extension'() {
    const { w } = boot({ native: false, url: 'https://20rajonadil.github.io/MAAR.Quran/' });
    const webp = new w.Blob([new Uint8Array(10)], { type: 'image/webp' });
    w.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(webp) });
    w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
    let clicked; w.HTMLAnchorElement.prototype.click = function () { clicked = this.download; };
    await w.QMImg.download({ src: 'daily-ayah-img/a.jpg', name: 'Card.jpg' });
    assert.strictEqual(clicked, 'Card.webp');
  },

  async 'long-press on a picture offers Download image; tiny icons are ignored'() {
    const { w, calls, doc } = boot();
    const big = doc.createElement('img'); big.src = 'https://i.ytimg.com/vi/DW-00ckCAPI/hqdefault.jpg'; big.alt = 'Thumb';
    const tiny = doc.createElement('img'); tiny.src = 'https://example.com/i.png';
    big.getBoundingClientRect = () => ({ width: 300, height: 200 }); tiny.getBoundingClientRect = () => ({ width: 20, height: 20 });
    doc.body.append(big, tiny);
    const ev = (t) => { const e = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 300 }); t.dispatchEvent(e); return e; };
    assert.strictEqual(ev(tiny).defaultPrevented, false);
    assert.strictEqual(doc.querySelector('.dl-pill'), null);
    assert.strictEqual(ev(big).defaultPrevented, true);
    doc.querySelector('.dl-pill-btn').click(); await tick(20);
    assert.ok(calls.some((c) => c[0] === 'download' && c[1].urls[0].includes('maxresdefault')));
    assert.strictEqual(doc.querySelector('.dl-pill'), null);
  },

  async 'bad input is reported, not thrown'() {
    const { w, doc } = boot();
    const r = await w.QMImg.download({ src: 'javascript:alert(1)' });
    assert.strictEqual(r, null);
    assert.ok(/not supported|not valid/i.test(text(toast(doc))));
  },
};

(async () => {
  let fail = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
  }
  console.log(fail ? `\n${fail} failed` : `\nall ${Object.keys(tests).length} passed`);
  process.exit(fail ? 1 : 0);
})();
