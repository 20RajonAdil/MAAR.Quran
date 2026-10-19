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
<p><a href="{up}surah/">All 114 surahs</a> · <a href="{up}ayat-al-kursi/">Ayat al-Kursi</a> · <a href="{up}duas/">Duas from the Qur'an</a> · <a href="{up}prayer-times/">Prayer times</a> · <a href="{up}qibla/">Qibla</a> · <a href="{up}hadith/">Hadith</a> · <a href="{up}seerah/">Seerah</a> · <a href="{up}hijri-calendar/">Hijri calendar</a> · <a href="{up}daily-goals/">Daily goals</a> · <a href="{up}hifz/">Hifz helper</a></p>
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

# ---------------------------------------------------------------------------
# Guide pages (features, duas, Ayat al-Kursi). Each has real, specific content.
# ---------------------------------------------------------------------------
DUA_GROUPS = [
 ("Forgiveness",[("7:23","Adam and Hawwa"),("3:16","The believers"),("14:41","Ibrahim"),("71:28","Nuh"),("3:147","The believers before us")]),
 ("Guidance",[("1:6","Al-Fatihah"),("3:8","The people of knowledge"),("3:193","The believers"),("18:10","The People of the Cave"),("20:114","For knowledge")]),
 ("Family",[("25:74","Servants of the Most Merciful"),("46:15","A believer at forty"),("14:40","Ibrahim"),("3:38","Zakariya"),("17:24","For our parents"),("2:128","Ibrahim and Ismail")]),
 ("Hardship and relief",[("21:87","Yunus"),("21:83","Ayyub"),("28:24","Musa"),("20:25","Musa"),("2:250","Believers facing trial")]),
 ("This life and the next",[("2:201","Rabbana atina"),("2:286","End of Al-Baqarah"),("17:80","Entering and leaving"),("23:29","Nuh"),("23:97","Seeking refuge")]),
]
EXTRA_URLS = []
MUTED = 'style="color:#a29c95"'

def simple_page(path, title, desc, h1, lead, body, crumb):
    url = f'{BASE}/{path}/'
    ld = {"@context":"https://schema.org","@graph":[
        {"@type":"WebPage","@id":url+"#page","url":url,"name":title,"description":desc,"inLanguage":"en",
         "isPartOf":{"@type":"WebSite","@id":BASE+"/#website","name":"Quran Maar","url":BASE+"/"},
         "primaryImageOfPage":{"@type":"ImageObject","url":BASE+"/og-image.png","width":1200,"height":630},
         "dateModified":TODAY,"breadcrumb":{"@id":url+"#breadcrumb"}},
        dict(breadcrumbs([("Quran Maar",BASE+"/"),(crumb,url)]), **{"@id":url+"#breadcrumb"}),
    ]}
    out = [head(title, desc, url, 1, ld), '<main class="wrap">',
           f'<nav class="crumbs" aria-label="Breadcrumb"><a href="../">Quran Maar</a> › {E(crumb)}</nav>',
           f'<h1>{E(h1)}</h1>', f'<p class="also" style="font-size:17px">{E(lead)}</p>', body, '</main>', FOOT.format(up='../')]
    d = os.path.join(ROOT, path); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'index.html'), 'w', encoding='utf-8') as f: f.write('\n'.join(out))
    EXTRA_URLS.append(url)

def cta(tab, label):
    return f'<div class="cta"><a class="btn" href="../?tab={tab}">{E(label)}</a><a class="btn ghost" href="../surah/">Read the surahs</a></div>'
def bullets(items):
    return '<ul style="padding-left:20px;color:#e8e2da">' + ''.join(f'<li style="margin:6px 0">{i}</li>' for i in items) + '</ul>'
def para(t): return f'<p {MUTED}>{t}</p>'

def verse(ar, en, ref):
    c, v = (int(x) for x in ref.split(':'))
    a = next(x for x in ar if x['chapter']==c and x['verse']==v); e = next(x for x in en if x['chapter']==c and x['verse']==v)
    return a['text'], e['text']

def build_guides(ar, en, info):
    # ---- Duas from the Qur'an ----
    body = [para("Each dua below is a verse of the Qur'an, shown in Arabic with the English meaning. Tap the reference to read it in context.")]
    total = 0
    for grp, items in DUA_GROUPS:
        body.append(f'<h2>{E(grp)}</h2><ol class="verses">')
        for ref, note in items:
            a, e = verse(ar, en, ref); c, v = ref.split(':'); total += 1
            body.append(f'<li id="dua-{c}-{v}"><a class="n" href="../surah/{slug(int(c))}/#ayah-{v}" aria-label="Open {ref}" style="width:auto;padding:0 10px;border-radius:999px">{ref}</a><p class="ar" lang="ar" dir="rtl">{E(a)}</p><p class="en">{E(e)}</p><p class="also" style="grid-column:2;margin:0">{E(note)} · Surah {E(NAMES[int(c)-1])}</p></li>')
        body.append('</ol>')
    body.append(cta('daily', 'Listen to these duas in the app'))
    simple_page('duas', "Duas from the Qur'an – Arabic & English | Quran Maar",
        f"{total} duas taken from the Qur'an for forgiveness, guidance, family, hardship and this life and the next — Arabic text with English meaning.",
        "Duas from the Qur'an", "Words Allah taught us to ask with — Arabic text and English meaning.", '\n'.join(body), "Duas from the Qur'an")

    # ---- Ayat al-Kursi ----
    a, e = verse(ar, en, '2:255')
    body = (para("Ayat al-Kursi, the Throne Verse, is verse 255 of Surah Al-Baqarah, the second chapter of the Qur'an. It is among the most widely memorised and recited verses.")
        + f'<ol class="verses"><li id="ayah-255"><a class="n" href="../surah/2-al-baqarah/#ayah-255" aria-label="Open in Surah Al-Baqarah">255</a><p class="ar" lang="ar" dir="rtl">{E(a)}</p><p class="en">{E(e)}</p></li></ol>'
        + para('Read it in context: <a href="../surah/2-al-baqarah/#ayah-255">Surah Al-Baqarah, verse 255</a>. You can also practise memorising it with the <a href="../hifz/">Hifz helper</a>.')
        + '<div class="cta"><a class="btn" href="../?tab=quran&amp;surah=2">Listen in the app</a><a class="btn ghost" href="../surah/2-al-baqarah/">Read Surah Al-Baqarah</a></div>')
    simple_page('ayat-al-kursi', 'Ayat al-Kursi (Throne Verse) – Arabic & English | Quran Maar',
        "Ayat al-Kursi, the Throne Verse (Qur'an 2:255): full Arabic text with English translation. Read it online or listen to recitation on Quran Maar.",
        'Ayat al-Kursi — the Throne Verse', "Qur'an 2:255, in Arabic with the English meaning.", body, 'Ayat al-Kursi')

    # ---- Feature pages ----
    simple_page('prayer-times', 'Prayer Times Today – Fajr, Dhuhr, Asr, Maghrib, Isha | Quran Maar',
        "See today's prayer times for your location with a live countdown to the next prayer. Free, private, and works offline with an estimate.",
        'Prayer times for your location', 'Fajr, Dhuhr, Asr, Maghrib and Isha — worked out for where you are, with a live countdown.',
        para("Quran Maar shows the five daily prayer times for your location and counts down to the next one. A ring fills as the prayer approaches, and its colours follow the part of the day, from pre-dawn to night.")
        + bullets(['Allow your location once and the times update for where you are.', 'If you are offline, the app calculates an estimate on your device and tells you it is an estimate.', 'During Ramadan the home page also counts down to suhoor and iftar.', 'Your location is used only to work out the times.'])
        + para("Times are calculated and can differ by a few minutes from your local mosque, so follow your mosque's timetable where it publishes one.") + cta('home', 'Open prayer times'), 'Prayer times')
    simple_page('qibla', 'Qibla Finder – Direction of the Kaaba | Quran Maar',
        'Find the Qibla direction from where you are with a live map pointed at the Kaaba in Makkah. Free and private.',
        'Qibla finder', 'Find the direction of the Kaaba in Makkah from wherever you are.',
        para("The Qibla page shows a map with a line from your location to the Kaaba, so you can see the direction to face for prayer.")
        + bullets(['Works from any place in the world.', 'Shows your position and the Kaaba on one map.', 'Uses your location only on your device.']) + cta('qibla', 'Open the Qibla finder'), 'Qibla finder')
    simple_page('hadith', 'Hadith Collections – Bukhari, Muslim & More, Free | Quran Maar',
        "Read six major hadith collections online — Sahih al-Bukhari, Sahih Muslim, Abu Dawood, At-Tirmidhi, An-Nasa'i and Ibn Majah — with translations in nine languages and bookmarks.",
        'Hadith collections', 'Six major collections, translated into nine languages, with bookmarking.',
        para('Browse the sayings and actions of the Prophet Muhammad (peace be upon him) in six well-known collections:')
        + bullets(['Sahih al-Bukhari', 'Sahih Muslim', 'Sunan Abi Dawood', 'Jami at-Tirmidhi', "Sunan an-Nasa'i", 'Sunan Ibn Majah'])
        + para('Pick a language where the collection is available, search, and save the hadith you want to come back to. Bookmarks stay on your device.') + cta('hadith', 'Open the Hadith collections'), 'Hadith')
    simple_page('seerah', 'Seerah of Prophet Muhammad – 11-Part Video Series | Quran Maar',
        'Watch the Seerah of Prophet Muhammad (peace be upon him) in 11 parts, in order, on Quran Maar. Track the parts you have watched and carry on where you left off.',
        'The Seerah of Prophet Muhammad', 'The life of the Prophet, told in order across 11 parts.',
        para('The Seerah tab gathers all 11 parts in one place, from Part 1 to the final part. Press Continue to pick up at the next part you have not watched, and use Next part to move straight on. Your progress is saved on your device.')
        + bullets([f'Part {i}' + (' (final part)' if i == 11 else '') for i in range(1, 12)]) + cta('seerah', 'Watch the Seerah'), 'Seerah')
    simple_page('hijri-calendar', 'Hijri Calendar – Islamic Dates, Ramadan & Eid | Quran Maar',
        'A Hijri calendar with Ramadan, Eid, the Day of Arafah, Ashura and the White Days marked, plus countdowns to the next events.',
        'Hijri calendar', 'Islamic and Gregorian dates side by side, with the main events marked.',
        para('Move through the months and see each Gregorian date with its Hijri date underneath. Ramadan, Eid al-Fitr, the Day of Arafah, Eid al-Adha, Ashura, the Islamic New Year and the White Days are marked, and a Coming up list counts the days to the next ones.')
        + bullets(['Fridays are highlighted.', 'The last ten nights of Ramadan, and the odd nights, are marked.', 'Close to Ramadan, the home page counts down to the first day.'])
        + para('Dates are calculated, so they can differ by a day from the moon sighting in your area. Islamic days begin at Maghrib.') + cta('daily', 'Open the Hijri calendar'), 'Hijri calendar')
    simple_page('daily-goals', "Daily Islamic Goals & Qur'an Khatam Planner | Quran Maar",
        "A daily checklist of good deeds with a streak, plus a Qur'an khatam planner that works out your pages per day. Free, and saved only on your device.",
        "Daily goals and Qur'an khatam planner", "Small deeds, done every day — and a plan to finish the Qur'an.",
        para("Tick off a short list each day: the five prayers, a page of Qur'an, morning and evening adhkar, tasbih after prayer, salawat, istighfar, sadaqah and an act of kindness. Do three or more to keep your streak going.")
        + '<h2>Khatam planner</h2>' + para("Choose how many days you want to take to finish the Qur'an — 30, 60, 90, 180 or your own number. The planner works out your pages per day (the Qur'an has 604 pages), shows a progress ring, and tells you whether you are ahead or behind.")
        + para('Everything is saved on your device only.') + cta('daily', 'Open daily goals'), 'Daily goals')
    simple_page('hifz', "Qur'an Memorisation (Hifz) Helper – Repeat Ayahs | Quran Maar",
        "Memorise the Qur'an by repeating: pick a surah and range, set repeats and speed, and hide the text to test yourself. Free.",
        'Hifz helper — memorise by repeating', 'Choose the ayahs, repeat them, slow them down, and test yourself.',
        para('Pick a surah and a range of ayahs, choose how many times each ayah repeats and whether the whole range loops, and press play. Slow the recitation down while you learn it.')
        + bullets(['Repeat each ayah 1, 3, 5, 7 or 10 times.', 'Loop the range once, 3 times, 5 times or without end.', 'Speed from 0.7× to 1.15×, with three reciters.', 'Show the text, show only the first word, or hide it and tap to reveal.']) + cta('daily', 'Open the Hifz helper'), 'Hifz helper')


def sitemap(info):
    u = ['  <url>\n    <loc>%s/</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n    <image:image>\n      <image:loc>%s/og-image.png</image:loc>\n      <image:title>Quran Maar — Light, Time, Guidance</image:title>\n      <image:caption>Read the Qur\'an online with audio recitation, prayer times and Hadith</image:caption>\n    </image:image>\n    <image:image>\n      <image:loc>%s/logo.png</image:loc>\n      <image:title>Quran Maar logo</image:title>\n    </image:image>\n  </url>' % (BASE, TODAY, BASE, BASE),
         '  <url>\n    <loc>%s/surah/</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>' % (BASE, TODAY)]
    for gu in EXTRA_URLS:
        u.append('  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n    <image:image>\n      <image:loc>%s/og-image.png</image:loc>\n    </image:image>\n  </url>' % (gu, TODAY, BASE))
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
    build_guides(ar, en, info)
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f: f.write(sitemap(info))
    print('built 114 surah pages + hub + %d guide pages + sitemap.xml' % len(EXTRA_URLS))

if __name__ == '__main__':
    main()
