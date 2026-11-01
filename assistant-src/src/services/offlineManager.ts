export async function registerServiceWorker(): Promise<'registered' | 'unsupported' | 'failed'> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  try { await navigator.serviceWorker.register('./sw.js', { scope: './' }); return 'registered'; } catch { return 'failed'; }
}
export async function storageInfo(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try { const e = await navigator.storage.estimate(); return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: (await navigator.storage.persisted?.()) ?? false }; } catch { return null; }
}
export async function requestPersistence() { try { return await navigator.storage.persist(); } catch { return false; } }
export const fmtBytes = (n: number) => (n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB');
/** Wait (briefly) until THIS folder's service worker controls the page, so the main MAAR.Quran worker (broader scope) never caches assistant files. */
export async function waitForOwnWorker(ms = 4000): Promise<void> {
  if (!('serviceWorker' in navigator)) return; const own = () => /\/assistant\/sw\.js$/.test(navigator.serviceWorker.controller?.scriptURL ?? '');
  const t = Date.now(); while (!own() && Date.now() - t < ms) await new Promise(r => setTimeout(r, 150));
}
