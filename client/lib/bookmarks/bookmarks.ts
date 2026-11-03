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
  publish();
  const { error } = wasSaved
    ? await client.from('bookmarks').delete().eq('client_id', userId).eq('listing_id', listingId)
    : await client.from('bookmarks').insert({ client_id: userId, listing_id: listingId });
  if (error) {
    if (ownerId === userId && saved) {
      if (wasSaved) saved.add(listingId); else saved.delete(listingId);
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
}
