// A host's actions on their own listing (the ⋮ menu), replacing
// public/js/host-listing-controls.js: status changes, duplicate and delete
// through the listings API, and the share link. Each change also updates
// the shared listing feed cache and fires the legacy `varoom:listing-updated`
// / `varoom:listing-deleted` events, which pages still on the old scripts
// (host-home) listen to. Import-free.

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type ListingStatus = 'available' | 'booked' | 'unavailable' | 'paused' | 'draft';

export const STATUS_ACTIONS: Array<{ status: ListingStatus; label: string }> = [
  { status: 'available', label: 'Make available' },
  { status: 'booked', label: 'Mark booked' },
  { status: 'unavailable', label: 'Mark unavailable' },
  { status: 'paused', label: 'Pause listing' },
  { status: 'draft', label: 'Save as draft' },
];

export interface MenuListing {
  id: string;
  title?: string | null;
  availability_status?: string | null;
  listing_draft_id?: string | null;
}

export class ListingActionError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'ListingActionError';
    this.code = code;
  }
}

async function request(fetchFn: FetchFn, token: string | null, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  if (!token) throw new ListingActionError('Please sign in again.', null);
  const response = await fetchFn(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  let body: Record<string, unknown> = {};
  try { body = (await response.json()) as Record<string, unknown>; } catch { body = {}; }
  if (!response.ok) throw new ListingActionError(typeof body.error === 'string' ? body.error : 'Request failed', typeof body.code === 'string' ? body.code : null);
  return body;
}

/** The status the server saved. */
export async function setListingStatus(token: string | null, id: string, status: ListingStatus, fetchFn: FetchFn = fetch): Promise<string> {
  const body = await request(fetchFn, token, `/listings/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  const listing = body.listing as { availability_status?: string } | undefined;
  return listing && listing.availability_status ? listing.availability_status : status;
}

export async function duplicateListing(token: string | null, id: string, fetchFn: FetchFn = fetch): Promise<void> {
  await request(fetchFn, token, `/listings/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
}

export async function deleteListing(token: string | null, id: string, fetchFn: FetchFn = fetch): Promise<void> {
  await request(fetchFn, token, `/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const listingShareUrl = (origin: string, id: string) => `${origin}/booking?listing=${encodeURIComponent(id)}`;

export const isDraft = (listing: MenuListing) => listing.availability_status === 'draft';
export const editLabel = (listing: MenuListing) => (listing.listing_draft_id || isDraft(listing) ? 'Continue Listing' : 'Edit listing');
export const editHref = (listing: MenuListing) => (listing.listing_draft_id
  ? `/list?draft=${encodeURIComponent(listing.listing_draft_id)}`
  : `/list?edit=${encodeURIComponent(listing.id)}`);
export const deleteLabel = (listing: MenuListing) => (isDraft(listing) ? 'Delete draft permanently' : 'Delete listing');

export function deleteConfirmText(listing: MenuListing): { title: string; body: string } {
  return isDraft(listing)
    ? { title: 'Delete draft listing?', body: `This permanently removes "${listing.title || 'this draft'}" and its listing media from VaRoom, including Discover and all profiles. This cannot be undone.` }
    : { title: 'Delete listing?', body: 'This is permanent. The listing, its photos, and discovery record will be removed.' };
}

// ---------- Shared listing state ----------

interface FeedCacheLike {
  updateListing?: (id: string, patch: Record<string, unknown>) => void;
  removeListing?: (id: string) => void;
  invalidateAll?: () => void;
}

const feedCache = (): FeedCacheLike | null => (typeof window === 'undefined'
  ? null
  : ((window as unknown as { VaRoomListingFeedCache?: FeedCacheLike }).VaRoomListingFeedCache || null));

/** A listing's status changed: the feed cache and every listening page. */
export function publishListingUpdate(id: string, patch: Record<string, unknown>): void {
  try { feedCache()?.updateListing?.(id, patch); } catch { /* cache unavailable */ }
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('varoom:listing-updated', { detail: { id, patch } }));
}

export function publishListingDeleted(id: string): void {
  try { feedCache()?.removeListing?.(id); } catch { /* cache unavailable */ }
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('varoom:listing-deleted', { detail: { id } }));
}

export function invalidateListingFeeds(): void {
  try { feedCache()?.invalidateAll?.(); } catch { /* cache unavailable */ }
}

const pending = new Set<string>();

/**
 * Optimistic status change: shown at once, confirmed by the server, rolled
 * back with the server's message when it refuses. One change per listing at
 * a time; returns null while another is in flight.
 */
export async function changeListingStatus(
  token: string | null, listing: MenuListing, status: ListingStatus, fetchFn: FetchFn = fetch,
): Promise<{ status: string; error: string | null } | null> {
  if (pending.has(listing.id)) return null;
  const previous = listing.availability_status || 'available';
  pending.add(listing.id);
  publishListingUpdate(listing.id, { availability_status: status });
  try {
    const saved = await setListingStatus(token, listing.id, status, fetchFn);
    publishListingUpdate(listing.id, { availability_status: saved });
    return { status: saved, error: null };
  } catch (error) {
    publishListingUpdate(listing.id, { availability_status: previous });
    return { status: previous, error: `Could not save listing status: ${(error as Error).message}` };
  } finally {
    pending.delete(listing.id);
  }
}

export function isStatusPending(id: string): boolean {
  return pending.has(id);
}
