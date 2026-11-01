/** Thin promise wrapper over IndexedDB. Quran data, Hadith data and the user's own data live in SEPARATE stores,
 *  so updating or clearing one never touches another. */
export const DB_NAME = 'maar-assistant'; export const DB_VERSION = 1;
export type StoreName = 'kv' | 'quran' | 'hadithRecords' | 'hadithCollections' | 'conversations' | 'bookmarks';
let dbp: Promise<IDBDatabase> | null = null;
export function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['kv', 'quran']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'key' });
      if (!db.objectStoreNames.contains('hadithRecords')) { const st = db.createObjectStore('hadithRecords', { keyPath: 'id' }); st.createIndex('collection', 'collection'); }
      for (const s of ['hadithCollections', 'conversations', 'bookmarks']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbp = null; }; resolve(req.result); };
    req.onerror = () => { dbp = null; reject(req.error); };
    req.onblocked = () => reject(new Error('Database upgrade blocked by another tab'));
  });
  return dbp;
}
export function resetDbHandle() { dbp = null; }
const wrap = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error('Transaction aborted')); });
export async function get<T = any>(store: StoreName, key: string): Promise<T | undefined> { const db = await openDb(); return wrap(db.transaction(store).objectStore(store).get(key)); }
export async function put(store: StoreName, value: any): Promise<void> { const db = await openDb(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); await done(tx); }
export async function putMany(store: StoreName, values: any[], chunk = 2000): Promise<void> {
  const db = await openDb();
  for (let i = 0; i < values.length; i += chunk) { const tx = db.transaction(store, 'readwrite'); const os = tx.objectStore(store); for (const v of values.slice(i, i + chunk)) os.put(v); await done(tx); }
}
export async function del(store: StoreName, key: string): Promise<void> { const db = await openDb(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); await done(tx); }
export async function getAll<T = any>(store: StoreName): Promise<T[]> { const db = await openDb(); return wrap(db.transaction(store).objectStore(store).getAll()); }
export async function getAllByIndex<T = any>(store: StoreName, index: string, value: IDBValidKey): Promise<T[]> { const db = await openDb(); return wrap(db.transaction(store).objectStore(store).index(index).getAll(value)); }
export async function deleteByIndex(store: StoreName, index: string, value: IDBValidKey): Promise<void> {
  const db = await openDb(); const tx = db.transaction(store, 'readwrite'); const req = tx.objectStore(store).index(index).openKeyCursor(IDBKeyRange.only(value));
  req.onsuccess = () => { const c = req.result; if (c) { tx.objectStore(store).delete(c.primaryKey); c.continue(); } }; await done(tx);
}
export async function clear(store: StoreName): Promise<void> { const db = await openDb(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear(); await done(tx); }
export async function count(store: StoreName): Promise<number> { const db = await openDb(); return wrap(db.transaction(store).objectStore(store).count()); }
export async function kvGet<T = any>(key: string): Promise<T | undefined> { return (await get('kv', key))?.value; }
export async function kvSet(key: string, value: any): Promise<void> { await put('kv', { key, value }); }
