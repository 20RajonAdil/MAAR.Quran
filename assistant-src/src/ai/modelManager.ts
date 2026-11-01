import * as webllm from '@mlc-ai/web-llm';
import type { ChatMsg } from './conversation';

export interface ModelChoice { id: string; f32Id: string; label: string; approxDownloadMB: number; note: string }
/** Both are from WebLLM's official prebuilt catalogue. No weights are stored in this repository: they are fetched once by WebLLM
 *  (from the model host named in its catalogue) and kept in the browser's Cache Storage. */
export const MODELS: ModelChoice[] = [
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', f32Id: 'Qwen2.5-3B-Instruct-q4f32_1-MLC', label: 'Qwen2.5 3B Instruct (recommended)', approxDownloadMB: 1900, note: 'Multilingual, ~2.5 GB GPU memory' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', f32Id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', label: 'Qwen2.5 1.5B Instruct (smaller, for low-memory devices)', approxDownloadMB: 1000, note: 'Faster, lower quality, ~1.6 GB GPU memory' },
];
export type ModelState =
  | { status: 'checking' } | { status: 'unsupported'; reason: string }
  | { status: 'idle'; modelId: string; installed: boolean; waitingForUser?: string }
  | { status: 'downloading'; modelId: string; progress: number; text: string; fetchedMB: number }
  | { status: 'loading'; modelId: string; progress: number; text: string } | { status: 'testing'; modelId: string }
  | { status: 'ready'; modelId: string; offlineReady: boolean } | { status: 'error'; message: string; modelId?: string };
export interface Hardware { webgpu: boolean; f16: boolean; deviceMemoryGB: number | null; mobile: boolean; saveData: boolean; metered: boolean; reason?: string }

export async function detectHardware(): Promise<Hardware> {
  const nav: any = navigator; const conn = nav.connection; const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const base = { deviceMemoryGB: nav.deviceMemory ?? null, mobile, saveData: !!conn?.saveData, metered: conn?.type === 'cellular' };
  if (!nav.gpu) return { webgpu: false, f16: false, ...base, reason: 'This browser does not support WebGPU, which is required to run the AI model locally. Try a recent version of Chrome or Edge on a device with a supported GPU.' };
  try { const ad = await nav.gpu.requestAdapter(); if (!ad) return { webgpu: false, f16: false, ...base, reason: 'WebGPU is present but no compatible graphics adapter was found.' }; return { webgpu: true, f16: ad.features.has('shader-f16'), ...base }; }
  catch (e: any) { return { webgpu: false, f16: false, ...base, reason: 'WebGPU could not be initialised: ' + (e?.message ?? e) }; }
}
export function pickModel(hw: Hardware, preferred: 'auto' | string): { id: string; choice: ModelChoice } {
  let c = MODELS.find(m => m.id === preferred || m.f32Id === preferred);
  if (!c) c = hw.mobile || (hw.deviceMemoryGB !== null && hw.deviceMemoryGB <= 4) ? MODELS[1] : MODELS[0];
  return { id: hw.f16 ? c.id : c.f32Id, choice: c };
}
export class ModelManager {
  state: ModelState = { status: 'checking' }; private listeners = new Set<(s: ModelState) => void>(); private engine: webllm.MLCEngineInterface | null = null; hw: Hardware | null = null; private worker: Worker | null = null; private starting = false;
  subscribe(fn: (s: ModelState) => void) { this.listeners.add(fn); fn(this.state); return () => { this.listeners.delete(fn); }; }
  private set(s: ModelState) { this.state = s; this.listeners.forEach(l => l(s)); }
  get ready() { return this.state.status === 'ready'; }
  async init(preferred: 'auto' | string = 'auto', autoStart = true) {
    this.set({ status: 'checking' }); this.hw = await detectHardware();
    if (!this.hw.webgpu) return this.set({ status: 'unsupported', reason: this.hw.reason! });
    const { id } = pickModel(this.hw, preferred); let installed = false;
    try { installed = await webllm.hasModelInCache(id); } catch { /* treat as not installed */ }
    if (installed) return this.start(id);
    // First visit: download automatically, except where that could cost the visitor mobile data.
    if (autoStart && !this.hw.saveData && !this.hw.metered) return this.start(id);
    this.set({ status: 'idle', modelId: id, installed, waitingForUser: this.hw.saveData ? 'Data Saver is on' : 'you appear to be on a mobile data connection' });
  }
  async start(modelId: string) {
    if (this.starting) return; this.starting = true;
    try {
      try { await navigator.storage?.persist?.(); } catch { /* optional */ }
      this.set({ status: 'downloading', modelId, progress: 0, text: 'Starting…', fetchedMB: 0 });
      this.worker = new Worker(new URL('./modelWorker.ts', import.meta.url), { type: 'module' });
      this.engine = await webllm.CreateWebWorkerMLCEngine(this.worker, modelId, { initProgressCallback: (r) => {
        const fetched = /(\d+)MB fetched/.exec(r.text); const loading = /load|Loading|compil|Finish/i.test(r.text) && !/Fetching/.test(r.text);
        this.set(loading ? { status: 'loading', modelId, progress: r.progress, text: r.text } : { status: 'downloading', modelId, progress: r.progress, text: r.text, fetchedMB: fetched ? +fetched[1] : 0 });
      } });
      this.set({ status: 'testing', modelId });
      const t = await this.engine.chat.completions.create({ messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_tokens: 8, temperature: 0 });
      if (!t.choices[0]?.message?.content) throw new Error('The model loaded but did not answer the readiness test.');
      this.set({ status: 'ready', modelId, offlineReady: true });
    } catch (e: any) {
      const msg = String(e?.message ?? e); this.engine = null;
      this.set({ status: 'error', modelId, message: /memory|OOM|allocation|device lost/i.test(msg) ? 'Your device ran out of graphics memory loading this model. Try the smaller model in Settings. (' + msg + ')' : /fetch|network|Failed to|Load failed/i.test(msg) ? 'The download was interrupted. Your progress is kept; press Retry to continue. (' + msg + ')' : msg });
    } finally { this.starting = false; }
  }
  async generate(messages: ChatMsg[], onToken: (t: string) => void, signal?: AbortSignal): Promise<string> {
    if (!this.engine || !this.ready) throw new Error('Model is not ready');
    const stream = await this.engine.chat.completions.create({ messages, stream: true, temperature: 0.3, top_p: 0.9, max_tokens: 700 });
    let out = ''; for await (const chunk of stream) { if (signal?.aborted) { await this.engine.interruptGenerate(); break; } const d = chunk.choices[0]?.delta?.content ?? ''; if (d) { out += d; onToken(out); } }
    return out;
  }
  async deleteModel(modelId: string) { try { await this.engine?.unload(); } catch { /* ignore */ } await webllm.deleteModelAllInfoInCache(modelId); this.engine = null; this.worker?.terminate(); }
}
