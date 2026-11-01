import { useState } from 'react';
import type { HadithCollectionMeta } from '../types';
import { validateImport, type ValidationReport } from '../hadith/validate';
import { installValidated, removeCollection } from '../hadith/hadithStore';
import { KNOWN_COLLECTIONS, PACK_EXAMPLE, LIMITS } from '../hadith/schema';
export function HadithManager({ collections, onChanged }: { collections: HadithCollectionMeta[]; onChanged: () => Promise<void> }) {
  const [cid, setCid] = useState('bukhari'); const [custom, setCustom] = useState(''); const [cname, setCname] = useState(''); const [lang, setLang] = useState('en'); const [src, setSrc] = useState(''); const [lic, setLic] = useState(''); const [tr, setTr] = useState(''); const [ed, setEd] = useState('');
  const [auth, setAuth] = useState(false); const [file, setFile] = useState<File | null>(null); const [rep, setRep] = useState<ValidationReport | null>(null); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const id = cid === 'custom' ? custom.trim().toLowerCase() : cid;
  const check = async () => {
    if (!file) return; setMsg(''); setRep(null); if (file.size > LIMITS.maxFileBytes) return setMsg('File is too large.');
    setBusy('Reading and validating…'); try { const json = JSON.parse(await file.text()); setRep(await validateImport(json, { collectionId: id, collectionName: cid === 'custom' ? cname : KNOWN_COLLECTIONS[cid]?.name, language: lang, sourceName: src, licence: lic, authorised: auth, translator: tr, edition: ed, fileName: file.name })); } catch (e: any) { setMsg('Could not read this file as JSON: ' + e.message); } setBusy('');
  };
  const install = async () => { if (!rep?.ok) return; setBusy('Installing…'); try { await installValidated(rep); await onChanged(); setMsg(`Installed ${rep.stats.accepted} records into “${rep.collectionName}”.`); setRep(null); setFile(null); } catch (e: any) { setMsg('Install failed: ' + e.message); } setBusy(''); };
  return (<div className="panel"><h2>Hadith library</h2>
    <p>No Hadith are bundled with MAAR. You can import a dataset <strong>you are legally authorised to use</strong>. Imports are validated before anything becomes searchable, and the assistant only discusses Hadith that are installed here.</p>
    <h3>Installed collections</h3>
    {!collections.length ? <p className="muted">None installed yet. Hadith-based answers are disabled until you import a collection.</p> :
      <ul className="list">{collections.map(c => <li key={c.id}><strong>{c.name}</strong> {c.nameAr && <span dir="rtl" lang="ar">{c.nameAr}</span>}
        <div className="muted small">{c.count} records · Arabic: {c.withArabic} · Translations: {Object.entries(c.withTranslation).map(([l, n]) => `${l} ${n}`).join(', ') || 'none'}</div>
        <div className="small"><span className="badge grade-graded">{c.graded} graded with authority</span> <span className="badge grade-grade_without_authority">{c.gradeWithoutAuthority} grade, no authority</span> <span className="badge grade-ungraded">{c.ungraded} no grading</span></div>
        <details className="small"><summary>Source & licence</summary>{c.sources.map((s, i) => <p key={i}>{new Date(s.importedAt).toLocaleDateString()} · {s.fileName} ({s.format}) · {s.sourceName} · {s.edition ?? ''} {s.translator ? '· ' + s.translator : ''}<br />Licence/permission: {s.licence}</p>)}</details>
        <button className="btn small danger" onClick={async () => { if (confirm(`Remove “${c.name}” from this device?`)) { await removeCollection(c.id); await onChanged(); } }}>Remove collection</button></li>)}</ul>}
    <h3>Import a dataset</h3>
    <div className="form">
      <label className="field">Collection <select value={cid} onChange={e => setCid(e.target.value)}>{Object.entries(KNOWN_COLLECTIONS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}<option value="custom">Other collection…</option></select></label>
      {cid === 'custom' && <><label className="field">Collection ID (a-z, 0-9, -)<input value={custom} onChange={e => setCustom(e.target.value)} /></label><label className="field">Collection name<input value={cname} onChange={e => setCname(e.target.value)} /></label></>}
      <label className="field">Language of the text in this file (ar for an Arabic-only file)<input value={lang} onChange={e => setLang(e.target.value.trim())} maxLength={8} /></label>
      <label className="field">Source / publisher<input value={src} onChange={e => setSrc(e.target.value)} placeholder="Who published this edition" /></label>
      <label className="field">Licence or permission you hold<textarea value={lic} onChange={e => setLic(e.target.value)} rows={2} placeholder="e.g. licence name and URL, or the permission statement" /></label>
      <label className="field">Translator (optional)<input value={tr} onChange={e => setTr(e.target.value)} /></label><label className="field">Edition (optional)<input value={ed} onChange={e => setEd(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={auth} onChange={e => setAuth(e.target.checked)} /> I confirm I am legally authorised to use and store this dataset.</label>
      <label className="field">JSON file<input type="file" accept=".json,application/json" onChange={e => { setFile(e.target.files?.[0] ?? null); setRep(null); }} /></label>
      <button className="btn primary" disabled={!file || !!busy} onClick={check}>Validate file</button>
    </div>
    {busy && <p role="status">{busy}</p>}{msg && <p role="status" className="note">{msg}</p>}
    {rep && <div className={'report ' + (rep.ok ? 'ok' : 'bad')} role="region" aria-label="Validation report">
      <h3>{rep.ok ? 'Validation passed' : 'Validation failed — nothing was installed'}</h3>
      {rep.format && <p className="small">Detected format: {rep.format}</p>}
      <p>{rep.stats.accepted} of {rep.stats.total} records valid · Arabic {rep.stats.withArabic} · translated {rep.stats.withTranslation} · <strong>{rep.stats.graded}</strong> graded with authority · {rep.stats.gradeWithoutAuthority} grade without authority · <strong>{rep.stats.ungraded}</strong> with no grading</p>
      {rep.errors.length > 0 && <ul className="errs">{rep.errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}{rep.warnings.length > 0 && <ul className="warns">{rep.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul>}{rep.notes.map((n, i) => <p key={i} className="small muted">{n}</p>)}
      {rep.rejections.length > 0 && <details><summary>{rep.stats.rejected} rejected record(s)</summary><ul className="small">{rep.rejections.slice(0, 50).map((r, i) => <li key={i}>#{r.index + 1}{r.number ? ` (no. ${r.number})` : ''}: {r.reason}</li>)}</ul></details>}
      {rep.ok && <button className="btn primary" onClick={install} disabled={!!busy}>Install and make searchable</button>}
    </div>}
    <details className="small"><summary>Accepted file formats</summary>
      <p>MAAR pack (below), hadith-api edition files, hadith-json files, or a plain JSON list with fields <code>number</code>, <code>arabic</code>, <code>text</code>, <code>grade</code>, <code>grade_authority</code>, <code>book</code>, <code>chapter</code>. Records without a Hadith number are rejected; numbers, grades and references are never invented. Import an Arabic edition and a translation edition of the same collection separately: they are merged by Hadith number.</p>
      <pre dir="ltr">{JSON.stringify(PACK_EXAMPLE, null, 2)}</pre></details>
  </div>);
}
