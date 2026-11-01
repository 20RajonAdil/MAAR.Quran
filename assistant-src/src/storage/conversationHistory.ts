import type { Conversation, Message } from '../types';
import { del, getAll, put, clear } from './indexedDB';
export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
export function newConversation(): Conversation { const t = Date.now(); return { id: newId(), title: 'New conversation', createdAt: t, updatedAt: t, messages: [] }; }
export async function saveConversation(c: Conversation) { await put('conversations', { ...c, updatedAt: Date.now() }); }
export async function listConversations(): Promise<Conversation[]> { return (await getAll<Conversation>('conversations')).sort((a, b) => b.updatedAt - a.updatedAt); }
export async function deleteConversation(id: string) { await del('conversations', id); }
export async function clearAllConversations() { await clear('conversations'); }
export const titleFrom = (m: Message) => m.text.replace(/\s+/g, ' ').slice(0, 60) || 'Conversation';
