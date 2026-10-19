#!/usr/bin/env python3
"""
Quran Maar — SEO page generator.

Builds one static, crawlable page for every surah (Arabic + English), a hub
page listing all 114, and a fresh sitemap.xml. Search engines can then index
and rank "Surah Yasin read online"-style searches, while the app itself stays
a JavaScript single-page app.

Usage (from the repo root):   python3 tools/build-seo.py
Moving to a custom domain?    change BASE below and run it again.

Text sources (downloaded from GitHub at build time):
  Arabic:  Uthmani Hafs        — fawazahmed0/quran-api  (ara-quranuthmanihaf)
  English: Saheeh International — fawazahmed0/quran-api  (eng-ummmuhammad)
"""
import json, os, html, urllib.request, datetime, shutil

BASE = 'https://20rajonadil.github.io/MAAR.Quran'     # no trailing slash
SRC = 'https://raw.githubusercontent.com/fawazahmed0/quran-api/1'
TODAY = datetime.date.today().isoformat()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NAMES = ["Al-Fatihah","Al-Baqarah","Ali 'Imran","An-Nisa","Al-Ma'idah","Al-An'am","Al-A'raf","Al-Anfal","At-Tawbah","Yunus","Hud","Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Ta-Ha","Al-Anbiya","Al-Hajj","Al-Mu'minun","An-Nur","Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-'Ankabut","Ar-Rum","Luqman","As-Sajdah","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir","Fussilat","Ash-Shura","Az-Zukhruf","Ad-Dukhan","Al-Jathiyah","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf","Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'ah","Al-Hadid","Al-Mujadila","Al-Hashr","Al-Mumtahanah","As-Saff","Al-Jumu'ah","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqah","Al-Ma'arij","Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyamah","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","'Abasa","At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiyah","Al-Fajr","Al-Balad","Ash-Shams","Al-Layl","Ad-Duha","Ash-Sharh","At-Tin","Al-'Alaq","Al-Qadr","Al-Bayyinah","Az-Zalzalah","Al-'Adiyat","Al-Qari'ah","At-Takathur","Al-'Asr","Al-Humazah","Al-Fil","Quraysh","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr","Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas"]
assert len(NAMES) == 114

# Other spellings people actually type into search.
ALIASES = {1:"Fatiha, Fateha, Al Fatiha, Surah Fatiha",2:"Baqara, Baqarah, Al Baqara",3:"Al Imran, Ali Imran, Aal-e-Imran",4:"Nisa, An Nisa",5:"Maidah, Al Maida",9:"Tawbah, Taubah, Bara'ah",12:"Yousuf, Yusuf",17:"Isra, Bani Israil",18:"Kahf, Al Kahf, Surah Kahf",19:"Maryam, Mariam",20:"Taha, Ta Ha",24:"Nur, An Noor",32:"Sajdah, As Sajda, Alif Lam Meem Sajdah",36:"Yasin, Yaseen, Ya Sin",55:"Rahman, Ar Rahman, Surah Rehman",56:"Waqiah, Waqia, Al Waqiah",67:"Mulk, Al Mulk, Tabarak",71:"Nuh, Noah",73:"Muzzammil",76:"Insan, Dahr",78:"Naba, Amma",87:"Ala, A'la",93:"Duha, Dhuha",94:"Inshirah, Alam Nashrah, Sharh",97:"Qadr, Laylat al-Qadr",99:"Zalzalah, Zilzal",100:"Adiyat",101:"Qariah",102:"Takathur",103:"Asr",104:"Humazah",105:"Fil",106:"Quraysh, Quraish",107:"Maun, Ma'un",108:"Kawthar, Kausar",109:"Kafirun, Kafiroon",110:"Nasr",111:"Masad, Lahab",112:"Ikhlas, Qul Huwa Allahu Ahad, Tawhid",113:"Falaq",114:"Nas, Naas"}
POPULAR = [1,2,18,36,55,56,67,78,112,113,114,19,12,97,93,94,108,109,110,103]

def get(path):
    with urllib.request.urlopen(f'{SRC}/{path}', timeout=60) as r:
        return json.load(r)

def slug(n):
    s = NAMES[n-1].lower().replace("'", '').replace(' ', '-')
    return f'{n}-{s}'

E = html.escape
def alt_list(n):
    return [a.strip() for a in ALIASES.get(n, '').split(',') if a.strip()]

FONTS = 'https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
CSS = """
:root{--bg:#0b0b0b;--ink:#f5f2ed;--muted:#a29c95;--crimson:#cf3342;--deep:#8b0d1a;--line:rgba(245,242,237,.1)}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(90% 60% at 50% -10%,rgba(139,13,26,.35),transparent 70%),var(--bg);color:var(--ink);font:16px/1.7 'Plus Jakarta Sans',system-ui,sans-serif}
a{color:inherit}.wrap{max-width:860px;margin:0 auto;padding:0 20px}
header.top{border-bottom:1px solid var(--line);background:rgba(11,11,11,.8);backdrop-filter:blur(10px);position:sticky;top:0;z-index:5}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-family:'Instrument Serif',serif;font-size:22px}.brand img{width:30px;height:30px;border-radius:8px}.brand b{color:var(--crimson);font-weight:400}
.btn{display:inline-block;padding:11px 22px;border-radius:999px;background:linear-gradient(135deg,var(--deep),var(--crimson));color:#fff;text-decoration:none;font-weight:600;font-size:14px;box-shadow:0 10px 30px -10px rgba(207,51,66,.7)}
.btn.ghost{background:rgba(245,242,237,.05);box-shadow:none;border:1px solid var(--line)}
nav.crumbs{font-size:13px;color:var(--muted);padding:22px 0 0}nav.crumbs a{text-decoration:none}nav.crumbs a:hover{color:var(--ink)}
h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(34px,6vw,54px);line-height:1.1;margin:14px 0 6px}
.ar-title{font-family:'Amiri Quran',serif;font-size:clamp(32px,6vw,48px);color:var(--crimson);margin:0}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 6px}.chip{padding:5px 14px;border:1px solid var(--line);border-radius:999px;font-size:13px;color:var(--muted)}
.also{color:var(--muted);font-size:14px;margin:6px 0 0}.cta{display:flex;flex-wrap:wrap;gap:12px;margin:22px 0 30px}
.bism{text-align:center;padding:26px 10px;margin:10px 0 26px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.bism .a{font-family:'Amiri Quran',serif;font-size:34px;line-height:1.9}.bism .e{color:var(--muted);font-size:14px;font-style:italic}
ol.verses{list-style:none;margin:0;padding:0}ol.verses li{padding:22px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:44px 1fr;gap:6px 14px}
.n{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:12px;color:var(--muted);text-decoration:none;margin-top:6px}.n:hover{border-color:var(--crimson);color:var(--ink)}
.ar{grid-column:2;margin:0;font-family:'Amiri Quran',serif;font-size:clamp(26px,4.4vw,34px);line-height:2.1;text-align:right}
.en{grid-column:2;margin:0;font-family:'Instrument Serif',serif;font-style:italic;font-size:19px;line-height:1.55;color:#e8e2da}
.pn{display:flex;justify-content:space-between;gap:12px;margin:34px 0}.pn a{flex:1;padding:16px 18px;border:1px solid var(--line);border-radius:16px;text-decoration:none;background:rgba(245,242,237,.03)}.pn small{display:block;color:var(--muted);font-size:12px}.pn .r{text-align:right}
h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:28px;margin:40px 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;list-style:none;padding:0;margin:0}.grid a{display:block;padding:12px 16px;border:1px solid var(--line);border-radius:14px;text-decoration:none;background:rgba(245,242,237,.03)}.grid a:hover{border-color:var(--crimson)}.grid small{color:var(--muted)}
footer{border-top:1px solid var(--line);margin-top:50px;padding:26px 0 50px;color:var(--muted);font-size:13px}footer a{text-decoration:underline}
@media(max-width:560px){ol.verses li{grid-template-columns:34px 1fr}}
"""

def head(title, desc, canon, depth, extra_ld):
    up = '../' * depth
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{canon}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="theme-color" content="#0b0b0b">
<link rel="icon" type="image/png" sizes="48x48" href="{up}favicon-48.png">
<link rel="icon" type="image/png" sizes="192x192" href="{up}icon-192.png">
<link rel="apple-touch-icon" href="{up}apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Quran Maar">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{BASE}/og-image.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{E(title)}">
<meta name="twitter:description" content="{E(desc)}">
<meta name="twitter:image" content="{BASE}/og-image.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{FONTS}" rel="stylesheet">
<script type="application/ld+json">{json.dumps(extra_ld, ensure_ascii=False)}</script>
<style>{CSS}</style>
</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="{up}" aria-label="Quran Maar home"><img src="{up}icon-192.png" alt="Quran Maar logo" width="30" height="30"><span>Quran <b>Maar</b></span></a>
<a class="btn ghost" href="{up}surah/">All surahs</a>
</div></header>
"""

FOOT = """<footer><div class="wrap">
<p><a href="{up}">Quran Maar</a> — a free, private companion for the Qur'an, Hadith and daily prayer. Arabic: Uthmani Hafs. English: Saheeh International.</p>
<p><a href="{up}surah/">All 114 surahs</a> · <a href="{up}?tab=hadith">Hadith</a> · <a href="{up}?tab=qibla">Qibla</a> · <a href="{up}?tab=daily">Daily goals</a> · <a href="{up}?tab=seerah">Seerah</a></p>
</div></footer>
</body></html>
"""

def breadcrumbs(items):
    return {"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":i+1,"name":n,"item":u} for i,(n,u) in enumerate(items)]}

def surah_page(n, ch, ar, en, nxt, prv):
    name, mean, arname = NAMES[n-1], ch['englishname'], ch['arabicname']
    rev = 'Meccan' if ch['revelation'].lower().startswith('mecc') else 'Medinan'
    count = len(ar)
    url = f'{BASE}/surah/{slug(n)}/'
    title = f'Surah {name} ({mean}) – Arabic & English | Quran Maar'
    desc = f'Read Surah {name} ({mean}) online — {count} verses, {rev}. Full Arabic text with English translation, plus audio recitation on Quran Maar.'
    al = alt_list(n)
    ld = {"@context":"https://schema.org","@graph":[
        {"@type":"WebPage","@id":url+"#page","url":url,"name":title,"description":desc,"inLanguage":["en","ar"],
         "isPartOf":{"@type":"WebSite","@id":BASE+"/#website","name":"Quran Maar","url":BASE+"/"},
         "primaryImageOfPage":{"@type":"ImageObject","url":BASE+"/og-image.png","width":1200,"height":630},
         "dateModified":TODAY,"breadcrumb":{"@id":url+"#breadcrumb"},
         "about":{"@type":"Thing","name":f"Surah {name}","alternateName":[arname]+al}},
        dict(breadcrumbs([("Quran Maar",BASE+"/"),("All surahs",BASE+"/surah/"),(f"Surah {name}",url)]), **{"@id":url+"#breadcrumb"}),
    ]}
    out = [head(title, desc, url, 2, ld)]
    out.append('<main class="wrap">')
    out.append(f'<nav class="crumbs" aria-label="Breadcrumb"><a href="../../">Quran Maar</a> › <a href="../">All surahs</a> › Surah {E(name)}</nav>')
    out.append(f'<h1>Surah {E(name)} <span style="color:var(--muted)">— {E(mean)}</span></h1>')
    out.append(f'<p class="ar-title" lang="ar" dir="rtl">{E(arname)}</p>')
    out.append(f'<div class="meta"><span class="chip">Surah {n} of 114</span><span class="chip">{count} verses</span><span class="chip">{rev}</span></div>')
    if al: out.append(f'<p class="also">Also searched as: {E(", ".join(al))}</p>')
    out.append(f'<div class="cta"><a class="btn" href="../../?tab=quran&amp;surah={n}">Listen &amp; read in the app</a><a class="btn ghost" href="../../?tab=quran">Search the Qur\'an</a></div>')
    if n not in (1, 9):
        out.append('<div class="bism"><div class="a" lang="ar" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div><div class="e">In the name of Allah, the Most Gracious, the Most Merciful</div></div>')
    out.append('<ol class="verses">')
    for a, e in zip(ar, en):
        v = a['verse']
        out.append(f'<li id="ayah-{v}"><a class="n" href="#ayah-{v}" aria-label="Verse {v}">{v}</a><p class="ar" lang="ar" dir="rtl">{E(a["text"])}</p><p class="en">{E(e["text"])}</p></li>')
    out.append('</ol>')
    pn = '<div class="pn">'
    pn += (f'<a href="../{slug(prv)}/"><small>← Previous</small>Surah {E(NAMES[prv-1])}</a>' if prv else '<span style="flex:1"></span>')
    pn += (f'<a class="r" href="../{slug(nxt)}/"><small>Next →</small>Surah {E(NAMES[nxt-1])}</a>' if nxt else '<span style="flex:1"></span>')
    out.append(pn + '</div>')
    out.append('<h2>Popular surahs</h2><ul class="grid">')
    for p in [x for x in POPULAR if x != n][:12]:
        out.append(f'<li><a href="../{slug(p)}/">{p}. {E(NAMES[p-1])}</a></li>')
    out.append('</ul></main>')
    out.append(FOOT.format(up='../../'))
    return '\n'.join(out)

def hub_page(info):
    url = f'{BASE}/surah/'
    title = 'All 114 Surahs of the Qur\'an – Read Online in Arabic & English | Quran Maar'
    desc = 'Browse all 114 surahs of the Holy Qur\'an. Read each surah in Arabic with an English translation, then listen to recitation on Quran Maar — free.'
    ld = {"@context":"https://schema.org","@graph":[
        {"@type":"CollectionPage","@id":url+"#page","url":url,"name":title,"description":desc,"inLanguage":"en",
         "isPartOf":{"@type":"WebSite","@id":BASE+"/#website","name":"Quran Maar","url":BASE+"/"},"dateModified":TODAY},
        {"@type":"ItemList","itemListElement":[{"@type":"ListItem","position":n,"name":f"Surah {NAMES[n-1]}","url":f"{BASE}/surah/{slug(n)}/"} for n in range(1,115)]},
        breadcrumbs([("Quran Maar",BASE+"/"),("All surahs",url)]),
    ]}
    out = [head(title, desc, url, 1, ld), '<main class="wrap">']
    out.append('<nav class="crumbs" aria-label="Breadcrumb"><a href="../">Quran Maar</a> › All surahs</nav>')
    out.append('<h1>All 114 surahs of the Qur\'an</h1>')
    out.append('<p class="also">Read every surah in Arabic with the English translation, then open the app to listen verse by verse.</p>')
    out.append('<div class="cta"><a class="btn" href="../?tab=quran">Open the Qur\'an in the app</a></div>')
    out.append('<ul class="grid">')
    for ch in info:
        n = ch['chapter']
        out.append(f'<li><a href="{slug(n)}/"><b>{n}. {E(NAMES[n-1])}</b><br><small>{E(ch["englishname"])} · {len(ch["verses"])} verses</small></a></li>')
    out.append('</ul></main>')
    out.append(FOOT.format(up='../'))
    return '\n'.join(out)

def sitemap(info):
    u = ['  <url>\n    <loc>%s/</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n    <image:image>\n      <image:loc>%s/og-image.png</image:loc>\n      <image:title>Quran Maar — Light, Time, Guidance</image:title>\n      <image:caption>Read the Qur\'an online with audio recitation, prayer times and Hadith</image:caption>\n    </image:image>\n    <image:image>\n      <image:loc>%s/logo.png</image:loc>\n      <image:title>Quran Maar logo</image:title>\n    </image:image>\n  </url>' % (BASE, TODAY, BASE, BASE),
         '  <url>\n    <loc>%s/surah/</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>' % (BASE, TODAY)]
    for ch in info:
        n = ch['chapter']
        u.append('  <url>\n    <loc>%s/surah/%s/</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>%s</priority>\n  </url>' % (BASE, slug(n), TODAY, '0.8' if n in POPULAR else '0.6'))
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset\n  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n\n' + '\n\n'.join(u) + '\n\n</urlset>\n'

def main():
    info = get('info.json')['chapters']
    ar = get('editions/ara-quranuthmanihaf.json')['quran']
    en = get('editions/eng-ummmuhammad.json')['quran']
    assert len(info) == 114 and len(ar) == len(en) == 6236
    out_dir = os.path.join(ROOT, 'surah')
    shutil.rmtree(out_dir, ignore_errors=True)
    for ch in info:
        n = ch['chapter']
        a = [x for x in ar if x['chapter'] == n]; e = [x for x in en if x['chapter'] == n]
        assert len(a) == len(e) == len(ch['verses'])
        d = os.path.join(out_dir, slug(n)); os.makedirs(d)
        with open(os.path.join(d, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(surah_page(n, ch, a, e, n+1 if n < 114 else None, n-1 if n > 1 else None))
    with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f: f.write(hub_page(info))
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f: f.write(sitemap(info))
    print('built 114 surah pages + hub + sitemap.xml')

if __name__ == '__main__':
    main()
