import type { SupabaseClient } from '@supabase/supabase-js';

// Listing engagement for host analytics: views, contact taps and shares.
// Fire-and-forget: never blocks the page or surfaces errors to the guest.
// The database ignores the listing's own host, unpublished listings and
// repeats (one view per viewer per listing every 30 minutes); this module
// also skips repeats within the tab so re-renders don't send requests.

export type ListingEventType = 'view' | 'contact_whatsapp' | 'contact_phone' | 'contact_email' | 'share';

const VIEW_REPEAT_MS = 30 * 60 * 1000;
const TAP_REPEAT_MS = 5 * 60 * 1000;
const sent = new Map<string, number>();

export function shouldSend(listingId: string, type: ListingEventType, now: number, log: Map<string, number> = sent): boolean {
  const key = `${listingId}:${type}`;
  const last = log.get(key);
  const window = type === 'view' ? VIEW_REPEAT_MS : TAP_REPEAT_MS;
  if (last !== undefined && now - last < window) return false;
  log.set(key, now);
  return true;
}

export function recordListingEvent(client: SupabaseClient | null, listingId: string | null | undefined, type: ListingEventType): void {
  if (!client || !listingId) return;
  if (!shouldSend(listingId, type, Date.now())) return;
  void Promise.resolve(client.rpc('record_listing_event', { p_listing_id: listingId, p_event_type: type }))
    .then(({ error }) => { if (error) console.warn('Listing event not recorded:', error.message); })
    .catch(() => { /* Offline or blocked: analytics only. */ });
}
