#!/usr/bin/env python3
"""Builds compact Quran data files from a checkout of risan/quran-json.
Text is copied VERBATIM (Tanzil: no changes allowed; QuranEnc: no modification/addition/deletion).
Usage: build-quran-data.py <quran-json/data dir> <out dir>"""
import json, sys, os, hashlib
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out + '/translations', exist_ok=True); os.makedirs(out + '/footnotes', exist_ok=True)
J = lambda p: json.load(open(os.path.join(src, p), encoding='utf-8'))
W = lambda p, o: open(os.path.join(out, p), 'w', encoding='utf-8').write(json.dumps(o, ensure_ascii=False, separators=(',', ':')))
chapters = J('tanzil/chapters.json')['chapters']
counts = [c['total_verses'] for c in chapters]
assert len(chapters) == 114 and sum(counts) == 6236
JUZ = [(1,1),(2,142),(2,253),(3,93),(4,24),(4,148),(5,82),(6,111),(7,88),(8,41),(9,93),(11,6),(12,53),(15,1),(17,1),(18,75),(21,1),(23,1),(25,21),(27,56),(29,46),(33,31),(36,28),(39,32),(41,47),(46,1),(51,31),(58,1),(67,1),(78,1)]
for s, a in JUZ: assert 1 <= a <= counts[s-1]
starts, acc = [], 0
for c in counts: starts.append(acc); acc += c
juz_idx = [starts[s-1] + a - 1 for s, a in JUZ]
def flat(d, what=''):
    arr, fn = [], {}
    for s in range(1, 115):
        vs = d[str(s)]
        assert len(vs) == counts[s-1], f'{what}: surah {s} has {len(vs)} verses, expected {counts[s-1]}'
        for i, v in enumerate(vs):
            assert v['chapter'] == s and v['verse'] == i + 1, f'{what}: misaligned {s}:{i+1}'
            arr.append(v['text'])
            if v.get('footnotes'): fn[len(arr) - 1] = v['footnotes']
    return arr, fn
ar, _ = flat(J('tanzil/uthmani.json'), 'uthmani')
arc, _ = flat(J('tanzil/simple-clean.json'), 'simple-clean')
W('arabic.json', ar); W('arabic-search.json', arc)
W('chapters.json', {'chapters': [{'n': c['id'], 'ar': c['name'], 'tr': c['transliteration'], 'en': c['translation'], 'type': c['type'], 'verses': c['total_verses'], 'start': starts[i]} for i, c in enumerate(chapters)], 'juzStart': juz_idx})
src_meta = {e['path']: e for e in J('meta/sources.json')}
LANGS = {'english_saheeh': ('en', 'English'), 'bengali_zakaria': ('bn', 'বাংলা'), 'urdu_junagarhi': ('ur', 'اردو'),
 'hindi_omari': ('hi', 'हिन्दी'), 'turkish_shaban': ('tr', 'Türkçe'), 'indonesian_affairs': ('id', 'Bahasa Indonesia'),
 'malay_basumayyah': ('ms', 'Bahasa Melayu'), 'persian_ih': ('fa', 'فارسی'), 'french_hameedullah': ('fr', 'Français'),
 'spanish_garcia': ('es', 'Español'), 'german_bubenheim': ('de', 'Deutsch'), 'portuguese_nasr': ('pt', 'Português'),
 'swahili_abubakr': ('sw', 'Kiswahili'), 'russian_aboadel': ('ru', 'Русский'), 'chinese_makin': ('zh', '中文')}
trs = []
for key, (lang, label) in LANGS.items():
    d = J(f'quranenc/{key}.json'); arr, fn = flat(d, key)
    m = src_meta[f'data/quranenc/{key}.json']; sm = m['source_metadata']
    W(f'translations/{key}.json', arr)
    if fn: W(f'footnotes/{key}.json', fn)
    trs.append({'key': key, 'lang': lang, 'label': label, 'title': sm['title'], 'version': sm['version'], 'direction': sm['direction'],
        'browse_url': sm['browse_url'], 'terms_url': sm['terms_url'], 'license': m['license'], 'has_footnotes': bool(fn),
        'file': f'translations/{key}.json', 'bytes': os.path.getsize(f'{out}/translations/{key}.json')})
tz = src_meta['data/tanzil/uthmani.json']
manifest = {'schema': 'maar-quran-data/1', 'dataVersion': 1, 'ayahCount': 6236, 'surahCount': 114, 'numbering': 'Hafs (Madinah mushaf), 6,236 ayat',
  'arabic': {'source': 'Tanzil Project (tanzil.net), Uthmani text', 'license': tz['license'], 'license_url': tz['license_url'], 'files': ['arabic.json', 'arabic-search.json'],
             'note': 'arabic.json is the Uthmani text, unmodified. arabic-search.json is the Tanzil simple-clean variant, also unmodified, used only for matching.'},
  'distribution': {'repository': 'https://github.com/risan/quran-json', 'repository_license': "CC BY-SA 4.0 (applies to the repository's own work; each text keeps its original licence listed here)"},
  'translations': trs}
files = {}
for root, _, fs in os.walk(out):
    for f in fs:
        if f == 'manifest.json': continue
        p = os.path.join(root, f); files[os.path.relpath(p, out)] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
manifest['sha256'] = dict(sorted(files.items()))
W('manifest.json', manifest)
print('ok', len(trs), 'translations;', sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(out) for f in fs) // 1024, 'KB total')
