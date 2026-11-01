import { useEffect, useState } from 'react';
import type { Evidence, HadithRecord } from '../types';
import type { QuranData } from '../services/datasetManager';
import { getFootnotes, juzOf } from '../services/datasetManager';
import { LANGUAGES } from '../services/languageDetection';
import { GRADING_LABEL } from '../hadith/schema';
import { addBookmark, removeBookmark } from '../storage/bookmarks';

export interface SourceCtx { quran: QuranData; displayLang: string; hadith: Map<string, HadithRecord>; collections: Record<string, string>; bookmarked: Set<string>; onBookmarkChange: () => void; }
export function SourceCard({ e, ctx, cited, open }: { e: Evidence; ctx: SourceCtx; cited?: boolean; open?: boolean }) {
  const [expanded, setExpanded] = useState(!!open); const [fn, setFn] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) setExpanded(true); }, [open]);
  if (e.kind === 'quran') {
    const q = ctx.quran; const c = q.chapters[e.surah - 1]; if (!c) return null;
    const lang = q.translations[ctx.displayLang] ? ctx.displayLang : 'en'; const tr = q.translations[lang]?.[e.index]; const rtlTr = LANGUAGES[lang]?.rtl; const key = e.id; const marked = ctx.bookmarked.has('quran:' + e.id.slice(2));
    const meta = q.manifest.translations.find(t => t.lang === lang);
    const loadFn = async () => { if (fn !== null) return setFn(null); const f = await getFootnotes(lang); const idx = String(e.index); setFn(f?.[idx] ?? '(no footnote for this ayah)'); };
    const toggleMark = async () => { const ref = `${e.surah}:${e.ayah}`; if (marked) await removeBookmark('quran', ref); else await addBookmark({ kind: 'quran', ref, label: `${c.tr} ${ref}` }); ctx.onBookmarkChange(); };
    const copy = async () => { await navigator.clipboard?.writeText(`${q.ar[e.index]}\n\n${tr ?? ''}\n\n— Quran ${e.surah}:${e.ayah} (${c.tr})${meta ? `, translation: ${meta.title} v${meta.version}` : ''}`); setCopied(true); setTimeout(() => setCopied(false), 1500); };
    return (<article className={'card' + (cited ? ' cited' : '')} id={'src-' + key}>
      <header><button className="link" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><strong>Quran {e.surah}:{e.ayah}</strong> · {c.tr} <span className="muted">({c.en})</span></button>{cited && <span className="badge ok">cited</span>}</header>
      <p className="arabic" dir="rtl" lang="ar">{q.ar[e.index]}</p>
      {tr ? <p className="trans" dir={rtlTr ? 'rtl' : 'ltr'} lang={lang}>{tr}</p> : <p className="muted">Translation not installed.</p>}
      {expanded && <div className="detail">
        <dl><dt>Surah</dt><dd>{c.n} · {c.ar} · {c.tr} ({c.type})</dd><dt>Ayah</dt><dd>{e.ayah} of {c.verses}</dd><dt>Juz</dt><dd>{juzOf(e.index, q.juzStart)}</dd><dt>Arabic</dt><dd>{q.manifest.arabic.source}</dd>
          {meta && <><dt>Translation</dt><dd>{meta.title} (v{meta.version}) — <a href={meta.browse_url} target="_blank" rel="noopener noreferrer">QuranEnc.com</a></dd></>}<dt>Numbering</dt><dd>{q.manifest.numbering}</dd></dl>
        {meta?.has_footnotes && <button className="btn small" onClick={loadFn}>{fn === null ? 'Show publisher footnotes' : 'Hide footnotes'}</button>}
        {fn && <p className="footnote" dir={rtlTr ? 'rtl' : 'ltr'}>{fn}</p>}
        <p className="muted small">The translation is the publisher's text, shown unmodified. Any explanation in the answer above is the assistant's, not part of the translation.</p>
      </div>}
      <footer><button className="btn small" onClick={toggleMark}>{marked ? '★ Bookmarked' : '☆ Bookmark'}</button><button className="btn small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button><button className="btn small" onClick={() => setExpanded(!expanded)}>{expanded ? 'Less' : 'Inspect reference'}</button></footer>
    </article>);
  }
  const r = ctx.hadith.get(e.id.slice(2)); if (!r) return null; const name = ctx.collections[r.collection] ?? r.collection; const ref = `${r.collection}:${r.number}`; const marked = ctx.bookmarked.has('hadith:' + ref);
  const toggleMark = async () => { if (marked) await removeBookmark('hadith', ref); else await addBookmark({ kind: 'hadith', ref, label: `${name} ${r.number}` }); ctx.onBookmarkChange(); };
  const tl = ctx.displayLang in r.translations ? ctx.displayLang : Object.keys(r.translations)[0];
  return (<article className={'card hadith' + (cited ? ' cited' : '')} id={'src-' + e.id}>
    <header><button className="link" onClick={() => setExpanded(!expanded)}><strong>{name} #{r.number}</strong>{r.book.name && <span className="muted"> · {r.book.name}</span>}</button>{cited && <span className="badge ok">cited</span>}</header>
    <p><span className={'badge grade-' + r.gradingStatus}>{GRADING_LABEL[r.gradingStatus]}</span>{r.gradings.map((g, i) => <span key={i} className={'badge lvl-' + g.level}>{g.grade}{g.authority ? ` — ${g.authority}` : ''}</span>)}</p>
    {r.arabic ? <p className="arabic" dir="rtl" lang="ar">{r.arabic}</p> : <p className="muted small">Arabic text not included in the installed data.</p>}
    {tl ? <p className="trans" dir={LANGUAGES[tl]?.rtl ? 'rtl' : 'ltr'} lang={tl}>{r.translations[tl]}</p> : <p className="muted small">No translation in the installed data.</p>}
    {expanded && <dl className="detail"><dt>Collection</dt><dd>{name}</dd><dt>Hadith number</dt><dd>{r.number} (as numbered in the imported edition)</dd><dt>Book</dt><dd>{r.book.number ?? '—'} {r.book.name ?? ''}</dd><dt>Chapter</dt><dd>{r.chapter ?? '—'}</dd>{r.narrator && <><dt>Narrator</dt><dd>{r.narrator}</dd></>}{r.reference && <><dt>Source reference</dt><dd>{r.reference}</dd></>}<dt>Grading</dt><dd>{r.gradings.length ? r.gradings.map(g => `${g.grade} (${g.authority ?? 'authority not stated'})`).join('; ') : 'None recorded in the imported data'}</dd></dl>}
    <footer><button className="btn small" onClick={toggleMark}>{marked ? '★ Bookmarked' : '☆ Bookmark'}</button><button className="btn small" onClick={() => setExpanded(!expanded)}>{expanded ? 'Less' : 'Inspect reference'}</button></footer>
  </article>);
}
