import type { SupabaseClient } from '@supabase/supabase-js';
import { createCache } from '../cache/createCache';

// A host's profile data, shared by /profile (the host's own) and the public
// host pages (/host/[hostId], /u/[username]): the profile row, listings,
// profile categories, reviews and (owner only) saved drafts. Each part loads
// once per host and viewer, is reused for two minutes when navigating back,
// and loads in parallel. Listing videos are not fetched here: cards load
// theirs when they come near the screen (lib/media/listingVideo.ts).

export const HOST_PROFILE_COLUMNS = 'id,role,full_name,username,bio,avatar_url,banner_image_key,verified,city,created_at,listing_categories';
export const LISTING_COLUMNS = 'id,title,category,location_text,availability_status,publication_state,created_at,listing_photos(storage_path),listing_booking_details(price_amount,price_unit)';
export const PROFILE_TTL_MS = 2 * 60 * 1000;
/** Plans allow up to 20 active listings; this keeps the read bounded. */
export const LISTING_LIMIT = 200;

export interface HostProfileRow {
  id: string;
  role: string | null;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_image_key: string | null;
  verified: boolean | null;
  city: string | null;
  created_at: string | null;
  listing_categories: string[] | null;
}

export interface ProfileListing {
  id: string;
  title: string | null;
  category: string | null;
  location_text: string | null;
  availability_status: string | null;
  publication_state: string | null;
  created_at: string | null;
  /** Storage path of the first photo. */
  photo: string | null;
  price_amount: number | null;
  price_unit: string | null;
}

export interface ProfileCategory {
  id: string;
  name: string;
  sort_order: number | null;
  listingIds: string[];
}

export interface HostReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  client: { full_name: string | null; avatar_url: string | null } | null;
}

export interface ReviewSummary {
  average_rating: number | null;
  review_count: number;
  /** Five entries, 5 stars to 1. */
  distribution: Array<{ star: number; count: number }>;
}

export interface ListingDraft {
  id: string;
  listing_id: string | null;
  category: string | null;
  title: string | null;
  mediaNames: string[];
}

type Row = Record<string, unknown>;
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

export function toProfileListing(row: Row): ProfileListing {
  const photos = Array.isArray(row.listing_photos) ? (row.listing_photos as Array<{ storage_path?: string | null }>) : [];
  const details = first(row.listing_booking_details as Row | Row[] | null);
  const amount = details && details.price_amount !== null && details.price_amount !== undefined ? Number(details.price_amount) : null;
  return {
    id: String(row.id),
    title: (row.title as string) || null,
    category: (row.category as string) || null,
    location_text: (row.location_text as string) || null,
    availability_status: (row.availability_status as string) || null,
    publication_state: (row.publication_state as string) || null,
    created_at: (row.created_at as string) || null,
    photo: (photos.find((photo) => photo && photo.storage_path) || {}).storage_path || null,
    price_amount: amount !== null && Number.isFinite(amount) ? amount : null,
    price_unit: details ? ((details.price_unit as string) || null) : null,
  };
}

// ---------- Queries ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

/** A host's in-app profile page: by username when there is one (usernames are unique, ignoring case). */
export function hostProfilePath(hostId: string, username?: string | null): string {
  const name = (username || '').replace(/^@/, '').trim();
  return `/host/${encodeURIComponent(name || hostId)}`;
}

/** `value` matched literally by ilike (its own % _ \ are escaped). */
export const literalIlike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** A host by id or username, ignoring the username's case (null when there is no such host). */
export async function fetchHostProfile(client: SupabaseClient, by: { id?: string; username?: string }): Promise<HostProfileRow | null> {
  let query = client.from('profiles').select(HOST_PROFILE_COLUMNS).eq('role', 'host');
  query = by.id ? query.eq('id', by.id) : query.ilike('username', literalIlike((by.username || '').replace(/^@/, '')));
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HostProfileRow | null) || null;
}

/** Any account's own profile row (the signed-in user's /profile). */
export async function fetchOwnProfile(client: SupabaseClient, userId: string): Promise<HostProfileRow | null> {
  const { data, error } = await client.from('profiles').select(HOST_PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HostProfileRow | null) || null;
}

/** The owner sees every listing; visitors only active, available ones. */
export async function fetchHostListings(client: SupabaseClient, hostId: string, owner: boolean): Promise<ProfileListing[]> {
  let query = client.from('listings').select(LISTING_COLUMNS).eq('host_id', hostId);
  if (!owner) query = query.eq('moderation_status', 'active').eq('availability_status', 'available');
  const { data, error } = await query.order('created_at', { ascending: false }).limit(LISTING_LIMIT);
  if (error) throw new Error(error.message);
  return ((data as Row[] | null) || []).map(toProfileListing);
}

export async function fetchProfileCategories(client: SupabaseClient, hostId: string): Promise<ProfileCategory[]> {
  const { data, error } = await client.from('profile_categories').select('id,host_id,name,sort_order,created_at')
    .eq('host_id', hostId).order('sort_order').order('created_at');
  if (error) throw new Error(error.message);
  const rows = (data as Row[] | null) || [];
  if (!rows.length) return [];
  const ids = rows.map((row) => String(row.id));
  const { data: links, error: linkError } = await client.from('profile_category_listings').select('category_id,listing_id').in('category_id', ids);
  if (linkError) throw new Error(linkError.message);
  const byCategory = new Map<string, string[]>();
  ((links as Row[] | null) || []).forEach((link) => {
    const key = String(link.category_id);
    byCategory.set(key, [...(byCategory.get(key) || []), String(link.listing_id)]);
  });
  return rows.map((row) => ({ id: String(row.id), name: String(row.name || ''), sort_order: (row.sort_order as number) ?? null, listingIds: byCategory.get(String(row.id)) || [] }));
}

export async function fetchHostReviews(hostId: string, fetchFn: FetchFn = fetch): Promise<{ reviews: HostReview[]; summary: ReviewSummary }> {
  const response = await fetchFn(`/api/hosts/${encodeURIComponent(hostId)}/reviews`);
  if (!response.ok) throw new Error(`Reviews could not be loaded (${response.status})`);
  const body = (await response.json()) as { reviews?: HostReview[]; summary?: Partial<ReviewSummary> };
  const reviews = Array.isArray(body.reviews) ? body.reviews : [];
  const summary = body.summary || {};
  return {
    reviews,
    summary: {
      average_rating: typeof summary.average_rating === 'number' ? summary.average_rating : null,
      review_count: typeof summary.review_count === 'number' ? summary.review_count : reviews.length,
      distribution: Array.isArray(summary.distribution) ? summary.distribution : [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((review) => Number(review.rating) === star).length })),
    },
  };
}

export async function fetchListingDrafts(token: string | null, fetchFn: FetchFn = fetch): Promise<ListingDraft[]> {
  if (!token) return [];
  const response = await fetchFn('/api/listing-drafts', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Drafts could not be loaded (${response.status})`);
  const body = (await response.json()) as { drafts?: Row[] };
  return (Array.isArray(body.drafts) ? body.drafts : []).map((draft) => {
    const form = (draft.form_data as { fields?: { title?: string } } | null) || null;
    const media = Array.isArray(draft.media_metadata) ? (draft.media_metadata as Array<{ name?: string }>) : [];
    return {
      id: String(draft.id),
      listing_id: (draft.listing_id as string) || null,
      category: (draft.category as string) || null,
      title: (form && form.fields && form.fields.title) || null,
      mediaNames: media.map((item) => item && item.name).filter((name): name is string => Boolean(name)),
    };
  });
}

// ---------- Cached loads ----------

// Keyed by viewer and host: an owner's view (unpublished listings, drafts)
// never serves another account. Memory only, cleared on sign-out.
const cache = createCache<unknown>({ namespace: 'varoom:host-profile:v1:', storage: 'memory', ttlMs: PROFILE_TTL_MS, maxEntries: 60, userScoped: true });

const key = (viewerId: string | null, hostId: string, part: string) => `${viewerId || 'anon'}:${hostId}:${part}`;

function cached<T>(cacheKey: string, loader: () => Promise<T>, force = false): Promise<T> {
  return cache.load(cacheKey, loader, { force }) as Promise<T>;
}

/** What is already loaded (fresh or not), for an instant first paint. */
export function peek<T>(viewerId: string | null, hostId: string, part: string): T | null {
  const entry = cache.read(key(viewerId, hostId, part));
  return entry ? (entry.value as T) : null;
}

export const loadHostListings = (client: SupabaseClient, viewerId: string | null, hostId: string, owner: boolean, force = false) =>
  cached(key(viewerId, hostId, owner ? 'listings:owner' : 'listings'), () => fetchHostListings(client, hostId, owner), force);

export const loadProfileCategories = (client: SupabaseClient, viewerId: string | null, hostId: string, force = false) =>
  cached(key(viewerId, hostId, 'categories'), () => fetchProfileCategories(client, hostId), force);

export const loadHostReviews = (viewerId: string | null, hostId: string, force = false, fetchFn: FetchFn = fetch) =>
  cached(key(viewerId, hostId, 'reviews'), () => fetchHostReviews(hostId, fetchFn), force);

export const loadListingDrafts = (viewerId: string, token: string | null, force = false, fetchFn: FetchFn = fetch) =>
  cached(key(viewerId, viewerId, 'drafts'), () => fetchListingDrafts(token, fetchFn), force);

const usernameKey = (username: string) => `@${username.replace(/^@/, '').toLowerCase()}`;

/** Cached under both the id and the username, so either address reuses it. */
export function loadHostProfile(client: SupabaseClient, viewerId: string | null, by: { id?: string; username?: string }, force = false): Promise<HostProfileRow | null> {
  const lookup = by.id || usernameKey(by.username || '');
  return cached(key(viewerId, lookup, 'profile'), () => fetchHostProfile(client, by), force).then((row) => {
    if (row) {
      if (by.id && row.username) cache.write(key(viewerId, usernameKey(row.username), 'profile'), row);
      if (!by.id) cache.write(key(viewerId, row.id, 'profile'), row);
    }
    return row;
  });
}

/** The cached profile for an id or username, if any. */
export const peekHostProfile = (viewerId: string | null, by: { id?: string; username?: string }) =>
  peek<HostProfileRow | null>(viewerId, by.id || usernameKey(by.username || ''), 'profile');

export const loadOwnProfile = (client: SupabaseClient, userId: string, force = false) =>
  cached(key(userId, userId, 'own-profile'), () => fetchOwnProfile(client, userId), force);

/** After the owner changes something: drop that part so the next read is fresh. */
export function invalidateHostProfile(viewerId: string | null, hostId: string, part?: string): void {
  cache.invalidate(part ? key(viewerId, hostId, part) : `${viewerId || 'anon'}:${hostId}:`);
}

/** Write a part directly (after an edit the page already applied). */
export function primeHostProfile<T>(viewerId: string | null, hostId: string, part: string, value: T): void {
  cache.write(key(viewerId, hostId, part), value);
}

export function clearHostProfileCache(): void {
  cache.clear();
}
