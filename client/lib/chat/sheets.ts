import type { ChatListingSummary } from '../chatCache';
import type { ChatApi } from './chatMedia';

// The dialogs over a conversation (components/chat/ReportSheet and
// ShareListingSheet): the host's listings to share, the search over them,
// and the submit rule both dialogs follow.

/**
 * Runs the dialog's action and closes it when that resolves. When it
 * rejects the dialog stays open to retry (the page reports the failure).
 */
export async function submitThenClose(action: () => Promise<void>, close: () => void): Promise<void> {
  try {
    await action();
    close();
  } catch {
    // The page reports the failure; the dialog stays open to retry.
  }
}

/** Report: submit once a reason is chosen, and not while a report is being sent. */
export function canSubmitReport(reason: string, submitting: boolean): boolean {
  return !(!reason || submitting);
}

// Each host's listings, loaded once per page session (legacy kept them in
// state). Keyed by account so another sign-in never sees them.
const listingsByUser = new Map<string, Promise<ChatListingSummary[]>>();

/** The host's listings to share, one request per account per page session; a failed load is retried next time. */
export function hostListings(userId: string, api: ChatApi): Promise<ChatListingSummary[]> {
  let promise = listingsByUser.get(userId);
  if (!promise) {
    promise = api<{ listings?: ChatListingSummary[] }>('/api/chat/listings')
      .then((result) => (result && result.listings) || [])
      .catch((error) => {
        listingsByUser.delete(userId);
        throw error;
      });
    listingsByUser.set(userId, promise);
  }
  return promise;
}

/** The listings whose title or place match the search. */
export function filterShareListings(listings: ChatListingSummary[] | null, query: string): ChatListingSummary[] {
  const q = query.trim().toLowerCase();
  if (!listings || !q) return listings || [];
  return listings.filter((listing) => `${listing.title || ''} ${listing.location_text || ''}`.toLowerCase().includes(q));
}
