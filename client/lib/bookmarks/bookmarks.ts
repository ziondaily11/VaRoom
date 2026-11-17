import type { SupabaseClient } from '@supabase/supabase-js';

// The signed-in account's saved listings (the `bookmarks` table), held once
// for the session: loaded once per account (concurrent callers share the
// request), updated at once on save / unsave and rolled back if the write
// fails, and shared by every page that shows a Save button. Cleared on
// sign-out or account change (lib/auth/clearUserData.ts).

type Listener = (userId: string, ids: ReadonlySet<string>) => void;

let ownerId: string | null = null;
let saved: Set<string> | null = null;
let pending: Promise<ReadonlySet<string>> | null = null;
const listeners = new Set<Listener>();
// Bumped on every saved / unsaved listing, so the Saved list knows when it is out of date.
let version = 0;

function publish() {
  if (!ownerId || !saved) return;
  const snapshot = new Set(saved);
  listeners.forEach((listener) => listener(ownerId as string, snapshot));
}

/** The saved listing ids if already loaded for this account. */
export function peekBookmarks(userId: string): ReadonlySet<string> | null {
  return ownerId === userId && saved ? new Set(saved) : null;
}

export function loadBookmarks(client: SupabaseClient, userId: string): Promise<ReadonlySet<string>> {
  if (ownerId === userId && saved) return Promise.resolve(new Set(saved));
  if (ownerId === userId && pending) return pending;
  ownerId = userId;
  saved = null;
  const request = Promise.resolve(client.from('bookmarks').select('listing_id').eq('client_id', userId)).then(({ data, error }) => {
    if (error) throw error;
    if (ownerId !== userId) return new Set<string>();
    saved = new Set(((data || []) as Array<{ listing_id: string }>).map((row) => row.listing_id));
    publish();
    return new Set(saved);
  }).finally(() => {
    if (pending === request) pending = null;
  });
  pending = request;
  return request;
}

/** Save or unsave a listing; resolves whether it is now saved, or throws (and restores) on failure. */
export async function toggleBookmark(client: SupabaseClient, userId: string, listingId: string): Promise<boolean> {
  if (ownerId !== userId || !saved) await loadBookmarks(client, userId);
  const set = saved as Set<string>;
  const wasSaved = set.has(listingId);
  if (wasSaved) set.delete(listingId); else set.add(listingId);
  version += 1;
  publish();
  const { error } = wasSaved
    ? await client.from('bookmarks').delete().eq('client_id', userId).eq('listing_id', listingId)
    : await client.from('bookmarks').insert({ client_id: userId, listing_id: listingId });
  if (error) {
    if (ownerId === userId && saved) {
      if (wasSaved) saved.add(listingId); else saved.delete(listingId);
      version += 1;
      publish();
    }
    throw error;
  }
  return !wasSaved;
}

export function subscribeBookmarks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearBookmarks(): void {
  ownerId = null;
  saved = null;
  pending = null;
  savedListings = null;
  savedListingsPending = null;
  version += 1;
}

// ---------- The Saved list (Profile → Saved) ----------

export interface SavedListing {
  id: string;
  title: string | null;
  location_text: string | null;
  category: string | null;
  availability_status: string | null;
  listing_photos: Array<{ storage_path: string | null }> | null;
  listing_booking_details: SavedListingPrice | SavedListingPrice[] | null;
}
export interface SavedListingPrice {
  price_amount: number | string | null;
  price_unit: string | null;
  listing_purpose?: string | null;
  sale_price_amount?: number | string | null;
}

const SAVED_SELECT = 'created_at,listing:listings(id,title,location_text,category,availability_status,'
  + 'listing_photos(storage_path),listing_booking_details(price_amount,price_unit,listing_purpose,sale_price_amount))';
const SAVED_TTL_MS = 2 * 60 * 1000;

let savedListings: { owner: string; version: number; at: number; rows: SavedListing[] } | null = null;
let savedListingsPending: { owner: string; version: number; request: Promise<SavedListing[]> } | null = null;

/** The Saved list if it is still current for this account (shown at once on return). */
export function peekSavedListings(userId: string, now: number = Date.now()): SavedListing[] | null {
  return savedListings && savedListings.owner === userId && savedListings.version === version && now - savedListings.at < SAVED_TTL_MS
    ? savedListings.rows
    : null;
}

/**
 * The account's saved listings, most recently saved first, in one request.
 * Listings no longer visible (removed or hidden) are left out.
 */
export function loadSavedListings(client: SupabaseClient, userId: string, now: () => number = Date.now): Promise<SavedListing[]> {
  const current = peekSavedListings(userId, now());
  if (current) return Promise.resolve(current);
  if (savedListingsPending && savedListingsPending.owner === userId && savedListingsPending.version === version) return savedListingsPending.request;
  const requestVersion = version;
  const request = Promise.resolve(
    client.from('bookmarks').select(SAVED_SELECT).eq('client_id', userId).order('created_at', { ascending: false }),
  ).then(({ data, error }) => {
    if (error) throw error;
    const rows = ((data || []) as unknown as Array<{ listing: SavedListing | SavedListing[] | null }>)
      .map((row) => (Array.isArray(row.listing) ? row.listing[0] : row.listing))
      .filter((listing): listing is SavedListing => Boolean(listing && listing.id));
    if (ownerId === null || ownerId === userId) savedListings = { owner: userId, version: requestVersion, at: now(), rows };
    return rows;
  }).finally(() => {
    if (savedListingsPending && savedListingsPending.request === request) savedListingsPending = null;
  });
  savedListingsPending = { owner: userId, version: requestVersion, request };
  return request;
}
