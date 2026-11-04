import type { SupabaseClient } from '@supabase/supabase-js';
import { createCache } from '../cache/createCache';
import { CACHE_NAMESPACES } from '../cache/namespaces';
import { fetchListingContact, type ListingContact } from '../reachOut/reachOut';

// The booking page (migrated from legacy-pages/booking.html): what it loads
// about a listing, the rules that decide which booking widget it shows, the
// calendar and price arithmetic, and what it writes. The same queries,
// wording and payloads as before.

export interface ListingHost { full_name: string | null; verified: boolean | null; avatar_url: string | null; username: string | null }

/** listing_booking_details (one row); office_shop_details holds the commercial form. */
export interface BookingDetails {
  price_amount?: number | string | null;
  price_unit?: string | null;
  sale_price_amount?: number | string | null;
  sale_price_mode?: string | null;
  size_or_type?: string | null;
  bathrooms?: number | null;
  units_available?: number | null;
  amenities?: string[] | null;
  cleaning_fee?: number | null;
  available_from?: string | null;
  min_lease_months?: number | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  cancellation_policy?: string | null;
  listing_purpose?: string | null;
  office_shop_details?: unknown;
  [key: string]: unknown;
}

export interface BookingListing {
  id: string;
  title: string;
  description: string | null;
  property_description: string | null;
  location_text: string | null;
  city: string | null;
  neighborhood: string | null;
  address_visibility: string | null;
  category: string | null;
  listing_purpose: string | null;
  verified: boolean | null;
  availability_status: string | null;
  paid_listing_until: string | null;
  host_id: string;
  supports_stay: boolean | null;
  supports_table_reservation: boolean | null;
  host: ListingHost;
  listing_photos: Array<{ storage_path: string }> | null;
  listing_booking_details: BookingDetails | BookingDetails[] | null;
}

export interface DiningConfig { restaurant_name: string; opening_hours: string; tables_available: number | string }

export interface ListingDocument { id?: string; documentType?: string; downloadUrl?: string; filename?: string; mimeType?: string }

export interface Review {
  id?: string;
  rating: number;
  comment: string | null;
  created_at: string;
  client?: { full_name?: string | null; avatar_url?: string | null } | null;
}

export interface ReviewSummary { average_rating: number | null; review_count: number }
export interface ReviewsResult { reviews: Review[]; summary: ReviewSummary; error: string | null }
export interface DocumentsResult { documents: ListingDocument[]; loaded: boolean }

export const LISTING_SELECT = 'id,title,description,property_description,location_text,city,neighborhood,address_visibility,category,listing_purpose,verified,availability_status,paid_listing_until,host_id,supports_stay,supports_table_reservation,'
  + 'host:profiles!listings_host_id_fkey(full_name,verified,avatar_url,username),listing_photos(storage_path),'
  + 'listing_booking_details(*)';

export const MESSAGES = {
  noListing: 'No listing specified.',
  loadFailed: "Couldn't load that listing.",
  ownListing: "This is your own listing — you can't book it.",
  noDetails: 'This listing has no booking details set up yet.',
  noDining: 'This hotel has not finished setting up table reservations yet.',
  reviewsUnavailable: 'Reviews are temporarily unavailable.',
} as const;

// ---------- Loading ----------

/** The listing with its host, photos and booking details; null when it doesn't exist. */
export async function fetchBookingListing(client: SupabaseClient, listingId: string): Promise<BookingListing | null> {
  const { data, error } = await client.from('listings').select(LISTING_SELECT).eq('id', listingId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? withHost(data as unknown as BookingListing) : null;
}

const NO_HOST: ListingHost = { full_name: null, verified: null, avatar_url: null, username: null };

/** The host's profile can come back empty (deleted, or not visible to this account): show "Host". */
export const withHost = (listing: BookingListing): BookingListing => (listing.host ? listing : { ...listing, host: NO_HOST });

export async function fetchDiningConfig(listingId: string, fetchFn: typeof fetch = fetch): Promise<DiningConfig | null> {
  const response = await fetchFn(`/api/listings/${encodeURIComponent(listingId)}/dining-config`);
  if (!response.ok) return null;
  return ((await response.json()) as { diningConfig?: DiningConfig | null }).diningConfig || null;
}

export async function fetchDocuments(listingId: string, token: string | null, fetchFn: typeof fetch = fetch): Promise<DocumentsResult> {
  try {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetchFn(`/api/listings/${encodeURIComponent(listingId)}/documents`, { headers });
    if (response.ok) {
      const result = (await response.json()) as { documents?: unknown };
      if (result && Array.isArray(result.documents)) return { documents: result.documents as ListingDocument[], loaded: true };
    }
  } catch (error) {
    console.warn('Listing documents could not be loaded:', error);
  }
  return { documents: [], loaded: false };
}

export async function fetchReviews(listingId: string, fetchFn: typeof fetch = fetch): Promise<ReviewsResult> {
  try {
    const response = await fetchFn(`/api/listings/${encodeURIComponent(listingId)}/reviews`);
    if (!response.ok) throw new Error('Unable to load reviews');
    const payload = (await response.json()) as { reviews?: unknown; summary?: ReviewSummary | null };
    return {
      reviews: Array.isArray(payload.reviews) ? (payload.reviews as Review[]) : [],
      summary: payload.summary || { average_rating: null, review_count: 0 },
      error: null,
    };
  } catch {
    return { reviews: [], summary: { average_rating: null, review_count: 0 }, error: MESSAGES.reviewsUnavailable };
  }
}

/**
 * The listing (and, for hotels taking tables, the dining setup) and the
 * host's contact options (Reach Out): what the page needs before it can show.
 */
export interface ListingBundle { listing: BookingListing | null; diningConfig: DiningConfig | null; contact: ListingContact }

const listingCache = createCache<ListingBundle>({
  namespace: CACHE_NAMESPACES.bookingListing,
  storage: 'memory',
  ttlMs: 2 * 60 * 1000,
  maxEntries: 20,
  userScoped: true,
});

const bundleKey = (userId: string, listingId: string) => `${userId}:${listingId}`;

/** A recently loaded listing, for showing at once on a revisit. */
export function peekListingBundle(userId: string, listingId: string): ListingBundle | null {
  const entry = listingCache.read(bundleKey(userId, listingId));
  return entry ? entry.value : null;
}

export function loadListingBundle(client: SupabaseClient, userId: string, listingId: string, fetchFn: typeof fetch = fetch): Promise<ListingBundle> {
  return listingCache.load(bundleKey(userId, listingId), async () => {
    const [listing, contact] = await Promise.all([fetchBookingListing(client, listingId), fetchListingContact(client, listingId)]);
    const takesTables = Boolean(listing && listing.category === 'hotel' && listing.supports_table_reservation === true);
    return { listing, diningConfig: takesTables ? await fetchDiningConfig(listingId, fetchFn) : null, contact };
  });
}

/** After a booking the next visit reads the listing again. */
export const forgetListingBundle = (userId: string, listingId: string) => listingCache.remove(bundleKey(userId, listingId));

// Reviews and documents, kept as long as the listing; failed loads are not kept.
const extrasCache = createCache<{ reviews?: ReviewsResult; documents?: DocumentsResult }>({
  namespace: `${CACHE_NAMESPACES.bookingListing}extras:`,
  storage: 'memory',
  ttlMs: 2 * 60 * 1000,
  maxEntries: 20,
  userScoped: true,
});

export function peekExtras(userId: string, listingId: string): { reviews?: ReviewsResult; documents?: DocumentsResult } {
  const entry = extrasCache.read(bundleKey(userId, listingId));
  return entry && entry.isFresh ? entry.value : {};
}

export function rememberExtras(userId: string, listingId: string, extras: { reviews?: ReviewsResult; documents?: DocumentsResult }): void {
  const key = bundleKey(userId, listingId);
  const current = extrasCache.read(key);
  const next = { ...(current && current.isFresh ? current.value : {}), ...extras };
  if (next.reviews && next.reviews.error) delete next.reviews;
  if (next.documents && !next.documents.loaded) delete next.documents;
  extrasCache.write(key, next);
}

// ---------- What the page shows ----------

export type PropertyPurpose = 'rent' | 'sale' | 'both';

export interface BookingKind {
  details: BookingDetails;
  supportsStay: boolean;
  supportsTableReservation: boolean;
  supportsBoth: boolean;
  isProperty: boolean;
  isOfficeShop: boolean;
  officeShop: Record<string, unknown> | null;
  propertyPurpose: PropertyPurpose | null;
  isPropertySaleOnly: boolean;
  propertyHasRentalPurpose: boolean;
  isShortStay: boolean;
  isHotel: boolean;
  isHourly: boolean;
  usesRentalBooking: boolean;
  listingUnavailable: boolean;
  availabilityMessage: string;
}

const SHORT_STAY = ['airbnb', 'hotel', 'venue'];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function bookingKind(listing: BookingListing, now: number = Date.now()): BookingKind {
  const rawDetails = listing.listing_booking_details;
  const details: BookingDetails = (Array.isArray(rawDetails) ? rawDetails[0] : rawDetails) || {};
  const supportsStay = listing.category !== 'hotel' || listing.supports_stay !== false;
  const supportsTableReservation = listing.category === 'hotel' && listing.supports_table_reservation === true;
  const isProperty = listing.category === 'property';
  const isOfficeShop = ['office', 'shop'].includes(listing.category || '');
  const officeShop = isOfficeShop && isRecord(details.office_shop_details) ? details.office_shop_details : null;
  const propertyPurpose = isProperty ? ((listing.listing_purpose || details.listing_purpose || 'rent') as PropertyPurpose) : null;
  const propertyHasRentalPurpose = isProperty && (propertyPurpose === 'rent' || propertyPurpose === 'both');
  const isShortStay = supportsStay && SHORT_STAY.includes(listing.category || '');
  const paidTermExpired = Boolean(listing.paid_listing_until && new Date(listing.paid_listing_until).getTime() <= now);
  const listingUnavailable = Boolean((listing.availability_status && listing.availability_status !== 'available') || paidTermExpired);
  return {
    details,
    supportsStay,
    supportsTableReservation,
    supportsBoth: supportsStay && supportsTableReservation,
    isProperty,
    isOfficeShop,
    officeShop,
    propertyPurpose,
    isPropertySaleOnly: isProperty && propertyPurpose === 'sale',
    propertyHasRentalPurpose,
    isShortStay,
    isHotel: listing.category === 'hotel',
    isHourly: details.price_unit === 'hour',
    usesRentalBooking: !isShortStay && (!isProperty || propertyHasRentalPurpose),
    listingUnavailable,
    availabilityMessage: listingUnavailable
      ? (paidTermExpired ? 'This listing’s 30-day paid listing period has ended.' : `This listing is currently ${String(listing.availability_status).replace('_', ' ')} and cannot accept new bookings.`)
      : '',
  };
}

/** Why the listing can't be shown for booking, in the order the page always checked; null when it can. */
export function bookingPageError(bundle: ListingBundle | null, userId: string, role: 'host' | 'client'): string | null {
  const listing = bundle && bundle.listing;
  if (!listing) return MESSAGES.loadFailed;
  if (role === 'host' && listing.host_id === userId) return MESSAGES.ownListing;
  const kind = bookingKind(listing);
  const { details } = kind;
  const hasBookingDetails = Boolean(details && (kind.officeShop || details.price_amount != null || details.sale_price_amount != null || details.size_or_type || details.bathrooms != null || (Array.isArray(details.amenities) && details.amenities.length > 0)));
  if (kind.supportsStay && (!listing.listing_booking_details || !hasBookingDetails)) return MESSAGES.noDetails;
  if (kind.supportsTableReservation && !bundle.diningConfig) return MESSAGES.noDining;
  return null;
}

// ---------- Calendar ----------

export interface CalendarDates { open: Set<string>; unavailable: Set<string> }

/** Open dates, minus every day of a pending or approved booking (start to end inclusive). */
export async function fetchCalendar(client: SupabaseClient, listingId: string): Promise<CalendarDates> {
  const [availability, bookings] = await Promise.all([
    client.from('availability').select('date').eq('listing_id', listingId),
    client.from('bookings').select('start_date,end_date,status').eq('listing_id', listingId).in('status', ['pending', 'approved']),
  ]);
  const open = new Set<string>(((availability.data || []) as Array<{ date: string }>).map((row) => row.date));
  return { open, unavailable: bookedDays((bookings.data || []) as Array<{ start_date: string | null; end_date: string | null }>) };
}

export function bookedDays(bookings: Array<{ start_date: string | null; end_date: string | null }>): Set<string> {
  const days = new Set<string>();
  bookings.forEach((booking) => {
    if (!booking.start_date || !booking.end_date) return;
    const day = new Date(booking.start_date);
    const end = new Date(booking.end_date);
    while (day <= end) {
      days.add(day.toISOString().slice(0, 10));
      day.setDate(day.getDate() + 1);
    }
  });
  return days;
}

export const isOpenDay = (dates: CalendarDates, day: string) => dates.open.has(day) && !dates.unavailable.has(day);

/** Every day from check-in to check-out is open. */
export function rangeIsOpen(dates: CalendarDates, start: string, end: string): boolean {
  const day = new Date(start);
  const last = new Date(end);
  while (day <= last) {
    if (!isOpenDay(dates, day.toISOString().slice(0, 10))) return false;
    day.setDate(day.getDate() + 1);
  }
  return true;
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface CalendarMonth { title: string; leadingBlanks: number; days: string[] }

export function calendarMonth(year: number, month: number): CalendarMonth {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return {
    title: `${MONTH_NAMES[month]} ${year}`,
    leadingBlanks: new Date(year, month, 1).getDay(),
    days: Array.from({ length: daysInMonth }, (_, index) => `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`),
  };
}

export function shiftMonth(year: number, month: number, by: 1 | -1): { year: number; month: number } {
  const next = month + by;
  if (next < 0) return { year: year - 1, month: 11 };
  if (next > 11) return { year: year + 1, month: 0 };
  return { year, month: next };
}

/** A tap on an open day: the new check-in/check-out, and a note when the range crossed closed days. */
export function pickStayDay(dates: CalendarDates, start: string | null, end: string | null, day: string): { start: string; end: string | null; blocked: boolean } {
  if (!start || (start && end)) return { start: day, end: null, blocked: false };
  if (day > start) {
    if (rangeIsOpen(dates, start, day)) return { start, end: day, blocked: false };
    return { start: day, end: null, blocked: true };
  }
  return { start: day, end: null, blocked: false };
}

export const nightsBetween = (start: string, end: string) => Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// ---------- Prices ----------

export interface PriceLine { quantity: number; label: string; base: number; fee: number | null; total: number }

export function priceLine(rate: unknown, quantity: number, label: string, fee: number | null): PriceLine {
  const base = Number(rate) * quantity;
  return { quantity, label, base, fee: fee || null, total: base + (fee || 0) };
}

export const ksh = (value: number) => `KSh ${value.toLocaleString()}`;

// ---------- Writes ----------

export interface StayChoice { start: string | null; end: string | null; hours: number; leaseStart: string; leaseMonths: number }

export function bookingPayload(listing: BookingListing, kind: BookingKind, clientId: string, total: number, choice: StayChoice): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    listing_id: listing.id,
    host_id: listing.host_id,
    client_id: clientId,
    price_unit: kind.details.price_unit,
    total_price: total,
  };
  if (kind.isShortStay && kind.isHourly) {
    payload.start_date = choice.start;
    payload.hours = choice.hours;
  } else if (kind.isShortStay) {
    payload.start_date = choice.start;
    payload.end_date = choice.end;
  } else {
    payload.lease_start_date = choice.leaseStart;
    payload.lease_months = choice.leaseMonths;
  }
  return payload;
}

/** The host's "New booking request" notification; the guest is named from their profile. */
export function bookingNotification(listing: BookingListing, bookingId: string | null, client: { id: string; name: string | null; email: string | null }): Record<string, unknown> {
  return {
    recipient_user_id: listing.host_id,
    actor_user_id: client.id,
    type: 'booking_request',
    title: 'New booking request',
    message: `"${client.name || 'A guest'}" requested to book "${listing.title || 'this listing'}".`,
    related_entity_type: 'booking',
    related_entity_id: bookingId,
    booking_id: bookingId,
    event_key: `booking-request:${bookingId || listing.id}`,
    metadata: {
      listing_id: listing.id,
      listing_name: listing.title,
      booking_id: bookingId,
      client_id: client.id,
      client_name: client.name || client.email || 'Guest',
    },
  };
}

export interface TableRequest {
  listing_id: string; phone: string; guest_count: number; table_count: number;
  requested_date: string; requested_time: string; special_occasion: boolean; occasion_details: string;
}

/** Sends a table reservation request; resolves an error message, or null when it was accepted. */
export async function sendTableRequest(request: TableRequest, token: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchFn('/api/table-reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
    });
  } catch {
    return 'Network error — please try again.';
  }
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  return response.ok ? null : (result.error || 'Unable to send the reservation request.');
}

/** "Message host": the conversation for this listing (created when new). */
export async function openConversation(client: SupabaseClient, listing: BookingListing, clientId: string): Promise<string> {
  const { data, error } = await client.from('conversations')
    .upsert({ listing_id: listing.id, host_id: listing.host_id, client_id: clientId }, { onConflict: 'listing_id,client_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
