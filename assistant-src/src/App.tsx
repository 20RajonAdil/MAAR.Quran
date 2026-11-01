import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bookmark, Conversation, HadithCollectionMeta, HadithRecord, Message, Settings as S } from './types';
import { installCore, installTranslation, loadQuran, type InstallProgress, type QuranData } from './services/datasetManager';
import { WorkerSearch } from './knowledge/searchClient';
import { ModelManager, type ModelState } from './ai/modelManager';
import { answerQuestion } from './rag/answerGenerator';
import { kvGet, kvSet } from './storage/indexedDB';
import { deleteConversation, listConversations, newConversation, saveConversation, titleFrom, newId } from './storage/conversationHistory';
import { listBookmarks, removeBookmark } from './storage/bookmarks';
import { listCollections, loadAllRecords } from './hadith/hadithStore';
import { IslamicChat } from './components/IslamicChat';
import { ModelDownload } from './components/ModelDownload';
import { Settings } from './components/Settings';
import { HadithManager } from './components/HadithManager';
import { SourceCard, type SourceCtx } from './components/SourceCard';
import { LanguageSelector } from './components/LanguageSelector';
import { fmtBytes, waitForOwnWorker } from './services/offlineManager';

const DEFAULTS: S = { theme: 'auto', responseLang: 'auto', displayTranslation: {}, modelId: 'auto', autoDownloadModel: true, detail: 'normal' };
type Tab = 'chat' | 'bookmarks' | 'hadith' | 'settings' | 'about';
export default function App() {
  const [boot, setBoot] = useState<{ phase: 'starting' | 'installing' | 'ready' | 'error'; p?: InstallProgress; error?: string }>({ phase: 'starting' });
  const [settings, setSettings] = useState<S>(DEFAULTS); const [quran, setQuran] = useState<QuranData | null>(null);
  const [collections, setCollections] = useState<HadithCollectionMeta[]>([]); const [hadith, setHadith] = useState<Map<string, HadithRecord>>(new Map());
  const [convs, setConvs] = useState<Conversation[]>([]); const [active, setActive] = useState<Conversation>(newConversation()); const [bms, setBms] = useState<Bookmark[]>([]);
  const [tab, setTab] = useState<Tab>('chat'); const [model, setModel] = useState<ModelState>({ status: 'checking' }); const [busy, setBusy] = useState(false); const [streaming, setStreaming] = useState('');
  const [online, setOnline] = useState(navigator.onLine); const [sidebar, setSidebar] = useState(false); const [toast, setToast] = useState('');
  const backend = useRef<WorkerSearch | null>(null); const mm = useRef<ModelManager | null>(null); const abort = useRef<AbortController | null>(null); const settingsRef = useRef(settings); settingsRef.current = settings;

  const refreshHadith = useCallback(async () => { const [c, r] = await Promise.all([listCollections(), loadAllRecords()]); setCollections(c); setHadith(new Map(r.map(x => [x.id, x]))); await backend.current?.rebuild(); }, []);
  const refreshUserData = useCallback(async () => { setConvs(await listConversations()); setBms(await listBookmarks()); const s = await kvGet<S>('settings'); if (s) setSettings({ ...DEFAULTS, ...s }); }, []);
  const reloadQuran = useCallback(async () => { const q = await loadQuran(); setQuran(q); await backend.current?.rebuild(); return q; }, []);

  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  useEffect(() => { // theme
    const d = document.documentElement; const apply = () => { const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); d.dataset.theme = dark ? 'dark' : 'light'; }; apply(); const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);
  useEffect(() => { // boot
    let dead = false;
    (async () => {
      try {
        backend.current = new WorkerSearch(); mm.current = new ModelManager(); mm.current.subscribe(s => !dead && setModel(s));
        const saved = await kvGet<S>('settings'); const st = { ...DEFAULTS, ...(saved ?? {}) }; setSettings(st); await refreshUserData();
        let q = await loadQuran().catch(() => null);
        if (!q) { setBoot({ phase: 'installing' }); await waitForOwnWorker(); await installCore(p => !dead && setBoot({ phase: 'installing', p })); q = await loadQuran(); }
        if (!q) throw new Error('The Quran database could not be installed.');
        setQuran(q); await refreshHadith(); await backend.current.rebuild(); setBoot({ phase: 'ready' });
        mm.current.init(st.modelId, st.autoDownloadModel); // model download is independent of the databases
      } catch (e: any) { setBoot({ phase: 'error', error: (e?.message || String(e)) + (navigator.onLine ? '' : ' (you appear to be offline: the first visit needs internet to install the database)') }); }
    })();
    return () => { dead = true; };
  }, [refreshHadith, refreshUserData]);

  const patch = (p: Partial<S>) => { const n = { ...settingsRef.current, ...p }; setSettings(n); kvSet('settings', n); };
  const bmSet = useMemo(() => new Set(bms.map(b => b.id)), [bms]);
  const colNames = useMemo(() => Object.fromEntries(collections.map(c => [c.id, c.name])), [collections]);
  const ctxFor = useCallback((m: Message): SourceCtx => { const def = settings.displayTranslation.default ?? 'en'; const lang = m.lang && quran?.translations[m.lang] ? m.lang : quran?.translations[def] ? def : 'en'; return { quran: quran!, displayLang: lang, hadith, collections: colNames, bookmarked: bmSet, onBookmarkChange: async () => setBms(await listBookmarks()) }; }, [quran, hadith, colNames, bmSet, settings.displayTranslation]);

  const persist = async (c: Conversation) => { await saveConversation(c); setConvs(await listConversations()); };
  const send = async (text: string) => {
    if (!quran || busy) return; const user: Message = { id: newId(), role: 'user', text, createdAt: Date.now() };
    let conv: Conversation = { ...active, messages: [...active.messages, user], title: active.messages.length ? active.title : titleFrom(user) }; setActive(conv); setBusy(true); setStreaming(''); abort.current = new AbortController();
    try {
      const m = mm.current!; const msg = await answerQuestion(text, active.messages, { chapters: quran.chapters, ar: quran.ar, en: quran.translations.en ?? null, backend: backend.current!, hadithInstalled: collections.some(c => c.count > 0), getHadith: id => hadith.get(id), llm: { get ready() { return m.ready; }, generate: (x, t, s) => m.generate(x, t, s) }, settings: { responseLang: settings.responseLang, detail: settings.detail } }, setStreaming, abort.current.signal);
      conv = { ...conv, messages: [...conv.messages, msg] };
    } catch (e: any) { conv = { ...conv, messages: [...conv.messages, { id: newId(), role: 'assistant', text: 'Sorry, something went wrong while answering: ' + (e?.message || e) + '. Nothing was sent anywhere; you can try again.', createdAt: Date.now(), kind: 'insufficient' }] }; }
    setActive(conv); setBusy(false); setStreaming(''); await persist(conv);
  };
  const installLang = async (l: string) => { try { await installTranslation(l); await reloadQuran(); setToast('Translation installed.'); } catch (e: any) { setToast('Could not install translation: ' + e.message); } setTimeout(() => setToast(''), 3000); };
  const langInstallable = (l?: string) => !!l && !!quran && !quran.translations[l] && quran.manifest.translations.some(t => t.lang === l);
  const switchModel = async (id: string) => { await mm.current?.init(id, false); };
  const saveAnswer = async (m: Message) => { const { addBookmark } = await import('./storage/bookmarks'); await addBookmark({ kind: 'quran', ref: 'answer:' + m.id, label: 'Saved: ' + m.text.slice(0, 60) }); setBms(await listBookmarks()); setToast('Answer saved to Bookmarks.'); setTimeout(() => setToast(''), 2500); };
  const del = async (id: string) => { if (!confirm('Delete this conversation?')) return; await deleteConversation(id); setConvs(await listConversations()); if (active.id === id) setActive(newConversation()); };

  if (boot.phase === 'starting' || boot.phase === 'installing') return (<div className="boot"><h1>MAAR Islamic Assistant</h1><p>{boot.phase === 'starting' ? 'Starting…' : 'Installing the Quran database on your device (one time)…'}</p>{boot.p && <><progress value={boot.p.done} max={boot.p.total} /><p className="muted small">{boot.p.done}/{boot.p.total} files · {fmtBytes(boot.p.bytes ?? 0)} · each file is verified against its published checksum</p></>}</div>);
  if (boot.phase === 'error' || !quran) return (<div className="boot"><h1>MAAR Islamic Assistant</h1><p role="alert" className="note">Could not start: {boot.error}</p><button className="btn primary" onClick={() => location.reload()}>Retry</button></div>);

  const quranStatus = `${Object.keys(quran.translations).length} translation${Object.keys(quran.translations).length === 1 ? '' : 's'}`;
  return (<div className="app">
    <header className="top"><button className="icon" aria-label="Menu" onClick={() => setSidebar(!sidebar)}>☰</button><div className="brand"><span className="logo" aria-hidden>✦</span> MAAR <span className="light">Islamic Assistant</span></div>
      <nav aria-label="Sections">{(['chat', 'bookmarks', 'hadith', 'settings', 'about'] as Tab[]).map(t => <button key={t} className={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>{t === 'chat' ? 'Ask' : t[0].toUpperCase() + t.slice(1)}</button>)}</nav>
      <span className={'pill ' + (online ? '' : 'off')}>{online ? 'Online' : 'Offline'}</span></header>
    <div className="statusbar"><span className="pill ok" title="Quran database">Quran ✓ 6,236 ayat · {quranStatus}</span><span className={'pill ' + (collections.length ? 'ok' : '')} title="Hadith database">Hadith: {collections.length ? collections.map(c => c.count).reduce((a, b) => a + b, 0) + ' records' : 'none installed'}</span></div>
    <ModelDownload state={model} onStart={id => mm.current?.start(id)} onRetry={() => mm.current?.init(settings.modelId, true)} />
    <div className="layout">
      <aside className={'side' + (sidebar ? ' open' : '')}><button className="btn primary wide" onClick={() => { setActive(newConversation()); setTab('chat'); setSidebar(false); }}>＋ New conversation</button><LanguageSelector value={settings.responseLang} onChange={v => patch({ responseLang: v })} /><h3>History</h3>
        <ul className="hist">{convs.map(c => <li key={c.id} className={c.id === active.id ? 'on' : ''}><button className="link" onClick={() => { setActive(c); setTab('chat'); setSidebar(false); }} dir="auto">{c.title}</button><button className="icon small" aria-label="Delete conversation" onClick={() => del(c.id)}>✕</button></li>)}{!convs.length && <li className="muted small">No saved conversations yet.</li>}</ul></aside>
      <main>
        {tab === 'chat' && <IslamicChat conv={active} ctxFor={ctxFor} busy={busy} streaming={streaming} onSend={send} onStop={() => abort.current?.abort()} modelReady={model.status === 'ready'} onInstallLang={installLang} langInstallable={langInstallable} onSave={saveAnswer} />}
        {tab === 'bookmarks' && <div className="panel"><h2>Bookmarks</h2>{!bms.length && <p className="muted">Nothing bookmarked yet.</p>}{bms.map(b => { if (b.ref.startsWith('answer:')) return <div key={b.id} className="card"><p>{b.label}</p><button className="btn small" onClick={async () => { await removeBookmark(b.kind, b.ref); setBms(await listBookmarks()); }}>Remove</button></div>; const m: Message = { id: 'b', role: 'assistant', text: '', createdAt: 0 }; let ev: any = null; if (b.kind === 'quran') { const [s, a] = b.ref.split(':').map(Number); const c = quran.chapters[s - 1]; if (c) ev = { kind: 'quran', id: `Q:${s}:${a}`, surah: s, ayah: a, index: c.start + a - 1, score: 1, matchedTerms: [] }; } else ev = { kind: 'hadith', id: 'H:' + b.ref, collection: b.ref.split(':')[0], number: b.ref.split(':').slice(1).join(':'), score: 1, matchedTerms: [] }; return ev ? <SourceCard key={b.id} e={ev} ctx={ctxFor(m)} /> : null; })}</div>}
        {tab === 'hadith' && <HadithManager collections={collections} onChanged={refreshHadith} />}
        {tab === 'settings' && <Settings s={settings} set={patch} quran={quran} model={model} onTranslation={async () => { await reloadQuran(); }} onDeleteModel={async () => { const id = 'modelId' in model ? model.modelId : ''; if (id) await mm.current!.deleteModel(id); await mm.current!.init(settings.modelId, false); }} onSwitchModel={switchModel} onDataChanged={async () => { await refreshUserData(); setActive(newConversation()); await refreshHadith(); }} />}
        {tab === 'about' && <About quran={quran} />}
      </main></div>
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>);
}
function About({ quran }: { quran: QuranData }) {
  return (<div className="panel"><h2>About MAAR Islamic Assistant</h2>
    <p>Everything runs on your device: the language model, the Quran database, search, and your conversations. No question is sent to any AI service, and there are no accounts, API keys, analytics or trackers. The only network use is the one-time download of the AI model files and, on first visit, the Quran data files from this website.</p>
    <h3>How answers are made</h3><p>Your question is matched against the installed Quran (and any Hadith you imported). The matching verses are given to the local model, which explains them. Citations are rebuilt from database records: any reference the model invents is removed. Text in the grey source cards is verified database content; the explanation above it is the assistant's.</p>
    <p><strong>Limits.</strong> This is an educational reference, not a mufti, and it cannot issue fatwas. Small local models can misunderstand questions or explain imperfectly, especially in Bengali, Urdu and other languages they support less well. Always check the explanation against the verses shown.</p>
    <h3>Quran sources and licences</h3>
    <ul><li><strong>Arabic (Uthmani)</strong>: {quran.manifest.arabic.source}. {quran.manifest.arabic.license} (<a href={quran.manifest.arabic.license_url} target="_blank" rel="noopener noreferrer">licence</a>). The text is used unmodified.</li>
      {quran.manifest.translations.map(t => <li key={t.key}><strong>{t.label}</strong>: {t.title}, version {t.version}, via <a href={t.browse_url} target="_blank" rel="noopener noreferrer">QuranEnc.com</a>. Republished unmodified under QuranEnc's <a href={t.terms_url} target="_blank" rel="noopener noreferrer">terms</a>.</li>)}
      <li>Data compiled from <a href={quran.manifest.distribution.repository} target="_blank" rel="noopener noreferrer">risan/quran-json</a> ({quran.manifest.distribution.repository_license}).</li></ul>
    <p className="muted small">Numbering: {quran.manifest.numbering}. Database version {quran.manifest.dataVersion}.</p>
    <h3>Hadith</h3><p>No Hadith collections are bundled. Import a dataset you are authorised to use from the Hadith tab. Authenticity gradings are shown only if the imported data contains them, together with the authority named in it; nothing is inferred.</p>
    <h3>Software</h3><p>AI runtime: <a href="https://github.com/mlc-ai/web-llm" target="_blank" rel="noopener noreferrer">WebLLM</a> (Apache-2.0), bundled locally. Search: MiniSearch (MIT). Arabic font: Amiri (SIL OFL).</p></div>);
}
