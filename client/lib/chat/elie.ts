import type { SupabaseClient } from '@supabase/supabase-js';
import type { VcoinWallet } from './vcoins';
import type { ChatListingSummary } from '../chatCache';

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
  category?: string | null;
  size_or_type?: string;
  price_amount?: number | string | null;
  price_unit?: string | null;
  listing_purpose?: string | null;
  sale_price_amount?: number | string | null;
  sale_price_mode?: string | null;
  /** The first photo's storage path (photo_url is its public URL). */
  photo_path?: string | null;
  photo_url?: string | null;
  verified?: boolean;
  /** Booking-page amenity keys (offices and shops: the services ticked). */
  amenities?: string[];
}

/** An answer about amenities: each listing's grid shows, these keys first. */
export interface ElieAmenityView { highlight: string[] }

export interface ElieResponse {
  reply?: string;
  suggestion?: string;
  news?: ElieNewsResult[];
  listings?: ElieListingResult[];
  detail?: string;
  /** The V-Coin balance after this answer (chatbot/main.py). */
  vcoins?: VcoinWallet & { charged?: number };
  /** Too few V-Coins: Elie asked for a top-up instead of searching. */
  needs_topup?: boolean;
  /** The Elie service saved the question and this answer to the session. */
  saved?: boolean;
  /** Show each listing's amenities, the highlighted ones first. */
  show_amenities?: boolean | null;
  highlight_amenities?: string[] | null;
}

/** What an answer showed besides its text, kept with it in elie_messages.results. */
export interface ElieResults { listings?: ElieListingResult[]; news?: ElieNewsResult[]; amenities?: ElieAmenityView }

/** One item in the Elie thread. */
export type ElieEntry =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'elie'; text: string }
  | { id: string; kind: 'news'; items: ElieNewsResult[] }
  | { id: string; kind: 'listings'; items: ElieListingResult[]; amenities?: ElieAmenityView }
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
  if (data.listings && data.listings.length) {
    entries.push({ id: elieEntryId(), kind: 'listings', items: data.listings, ...(data.show_amenities ? { amenities: { highlight: data.highlight_amenities || [] } } : {}) });
  }
  if (data.suggestion) entries.push({ id: elieEntryId(), kind: 'elie', text: data.suggestion });
  return entries;
}

export const ELIE_SHOWN_LISTINGS = 12;

/** The listings the thread shows, latest search first and each in its order:
 *  Elie answers questions about them ("does the first one have Wi-Fi?"). */
export function elieShownListingIds(entries: ElieEntry[]): string[] {
  const ids = entries.slice().reverse().flatMap((entry) => (entry.kind === 'listings' ? entry.items.map((item) => item.id) : []));
  return Array.from(new Set(ids)).slice(0, ELIE_SHOWN_LISTINGS);
}

const PHOTO_BUCKET_PATH = '/storage/v1/object/public/listing-photos/';

/**
 * A listing Elie found, as the chat's listing card takes it: the photo by its
 * storage path and the booking details the Marketplace price reads.
 */
export function elieListingSummary(listing: ElieListingResult): ChatListingSummary {
  const fromUrl = listing.photo_url && listing.photo_url.includes(PHOTO_BUCKET_PATH)
    ? decodeURIComponent(listing.photo_url.split(PHOTO_BUCKET_PATH)[1] || '') : '';
  const photoPath = listing.photo_path || fromUrl;
  const hasPrice = listing.price_amount != null || listing.sale_price_amount != null;
  return {
    id: listing.id,
    title: listing.title || null,
    location_text: listing.location_text || null,
    category: listing.category || null,
    listing_photos: photoPath ? [{ storage_path: photoPath }] : [],
    listing_booking_details: hasPrice ? {
      price_amount: listing.price_amount ?? null,
      price_unit: listing.price_unit || null,
      listing_purpose: listing.listing_purpose || null,
      sale_price_amount: listing.sale_price_amount ?? null,
      sale_price_mode: listing.sale_price_mode || null,
    } : null,
  };
}

export class ElieRequestError extends Error {}

/**
 * Ask Elie. `history` already includes this question (legacy sends the last
 * six turns including it). Rejects with ElieRequestError carrying the text to
 * show the user.
 */
export async function askElie({ message, history, token, sessionId = null, listingIds = [], fetchFn = fetch, timeoutMs = ELIE_TIMEOUT_MS }: {
  message: string;
  history: ElieTurn[];
  token: string | null;
  /** The session the Elie service saves the question and answer to. */
  sessionId?: string | null;
  /** The listings already shown (elieShownListingIds). */
  listingIds?: string[];
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
      body: JSON.stringify({
        message,
        history: history.slice(-ELIE_HISTORY_TURNS),
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(listingIds.length ? { listing_ids: listingIds } : {}),
      }),
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

/** A saved turn: its text, and the listings and news an answer showed. */
export interface ElieStoredTurn { role: ElieTurn['role']; text: string; results: ElieResults | null }

// Before migration 000080 elie_messages has no results column.
const missingResults = (error: { code?: string; message?: string } | null) => Boolean(error && (error.code === '42703' || /results/.test(error.message || '')));

/** A past session's turns, oldest first. */
export async function loadElieTurns(client: SupabaseClient, sessionId: string): Promise<ElieStoredTurn[]> {
  const query = (columns: string) => client.from('elie_messages').select(columns).eq('session_id', sessionId).order('created_at', { ascending: true });
  let result = await query('role,body,results');
  if (result.error && missingResults(result.error)) result = await query('role,body');
  if (result.error) throw result.error;
  return ((result.data || []) as unknown as Array<{ role: string; body: string; results?: ElieResults | null }>).map((row) => ({
    role: row.role === 'user' ? 'user' : 'elie',
    text: row.body,
    results: row.results || null,
  }));
}

/** The thread for saved turns: questions, answers with their news and listing cards. */
export function elieTurnEntries(turns: ElieStoredTurn[]): ElieEntry[] {
  return turns.flatMap((turn): ElieEntry[] => (turn.role === 'user'
    ? [{ id: elieEntryId(), kind: 'user', text: turn.text }]
    : elieResponseEntries({
      reply: turn.text,
      listings: turn.results?.listings,
      news: turn.results?.news,
      show_amenities: Boolean(turn.results?.amenities),
      highlight_amenities: turn.results?.amenities?.highlight,
    })));
}

/** A new Elie session, titled by its first question. */
export async function createElieSession(client: SupabaseClient, userId: string, question: string): Promise<string> {
  const created = await client.from('elie_sessions').insert({ user_id: userId, title: question.slice(0, 60) }).select('id').single();
  if (created.error || !created.data) throw created.error || new Error('The Elie session was not created');
  return (created.data as { id: string }).id;
}

/** An answer's text as saved: the reply, then any suggestion. */
export const elieAnswerText = (data: ElieResponse) => [data.reply, data.suggestion].filter(Boolean).join('\n\n');

/**
 * Saves a question and its answer from the page, when the Elie service could
 * not (an older service, or its save failed). The answer is a moment later,
 * so it always reads after its question.
 */
export async function saveElieTurns(client: SupabaseClient, { sessionId, userId, question, data, now = Date.now() }: {
  sessionId: string; userId: string; question: string; data: ElieResponse; now?: number;
}): Promise<void> {
  const results: ElieResults = {};
  if (data.listings && data.listings.length) results.listings = data.listings;
  if (data.news && data.news.length) results.news = data.news;
  if (data.show_amenities && results.listings) results.amenities = { highlight: data.highlight_amenities || [] };
  const hasResults = Boolean(results.listings || results.news);
  const rows = [
    { session_id: sessionId, user_id: userId, role: 'user', body: question, created_at: new Date(now).toISOString() },
    { session_id: sessionId, user_id: userId, role: 'elie', body: elieAnswerText(data), created_at: new Date(now + 1).toISOString(), ...(hasResults ? { results } : {}) },
  ];
  let inserted = await client.from('elie_messages').insert(rows);
  if (inserted.error && missingResults(inserted.error)) inserted = await client.from('elie_messages').insert(rows.map(({ results: _results, ...row }: Record<string, unknown>) => row));
  if (inserted.error) throw inserted.error;
  await client.from('elie_sessions').update({ updated_at: new Date(now).toISOString() }).eq('id', sessionId);
}
