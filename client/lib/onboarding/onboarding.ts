import type { SupabaseClient } from '@supabase/supabase-js';
import { getSafeRedirect } from '../safeRedirect';
import { isReservedUsername, normalizeUsername, RESERVED_USERNAME_MESSAGE } from '../profile/usernames';
import { normalizeInterests } from '../clientInterests';

// Onboarding (migrated from legacy-pages/onboarding.html): the choices, the
// field rules and wording, the saves, and where each role goes when done.
// Hosts: profile (photo, username, phone, location), then what they list and
// their Discover name. Clients: only what they're looking for, then Marketplace.

export type Category = 'airbnb' | 'hotel' | 'property' | 'office' | 'venue';
/** A client's picks: the categories, with property split into buying and renting. */
export type Interest = 'airbnb' | 'hotel' | 'buy' | 'rent' | 'office' | 'venue';

/** A picture tile: its saved value, label and photo (public/assets). */
export interface Tile<V extends string> { value: V; title: string; image: string }

const IMAGES = {
  airbnb: '/assets/bnb.jpg',
  hotel: '/assets/hote.jpg',
  office: '/assets/officea.jpg',
  venue: '/assets/event.jpg',
  home: '/assets/property-home.jpg',
  apartment: '/assets/property-apartment.jpg',
} as const;

/** What hosts list: five tiles, one picked. */
export const CATEGORIES: Array<Tile<Category>> = [
  { value: 'airbnb', title: 'Airbnbs', image: IMAGES.airbnb },
  { value: 'hotel', title: 'Hotels', image: IMAGES.hotel },
  { value: 'property', title: 'Property', image: IMAGES.home },
  { value: 'office', title: 'Shops & offices', image: IMAGES.office },
  { value: 'venue', title: 'Event venues', image: IMAGES.venue },
];

/** What clients look for: six tiles (buy and rent apart), one or more picked. */
export const INTERESTS: Array<Tile<Interest>> = [
  { value: 'airbnb', title: 'Airbnbs', image: IMAGES.airbnb },
  { value: 'hotel', title: 'Hotels', image: IMAGES.hotel },
  { value: 'buy', title: 'Buy a property', image: IMAGES.home },
  { value: 'rent', title: 'Rent a property', image: IMAGES.apartment },
  { value: 'office', title: 'Shops & offices', image: IMAGES.office },
  { value: 'venue', title: 'Event venues', image: IMAGES.venue },
];

export const CITY_SUGGESTIONS = ['Nairobi', 'Mombasa', 'Diani', 'Kisumu', 'Nakuru', 'Naivasha', 'Eldoret', 'Malindi', 'Kilifi', 'Nanyuki', 'Kiambu'].map((city) => `${city}, Kenya`);

const isCategory = (value: unknown): value is Category => CATEGORIES.some((option) => option.value === value);

// ---------- Username ----------

export const USERNAME_HELP = 'Your unique name. You can always change it later.';

export { normalizeUsername };

/** The format problem with a username, or null when it is well-formed. */
export function usernameFormatError(username: string): string | null {
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (!/^[a-z0-9_]+$/.test(username)) return 'Only lowercase letters, numbers and underscore allowed.';
  if (username.length > 20) return 'Username must be 20 characters or fewer.';
  // Public profiles live at varoom.co.ke/<username>, beside the site's pages.
  if (isReservedUsername(username)) return RESERVED_USERNAME_MESSAGE;
  return null;
}

export const takenMessage = (username: string) => `Username "${username}" is already taken. Try another.`;

/** Whether another account has this username (case-insensitive, literal). */
export async function usernameTaken(client: SupabaseClient, username: string, userId: string): Promise<boolean> {
  const literal = username.replace(/[\\%_]/g, (char) => `\\${char}`);
  const { data, error } = await client.from('profiles').select('id').ilike('username', literal).neq('id', userId).limit(1);
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

// ---------- Phone and location ----------

/** What the phone field shows: the number without +254, 254 or a leading 0. */
export function cleanPhoneInput(value: string): string {
  const v = value.trim();
  if (v.startsWith('+254')) return v.slice(4).trim();
  if (v.startsWith('254') && v.length > 9) return v.slice(3).trim();
  if (v.startsWith('0') && v.length === 10) return v.slice(1).trim();
  return value;
}

export function phoneValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

/** The phone as saved: +254… for Kenyan numbers, otherwise + and the digits. */
export function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return `+${digits}`;
}

export const phoneForInput = (saved: string | null | undefined) => (saved ? saved.replace(/^\+254/, '').trim() : '');
export const locationValid = (value: string) => value.trim().length >= 2;
export const discoverNameValid = (value: string) => value.trim().length >= 2 && value.trim().length <= 40;

export const MESSAGES = {
  phone: 'Please enter a valid phone number.',
  location: 'Please enter or select your city/area.',
  niche: 'Please select exactly one listing category.',
  discoverName: 'Please enter a name between 2 and 40 characters.',
  categories: 'Please choose at least one category to continue.',
  saveClient: 'Could not save your preferences. Please try again.',
  saveProfile: 'Could not save profile. Please check your inputs and try again.',
  finish: 'Could not finish onboarding. Please try again.',
  photoType: 'Please choose an image file.',
  photoSize: 'That photo is over 5 MB. Try a smaller one.',
  photoUpload: "Your photo couldn't be uploaded. Try again, or continue without it.",
} as const;

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

// ---------- Host progress ----------

export const hostStepKey = (userId: string) => `varoom_host_onboarding_step_${userId}`;

/** Step 2's choices, kept while the host goes back to step 1 (and across a reload). */
export const listingDraftKey = (userId: string) => `varoom_host_onboarding_listing_${userId}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined;

export function readListingDraft(storage: StorageLike, userId: string): { niche: Category | null; name: string } | null {
  try {
    const raw = storage ? storage.getItem(listingDraftKey(userId)) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { niche?: unknown; name?: unknown };
    return { niche: isCategory(parsed.niche) ? parsed.niche : null, name: typeof parsed.name === 'string' ? parsed.name.slice(0, 40) : '' };
  } catch {
    return null;
  }
}

export function writeListingDraft(storage: StorageLike, userId: string, draft: { niche: Category | null; name: string } | null): void {
  try {
    if (!storage) return;
    if (draft) storage.setItem(listingDraftKey(userId), JSON.stringify(draft));
    else storage.removeItem(listingDraftKey(userId));
  } catch { /* storage unavailable */ }
}

/** Hosts resume on step 2 only when step 1 was saved. */
export function initialHostStep(stored: string | null, profile: { username?: string | null; phone?: string | null; city?: string | null }): 1 | 2 {
  return stored === '2' && profile.username && profile.phone && profile.city ? 2 : 1;
}

// ---------- Saves ----------

export interface HostExtras { phone: string | null; city: string | null; listing_categories: string[] | null }

export async function loadHostExtras(client: SupabaseClient, userId: string): Promise<HostExtras> {
  const { data, error } = await client.from('profiles').select('phone,city,listing_categories').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data || {}) as Partial<HostExtras>;
  return { phone: row.phone || null, city: row.city || null, listing_categories: Array.isArray(row.listing_categories) ? row.listing_categories : null };
}

async function update(client: SupabaseClient, userId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await client.from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}

/**
 * Clients are no longer asked when they are looking: every new client is
 * "looking soon", so Marketplace and Client Home rank their interests first.
 */
export const saveClientPreferences = (client: SupabaseClient, userId: string, interests: Interest[]) =>
  update(client, userId, { interested_categories: interests, looking_timeline: 'soon', onboarding_completed: true });

/** Step 1. `removeAvatar` clears the saved photo the host removed (a new photo uploads separately). */
export const saveHostProfile = (client: SupabaseClient, userId: string, values: { username: string; phone: string; city: string; removeAvatar?: boolean }) =>
  update(client, userId, {
    username: values.username, phone: normalisePhone(values.phone), city: values.city.trim(),
    ...(values.removeAvatar ? { avatar_url: null } : {}),
  });

export const saveHostListing = (client: SupabaseClient, userId: string, niche: Category, discoverName: string) =>
  update(client, userId, { listing_categories: [niche], full_name: discoverName.trim(), onboarding_completed: true });

/** Upload the cropped photo to the account's avatars folder; returns the stored key. */
export async function uploadAvatar(client: SupabaseClient, userId: string, photo: Blob, now: number = Date.now()): Promise<string> {
  const { data, error } = await client.storage.from('avatars').upload(`${userId}/avatar_${now}.jpg`, photo, { upsert: false, contentType: 'image/jpeg' });
  if (error || !data) throw new Error(error ? error.message : 'Upload failed');
  return data.path;
}

/** Upload the cropped photo and save it on the profile; returns the stored key. */
export async function saveAvatar(client: SupabaseClient, userId: string, photo: Blob, now: number = Date.now()): Promise<string> {
  const path = await uploadAvatar(client, userId, photo, now);
  await update(client, userId, { avatar_url: path });
  return path;
}

// ---------- Where to go next ----------

/** After onboarding: the safe link they came from, else Host Home for hosts and Marketplace for clients. */
export function destination(role: 'host' | 'client', safeRedirect: string | null): string {
  if (safeRedirect) return safeRedirect;
  return role === 'host' ? '/host-home' : '/marketplace';
}

export const roleHome = (role: 'host' | 'client') => (role === 'host' ? '/host-home' : '/client-home');

/** The ?redirect= to return to when done: same-origin only, and never back to onboarding. */
export function onboardingRedirect(value: unknown): string | null {
  const safe = getSafeRedirect(value);
  return safe && !safe.startsWith('/onboarding') ? safe : null;
}

/**
 * Finishing waits for a photo still uploading. False when that upload failed
 * and is still the current one: the host stays to retry or skip it.
 */
export async function photoAllowsFinish<R extends { done: Promise<string> }>(getRun: () => R | null): Promise<boolean> {
  const run = getRun();
  if (run) {
    const result = await run.done;
    if (result === 'failed' && getRun() === run) return false;
  }
  return true;
}

/** A client's saved picks, in tile order; an older 'property' pick becomes both buy and rent. */
export function initialInterests(saved: unknown): Interest[] {
  const keys = normalizeInterests(Array.isArray(saved) ? saved : []);
  const picked = new Set(keys.flatMap((key) => (key === 'property' ? ['buy', 'rent'] : [key])));
  return INTERESTS.map((tile) => tile.value).filter((value) => picked.has(value));
}

/** Picks in tile order (as saved). */
export const orderedInterests = (picked: readonly Interest[]): Interest[] => INTERESTS.map((tile) => tile.value).filter((value) => picked.includes(value));

export function initialNiche(saved: string[] | null | undefined): Category | null {
  return Array.isArray(saved) && saved.length === 1 && isCategory(saved[0]) ? saved[0] : null;
}

// ---------- Photo crop ----------

export interface Crop { frameSize: number; baseWidth: number; baseHeight: number; zoom: number; offsetX: number; offsetY: number }

/** Fit the image to cover the square frame, centred, unzoomed. */
export function startCrop(frameSize: number, naturalWidth: number, naturalHeight: number): Crop {
  const fit = Math.max(frameSize / naturalWidth, frameSize / naturalHeight);
  return { frameSize, baseWidth: naturalWidth * fit, baseHeight: naturalHeight * fit, zoom: 1, offsetX: 0, offsetY: 0 };
}

/** Zoom 1–4; the image always covers the frame. */
export function constrainCrop(crop: Crop): Crop {
  const zoom = Math.max(1, Math.min(4, crop.zoom));
  const maxX = Math.max(0, (crop.baseWidth * zoom - crop.frameSize) / 2);
  const maxY = Math.max(0, (crop.baseHeight * zoom - crop.frameSize) / 2);
  return { ...crop, zoom, offsetX: Math.max(-maxX, Math.min(maxX, crop.offsetX)), offsetY: Math.max(-maxY, Math.min(maxY, crop.offsetY)) };
}

/** Where the image is drawn on the 1024px output square. */
export function cropDraw(crop: Crop, outputSize = 1024): { left: number; top: number; width: number; height: number } {
  const scale = outputSize / crop.frameSize;
  const width = crop.baseWidth * crop.zoom;
  const height = crop.baseHeight * crop.zoom;
  return { left: (crop.frameSize / 2 + crop.offsetX - width / 2) * scale, top: (crop.frameSize / 2 + crop.offsetY - height / 2) * scale, width: width * scale, height: height * scale };
}
