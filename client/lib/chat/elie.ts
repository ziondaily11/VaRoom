import type { SupabaseClient } from '@supabase/supabase-js';

// Elie, the VaRoom search assistant (ported from public/js/chat-data.js).
// The request, response and history rules live here; the page renders them.

export const ELIE_API_URL = 'https://elie1-0.onrender.com/elie/search';
export const ELIE_TIMEOUT_MS = 25000;
export const ELIE_HISTORY_TURNS = 6;
export const ELIE_SUGGESTED_PROMPTS = ['Airbnbs in Nairobi', 'Event venues in Nakuru', 'Offices in Westlands'];

export interface ElieTurn { role: 'user' | 'elie'; text: string }

export interface ElieNewsResult { title?: string; summary?: string; source_name?: string; source_url?: string }
export interface ElieListingResult {
  id: string;
  title?: string;
  location_text?: string;
  size_or_type?: string;
  price_amount?: number | string | null;
  verified?: boolean;
}

export interface ElieResponse {
  reply?: string;
  suggestion?: string;
  news?: ElieNewsResult[];
  listings?: ElieListingResult[];
  detail?: string;
}

/** One item in the Elie thread. */
export type ElieEntry =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'elie'; text: string }
  | { id: string; kind: 'news'; items: ElieNewsResult[] }
  | { id: string; kind: 'listings'; items: ElieListingResult[] }
  | { id: string; kind: 'error'; text: string; retryText: string };

let entryCounter = 0;
export function elieEntryId(): string {
  entryCounter += 1;
  return `elie-${Date.now().toString(36)}-${entryCounter}`;
}

/** Thread entries for one response, in legacy order: reply, news, listings, suggestion. */
export function elieResponseEntries(data: ElieResponse): ElieEntry[] {
  const entries: ElieEntry[] = [];
  if (data.reply) entries.push({ id: elieEntryId(), kind: 'elie', text: data.reply });
  if (data.news && data.news.length) entries.push({ id: elieEntryId(), kind: 'news', items: data.news });
  if (data.listings && data.listings.length) entries.push({ id: elieEntryId(), kind: 'listings', items: data.listings });
  if (data.suggestion) entries.push({ id: elieEntryId(), kind: 'elie', text: data.suggestion });
  return entries;
}

/** "Location · size · KSh price" for a listing result. */
export function elieListingMeta(listing: ElieListingResult): string {
  const price = listing.price_amount ? `KSh ${Number(listing.price_amount).toLocaleString()}` : '';
  return [listing.location_text, listing.size_or_type, price].filter(Boolean).join(' · ');
}

export class ElieRequestError extends Error {}

/**
 * Ask Elie. `history` already includes this question (legacy sends the last
 * six turns including it). Rejects with ElieRequestError carrying the text to
 * show the user.
 */
export async function askElie({ message, history, token, fetchFn = fetch, timeoutMs = ELIE_TIMEOUT_MS }: {
  message: string;
  history: ElieTurn[];
  token: string | null;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<ElieResponse> {
  if (!token) throw new ElieRequestError('Please log in again to use Elie.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchFn(ELIE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Correlation-ID': `CLIENT-${Date.now().toString(36).toUpperCase()}`,
      },
      body: JSON.stringify({ message, history: history.slice(-ELIE_HISTORY_TURNS) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && (error as Error).name === 'AbortError') throw new ElieRequestError('Elie is taking longer than expected. Please try again.');
    throw new ElieRequestError('Could not reach Elie. Please check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await response.json().catch(() => ({}))) as ElieResponse;
  if (!response.ok) throw new ElieRequestError(data.detail || 'Something went wrong reaching Elie. Please try again.');
  return data;
}

/** "Today, 9:14 AM", "Yesterday, …" or "Nov 2, 2026, …" (legacy formatHistoryDate). */
export function formatElieHistoryDate(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${time}`;
}

export interface ElieSessionSummary { id: string; title: string | null; updated_at: string | null; created_at: string | null }

/** The user's 30 most recent Elie sessions. */
export async function listElieSessions(client: SupabaseClient, userId: string): Promise<ElieSessionSummary[]> {
  const result = await client
    .from('elie_sessions')
    .select('id,title,updated_at,created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (result.error) throw result.error;
  return (result.data || []) as ElieSessionSummary[];
}

/** A past session's turns, oldest first. */
export async function loadElieTurns(client: SupabaseClient, sessionId: string): Promise<ElieTurn[]> {
  const result = await client.from('elie_messages').select('role,body').eq('session_id', sessionId).order('created_at', { ascending: true });
  if (result.error) throw result.error;
  return (result.data || []).map((row: { role: string; body: string }) => ({ role: row.role === 'user' ? 'user' : 'elie', text: row.body }));
}

/**
 * Saves turns to the user's Elie history. Saves run one after another, so
 * the session is created once (legacy could create two when a reply arrived
 * before the first save finished). Failures are logged, never shown.
 */
export function createElieRecorder(client: SupabaseClient | null, userId: string | null) {
  let sessionId: string | null = null;
  let queue: Promise<void> = Promise.resolve();

  const save = async (role: ElieTurn['role'], text: string) => {
    if (!client || !userId) return;
    if (!sessionId) {
      const created = await client.from('elie_sessions').insert({ user_id: userId, title: text.slice(0, 60) }).select().single();
      if (created.error) {
        console.warn('Elie session creation failed:', created.error);
        return;
      }
      sessionId = (created.data as { id: string }).id;
    }
    const inserted = await client.from('elie_messages').insert({ session_id: sessionId, user_id: userId, role, body: text });
    if (inserted.error) {
      console.warn('Elie message insert failed:', inserted.error);
      return;
    }
    await client.from('elie_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
  };

  return {
    record(role: ElieTurn['role'], text: string): Promise<void> {
      queue = queue.then(() => save(role, text)).catch((error) => console.warn('Elie persistence error:', error));
      return queue;
    },
    /** Continue an existing session (opened from history). */
    resume(id: string | null) { sessionId = id; },
    get sessionId() { return sessionId; },
  };
}
