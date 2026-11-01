# MAAR Islamic Assistant (source)

Compiled output lives in `../assistant/` (served by GitHub Pages at `/MAAR.Quran/assistant/`). The existing MAAR.Quran site is untouched.

## Build
```
cd assistant-src && npm install
python3 scripts/build-quran-data.py <path to risan/quran-json/data> public/data/quran   # regenerates verified data + checksums
npm test          # 40 unit/integration tests on the real Quran data
npm run build     # -> dist/ ; copy dist/* into ../assistant/
```
## How it works
Local AI: WebLLM (bundled from npm, no CDN) + WebGPU in a worker. Model weights are NOT in this repository; WebLLM downloads them once into the browser's Cache Storage (default Qwen2.5-3B-Instruct q4, or 1.5B on low-memory/mobile). The Quran/Hadith databases (IndexedDB) and the model are installed separately.
RAG: language detection → reference parsing / multilingual topic dictionary → MiniSearch (worker) → ranked, de-duplicated evidence → local model explains → citations rebuilt from database records; invented references and unsupported Hadith claims are removed.
Hadith: none bundled. Import via the Hadith tab (MAAR pack, hadith-api edition, hadith-json, or generic list). Records with no number are rejected; grades/authorities are never inferred; records are labelled graded / grade-without-authority / no grading.
Service worker (`assistant/sw.js`, scope `/assistant/` only) precaches the app shell. It never touches model downloads or the data files.
