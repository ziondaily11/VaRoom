import type { SupabaseClient } from '@supabase/supabase-js';

// Quick replies: answers a person saves (Chat Settings) and drops into the
// composer with "/" or the composer's button. Private to their owner
// (public.quick_replies, row-level security), read once per account while
// the app is open; every screen showing them follows changes.

export interface QuickReply {
  id: string;
  title: string;
  body: string;
}

export const QUICK_REPLY_MAX = 20;
export const QUICK_REPLY_TITLE_MAX = 60;
export const QUICK_REPLY_BODY_MAX = 1000;

const cache = new Map<string, QuickReply[]>();
const inFlight = new Map<string, Promise<QuickReply[]>>();
const listeners = new Map<string, Set<(replies: QuickReply[]) => void>>();

function publish(userId: string, replies: QuickReply[]): void {
  cache.set(userId, replies);
  listeners.get(userId)?.forEach((listener) => listener(replies));
}

export function subscribeQuickReplies(userId: string, listener: (replies: QuickReply[]) => void): () => void {
  const set = listeners.get(userId) || new Set();
  set.add(listener);
  listeners.set(userId, set);
  return () => { set.delete(listener); };
}

export const cachedQuickReplies = (userId: string): QuickReply[] | null => cache.get(userId) || null;

export function loadQuickReplies(client: SupabaseClient, userId: string): Promise<QuickReply[]> {
  const known = cache.get(userId);
  if (known) return Promise.resolve(known);
  const pending = inFlight.get(userId);
  if (pending) return pending;
  const request = (async () => {
    const { data, error } = await client.from('quick_replies').select('id,title,body').eq('user_id', userId).order('created_at');
    if (error) throw new Error(error.message);
    const replies = (data || []) as QuickReply[];
    publish(userId, replies);
    return replies;
  })().finally(() => inFlight.delete(userId));
  inFlight.set(userId, request);
  return request;
}

/** Title and text, trimmed; an error to show when they can't be saved. */
export function quickReplyProblem(title: string, body: string): string | null {
  if (!title.trim()) return 'Give it a short title.';
  if (!body.trim()) return 'Write the reply.';
  if (title.trim().length > QUICK_REPLY_TITLE_MAX) return `Keep the title under ${QUICK_REPLY_TITLE_MAX} characters.`;
  if (body.trim().length > QUICK_REPLY_BODY_MAX) return `Keep the reply under ${QUICK_REPLY_BODY_MAX} characters.`;
  return null;
}

export async function saveQuickReply(client: SupabaseClient, userId: string, reply: { id?: string; title: string; body: string }): Promise<void> {
  const row = { title: reply.title.trim(), body: reply.body.trim() };
  const query = reply.id
    ? client.from('quick_replies').update(row).eq('id', reply.id).eq('user_id', userId)
    : client.from('quick_replies').insert({ ...row, user_id: userId });
  const { data, error } = await query.select('id,title,body').single();
  if (error) throw new Error(error.message);
  const saved = data as QuickReply;
  const current = cache.get(userId) || [];
  publish(userId, reply.id ? current.map((r) => (r.id === saved.id ? saved : r)) : [...current, saved]);
}

export async function deleteQuickReply(client: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await client.from('quick_replies').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
  publish(userId, (cache.get(userId) || []).filter((r) => r.id !== id));
}

/** What's typed after "/" at the start of the composer, or null when it isn't a quick-reply search. */
export function slashQuery(text: string): string | null {
  const match = /^\/([^\n]*)$/.exec(text.trimStart());
  return match ? match[1].trim().toLowerCase() : null;
}

/** Quick replies whose title or text contains the search. */
export function matchQuickReplies(replies: QuickReply[], query: string): QuickReply[] {
  const q = query.trim().toLowerCase();
  return q ? replies.filter((r) => `${r.title} ${r.body}`.toLowerCase().includes(q)) : replies;
}

export function clearQuickRepliesCache(): void {
  cache.clear();
  inFlight.clear();
}
