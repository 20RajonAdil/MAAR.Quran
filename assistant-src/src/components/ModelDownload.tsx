import type { ModelState } from '../ai/modelManager';
import { MODELS } from '../ai/modelManager';
export function ModelDownload({ state, onStart, onRetry }: { state: ModelState; onStart: (id: string) => void; onRetry: () => void }) {
  const pct = (p: number) => Math.round(p * 100) + '%';
  const info = MODELS.find(m => 'modelId' in state && (m.id === state.modelId || m.f32Id === state.modelId));
  switch (state.status) {
    case 'checking': return <div className="status">Checking this device…</div>;
    case 'unsupported': return <div className="status warn" role="status"><strong>AI model unavailable on this device.</strong> {state.reason} <span>You can still search and read the verified Quran text; answers will show sources without an AI explanation.</span></div>;
    case 'idle': return <div className="status" role="status">The AI model ({info?.label}, about {info?.approxDownloadMB} MB) has not been downloaded. Automatic download is paused because {state.waitingForUser ?? 'it is not installed yet'}. <button className="btn" onClick={() => onStart(state.modelId)}>Download now</button></div>;
    case 'downloading': return <div className="status" role="status"><div>Downloading AI model — {pct(state.progress)}{state.fetchedMB ? ` · ${state.fetchedMB} MB fetched` : ''}</div><progress value={state.progress} max={1} aria-label="Model download progress" /><div className="muted small">{state.text}</div><div className="muted small">One-time download. It is stored on this device so MAAR can work offline afterwards.</div></div>;
    case 'loading': return <div className="status" role="status"><div>Loading the model into memory — {pct(state.progress)}</div><progress value={state.progress} max={1} /><div className="muted small">{state.text}</div></div>;
    case 'testing': return <div className="status">Running readiness test…</div>;
    case 'ready': return <div className="status ok" role="status">AI model ready ({info?.label ?? state.modelId}). Running locally on your device.</div>;
    case 'error': return <div className="status warn" role="alert"><strong>Model problem.</strong> {state.message} {state.modelId && <button className="btn" onClick={onRetry}>Retry</button>}</div>;
  }
}
