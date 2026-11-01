/* MAAR Islamic Assistant service worker. Scope: this /assistant/ folder only. Version c90e0d0fe7ea */
const SHELL = 'maar-assistant-shell-c90e0d0fe7ea'; const PREFIX = 'maar-assistant-shell-'; const URLS = ["./","./assets/amiri-arabic-400-normal-D0NIBXga.woff2","./assets/amiri-arabic-700-normal-D8FrblyB.woff2","./assets/index-BnEpu4XB.js","./assets/index-CCO6S5E8.css","./assets/modelWorker-D9qHDDSs.js","./assets/searchWorker-BRZztfM7.js","./index.html"];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => Promise.all(URLS.map(u => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.origin !== location.origin) return;               // never touch model downloads (WebLLM manages its own cache)
  if (!u.pathname.startsWith(new URL('./', location).pathname)) return;
  if (u.pathname.includes('/data/')) return;               // data is stored in IndexedDB by the app, with checksum verification
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || (r.mode === 'navigate' ? caches.match('./') : null) || fetch(r)));
});
