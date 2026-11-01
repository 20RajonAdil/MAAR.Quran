import type { Message } from '../types';
import { contentTerms } from '../knowledge/normalize';
export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
/** Keeps the prompt inside the model's context window: recent turns verbatim (truncated), older turns reduced to a local rule-based summary. */
export function buildHistory(messages: Message[], keep = 6): { history: ChatMsg[]; summary: string } {
  const recent = messages.slice(-keep); const older = messages.slice(0, Math.max(0, messages.length - keep));
  const summary = older.filter(m => m.role === 'user').map(m => m.text.replace(/\s+/g, ' ').slice(0, 80)).slice(-8).join(' | ');
  const history = recent.map(m => ({ role: m.role, content: m.role === 'assistant' ? m.text.slice(0, 600) : m.text.slice(0, 400) }) as ChatMsg);
  return { history, summary: summary ? 'Earlier in this conversation the user asked about: ' + summary : '' };
}
export const FOLLOW_UP = /^(why|how|simpl|more|explain|example|again|what about|and |also|elaborate|detail|shorter|short|longer|summar|in simple|can you|could you|please|তাহলে|আরও|সহজ|ব্যাখ্যা|مزید|آسان|وضح|اشرح|أكثر|بسّط|बताइए|समझाइए)/i;
/** A follow-up is a short continuation ("explain more simply", "why?", "give an example") that carries at most one new content word.
 *  Anything with its own subject ("how do I bake a pizza") is a NEW question and must be answered from fresh evidence or refused. */
export function looksLikeFollowUp(q: string): boolean { const t = q.trim(); return t.length < 90 && contentTerms(t).length <= 1 && (FOLLOW_UP.test(t) || t.split(/\s+/).length <= 4); }
