// A host's actions on their own listing (the ⋮ menu), replacing
// public/js/host-listing-controls.js: status changes, duplicate and delete
// through the listings API, and the share link. Each change also updates
// the shared listing feed cache and fires the legacy `varoom:listing-updated`
// / `varoom:listing-deleted` events, which pages still on the old scripts
// (host-home) listen to. Each niche's own controls (mark sold / rented /
// leased, relist, under offer) are in the menu too (migration 000087).

import { isMarkedStatus, listingAction, listingOutcomes, propertyPurpose, unitsLeft, type ActionListing, type ListingOutcome } from './listingAction';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** What the menu sets: a live listing pauses, any other comes back (booked / unavailable are no longer offered). */
export type ListingStatus = 'available' | 'paused';

export interface MenuListing extends ActionListing {
  id: string;
  title?: string | null;
  availability_status?: string | null;
  listing_draft_id?: string | null;
  under_offer?: boolean | null;
}

/** What changed on a listing, for the feed cache and the page showing it. */
export interface ListingPatch {
  availability_status?: string;
  under_offer?: boolean;
  listing_booking_details?: unknown;
}

/** A button in the page's toast (Undo). */
export interface ToastAction { label: string; run: () => void }

/** The listing's details with a new unit count, in the shape it was read (one row or a list of one). */
export function unitsPatch(listing: MenuListing, units: number | null): ListingPatch {
  if (listing.category !== 'property' || units == null) return {};
  const raw = listing.listing_booking_details;
  const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
  const next = { ...(row || {}), units_available: units };
  return { listing_booking_details: Array.isArray(raw) ? [next] : next };
}

/** Pause a live listing; anything else (paused, a draft, or the old booked / unavailable) is made available. */
export const statusToggle = (listing: MenuListing): { status: ListingStatus; label: string } => ((listing.availability_status || 'available') === 'available'
  ? { status: 'paused', label: 'Pause listing' }
  : { status: 'available', label: 'Make available' });

/** The guest requests behind "View …": none for a sale-only property (buyers come through chat). */
export function requestsLabel(listing: MenuListing): string | null {
  if (listing.category === 'property' && propertyPurpose(listing) === 'sale') return null;
  const action = listingAction(listing);
  if (action === 'Lease') return 'View lease requests';
  return action === 'Rent' || action === 'Rent or buy' ? 'View rental requests' : 'View bookings';
}

/** Under offer applies to a property for sale that is still on the market. */
export const canBeUnderOffer = (listing: MenuListing) => listingOutcomes(listing).includes('sold');

/** The menu's "Change listing status" items for this listing. */
export type StatusControl =
  | { kind: 'status'; status: ListingStatus; label: string }
  | { kind: 'mark'; outcome: ListingOutcome; label: string }
  | { kind: 'offer'; label: string }
  | { kind: 'relist'; label: string };

/**
 * Marked sold / rented / leased: only Relist. Otherwise Pause / Make available,
 * then (on the market) its niche's Mark as… items, "units" when a property has
 * several, and Under offer for a sale.
 */
export function statusControls(listing: MenuListing): StatusControl[] {
  if (isMarkedStatus(listing.availability_status)) return [{ kind: 'relist', label: 'Relist…' }];
  const controls: StatusControl[] = [{ kind: 'status', ...statusToggle(listing) }];
  if (isDraft(listing)) return controls;
  const several = unitsLeft(listing) > 1;
  listingOutcomes(listing).forEach((outcome) => controls.push({ kind: 'mark', outcome, label: several ? `Mark units as ${outcome}…` : `Mark as ${outcome}…` }));
  if (canBeUnderOffer(listing)) controls.push({ kind: 'offer', label: listing.under_offer ? 'Remove under offer' : 'Mark under offer' });
  return controls;
}

/** Phones and tablets share through the share sheet; computers copy the link (the Windows share panel is no use there). */
export const sharesWithSheet = () => typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  && Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

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

export interface OutcomeResult {
  outcome: { id: string; outcome: ListingOutcome; units: number };
  listing: { id: string; availability_status: string; under_offer: boolean; units_available: number | null };
}

/** Mark it (or some of a property's units) sold, rented or leased; the last unit takes it offline. */
export async function markListing(token: string | null, id: string, input: { outcome: ListingOutcome; units?: number; agreedAmount?: number | null; bookingId?: string | null }, fetchFn: FetchFn = fetch): Promise<OutcomeResult> {
  const body: Record<string, unknown> = { outcome: input.outcome, units: input.units ?? 1 };
  if (input.agreedAmount != null) body.agreed_amount = input.agreedAmount;
  if (input.bookingId) body.booking_id = input.bookingId;
  return (await request(fetchFn, token, `/listings/${encodeURIComponent(id)}/outcomes`, { method: 'POST', body: JSON.stringify(body) })) as unknown as OutcomeResult;
}

/** Undo a mark within 10 minutes: its status and units come back. */
export async function undoOutcome(token: string | null, listingId: string, outcomeId: string, fetchFn: FetchFn = fetch): Promise<OutcomeResult['listing']> {
  const body = await request(fetchFn, token, `/listings/${encodeURIComponent(listingId)}/outcomes/${encodeURIComponent(outcomeId)}/void`, { method: 'POST', body: '{}' });
  return body.listing as OutcomeResult['listing'];
}

/** Back on the market: a property with the units available again, then online as Make available. */
export async function relistListing(token: string | null, id: string, units: number | null, fetchFn: FetchFn = fetch): Promise<string> {
  const body = await request(fetchFn, token, `/listings/${encodeURIComponent(id)}/relist`, { method: 'POST', body: JSON.stringify(units ? { units } : {}) });
  const listing = body.listing as { availability_status?: string } | undefined;
  return (listing && listing.availability_status) || 'available';
}

export async function setUnderOffer(token: string | null, id: string, underOffer: boolean, fetchFn: FetchFn = fetch): Promise<boolean> {
  const body = await request(fetchFn, token, `/listings/${encodeURIComponent(id)}/under-offer`, { method: 'PATCH', body: JSON.stringify({ under_offer: underOffer }) });
  return Boolean((body.listing as { under_offer?: boolean } | undefined)?.under_offer);
}

export async function duplicateListing(token: string | null, id: string, fetchFn: FetchFn = fetch): Promise<void> {
  await request(fetchFn, token, `/listings/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
}

export async function deleteListing(token: string | null, id: string, fetchFn: FetchFn = fetch): Promise<void> {
  await request(fetchFn, token, `/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Discard a saved draft (Discard draft on the host's profile): the draft and,
 * when it has an unpublished listing, that listing too, whose media is then
 * queued for cleanup. Refused while a payment for the listing is in progress.
 */
export async function discardListingDraft(token: string | null, draftId: string, fetchFn: FetchFn = fetch): Promise<void> {
  await request(fetchFn, token, `/listing-drafts/${encodeURIComponent(draftId)}?discard=1`, { method: 'DELETE' });
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
  updateListing?: (id: string, patch: ListingPatch) => void;
  removeListing?: (id: string) => void;
  invalidateAll?: () => void;
}

const feedCache = (): FeedCacheLike | null => (typeof window === 'undefined'
  ? null
  : ((window as unknown as { VaRoomListingFeedCache?: FeedCacheLike }).VaRoomListingFeedCache || null));

/** A listing's status changed: the feed cache and every listening page. */
export function publishListingUpdate(id: string, patch: ListingPatch): void {
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
