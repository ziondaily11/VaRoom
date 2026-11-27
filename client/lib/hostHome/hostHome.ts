import { searchTerm } from '../marketplace/marketplace';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pageAfter, type FeedCursorRow } from '../discover/feedCursor';

// Host home (migrated from legacy-pages/host-home.html): the Discover feed
// (all available listings, or the host's own), the host's listings at a
// glance, VaRoom Updates and Property News, and what the page writes. The
// same queries, cache keys and wording as before.

export interface FeedHost { full_name: string | null; verified: boolean | null; avatar_url: string | null; username: string | null }

export interface FeedListing {
  id: string;
  title: string;
  description: string | null;
  location_text: string | null;
  category: string | null;
  listing_purpose?: string | null;
  supports_stay?: boolean | null;
  supports_table_reservation?: boolean | null;
  /** A sale property with an offer in progress (migration 000087). */
  under_offer?: boolean | null;
  verified: boolean | null;
  availability_status: string | null;
  created_at: string;
  host_id: string;
  host: FeedHost | null;
  listing_photos: Array<{ storage_path: string; width?: number | null; height?: number | null }> | null;
  listing_booking_details?: unknown;
  [field: string]: unknown;
}

/** The host's own listings, as the "Needs your attention" card reads them. */
export interface GlanceListing {
  id: string;
  title: string;
  availability_status: string | null;
  /** End of a paid Property / Shops & Offices term (NULL for older listings). */
  paid_listing_until: string | null;
}

// Typed as plain strings so the client's select-string parser stays shallow.
export const FEED_SELECT: string = 'id,title,description,location_text,category,listing_purpose,supports_stay,supports_table_reservation,under_offer,verified,availability_status,created_at,host_id,host:profiles!listings_host_id_fkey(full_name,verified,avatar_url,username),listing_photos(storage_path,width,height),listing_booking_details(price_amount,price_unit,listing_purpose,units_available)';
export const GLANCE_SELECT: string = 'id,title,availability_status,paid_listing_until';

export const CATEGORY_TABS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'airbnb', label: 'Airbnbs' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'venue', label: 'Event Venues' },
  { value: 'office', label: 'Offices' },
  { value: 'shop', label: 'Shops' },
  { value: 'property', label: 'Property' },
];

/** Host Home's ?view= (Saved moved to Profile → Saved; ?view=saved redirects there). */
export type HostView = 'home' | 'my-listings';
export const viewFromQuery = (value: unknown): HostView => (value === 'my-listings' ? value : 'home');

// ---------- Feed ----------

/** The listing-feed cache key, unchanged ("host:<id>:all|mine:<category>:<term>"). */
export const feedKey = (userId: string, onlyMine: boolean, category: string, term: string) =>
  ['host', userId, onlyMine ? 'mine' : 'all', category, term.toLowerCase()].join(':');

export const scrollKey = (key: string) => `varoom:listings:scroll:${key}`;

type PageResult = { data?: FeedListing[]; hasMore?: boolean; error?: Error };

/** One page of the feed; a search (location or @username) returns one page only. */
export function feedFetcher(client: SupabaseClient, userId: string, onlyMine: boolean, category: string, term: string) {
  const listings = () => client.from('listings').select(FEED_SELECT);
  // The filters as before: the host's own listings, or every active, available listing.
  const withFilters = (query: ReturnType<typeof listings>) => {
    // Everyone's feed shows online listings only (the host's own offline ones would otherwise appear).
    let next = onlyMine ? query.eq('host_id', userId) : query.eq('moderation_status', 'active').eq('availability_status', 'available').gt('live_until', new Date().toISOString());
    if (category !== 'all') next = next.eq('category', category);
    return next;
  };

  return async (offset: number, limit: number, after: FeedCursorRow | null = null): Promise<PageResult> => {
    if (!term) {
      // After the last listing already loaded (offset only without one).
      const { data, error } = await pageAfter(withFilters(listings())
        .order('created_at', { ascending: false }).order('id', { ascending: false }), offset, limit, after);
      return error ? { error: new Error(error.message) } : { data: (data || []) as unknown as FeedListing[] };
    }
    if (offset > 0) return { data: [], hasMore: false };
    // Name or area (one filter; characters that would break it are removed), or a host's @username.
    const safeTerm = searchTerm(term.replace(/^@/, ''));
    const locationQuery = (safeTerm ? withFilters(listings()).or(`title.ilike.%${safeTerm}%,location_text.ilike.%${safeTerm}%`) : withFilters(listings()))
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
    const hosts = await client.from('profiles').select('id').ilike('username', `%${safeTerm || term}%`).limit(100);
    if (hosts.error) return { error: new Error(hosts.error.message) };
    const hostIds = ((hosts.data || []) as Array<{ id: string }>).map((profile) => profile.id);
    const hostQuery = hostIds.length
      ? withFilters(listings().in('host_id', hostIds)).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
      : Promise.resolve({ data: [], error: null });
    const [byLocation, byHost] = await Promise.all([locationQuery, hostQuery]);
    if (byLocation.error) return { error: new Error(byLocation.error.message) };
    if (byHost.error) return { error: new Error(byHost.error.message) };
    return { data: mergeSearchResults((byLocation.data || []) as unknown as FeedListing[], (byHost.data || []) as unknown as FeedListing[], limit), hasMore: false };
  };
}

/** Location and @username matches together: each listing once, newest first. */
export function mergeSearchResults(byLocation: FeedListing[], byHost: FeedListing[], limit: number): FeedListing[] {
  const seen = new Set<string>();
  return byLocation.concat(byHost)
    .filter((listing) => (seen.has(listing.id) ? false : (seen.add(listing.id), true)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || String(b.id).localeCompare(String(a.id)))
    .slice(0, limit);
}

export function timeAgo(dateStr: string, now: number = Date.now()): string {
  const mins = Math.floor((now - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------- The host's own listings (for "Needs your attention") ----------

/** The host's listings, newest first (one query; it also answers "how many" and "which expire soon"). */
export async function fetchHostListings(client: SupabaseClient, userId: string): Promise<GlanceListing[]> {
  const { data, error } = await client.from('listings').select(GLANCE_SELECT).eq('host_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as unknown as GlanceListing[];
}

// ---------- VaRoom Updates and Property News ----------

export interface VaroomUpdate { id: string; body: string; image_url: string | null; image_urls: string[] | null; created_at: string }

export async function fetchUpdates(client: SupabaseClient): Promise<VaroomUpdate[]> {
  const result = await client.from('varoom_updates').select('id,body,image_url,image_urls,created_at')
    .eq('status', 'published').order('created_at', { ascending: false }).limit(3);
  if (result.error) throw result.error;
  if (!Array.isArray(result.data)) throw new Error('VaRoom Updates returned an invalid response.');
  return result.data as VaroomUpdate[];
}

export const updatePhotos = (update: VaroomUpdate) => (update.image_urls && update.image_urls.length > 0 ? update.image_urls : (update.image_url ? [update.image_url] : []));

export interface NewsItem { id: string | number; title?: string | null; published_at?: string | null; source?: { name?: string | null; published_at?: string | null } | null }

export const PROPERTY_NEWS_REFRESH_MS = 5 * 60 * 1000;

/** `force` (the Refresh link) skips the browser's HTTP cache. */
export async function fetchLatestNews(fetchFn: typeof fetch = fetch, force = false): Promise<NewsItem[]> {
  const response = await fetchFn('/api/news/latest?limit=5', { headers: { Accept: 'application/json' }, ...(force ? { cache: 'no-store' as RequestCache } : {}) });
  if (!response.ok) throw new Error(`Property news request failed (${response.status})`);
  const result = await response.json();
  if (!Array.isArray(result)) throw new Error('Property News returned an invalid response.');
  return result as NewsItem[];
}

export const newsSource = (news: NewsItem) => (news.source && typeof news.source.name === 'string' && news.source.name.trim() ? news.source.name.trim() : '');

export function newsDate(value: string | null | undefined): string {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- Account and writes ----------

export async function fetchSuspended(token: string | null, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchFn('/api/account-status', { headers: { Authorization: `Bearer ${token}` } });
    const status = response && response.ok ? await response.json() : { suspended: false };
    return status.suspended === true;
  } catch {
    return false;
  }
}

/** A host must pick exactly one niche; null until known. */
export async function fetchListingCategories(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client.from('profiles').select('listing_categories').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const value = data && (data as { listing_categories?: unknown }).listing_categories;
  return Array.isArray(value) ? (value as string[]) : [];
}

export const NICHES: Array<{ value: string; label: string }> = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'venue', label: 'Event venue' },
  { value: 'office', label: 'Offices & Shops' },
  { value: 'property', label: 'Property' },
];

export async function saveNiche(client: SupabaseClient, userId: string, niche: string): Promise<void> {
  const { error } = await client.from('profiles').update({ listing_categories: [niche] }).eq('id', userId);
  if (error) throw new Error(error.message);
}

export const REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: 'fraudulent', label: 'Fraudulent — this host is scamming or misrepresenting' },
  { value: 'misleading_info', label: "Misleading information — details don't match reality" },
  { value: 'other', label: 'Other' },
];

export async function submitReport(client: SupabaseClient, report: { reporterId: string; hostId: string; listingId: string; reason: string; details: string }): Promise<string | null> {
  const { error } = await client.from('reports').insert({
    reporter_id: report.reporterId,
    host_id: report.hostId,
    listing_id: report.listingId,
    reason: report.reason,
    details: report.details || null,
  });
  return error ? error.message : null;
}

/** "Chat": the chat with this listing's host, ready to ask about the listing (lib/chat/startChat). */
export { startListingChat as openChat } from '../chat/startChat';
