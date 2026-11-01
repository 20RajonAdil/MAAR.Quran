import { LANGUAGES } from '../services/languageDetection';
export function LanguageSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (<label className="field">Answer language <select value={value} onChange={e => onChange(e.target.value)}><option value="auto">Automatic (same as my question)</option>{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v.native} — {v.name}{v.modelQuality === 'limited' ? ' (limited model quality)' : ''}</option>)}</select></label>);
}
