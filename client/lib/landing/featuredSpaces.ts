import type { SupabaseClient } from '@supabase/supabase-js';
import { PHOTO_WIDTH, resolveStoredPhotoUrl } from '../../components/resolveStoredPhotoUrl';
import { formatPrice, normalizeListingTitle } from '../marketplace/marketplace';
import type { BookingDetails } from '../marketplace/marketplace';

// The landing page's "spaces" section: one card per niche, filled with the
// newest published listing of that niche. Fetched at build time and
// revalidated (ISR), so the landing page itself never talks to Supabase.

export type SpaceNicheId = 'property' | 'office' | 'airbnb' | 'venue' | 'hotel';

export interface SpaceNiche {
  id: SpaceNicheId;
  /** The label shown on the card. */
  label: string;
  /** Stored `listings.category` values; offices and shops are one niche. */
  categories: string[];
  /** The marketplace filter the card's fallback link opens. */
  marketplaceCategory: string;
}

/** In display order; the middle one starts in the centre. */
export const SPACE_NICHES: SpaceNiche[] = [
  { id: 'property', label: 'Property', categories: ['property'], marketplaceCategory: 'property' },
  { id: 'office', label: 'Offices & Shops', categories: ['office', 'shop'], marketplaceCategory: 'office' },
  { id: 'airbnb', label: 'Airbnbs', categories: ['airbnb'], marketplaceCategory: 'airbnb' },
  { id: 'venue', label: 'Event Venues', categories: ['venue'], marketplaceCategory: 'venue' },
  { id: 'hotel', label: 'Hotels', categories: ['hotel'], marketplaceCategory: 'hotel' },
];

export interface FeaturedSpace {
  /** The card's place in the row: the niche it stands for. */
  slot: SpaceNicheId;
  /** The niche of the listing shown. Differs from `slot` when an empty niche borrows a listing. */
  niche: SpaceNicheId;
  label: string;
  /** Null when the niche has no published listing yet. */
  listing: {
    id: string;
    title: string;
    summary: string;
    photoUrl: string | null;
    /** e.g. "KSh 4,500" */
    price: string | null;
    /** e.g. "/ night"; empty for a sale price. */
    priceUnit: string;
  } | null;
  /** Where the card's button goes. */
  href: string;
}

interface ListingRow {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  listing_photos: Array<{ storage_path: string | null }> | null;
  listing_booking_details: BookingDetails | BookingDetails[] | null;
}

const SELECT = 'id,title,description,category,created_at,listing_photos(storage_path),listing_booking_details(*)';
/** Newest few per niche, so one with a photo and a real title can be chosen. */
const CANDIDATES = 8;

const UNIT_LABELS: Record<string, string> = { sq_ft: 'sq ft', m2: 'm²' };

export function priceParts(details: ListingRow['listing_booking_details'], category: string | null): { price: string | null; priceUnit: string } {
  const price = formatPrice(details, category);
  if (!price || !Number.isFinite(price.amount) || price.amount <= 0) return { price: null, priceUnit: '' };
  const amount = `KSh ${price.amount.toLocaleString('en-KE')}`;
  if (price.isSale) return { price: `${price.isStarting ? 'From ' : ''}${amount}`, priceUnit: '' };
  return { price: amount, priceUnit: `/ ${UNIT_LABELS[price.unit] || price.unit}` };
}

function cleanSummary(value: string | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const firstPhotoPath = (row: ListingRow): string | null => row.listing_photos?.find((photo) => photo.storage_path)?.storage_path || null;

/**
 * The listing shown for a niche: the newest with a real title whose photo
 * loads; else the newest with a real title, shown without a photo.
 * `photoLoads` checks a resolved photo URL; it defaults to trusting it.
 */
export async function pickListing(
  rows: ListingRow[],
  photoUrlOf: (row: ListingRow) => string | null,
  photoLoads: (url: string) => Promise<boolean> = async () => true,
): Promise<{ row: ListingRow; photoUrl: string | null } | null> {
  const titled = rows.filter((row) => normalizeListingTitle(row.title) !== 'Property' || row.category === 'property');
  for (const row of titled) {
    const photoUrl = photoUrlOf(row);
    if (photoUrl && await photoLoads(photoUrl)) return { row, photoUrl };
  }
  return titled[0] ? { row: titled[0], photoUrl: null } : null;
}

/**
 * Absolute photo URLs (older Supabase storage) are checked, since some point
 * at deleted files. /api/photos URLs are relative to the site and served by
 * the API, so they are trusted here.
 */
async function absolutePhotoLoads(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return true;
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

const cardPhotoUrl = (row: ListingRow, client?: Pick<SupabaseClient, 'storage'> | null): string | null => (
  resolveStoredPhotoUrl(firstPhotoPath(row), 'listing-photos', client, PHOTO_WIDTH.card));

export function toFeaturedSpace(
  niche: SpaceNiche,
  row: ListingRow | null,
  client?: Pick<SupabaseClient, 'storage'> | null,
  photoUrl: string | null = row ? cardPhotoUrl(row, client) : null,
  slot: SpaceNicheId = niche.id,
): FeaturedSpace {
  const fallbackHref = `/marketplace?category=${niche.marketplaceCategory}`;
  if (!row) return { slot, niche: niche.id, label: niche.label, listing: null, href: fallbackHref };
  return {
    slot,
    niche: niche.id,
    label: niche.label,
    listing: {
      id: row.id,
      title: normalizeListingTitle(row.title),
      summary: cleanSummary(row.description),
      photoUrl,
      ...priceParts(row.listing_booking_details, row.category),
    },
    href: `/booking?listing=${encodeURIComponent(row.id)}`,
  };
}

interface NicheListings {
  niche: SpaceNiche;
  rows: ListingRow[];
  /** All of the niche's public listings, not only the fetched candidates. */
  total: number;
}

async function fetchNicheListings(client: SupabaseClient, niche: SpaceNiche, nowIso: string): Promise<NicheListings> {
  const { data, error, count } = await client
    .from('listings')
    .select(SELECT, { count: 'exact' })
    .in('category', niche.categories)
    .eq('moderation_status', 'active')
    .eq('availability_status', 'available')
    .or(`paid_listing_until.is.null,paid_listing_until.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(CANDIDATES);
  if (error) console.warn(`Landing spaces: ${niche.id} listings unavailable`, error.message);
  const rows = (data as ListingRow[] | null) || [];
  return { niche, rows, total: count ?? rows.length };
}

type PhotoLoads = (url: string) => Promise<boolean>;

/**
 * One card per niche. A niche with no listing (or whose query failed) shows
 * another listing from the niche with the most listings, then the next
 * largest, never the same listing twice. Only when no niche has one to spare
 * does the card say the niche is coming soon.
 */
export async function buildFeaturedSpaces(
  found: NicheListings[],
  client?: Pick<SupabaseClient, 'storage'> | null,
  photoLoads: PhotoLoads = absolutePhotoLoads,
): Promise<FeaturedSpace[]> {
  const photoUrlOf = (row: ListingRow) => cardPhotoUrl(row, client);
  const used = new Set<string>();
  const unused = (rows: ListingRow[]) => rows.filter((row) => !used.has(row.id));

  const cards: Array<FeaturedSpace | null> = [];
  for (const { niche, rows } of found) {
    const picked = await pickListing(rows, photoUrlOf, photoLoads);
    if (picked) used.add(picked.row.id);
    cards.push(picked ? toFeaturedSpace(niche, picked.row, client, picked.photoUrl) : null);
  }

  const donors = found.filter((entry) => entry.rows.length).sort((a, b) => b.total - a.total);
  for (let i = 0; i < cards.length; i += 1) {
    if (cards[i]) continue;
    const slot = found[i].niche;
    let borrowed: FeaturedSpace | null = null;
    for (const donor of donors) {
      const picked = await pickListing(unused(donor.rows), photoUrlOf, photoLoads);
      if (!picked) continue;
      used.add(picked.row.id);
      borrowed = toFeaturedSpace(donor.niche, picked.row, client, picked.photoUrl, slot.id);
      break;
    }
    cards[i] = borrowed || toFeaturedSpace(slot, null);
  }
  return cards as FeaturedSpace[];
}

export async function fetchFeaturedSpaces(client: SupabaseClient): Promise<FeaturedSpace[]> {
  const nowIso = new Date().toISOString();
  const found = await Promise.all(SPACE_NICHES.map((niche) => fetchNicheListings(client, niche, nowIso)));
  return buildFeaturedSpaces(found, client);
}

/** Cards for a build that could not reach the database at all. */
export function emptyFeaturedSpaces(): FeaturedSpace[] {
  return SPACE_NICHES.map((niche) => toFeaturedSpace(niche, null));
}
