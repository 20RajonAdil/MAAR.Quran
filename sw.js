/* ============================================================
   QURAN MAAR — Service Worker
   Offline-first PWA shell.

   THREE INDEPENDENT STORAGE GENERATIONS
   -------------------------------------
   1. qm-shell-<SHELL_VERSION>  Cache API. HTML/CSS/JS/icons/fonts/CDN libs.
   2. qm-data-<DATA_VERSION>    Cache API. Qur'an text, translations,
                                hadith, prayer-time JSON.
   3. IndexedDB "qm-offline"    User-downloaded recitation audio.

   The cleanup pass in `activate` ONLY ever deletes Cache Storage keys
   that begin with "qm-shell-" or "qm-data-" and do not match the
   current version. User audio lives in IndexedDB, which this worker
   never clears — so bumping SHELL_VERSION to ship an app update
   cannot delete a single downloaded surah. Shell and data versions are
   also separate, so a pure UI change doesn't force a re-download of
   the Qur'an text either.
   ============================================================ */

const SHELL_VERSION = 'v3';
const DATA_VERSION  = 'v1';

const SHELL_CACHE = `qm-shell-${SHELL_VERSION}`;
const DATA_CACHE  = `qm-data-${DATA_VERSION}`;

/* Caches this worker is allowed to delete. Anything not matching these
   prefixes is left completely alone. */
const MANAGED_PREFIXES = ['qm-shell-', 'qm-data-'];
const CURRENT_CACHES = [SHELL_CACHE, DATA_CACHE];

/* ---------- app shell ---------- */
const SHELL_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './app.js?v=17',
  './offline.js?v=1',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-16.png',
  './logo.png',
  './moon-photo.png',
  './cloud-photo.jpg',
  // third-party runtime dependencies — without these the app cannot boot offline
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/htm@3/dist/htm.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

/* ---------- request classification ---------- */
const AUDIO_HOSTS = ['cdn.islamic.network', 'archive.org', 'ia800', 'ia600', 'dn720'];
const DATA_HOSTS  = ['api.alquran.cloud', 'cdn.jsdelivr.net', 'api.aladhan.com'];
const FONT_HOSTS  = ['fonts.googleapis.com', 'fonts.gstatic.com'];
/* Location lookups must never be served stale — a cached answer would
   pin prayer times and the Qibla bearing to wherever the user last was. */
const NEVER_CACHE_HOSTS = ['ipapi.co', 'ipwho.is', 'api.bigdatacloud.net', 'nominatim.openstreetmap.org'];

const isAudio = (url) =>
  AUDIO_HOSTS.some((h) => url.hostname.includes(h)) || /\.(mp3|ogg|m4a)($|\?)/i.test(url.pathname);
const isData  = (url) => DATA_HOSTS.some((h) => url.hostname.includes(h));
const isFont  = (url) => FONT_HOSTS.some((h) => url.hostname.includes(h));

/* ============================================================
   Minimal IndexedDB reader — the SW needs to look up downloaded
   audio blobs saved by offline.js on the page side.
   ============================================================ */
const IDB_NAME = 'qm-offline';
const IDB_VERSION = 1;
const AUDIO_STORE = 'audio';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE, { keyPath: 'url' });
      if (!db.objectStoreNames.contains('meta'))      db.createObjectStore('meta',      { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv'))        db.createObjectStore('kv',        { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredAudio(url) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const rq = tx.objectStore(AUDIO_STORE).get(url);
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/* Audio elements (especially in Safari and on iOS) issue Range requests
   and will refuse to play a source that answers 200 to a Range ask.
   So a stored blob has to be sliced and returned as a real 206. */
function blobResponse(blob, request) {
  const type = blob.type || 'audio/mpeg';
  const range = request.headers.get('range');
  const total = blob.size;

  if (!range) {
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
        'X-QM-Source': 'offline-idb',
      },
    });
  }

  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end   = m && m[2] ? parseInt(m[2], 10) : total - 1;
  if (isNaN(start) || start < 0) start = 0;
  if (isNaN(end) || end >= total) end = total - 1;
  if (start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` },
    });
  }

  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'X-QM-Source': 'offline-idb',
    },
  });
}

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      /* Added one at a time: cache.addAll() rejects the whole install if
         any single URL 404s or a CDN is briefly unreachable, which would
         leave the user with no worker at all. */
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            const req = new Request(asset, { cache: 'reload' });
            const res = await fetch(req);
            if (res && (res.ok || res.type === 'opaque')) await cache.put(asset, res);
          } catch (e) {
            /* non-fatal — runtime caching will pick it up later */
          }
        })
      );
    })()
  );
});

/* ============================================================
   ACTIVATE — version sweep
   ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          const managed = MANAGED_PREFIXES.some((p) => key.startsWith(p));
          if (managed && !CURRENT_CACHES.includes(key)) return caches.delete(key);
          return Promise.resolve(false);
        })
      );
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch {}
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ shell: SHELL_VERSION, data: DATA_VERSION });
  }
  /* Lets the page force a fresh Qur'an-text pull without nuking audio. */
  if (data.type === 'CLEAR_DATA_CACHE') {
    event.waitUntil(caches.delete(DATA_CACHE));
  }
});

/* ============================================================
   STRATEGIES
   ============================================================ */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const fallback = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
    if (fallback) return fallback;
    throw e;
  }
}

/* Data is served instantly from cache while a fresh copy is fetched in the
   background, so an online user still gets updates without ever waiting. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (hit) return hit;
  const res = await network;
  if (res) return res;
  return new Response(JSON.stringify({ offline: true, error: 'Not available offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleNavigation(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch (e) {
    const cache = await caches.open(SHELL_CACHE);
    return (
      (await cache.match('./index.html')) ||
      (await cache.match('./')) ||
      (await cache.match('./offline.html')) ||
      new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } })
    );
  }
}

/* ============================================================
   FETCH
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (!/^https?:$/.test(url.protocol)) return;

  if (NEVER_CACHE_HOSTS.some((h) => url.hostname.includes(h))) return;

  /* 1. AUDIO — downloaded blobs win, always. Anything not downloaded
        simply streams from the network and is never auto-cached, so a
        casual listen can't silently eat the user's disk. */
  if (isAudio(url)) {
    event.respondWith(
      (async () => {
        const stored = await getStoredAudio(url.href);
        if (stored && stored.blob) return blobResponse(stored.blob, request);
        try {
          return await fetch(request);
        } catch (e) {
          return new Response('', { status: 504, statusText: 'Audio unavailable offline' });
        }
      })()
    );
    return;
  }

  /* 2. NAVIGATION */
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  /* 3. QUR'AN / HADITH / PRAYER-TIME DATA */
  if (isData(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  /* 4. FONTS + CDN LIBS */
  if (isFont(url) || url.hostname.includes('unpkg.com') || url.hostname.includes('cdnjs')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /* 5. OWN ASSETS */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
});
