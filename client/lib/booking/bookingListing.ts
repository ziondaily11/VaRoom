import type { SupabaseClient } from '@supabase/supabase-js';
import { createCache } from '../cache/createCache';
import { CACHE_NAMESPACES } from '../cache/namespaces';
import { fetchListingContact, type ListingContact } from '../reachOut/reachOut';
import { startListingChat } from '../chat/startChat';
import { listingAction, type ActionListing } from '../listings/listingAction';

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
  /** Airbnb and hotel: bedrooms (0 = studio) and beds; venues: seated and standing guests. */
  bedrooms?: number | null;
  beds?: number | null;
  seated_capacity?: number | null;
  standing_capacity?: number | null;
  max_guests?: number | null;
  amenities?: string[] | null;
  cleaning_fee?: number | null;
  available_from?: string | null;
  min_lease_months?: number | null;
  /** Property rentals: the deposit and whether utilities are in the rent. */
  deposit_amount?: number | string | null;
  utilities_included?: boolean | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  cancellation_policy?: string | null;
  instant_book?: boolean | null;
  min_notice_days?: number | null;
  max_advance_days?: number | null;
  min_stay_nights?: number | null;
  max_stay_nights?: number | null;
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
  /** A sale property with an offer in progress (migration 000085). */
  under_offer?: boolean | null;
  verified: boolean | null;
  availability_status: string | null;
  paid_listing_until: string | null;
  live_until?: string | null;
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

export const LISTING_SELECT = 'id,title,description,property_description,location_text,city,neighborhood,address_visibility,category,listing_purpose,under_offer,verified,availability_status,paid_listing_until,live_until,host_id,supports_stay,supports_table_reservation,'
  + 'host:profiles!listings_host_id_fkey(full_name,verified,avatar_url,username),listing_photos(storage_path),'
  + 'listing_booking_details(*)';

export const MESSAGES = {
  noListing: 'No listing specified.',
  loadFailed: "Couldn't load that listing.",
  ownListing: (listing: ActionListing) => `This is your own listing. Guests ${listingAction(listing).toLowerCase()} it here.`,
  ownContact: 'This is your own contact. Guests use these buttons to reach you.',
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
  // Offline: its Silver / Gold term or the host's plan has ended (listings.live_until).
  const offline = !(listing.live_until && new Date(listing.live_until).getTime() > now);
  const listingUnavailable = Boolean((listing.availability_status && listing.availability_status !== 'available') || offline);
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
      // Its own status first (booked, paused…); offline only says so for an otherwise available listing.
      ? (listing.availability_status && listing.availability_status !== 'available'
        ? (['sold', 'rented', 'leased'].includes(listing.availability_status)
          ? `This listing has been ${listing.availability_status}.`
          : `This listing is currently ${String(listing.availability_status).replace('_', ' ')} and cannot accept new bookings.`)
        : listing.paid_listing_until ? 'This listing’s 30-day paid listing period has ended.' : 'This listing is offline right now and cannot accept new bookings.')
      : '',
  };
}

/** Why the listing can't be shown for booking, in the order the page always checked; null when it can. */
/**
 * Why the page can't show this listing, or null. The owner sees their own
 * listing like a guest (with owner notes instead of the actions; see isOwnListing).
 */
export function bookingPageError(bundle: ListingBundle | null): string | null {
  const listing = bundle && bundle.listing;
  if (!listing) return MESSAGES.loadFailed;
  const kind = bookingKind(listing);
  const { details } = kind;
  const hasBookingDetails = Boolean(details && (kind.officeShop || details.price_amount != null || details.sale_price_amount != null || details.size_or_type || details.bathrooms != null || (Array.isArray(details.amenities) && details.amenities.length > 0)));
  if (kind.supportsStay && (!listing.listing_booking_details || !hasBookingDetails)) return MESSAGES.noDetails;
  if (kind.supportsTableReservation && !bundle.diningConfig) return MESSAGES.noDining;
  return null;
}

/** The signed-in account owns this listing: it can look, not book or contact itself. */
export const isOwnListing = (listing: Pick<BookingListing, 'host_id'>, userId: string | null): boolean => Boolean(userId && listing.host_id === userId);

// ---------- Reviews ----------

/**
 * Properties, offices and shops are not stayed in, so reviews are not part
 * of them: the page shows nothing about reviews until one exists. Every
 * other listing shows its reviews, or an invitation to write the first one.
 */
export const reviewsOptional = (kind: Pick<BookingKind, 'isProperty' | 'isOfficeShop'>): boolean => kind.isProperty || kind.isOfficeShop;

/** How many reviews the listing has (0 while loading or when they could not be read). */
export function reviewCount(reviews: ReviewsResult | null): number {
  if (!reviews || reviews.error) return 0;
  return Number(reviews.summary.review_count || reviews.reviews.length) || 0;
}

// ---------- Property: sale and rent ----------

export type PropertyOption = 'sale' | 'rent';

/**
 * Which of sale and rent a property offers, for the Buy / Rent buttons: the
 * host's purpose, limited to the options with a price. With no price at all,
 * the purpose alone decides (the panel then says the price is not provided).
 */
export function propertyOptions(kind: Pick<BookingKind, 'isProperty' | 'propertyPurpose' | 'details'>): PropertyOption[] {
  if (!kind.isProperty) return [];
  const purpose = kind.propertyPurpose || 'rent';
  const offered: PropertyOption[] = [];
  if (purpose === 'sale' || purpose === 'both') offered.push('sale');
  if (purpose === 'rent' || purpose === 'both') offered.push('rent');
  const price = (value: unknown) => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
  const priced = offered.filter((option) => price(option === 'sale' ? kind.details.sale_price_amount : kind.details.price_amount));
  return priced.length ? priced : offered;
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

/**
 * The calendar day after `day` ("2026-11-20" → "2026-11-21"). Worked out in
 * UTC, so a clock change (summer time) where the guest is can never skip or
 * repeat a day, as stepping a local Date and reading it back in UTC could.
 */
export function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/** Every day from `start` to `end`, both included (date-only strings). */
function eachDay(start: string, end: string, visit: (day: string) => boolean | void): void {
  const first = start.slice(0, 10);
  const last = end.slice(0, 10);
  for (let day = first, guard = 0; day <= last && guard < 4000; day = nextDay(day), guard += 1) {
    if (visit(day) === false) return;
  }
}

export function bookedDays(bookings: Array<{ start_date: string | null; end_date: string | null }>): Set<string> {
  const days = new Set<string>();
  bookings.forEach((booking) => {
    if (!booking.start_date || !booking.end_date) return;
    eachDay(booking.start_date, booking.end_date, (day) => { days.add(day); });
  });
  return days;
}

export const isOpenDay = (dates: CalendarDates, day: string) => dates.open.has(day) && !dates.unavailable.has(day);

/** Every day from check-in to check-out is open. */
export function rangeIsOpen(dates: CalendarDates, start: string, end: string): boolean {
  let open = true;
  eachDay(start, end, (day) => {
    if (!isOpenDay(dates, day)) { open = false; return false; }
    return true;
  });
  return open;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A calendar day as people read it: "Fri 20 Nov", or "Fri 20 Nov 2026" with
 * the year. The day is read as that date where the guest is (not UTC).
 */
export function dayLabel(day: string, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || '');
  if (!match) return day || '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const text = `${SHORT_DAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
  return withYear ? `${text} ${date.getFullYear()}` : text;
}

/** Today as a date-only string, where the guest is. */
export const todayString = (today: Date = new Date()) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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

// ---------- Booking rules (the database enforces the same ones) ----------

const dayString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };

/** The first and last day a guest can start a booking (minimum notice, how far ahead). */
export function bookingWindow(details: BookingDetails, today: Date = new Date()): { first: string; last: string | null } {
  return {
    first: dayString(addDays(today, Math.max(0, Number(details.min_notice_days) || 0))),
    last: details.max_advance_days ? dayString(addDays(today, Number(details.max_advance_days))) : null,
  };
}

/** Open dates limited to the booking window. */
export function windowedCalendar(dates: CalendarDates, window: { first: string; last: string | null }): CalendarDates {
  return { ...dates, open: new Set(Array.from(dates.open).filter((day) => day >= window.first && (!window.last || day <= window.last))) };
}

/** Why a stay of these nights can't be booked, or null. */
export function stayProblem(details: BookingDetails, nights: number): string | null {
  if (details.min_stay_nights && nights < Number(details.min_stay_nights)) return `The minimum stay is ${plural(Number(details.min_stay_nights), 'night')}.`;
  if (details.max_stay_nights && nights > Number(details.max_stay_nights)) return `The maximum stay is ${plural(Number(details.max_stay_nights), 'night')}.`;
  return null;
}

/** Nightly stays on an instant-book listing are confirmed at once. */
export const isInstantBooking = (kind: BookingKind) => Boolean(kind.isShortStay && !kind.isHourly && kind.details.instant_book);

/** The guest-facing text for a failed booking insert. */
export const bookingFailureText = (message: string) => (message.startsWith('booking_rule: ') ? message.slice('booking_rule: '.length) : `Something went wrong: ${message}`);

export const nightsBetween = (start: string, end: string) => Math.round((Date.parse(`${end.slice(0, 10)}T00:00:00Z`) - Date.parse(`${start.slice(0, 10)}T00:00:00Z`)) / 86400000);
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * What a stay or venue is like, as booking-page chips: Airbnb bedrooms, beds,
 * bathrooms and guests; hotel room type, beds, guests and rooms of this type;
 * venue seated and standing guests. Listings saved before these numbers
 * existed show their free-text size_or_type instead.
 */
export function spaceChips(category: string | null, details: Pick<BookingDetails, 'size_or_type' | 'bedrooms' | 'beds' | 'bathrooms' | 'max_guests' | 'units_available' | 'seated_capacity' | 'standing_capacity'>): string[] {
  const count = (value: unknown) => (value != null && Number(value) >= 0 ? Number(value) : null);
  const bedrooms = count(details.bedrooms);
  const beds = count(details.beds);
  const baths = count(details.bathrooms);
  const guests = count(details.max_guests);
  const chips: Array<string | null> = [];
  if (category === 'airbnb') {
    chips.push(bedrooms === null ? null : bedrooms === 0 ? 'Studio' : plural(bedrooms, 'bedroom'));
    chips.push(beds ? plural(beds, 'bed') : null, baths ? plural(baths, 'bathroom') : null);
    if (bedrooms === null && !beds && details.size_or_type) chips.unshift(details.size_or_type);
  } else if (category === 'hotel') {
    chips.push(details.size_or_type || null, beds ? plural(beds, 'bed') : null);
  } else if (category === 'venue') {
    const seated = count(details.seated_capacity);
    const standing = count(details.standing_capacity);
    chips.push(seated ? `Seats ${seated}` : null, standing ? `${standing} standing` : null);
    if (!seated && !standing && details.size_or_type) chips.push(details.size_or_type);
    return chips.filter((chip): chip is string => Boolean(chip));
  } else {
    return details.size_or_type ? [details.size_or_type] : [];
  }
  chips.push(guests ? `Up to ${plural(guests, 'guest')}` : null);
  if (category === 'hotel') { const rooms = count(details.units_available); chips.push(rooms ? `${plural(rooms, 'room')} of this type` : null); }
  return chips.filter((chip): chip is string => Boolean(chip));
}

// ---------- Prices ----------

export interface PriceLine { quantity: number; label: string; base: number; fee: number | null; total: number; /** No total can be worked out: the host confirms the price. */ onRequest?: boolean }

export function priceLine(rate: unknown, quantity: number, label: string, fee: number | null): PriceLine {
  const base = Number(rate) * quantity;
  return { quantity, label, base, fee: fee || null, total: base + (fee || 0) };
}

/**
 * A rental of `months`, priced by the listing's unit. Monthly prices multiply;
 * yearly ones are a twelfth a month; office and shop prices per area or per
 * desk use the stored area or one desk. A daily or turnover price has no
 * total here: the host confirms it (total 0, onRequest).
 */
export function rentalLine(details: Pick<BookingDetails, 'price_amount' | 'price_unit' | 'office_shop_details'>, months: number): PriceLine {
  const label = plural(months, 'month');
  const rate = Number(details.price_amount) || 0;
  const unit = details.price_unit || 'month';
  const office = isRecord(details.office_shop_details) ? details.office_shop_details : {};
  const space = isRecord(office.space) ? office.space : {};
  const pricing = isRecord(office.pricing) ? office.pricing : {};
  const perMonth = (value: number, period: unknown) => (period === 'year' ? value / 12 : value);
  let monthly: number | null = null;
  if (unit === 'month') monthly = rate;
  else if (unit === 'year') monthly = rate / 12;
  else if (unit === 'sq_ft' || unit === 'm2') monthly = Number(space.area) > 0 ? perMonth(rate * Number(space.area), pricing.area_period) : null;
  else if (unit === 'desk') monthly = rate;
  if (monthly === null) return { quantity: months, label, base: 0, fee: null, total: 0, onRequest: true };
  const total = Math.round(monthly * months);
  return { quantity: months, label: unit === 'desk' ? `1 desk · ${label}` : label, base: total, fee: null, total };
}

export const ksh = (value: number) => `KSh ${value.toLocaleString()}`;

// ---------- Writes ----------

/** What the guest chose; `guests` is sent for stays and venues only. */
export interface StayChoice { start: string | null; end: string | null; hours: number; leaseStart: string; leaseMonths: number; guests?: number }

/** The most guests the Guests stepper offers: the listing's maximum, else 20 (the database allows up to 1000). */
export function guestLimit(details: Pick<BookingDetails, 'max_guests'>): number {
  const max = Number(details.max_guests);
  return Number.isInteger(max) && max > 0 ? Math.min(max, 1000) : 20;
}

export function bookingPayload(listing: BookingListing, kind: BookingKind, clientId: string, total: number, choice: StayChoice): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    listing_id: listing.id,
    host_id: listing.host_id,
    client_id: clientId,
    price_unit: kind.details.price_unit,
    total_price: total,
  };
  if (kind.isShortStay && choice.guests && choice.guests > 0) payload.guest_count = Math.min(Math.round(choice.guests), guestLimit(kind.details));
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

/** "Message host": the chat with the host, ready to ask about this listing (lib/chat/startChat). */
export function openConversation(listing: Pick<BookingListing, 'id'>): Promise<string> {
  return startListingChat(listing.id);
}
