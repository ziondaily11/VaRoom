import type { SupabaseClient } from '@supabase/supabase-js';
import { createCache } from '../cache/createCache';

// /profile (the signed-in account's own profile): client bookings, the
// header's labels, editing the profile, the avatar and banner uploads and
// the profile-category functions. Wording is unchanged from
// legacy-pages/profile.html.

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
type Row = Record<string, unknown>;

// ---------- Labels ----------

export const NICHE_LABELS: Record<string, string> = {
  airbnb: 'Airbnb', hotel: 'Hotel', venue: 'Event ground / venue', office: 'Offices & Shops', shop: 'Offices & Shops', property: 'Property',
};
export const CATEGORY_LABELS: Record<string, string> = {
  airbnb: 'Airbnb', hotel: 'Hotel', venue: 'Event Venue', office: 'Office', shop: 'Shop', property: 'Property',
};
const DRAFT_TITLES: Record<string, string> = {
  property: 'Property draft', office: 'Office draft', shop: 'Shop draft', airbnb: 'Airbnb draft', hotel: 'Hotel draft', venue: 'Venue draft',
};

export const displayName = (fullName: string | null | undefined) => fullName || 'VaRoom member';
export const initialOf = (name: string) => (name || '?').charAt(0).toUpperCase();
export const handleOf = (username: string | null | undefined) => (username ? `@${username}` : '@user');
export const memberSince = (createdAt: string | null | undefined) => (createdAt ? `Member since ${new Date(createdAt).getFullYear()}` : 'Member since 2024');

/** "Specializes in …" for a host with exactly one niche. */
export function specialisation(role: string | null | undefined, niches: string[] | null | undefined): string | null {
  const list = Array.isArray(niches) ? niches : [];
  return role === 'host' && list.length === 1 ? `Specializes in ${NICHE_LABELS[list[0]] || list[0]}` : null;
}

export function bannerUrl(key: string | null | undefined): string | null {
  return key ? `/api/photos/profile-banners/${key.split('/').map(encodeURIComponent).join('/')}` : null;
}

/** The share link: the public profile when there is a username. */
export function profileShareUrl(origin: string, username: string | null | undefined): string {
  return username ? `${origin}/u/${encodeURIComponent(username)}` : `${origin}/profile`;
}

export function shareLinks(url: string) {
  return {
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent('Check out this VaRoom profile')}&body=${encodeURIComponent(url)}`,
  };
}

export function listingPrice(amount: number | null, unit: string | null): string {
  if (!amount) return '';
  const per = unit === 'month' ? 'month' : unit === 'hour' ? 'hour' : 'night';
  return `KSh ${Number(amount).toLocaleString()} / ${per}`;
}

export function listingStatus(status: string | null | undefined): { label: string; className: string; style?: Record<string, string> } {
  const value = (status || '').toLowerCase();
  if (value === 'booked') return { label: 'Booked', className: 'booked' };
  if (value === 'paused') return { label: 'Paused', className: 'paused' };
  if (value === 'unavailable') return { label: 'Unavailable', className: 'unavailable' };
  if (value === 'draft') return { label: 'Draft', className: 'paused' };
  if (value === 'few_dates') return { label: 'Few dates left', className: '', style: { color: '#b45309' } };
  return { label: 'Available', className: 'available' };
}

export const draftTitle = (title: string | null, category: string | null) => title || (category && DRAFT_TITLES[category]) || 'Listing draft';

// ---------- Client bookings ----------

export const BOOKING_COLUMNS = 'id,listing_id,total_price,start_date,end_date,guests,status,listing:listings(id,title,location_text,listing_photos(storage_path))';

export interface ProfileBooking {
  id: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  total_price: number | null;
  title: string | null;
  location: string | null;
  photo: string | null;
}

function toBooking(row: Row): ProfileBooking {
  const listing = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as Row | null;
  const photos = listing && Array.isArray(listing.listing_photos) ? (listing.listing_photos as Array<{ storage_path?: string }>) : [];
  return {
    id: String(row.id),
    status: (row.status as string) || null,
    start_date: (row.start_date as string) || null,
    end_date: (row.end_date as string) || null,
    guests: row.guests === null || row.guests === undefined ? null : Number(row.guests),
    total_price: row.total_price === null || row.total_price === undefined ? null : Number(row.total_price),
    title: listing ? ((listing.title as string) || null) : null,
    location: listing ? ((listing.location_text as string) || null) : null,
    photo: (photos.find((photo) => photo && photo.storage_path) || {}).storage_path || null,
  };
}

export const todayIso = (now: Date = new Date()) => now.toISOString().slice(0, 10);

/**
 * The two upcoming and three most recent past bookings (past: completed,
 * cancelled, or ended). Only the rows shown are read.
 */
export async function loadClientBookings(client: SupabaseClient, userId: string, now: Date = new Date()): Promise<{ upcoming: ProfileBooking[]; past: ProfileBooking[] }> {
  const today = todayIso(now);
  const [upcoming, past] = await Promise.all([
    client.from('bookings').select(BOOKING_COLUMNS).eq('client_id', userId)
      .not('status', 'in', '(completed,cancelled)').or(`end_date.gte.${today},end_date.is.null`)
      .order('start_date', { ascending: true }).limit(2),
    client.from('bookings').select(BOOKING_COLUMNS).eq('client_id', userId)
      .or(`status.in.(completed,cancelled),end_date.lt.${today}`)
      .order('end_date', { ascending: false }).limit(3),
  ]);
  if (upcoming.error) throw new Error(upcoming.error.message);
  if (past.error) throw new Error(past.error.message);
  return { upcoming: ((upcoming.data as Row[] | null) || []).map(toBooking), past: ((past.data as Row[] | null) || []).map(toBooking) };
}

// Reused for a minute when navigating back; private to the account.
const bookingsCache = createCache<{ upcoming: ProfileBooking[]; past: ProfileBooking[] }>({ namespace: 'varoom:profile-bookings:v1:', storage: 'memory', ttlMs: 60 * 1000, maxEntries: 6, userScoped: true });

export function loadClientBookingsCached(client: SupabaseClient, userId: string): Promise<{ upcoming: ProfileBooking[]; past: ProfileBooking[] }> {
  return bookingsCache.load(userId, () => loadClientBookings(client, userId));
}

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function bookingDates(booking: ProfileBooking): string {
  const start = booking.start_date ? formatDate(booking.start_date) : '';
  const end = booking.end_date ? formatDate(booking.end_date) : '';
  return start && end ? `${start} - ${end}` : (start || 'Flexible dates');
}

export function bookingNights(booking: ProfileBooking): number {
  if (!booking.start_date || !booking.end_date) return 0;
  const nights = Math.round((Date.parse(booking.end_date) - Date.parse(booking.start_date)) / 86400000);
  return Number.isFinite(nights) && nights > 0 ? nights : 0;
}

export const bookingTotal = (total: number | null) => `KES ${Number(total || 0).toLocaleString('en-KE')}`;
export const pastDate = (booking: ProfileBooking) => (booking.end_date ? formatDate(booking.end_date) : 'Completed');
export const pastStatus = (booking: ProfileBooking) => (booking.status === 'cancelled' ? 'Cancelled' : 'Completed');

// ---------- Editing the profile ----------

// The simple, public details. Full name, username and phone are changed in
// Settings → Your Account only, behind its lock (lib/settings/accountDetails.ts).
export interface ProfileEdit { city: string | null; bio?: string | null }

/** The update to save, or the message to show. */
export function profileEdit(values: { bio: string; city: string }, isHost: boolean): { update: ProfileEdit | null; error: string | null } {
  const update: ProfileEdit = { city: values.city.trim() || null };
  if (isHost) update.bio = values.bio.trim() || null;
  return { update, error: null };
}

export async function saveProfileEdit(client: SupabaseClient, userId: string, update: ProfileEdit): Promise<string | null> {
  const { error } = await client.from('profiles').update(update).eq('id', userId);
  return error ? error.message : null;
}

// ---------- Avatar ----------

export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

/** Upload a new avatar and save it on the profile; returns the stored path. */
export async function uploadAvatar(client: SupabaseClient, userId: string, file: File, now: number = Date.now()): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/avatar_${now}.${ext}`;
  const { data, error } = await client.storage.from('avatars').upload(path, file, { upsert: false });
  if (error || !data) throw new Error(error ? error.message : 'Upload failed');
  const { error: saveError } = await client.from('profiles').update({ avatar_url: data.path }).eq('id', userId);
  if (saveError) throw new Error(saveError.message);
  return data.path;
}

// ---------- Banner ----------

export const BANNER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const BANNER_MAX_BYTES = 15 * 1024 * 1024;
export const bannerFileOk = (file: { type: string; size: number }) => BANNER_TYPES.includes(file.type) && file.size >= 1 && file.size <= BANNER_MAX_BYTES;

async function json(response: Response): Promise<Row> {
  try { return (await response.json()) as Row; } catch { return {}; }
}

async function discardBanner(key: string | null, token: string, fetchFn: FetchFn): Promise<void> {
  if (!key) return;
  try {
    await fetchFn('/api/photos/upload-discard', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ category: 'profile-banners', key }) });
  } catch (error) {
    console.warn('Uploaded banner cleanup could not be completed.', error);
  }
}

/** Upload, verify and save a banner; the previous banner is discarded. Returns the new key. */
export async function uploadBanner(token: string, file: File, currentKey: string | null, fetchFn: FetchFn = fetch): Promise<string> {
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  let uploadedKey: string | null = null;
  try {
    const initResponse = await fetchFn('/api/photos/upload-init', { method: 'POST', headers: auth, body: JSON.stringify({ category: 'profile-banners', filename: file.name, mimeType: file.type, fileSize: file.size }) });
    const init = await json(initResponse);
    if (!initResponse.ok) throw new Error((init.error as string) || 'Unable to prepare banner upload.');
    uploadedKey = init.key as string;
    const put = await fetchFn(init.uploadUrl as string, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error('Banner upload failed.');
    const completeResponse = await fetchFn('/api/photos/upload-complete', { method: 'POST', headers: auth, body: JSON.stringify({ category: 'profile-banners', key: uploadedKey }) });
    const complete = await json(completeResponse);
    if (!completeResponse.ok) throw new Error((complete.error as string) || 'Unable to verify banner upload.');
    const saveResponse = await fetchFn('/api/profile/banner', { method: 'PUT', headers: auth, body: JSON.stringify({ key: uploadedKey }) });
    const saved = await json(saveResponse);
    if (!saveResponse.ok) throw new Error((saved.error as string) || 'Banner uploaded but could not be saved to your profile.');
    await discardBanner((saved.previousKey as string) || currentKey, token, fetchFn);
    return uploadedKey;
  } catch (error) {
    await discardBanner(uploadedKey, token, fetchFn);
    throw error;
  }
}

export async function removeBanner(token: string, fetchFn: FetchFn = fetch): Promise<void> {
  const response = await fetchFn('/api/profile/banner', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  const result = await json(response);
  if (!response.ok) throw new Error((result.error as string) || 'Could not remove banner.');
  await discardBanner((result.previousKey as string) || null, token, fetchFn);
}

// ---------- Profile categories ----------

export const CATEGORY_NAME_ERROR = 'Enter a category name (1–60 characters).';
export const cleanCategoryName = (name: string) => {
  const clean = name.trim();
  return clean && clean.length <= 60 ? clean : null;
};
export const categoryLimitMessage = (limit: number) => (limit === 5 ? 'You have reached the maximum of 5 categories for Premium hosts.' : 'Your plan allows 1 category.');

export async function categoryLimit(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('profile_category_limit');
  if (error) throw new Error(error.message);
  return Number(data);
}

/** Create (no id) or update a category with its listings; returns its id. */
export async function saveCategory(client: SupabaseClient, categoryId: string | null, name: string | null, listingIds: string[]): Promise<string> {
  const { data, error } = await client.rpc('save_profile_category_with_listings', { p_category_id: categoryId, p_name: categoryId ? null : name, p_listing_ids: listingIds });
  if (error) throw Object.assign(new Error(error.code === '23505' ? 'That category name already exists.' : (error.message || 'Could not save listing selections. Please try again.')), { code: error.code });
  const saved = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  if (!saved || !saved.id) throw new Error('Category could not be saved. Please try again.');
  return saved.id;
}

export async function renameCategory(client: SupabaseClient, categoryId: string, name: string): Promise<void> {
  const { error } = await client.rpc('rename_profile_category', { p_category_id: categoryId, p_name: name });
  if (error) throw new Error(error.code === '23505' ? 'That category name already exists.' : 'Could not rename category.');
}

export async function deleteCategory(client: SupabaseClient, categoryId: string): Promise<void> {
  const { error } = await client.rpc('delete_profile_category', { p_category_id: categoryId });
  if (error) throw new Error('Could not delete category.');
}
