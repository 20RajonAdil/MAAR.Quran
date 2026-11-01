import { useState } from 'react';
import type { Message } from '../types';
import { LANGUAGES } from '../services/languageDetection';
import { SourceCard, type SourceCtx } from './SourceCard';
const MARK = /(\[(?:Q|H):[^\]\s]+\])/g;
export function MessageBubble({ m, ctx, onSave }: { m: Message; ctx: SourceCtx; onSave?: (m: Message) => void }) {
  const [open, setOpen] = useState<string | null>(null); const [copied, setCopied] = useState(false); const rtl = !!LANGUAGES[m.lang ?? 'en']?.rtl && m.role === 'assistant';
  const cited = new Set((m.text.match(MARK) ?? []).map(x => x.slice(1, -1)));
  // Message text is rendered as plain text (React escapes it): model output can never inject HTML.
  const parts = m.text.split(MARK).map((p, i) => { if (MARK.test(p)) { MARK.lastIndex = 0; const id = p.slice(1, -1); const [k, ...rest] = id.split(':'); return <button key={i} className="chip" onClick={() => { setOpen(id); document.getElementById('src-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} title="Show source">{k === 'Q' ? 'Quran ' + rest.join(':') : rest.join(' #')}</button>; } MARK.lastIndex = 0; return <span key={i}>{p}</span>; });
  if (m.role === 'user') return <div className="msg user"><div className="bubble" dir="auto">{m.text}</div></div>;
  return (<div className={'msg assistant ' + (m.kind ?? '')}>
    <div className="bubble" dir={rtl ? 'rtl' : 'ltr'} lang={m.lang}>{parts}</div>
    {m.notes?.map((n, i) => <p key={i} className="note" role="note">⚠ {n}</p>)}
    {m.evidence && m.evidence.length > 0 && <section className="sources" aria-label="Sources"><h4>Sources <span className="muted small">(text below is verified database content; the explanation above is the assistant's)</span></h4>{m.evidence.map(e => <SourceCard key={e.id} e={e} ctx={ctx} cited={cited.has(e.id)} open={open === e.id} />)}</section>}
    <div className="actions"><button className="btn small" onClick={async () => { await navigator.clipboard?.writeText(m.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy answer'}</button>{onSave && <button className="btn small" onClick={() => onSave(m)}>Save answer</button>}</div>
  </div>);
}
