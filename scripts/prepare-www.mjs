/* Copies the website (the static files at the repo root) into ./www, which is
   the folder Capacitor packs inside the Android app.

   - Nothing at the repo root is moved, changed or deleted. www/ is generated
     and git-ignored.
   - It leaves out things the app does not use (old versions of the site, big
     PDFs, the Vercel serverless function, the dropped assistant, build tools),
     so the APK stays small.
   - It fails loudly if something the site needs is missing. */
import { cpSync, rmSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const out = join(root, 'www');

/* Top-level names that are NOT part of the app. */
const EXCLUDE = new Set([
  '.git', '.github', '.gitignore', '.nojekyll', 'node_modules', 'www', 'android', 'scripts',
  'package.json', 'package-lock.json', 'capacitor.config.json',
  'api',               /* Vercel function; the app calls the hosted copy instead */
  'vercel.json', 'sitemap.xml', 'robots.txt', 'google1cf38d53a5ba1eb1.html',
  'tools',             /* SEO build script */
  'assistant', 'assistant-src',   /* the dropped on-device AI assistant (~51 MB) */
  'README.md', 'LICENSE', 'ANDROID-ADHAN.md', 'ANDROID-BUILD.md',
  'v1.html', 'v2.html', 'v3.html', 'v4.html', 'v5.html', 'v6.html',
  'old.Adil.MAAR.html', 'MAAR.TAST.html', 'tast.html', 'add-videos.html',
  'Quran.Arabic.pdf', 'Quran.Bangla.pdf', 'Quran.English.pdf',   /* only linked from the old site (~31 MB) */
  'image.png', 'logo-original-full.png', 'Quran.Maar.jpg', 'Quran.Maar2.jpg', 'og-image.png',
]);

/* Files the app cannot start without. */
const REQUIRED = [
  'index.html', 'app.js', 'adhan.js', 'customise.js', 'features.js', 'i18n.js', 'i18n-data.js', 'offline.js',
  'sw.js', 'manifest.json', 'offline.html', 'icon-192.png', 'icon-512.png',
  'vendor/react.production.min.js', 'vendor/react-dom.production.min.js', 'vendor/htm.js', 'vendor/leaflet.js',
  'adhan/Adan1.mp3', 'adhan/Adan2.mp3',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const name of readdirSync(root)) {
  if (EXCLUDE.has(name)) continue;
  cpSync(join(root, name), join(out, name), { recursive: true });
}

const missing = REQUIRED.filter((f) => !existsSync(join(out, f)));
if (missing.length) {
  console.error('prepare-www: missing required files:\n  ' + missing.join('\n  '));
  process.exit(1);
}

function size(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? size(p) : statSync(p).size;
  }
  return n;
}
console.log(`prepare-www: www/ ready (${(size(out) / 1048576).toFixed(1)} MB, ${readdirSync(out).length} top-level entries)`);
