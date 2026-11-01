import type { Bookmark } from '../types';
import { del, getAll, put, clear } from './indexedDB';
export const bookmarkId = (kind: string, ref: string) => `${kind}:${ref}`;
export async function addBookmark(b: Omit<Bookmark, 'id' | 'createdAt'>) { const x: Bookmark = { ...b, id: bookmarkId(b.kind, b.ref), createdAt: Date.now() }; await put('bookmarks', x); return x; }
export async function removeBookmark(kind: string, ref: string) { await del('bookmarks', bookmarkId(kind, ref)); }
export async function listBookmarks(): Promise<Bookmark[]> { return (await getAll<Bookmark>('bookmarks')).sort((a, b) => b.createdAt - a.createdAt); }
export async function clearBookmarks() { await clear('bookmarks'); }
