export function deleteDatabase(): Promise<void> { return new Promise(res => { const r = indexedDB.deleteDatabase('maar-assistant'); r.onsuccess = r.onerror = r.onblocked = () => res(); }); }
