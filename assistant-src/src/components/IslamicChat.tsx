import { useEffect, useRef, useState } from 'react';
import type { Conversation, Message } from '../types';
import { MessageBubble } from './MessageBubble';
import type { SourceCtx } from './SourceCard';
import { LANGUAGES } from '../services/languageDetection';
const SUGGESTIONS = ['What does Islam say about patience?', 'Explain Ayat al-Kursi (2:255)', 'ধৈর্য সম্পর্কে কুরআন কী বলে?', 'How should I treat my parents?', 'نماز کی اہمیت کیا ہے؟', 'ما هو الصيام في القرآن؟', 'What is the importance of forgiveness?', 'Explain surah al-Ikhlas'];
export function IslamicChat({ conv, ctxFor, busy, streaming, onSend, onStop, modelReady, onInstallLang, langInstallable, onSave }: { conv: Conversation; ctxFor: (m: Message) => SourceCtx; busy: boolean; streaming: string; onSend: (q: string) => void; onStop: () => void; modelReady: boolean; onInstallLang: (l: string) => void; langInstallable: (l?: string) => boolean; onSave: (m: Message) => void }) {
  const [q, setQ] = useState(''); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conv.messages.length, streaming]);
  const submit = () => { const t = q.trim(); if (!t || busy) return; setQ(''); onSend(t); };
  return (<div className="chat">
    <div className="messages" aria-live="polite">
      {conv.messages.length === 0 && <div className="welcome"><h1>MAAR Islamic Assistant</h1><p>Ask about the Quran in your own language. Answers are explained by an AI model running on your device and are backed by verified Quran text shown beside every answer.</p>
        <p className="muted small">An educational tool, not a mufti. For rulings, consult a qualified scholar.</p>
        <div className="suggest">{SUGGESTIONS.map(s => <button key={s} className="chip big" dir="auto" onClick={() => onSend(s)} disabled={busy}>{s}</button>)}</div></div>}
      {conv.messages.map(m => <div key={m.id}><MessageBubble m={m} ctx={ctxFor(m)} onSave={m.role === 'assistant' ? onSave : undefined} />
        {m.role === 'assistant' && m.lang && m.evidence?.length && langInstallable(m.lang) ? <p className="note small"><button className="btn small" onClick={() => onInstallLang(m.lang!)}>Install the {LANGUAGES[m.lang]?.native} Quran translation</button> to see the verses in your language.</p> : null}</div>)}
      {busy && <div className="msg assistant"><div className="bubble typing" dir="auto">{streaming || 'Searching verified sources…'}</div></div>}
      <div ref={end} />
    </div>
    <form className="composer" onSubmit={e => { e.preventDefault(); submit(); }}>
      <textarea value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} dir="auto" rows={2} placeholder="Ask a question — in any language, or type a reference like 2:255" aria-label="Your question" />
      {busy ? <button type="button" className="btn" onClick={onStop}>Stop</button> : <button className="btn primary" type="submit" disabled={!q.trim()}>Ask</button>}
    </form>
    {!modelReady && <p className="muted small center">The AI model is not ready, so I will show verified sources only. See the status bar above.</p>}
  </div>);
}
