// Generates dist/sw.js: precaches the built app shell. Quran/Hadith data lives in IndexedDB; model weights live in WebLLM's own Cache Storage.
import { readdirSync, statSync, writeFileSync, readFileSync } from 'fs'; import { join, relative } from 'path'; import { createHash } from 'crypto';
const dist = new URL('../dist/', import.meta.url).pathname; const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (relative(dist, p).startsWith('data')) continue; walk(p); } else if (f !== 'sw.js') files.push(relative(dist, p)); } })(dist);
const hash = createHash('sha256'); for (const f of files.sort()) hash.update(f).update(readFileSync(join(dist, f))); const v = hash.digest('hex').slice(0, 12);
const urls = ['./', ...files.map(f => './' + f)];
writeFileSync(join(dist, 'sw.js'), `/* MAAR Islamic Assistant service worker. Scope: this /assistant/ folder only. Version ${v} */
const SHELL = 'maar-assistant-shell-${v}'; const PREFIX = 'maar-assistant-shell-'; const URLS = ${JSON.stringify(urls)};
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => Promise.all(URLS.map(u => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.origin !== location.origin) return;               // never touch model downloads (WebLLM manages its own cache)
  if (!u.pathname.startsWith(new URL('./', location).pathname)) return;
  if (u.pathname.includes('/data/')) return;               // data is stored in IndexedDB by the app, with checksum verification
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || (r.mode === 'navigate' ? caches.match('./') : null) || fetch(r)));
});
`); console.log('sw.js written:', urls.length, 'files, version', v);
