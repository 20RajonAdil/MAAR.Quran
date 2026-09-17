/* ============================================================
   QURAN MAAR — offline.js
   Download manager + persistent storage layer.

   Loaded as a classic script BEFORE app.js, exposing window.QMOffline.

   Audio blobs live in IndexedDB rather than the Cache API on purpose:
   Cache Storage is swept by version in sw.js, whereas this database is
   never touched by an app update. A user who has downloaded 40 surahs
   keeps all 40 across every future release.
   ============================================================ */
(function () {
  'use strict';

  const DB_NAME = 'qm-offline';
  const DB_VERSION = 1;
  const AUDIO_STORE = 'audio';   // { url, blob, size, id }
  const META_STORE  = 'meta';    // { id, reciterId, surahNumber, urls[], bytes, files, date }
  const KV_STORE    = 'kv';      // { key, value }

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          const s = db.createObjectStore(AUDIO_STORE, { keyPath: 'url' });
          s.createIndex('id', 'id', { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(KV_STORE))   db.createObjectStore(KV_STORE,   { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(store, mode);
          const os = t.objectStore(store);
          let out;
          try { out = fn(os); } catch (e) { reject(e); return; }
          t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  const idbGet    = (store, key) => tx(store, 'readonly',  (os) => os.get(key));
  const idbPut    = (store, val) => tx(store, 'readwrite', (os) => os.put(val));
  const idbDelete = (store, key) => tx(store, 'readwrite', (os) => os.delete(key));
  const idbAll    = (store)      => tx(store, 'readonly',  (os) => os.getAll());

  /* ---------- tiny event bus so React can re-render on change ---------- */
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch {} });

  /* ---------- persistent-storage request ----------
     Without this, browsers treat the origin as "best effort" and may
     evict downloads under disk pressure. Chromium usually grants it
     silently once the PWA is installed or engaged with. */
  async function requestPersistence() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return false;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }

  async function estimate() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return null;
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0 };
    } catch {
      return null;
    }
  }

  /* ============================================================
     DOWNLOADS
     ============================================================ */
  const downloadId = (reciterId, surahNumber) => `${reciterId}:${surahNumber}`;

  const active = new Map(); // id -> { cancelled }

  /* Streams a single file, reporting byte progress as it arrives so the
     UI can show real movement on long surahs rather than a dead bar. */
  async function fetchBlob(url, onBytes, signalObj) {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (!res.body || typeof res.body.getReader !== 'function') {
      const b = await res.blob();
      onBytes && onBytes(b.size);
      return b;
    }

    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      if (signalObj && signalObj.cancelled) { try { reader.cancel(); } catch {} throw new Error('cancelled'); }
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      onBytes && onBytes(value.byteLength);
    }
    return new Blob(chunks, { type: res.headers.get('content-type') || 'audio/mpeg' });
  }

  /**
   * Download one recitation.
   * @param {object} opts
   *   id, reciterId, reciterName, surahNumber, surahName, surahEnglish,
   *   urls: string[]  (1 file for surah-only reciters, N for per-ayah)
   *   onProgress: ({done, total, bytes, phase}) => void
   */
  async function downloadRecitation(opts) {
    const { reciterId, surahNumber, urls } = opts;
    const id = downloadId(reciterId, surahNumber);
    if (active.has(id)) throw new Error('Already downloading');

    const state = { cancelled: false };
    active.set(id, state);
    emit();

    let bytes = 0;
    let stored = 0;
    const storedUrls = [];
    const failures = [];

    try {
      await requestPersistence();

      for (let i = 0; i < urls.length; i++) {
        if (state.cancelled) throw new Error('cancelled');
        const url = urls[i];
        try {
          const blob = await fetchBlob(url, (n) => {
            bytes += n;
            opts.onProgress && opts.onProgress({ done: stored, total: urls.length, bytes, phase: 'downloading' });
          }, state);
          await idbPut(AUDIO_STORE, { url, blob, size: blob.size, id });
          storedUrls.push(url);
          stored++;
          opts.onProgress && opts.onProgress({ done: stored, total: urls.length, bytes, phase: 'downloading' });
        } catch (err) {
          if (String(err && err.message) === 'cancelled') throw err;
          failures.push({ url, error: String(err && err.message || err) });
        }
      }

      if (!storedUrls.length) {
        throw new Error(
          failures.length
            ? `Could not download any audio (${failures[0].error}). The host may be blocking cross-origin downloads.`
            : 'Nothing to download'
        );
      }

      const record = {
        id,
        reciterId,
        reciterName: opts.reciterName || reciterId,
        surahNumber,
        surahName: opts.surahName || '',
        surahEnglish: opts.surahEnglish || '',
        urls: storedUrls,
        files: storedUrls.length,
        expected: urls.length,
        bytes,
        partial: storedUrls.length < urls.length,
        date: Date.now(),
      };
      await idbPut(META_STORE, record);
      emit();
      return record;
    } catch (err) {
      // roll back anything written during a cancelled/failed run
      for (const u of storedUrls) { try { await idbDelete(AUDIO_STORE, u); } catch {} }
      throw err;
    } finally {
      active.delete(id);
      emit();
    }
  }

  function cancelDownload(id) {
    const s = active.get(id);
    if (s) s.cancelled = true;
  }

  async function deleteDownload(id) {
    const meta = await idbGet(META_STORE, id);
    if (meta && Array.isArray(meta.urls)) {
      for (const u of meta.urls) { try { await idbDelete(AUDIO_STORE, u); } catch {} }
    }
    await idbDelete(META_STORE, id);
    emit();
  }

  async function deleteAllDownloads() {
    const all = (await idbAll(META_STORE)) || [];
    for (const m of all) await deleteDownload(m.id);
    await tx(AUDIO_STORE, 'readwrite', (os) => os.clear()); // sweep any orphans
    emit();
  }

  async function listDownloads() {
    const all = (await idbAll(META_STORE)) || [];
    return all.sort((a, b) => b.date - a.date);
  }

  async function getBlobURL(url) {
    const rec = await idbGet(AUDIO_STORE, url);
    if (!rec || !rec.blob) return null;
    return URL.createObjectURL(rec.blob);
  }

  async function isDownloaded(reciterId, surahNumber) {
    const m = await idbGet(META_STORE, downloadId(reciterId, surahNumber));
    return !!m;
  }

  /* ============================================================
     QUR'AN TEXT — warm the SW data cache for all 114 surahs.
     These go through plain fetch() so sw.js stores them in
     qm-data-<version>, which survives shell upgrades.
     ============================================================ */
  async function cacheQuranText(opts) {
    const api = opts.api;
    const arabicEdition = opts.arabicEdition;
    const translationEdition = opts.translationEdition;
    const onProgress = opts.onProgress || (() => {});
    const state = { cancelled: false };
    cacheQuranText.cancel = () => { state.cancelled = true; };

    await fetch(`${api}/surah`).catch(() => {});

    let done = 0;
    const total = 114;
    const CONCURRENCY = 4; // polite to the API, still fast
    let cursor = 1;

    async function worker() {
      for (;;) {
        if (state.cancelled) return;
        const n = cursor++;
        if (n > total) return;
        try {
          await Promise.all([
            fetch(`${api}/surah/${n}/${arabicEdition}`),
            fetch(`${api}/surah/${n}/${translationEdition}`),
          ]);
        } catch {}
        done++;
        onProgress({ done, total });
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await idbPut(KV_STORE, {
      key: 'quranTextCached',
      value: { at: Date.now(), translationEdition, complete: !state.cancelled },
    });
    emit();
    return { complete: !state.cancelled };
  }

  async function quranTextStatus() {
    const rec = await idbGet(KV_STORE, 'quranTextCached');
    return rec ? rec.value : null;
  }

  function formatBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  window.QMOffline = {
    downloadId,
    downloadRecitation,
    cancelDownload,
    deleteDownload,
    deleteAllDownloads,
    listDownloads,
    isDownloaded,
    getBlobURL,
    estimate,
    requestPersistence,
    cacheQuranText,
    quranTextStatus,
    formatBytes,
    activeDownloads: () => Array.from(active.keys()),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
