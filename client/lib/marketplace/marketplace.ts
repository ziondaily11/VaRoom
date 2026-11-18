import type { SupabaseClient } from '@supabase/supabase-js';
import { listingMatchesInterests, normalizeInterests } from '../clientInterests';

// Marketplace listings (migrated from legacy-pages/marketplace.html): what is
// publicly listed, the search, the card display rules and the ordering.
// Import-free apart from types and the shared interest rule, so it can be tested directly.

export const CATEGORY_LABELS: Record<string, string> = {
  airbnb: 'Airbnbs', hotel: 'Hotels', venue: 'Event Venues', office: 'Offices', shop: 'Shops', property: 'Property',
};
export const CATEGORIES = ['all', ...Object.keys(CATEGORY_LABELS)];
export const PAGE_SIZE = 12;

export const MARKETPLACE_SELECT = 'id,title,description,location_text,category,listing_purpose,verified,created_at,host_id,'
  + 'host:profiles!listings_host_id_fkey(full_name,verified,avatar_url,username),'
  + 'listing_photos(storage_path),listing_booking_details(*)';

export interface BookingDetails {
  price_amount?: number | string | null;
  price_unit?: string | null;
  listing_purpose?: string | null;
  sale_price_amount?: number | string | null;
  sale_price_mode?: string | null;
  max_guests?: number | null;
  amenities?: string[] | null;
  location_text?: string | null;
  /** Property: the bedroom type ('Studio', '2 bedrooms', ...). */
  size_or_type?: string | null;
  bathrooms?: number | null;
  /** Airbnb: bedroom count (0 = studio). */
  bedrooms?: number | null;
}

export interface MarketplaceListing {
  id: string;
  title: string | null;
  location_text: string | null;
  category: string | null;
  /** Property: 'rent', 'sale' or 'both'. */
  listing_purpose?: string | null;
  verified: boolean | null;
  created_at: string;
  host_id: string;
  listing_photos: Array<{ storage_path: string | null }> | null;
  listing_booking_details: BookingDetails | BookingDetails[] | null;
  /** Read for an owner's own cards (/profile, the owner's public profile). */
  availability_status?: string | null;
  publication_state?: string | null;
}

export interface MarketplaceSearch {
  q: string;
  category: string;
  /** Minimum guests (from a ?guests link); '' for any. */
  guests: string;
}

const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] || null : value || null);

export function normalizeCategory(value: unknown): string {
  const category = String(value || 'all').trim().toLowerCase();
  return category === 'all' || Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category) ? category : 'all';
}

/** The search seeded from the URL (client home's "Browse as Marketplace" sends q and category). */
export function searchFromQuery(query: Record<string, string | string[] | undefined>): MarketplaceSearch {
  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');
  return { q: one('q'), category: normalizeCategory(one('category')), guests: one('guests') };
}

export function categoryLabel(category: string | null | undefined): string {
  return (category && CATEGORY_LABELS[category]) || category || 'Property';
}

export interface CardPrice { amount: number; unit: string; isSale?: boolean; isStarting?: boolean }

/**
 * The card price. A property for sale shows its sale price. The purpose is on
 * the listing (listings.listing_purpose); older readers only have the details
 * row, so a sale-only property is also recognised by its price matching the
 * sale price (the wizard stores the sale price as price_amount for those).
 */
export function formatPrice(details: MarketplaceListing['listing_booking_details'], category: string | null, listingPurpose?: string | null): CardPrice | null {
  const d = first(details);
  if (!d) return null;
  const purpose = listingPurpose || d.listing_purpose
    || (d.sale_price_amount != null && d.price_amount != null && Number(d.price_amount) === Number(d.sale_price_amount) ? 'sale' : null);
  if (category === 'property' && purpose === 'sale' && d.sale_price_amount != null) {
    return { amount: Number(d.sale_price_amount), unit: '', isSale: true, isStarting: d.sale_price_mode === 'starting' };
  }
  if (d.price_amount == null) return null;
  return { amount: Number(d.price_amount), unit: d.price_unit || 'night' };
}

export function sanitizeLocationText(value: string | null | undefined): string {
  if (!value) return '';
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  if (!cleaned || /location to be added|not available|coming soon/i.test(cleaned)) return '';
  return cleaned;
}

export function normalizeListingTitle(value: unknown): string {
  const fallback = 'Property';
  if (!value || typeof value !== 'string') return fallback;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const normalized = cleaned.replace(/^\.+\s*$/, '').trim();
  if (!normalized || normalized.length <= 2 || /^(a|test|new|listing)$/i.test(normalized)) return fallback;
  return normalized;
}

export function cardLocation(listing: MarketplaceListing): string {
  return sanitizeLocationText(listing.location_text || (first(listing.listing_booking_details) || {}).location_text || '');
}

/**
 * Bedrooms and baths for a card. Property: from its type ('2 bedrooms' → '2';
 * 'Studio' and 'Bedsitter' as named). Airbnb: from the bedroom count (0 is a
 * studio). Both with the bathroom count.
 */
export function propertyRooms(listing: MarketplaceListing): { beds: string | null; baths: number | null } {
  const d = first(listing.listing_booking_details) || {};
  if (listing.category === 'airbnb') {
    const count = d.bedrooms != null && Number(d.bedrooms) >= 0 ? Number(d.bedrooms) : null;
    return { beds: count === null ? null : count === 0 ? 'Studio' : String(count), baths: d.bathrooms != null && Number(d.bathrooms) > 0 ? Number(d.bathrooms) : null };
  }
  if (listing.category !== 'property') return { beds: null, baths: null };
  const type = String(d.size_or_type || '').trim();
  const count = type.match(/^(\d+)\s*bed/i);
  const beds = count ? count[1] : /^(studio|bedsitter)$/i.test(type) ? type : null;
  const baths = d.bathrooms != null && Number(d.bathrooms) > 0 ? Number(d.bathrooms) : null;
  return { beds, baths };
}

export type CategoryTone = 'green' | 'amber' | 'violet' | 'blue' | 'rose' | 'teal';

const CATEGORY_TONES: Record<string, CategoryTone> = {
  airbnb: 'green', hotel: 'amber', venue: 'violet', office: 'blue', shop: 'rose', property: 'teal',
};

/** The colour of a card's category tag. */
export function categoryTone(category: string | null | undefined): CategoryTone {
  return (category && CATEGORY_TONES[category]) || 'teal';
}

/** A looking-soon client's interests (categories, plus 'buy' / 'rent' for property), ranked first in the default view. */
export function preferredCategories(profile: { role?: string | null; looking_timeline?: string | null; interested_categories?: string[] | null } | null): string[] {
  if (!profile || profile.role !== 'client' || profile.looking_timeline !== 'soon') return [];
  return normalizeInterests(profile.interested_categories)
    .filter((key) => key === 'buy' || key === 'rent' || Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, key));
}

/** Whether a listing matches the client's interests (property by rent / sale). */
export function isPreferred(listing: MarketplaceListing, preferred: string[]): boolean {
  const details = first(listing.listing_booking_details);
  return listingMatchesInterests({ category: listing.category, purpose: listing.listing_purpose || (details && details.listing_purpose) || null }, preferred);
}

/** Newest first; preferred categories first while browsing all without a search. */
export function orderListings(listings: MarketplaceListing[], search: MarketplaceSearch, preferred: string[]): MarketplaceListing[] {
  const seen = new Set<string>();
  const unique = listings.filter((listing) => {
    if (!listing || !listing.id || seen.has(listing.id)) return false;
    seen.add(listing.id);
    return true;
  });
  const rankPreferred = search.category === 'all' && !search.q && preferred.length > 0;
  return unique.slice().sort((a, b) => {
    if (rankPreferred) {
      const ap = isPreferred(a, preferred);
      const bp = isPreferred(b, preferred);
      if (ap !== bp) return ap ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/** The ilike search term, or '' (commas, parentheses and % would break the filter). */
export function searchTerm(q: string): string {
  return q.replace(/[%(),]/g, ' ').trim();
}

export interface ListingPage {
  listings: MarketplaceListing[];
  /** Rows the server returned (the next page starts after them). */
  rows: number;
  hasMore: boolean;
}

/**
 * One page of publicly listed spaces: active, available and within any paid
 * term. No total is counted (nothing shows it).
 */
export async function fetchListingPage(client: SupabaseClient, search: MarketplaceSearch, offset: number, now: Date = new Date()): Promise<ListingPage> {
  let query = client
    .from('listings')
    .select(MARKETPLACE_SELECT)
    .range(offset, offset + PAGE_SIZE - 1)
    .eq('moderation_status', 'active')
    .eq('availability_status', 'available')
    // A paid Property / Shops & Offices listing is public only through its
    // verified 30-day term. Legacy rows keep a NULL term.
    .or(`paid_listing_until.is.null,paid_listing_until.gt.${now.toISOString()}`);
  if (search.category !== 'all') query = query.eq('category', search.category);
  const term = searchTerm(search.q);
  if (term) query = query.or(`title.ilike.%${term}%,location_text.ilike.%${term}%,category.ilike.%${term}%`);
  const minGuests = search.guests ? parseInt(search.guests, 10) : null;
  if (minGuests) query = query.gte('listing_booking_details.max_guests', minGuests);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as unknown as MarketplaceListing[];
  // The guests filter applies to the embedded details, so rows are checked too.
  const listings = minGuests
    ? rows.filter((listing) => {
      const guests = (first(listing.listing_booking_details) || {}).max_guests;
      return guests == null || guests >= minGuests;
    })
    : rows;
  return { listings, rows: rows.length, hasMore: rows.length === PAGE_SIZE };
}

// Recent pages per search, for returning to the Marketplace (public data).
const PAGE_TTL_MS = 2 * 60 * 1000;
const pages = new Map<string, { page: ListingPage; at: number }>();

export const pageKey = (search: MarketplaceSearch, offset: number) => JSON.stringify([search.q, search.category, search.guests, offset]);

export function getCachedPage(search: MarketplaceSearch, offset: number, now: number = Date.now()): ListingPage | null {
  const entry = pages.get(pageKey(search, offset));
  return entry && now - entry.at < PAGE_TTL_MS ? entry.page : null;
}

export function setCachedPage(search: MarketplaceSearch, offset: number, page: ListingPage, now: number = Date.now()): void {
  pages.set(pageKey(search, offset), { page, at: now });
  if (pages.size > 60) pages.delete(pages.keys().next().value as string);
}

// ---------- Coming back to the list ----------

/**
 * The list as the guest left it (every page loaded so far and the scroll
 * position), per search, so Back from a listing shows the same places at the
 * same place. In memory only (public data, gone on reload); two minutes, like
 * the pages above.
 */
export interface ListSnapshot { listings: MarketplaceListing[]; hasMore: boolean; offset: number; scrollTop: number }

const snapshots = new Map<string, { snapshot: ListSnapshot; at: number }>();
const snapshotKey = (search: MarketplaceSearch) => JSON.stringify([search.q, search.category, search.guests]);

export function getListSnapshot(search: MarketplaceSearch, now: number = Date.now()): ListSnapshot | null {
  const entry = snapshots.get(snapshotKey(search));
  return entry && now - entry.at < PAGE_TTL_MS ? entry.snapshot : null;
}

export function setListSnapshot(search: MarketplaceSearch, snapshot: ListSnapshot, now: number = Date.now()): void {
  snapshots.delete(snapshotKey(search));
  snapshots.set(snapshotKey(search), { snapshot, at: now });
  if (snapshots.size > 20) snapshots.delete(snapshots.keys().next().value as string);
}

/** What the summary line says about the search, one part per removable filter. */
export function searchSummary(search: MarketplaceSearch): Array<{ key: 'q' | 'category' | 'guests'; label: string }> {
  const parts: Array<{ key: 'q' | 'category' | 'guests'; label: string }> = [];
  if (search.q.trim()) parts.push({ key: 'q', label: `“${search.q.trim()}”` });
  if (search.category !== 'all') parts.push({ key: 'category', label: CATEGORY_LABELS[search.category] || search.category });
  const guests = parseInt(search.guests, 10);
  if (guests > 0) parts.push({ key: 'guests', label: `${guests}+ guests` });
  return parts;
}

/** The empty state for a search that found nothing. */
export function emptyMessage(search: MarketplaceSearch): { title: string; text: string } {
  if (search.q.trim()) return { title: 'No places found', text: `Nothing matches “${search.q.trim()}”. Try another word, an area or a city.` };
  if (search.category !== 'all' || search.guests) return { title: 'No places here yet', text: 'Try another category, or clear the filters.' };
  return { title: 'No places listed yet', text: 'New places appear here as soon as hosts publish them.' };
}
