import type { SupabaseClient } from '@supabase/supabase-js';

// Onboarding (migrated from legacy-pages/onboarding.html): the choices, the
// field rules and wording, the saves, and where each role goes when done.
// Hosts: profile (photo, username, phone, location), then what they list and
// their Discover name. Clients: what they're looking for and when.

export type Category = 'airbnb' | 'hotel' | 'property' | 'office' | 'venue';
export type Timeline = 'soon' | 'browsing';

export const CATEGORIES: Array<{ value: Category; title: string; description: string }> = [
  { value: 'airbnb', title: 'Airbnbs', description: 'Unique stays that feel like home' },
  { value: 'hotel', title: 'Hotels', description: 'Comfort, service and easy booking' },
  { value: 'property', title: 'Property to let / buy', description: 'Your next home or investment' },
  { value: 'office', title: 'Shops & offices', description: 'Spaces for work and business' },
  { value: 'venue', title: 'Event venues', description: 'The right setting for your occasion' },
];

export const TIMELINES: Array<{ value: Timeline; title: string; description: string }> = [
  { value: 'soon', title: 'Looking soon', description: "I'm ready to find it" },
  { value: 'browsing', title: 'Just browsing', description: "I'm exploring for now" },
];

export const CITY_SUGGESTIONS = ['Nairobi', 'Mombasa', 'Diani', 'Kisumu', 'Nakuru', 'Naivasha', 'Eldoret', 'Malindi', 'Kilifi', 'Nanyuki', 'Kiambu'].map((city) => `${city}, Kenya`);

const isCategory = (value: unknown): value is Category => CATEGORIES.some((option) => option.value === value);

// ---------- Username ----------

export const USERNAME_HELP = 'Your unique name. You can always change it later.';

export const normalizeUsername = (value: string) => value.trim().replace(/^@+/, '').toLowerCase();

/** The format problem with a username, or null when it is well-formed. */
export function usernameFormatError(username: string): string | null {
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (!/^[a-z0-9._]+$/.test(username)) return 'Only lowercase letters, numbers, dot, and underscore allowed.';
  if (username.length > 20) return 'Username must be 20 characters or fewer.';
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
  timeline: 'Please select when you are looking.',
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

export const saveClientPreferences = (client: SupabaseClient, userId: string, categories: Category[], timeline: Timeline) =>
  update(client, userId, { interested_categories: categories, looking_timeline: timeline, onboarding_completed: true });

export const saveHostProfile = (client: SupabaseClient, userId: string, values: { username: string; phone: string; city: string }) =>
  update(client, userId, { username: values.username, phone: normalisePhone(values.phone), city: values.city.trim() });

export const saveHostListing = (client: SupabaseClient, userId: string, niche: Category, discoverName: string) =>
  update(client, userId, { listing_categories: [niche], full_name: discoverName.trim(), onboarding_completed: true });

/** Upload the cropped photo and save it on the profile; returns the stored key. */
export async function saveAvatar(client: SupabaseClient, userId: string, photo: Blob, now: number = Date.now()): Promise<string> {
  const { data, error } = await client.storage.from('avatars').upload(`${userId}/avatar_${now}.jpg`, photo, { upsert: false, contentType: 'image/jpeg' });
  if (error || !data) throw new Error(error ? error.message : 'Upload failed');
  await update(client, userId, { avatar_url: data.path });
  return data.path;
}

// ---------- Where to go next ----------

/** After onboarding: the safe link they came from, else their role's home. */
export function destination(role: 'host' | 'client', timeline: Timeline | null, safeRedirect: string | null): string {
  if (safeRedirect) return safeRedirect;
  if (role === 'host') return '/host-home';
  return timeline === 'soon' ? '/marketplace' : '/client-home';
}

export const roleHome = (role: 'host' | 'client') => (role === 'host' ? '/host-home' : '/client-home');

export function initialCategories(saved: unknown): Category[] {
  return Array.isArray(saved) ? saved.filter(isCategory) : [];
}

export function initialNiche(saved: string[] | null | undefined): Category | null {
  return Array.isArray(saved) && saved.length === 1 && isCategory(saved[0]) ? saved[0] : null;
}

export const initialTimeline = (saved: unknown): Timeline | null => (saved === 'soon' || saved === 'browsing' ? saved : null);

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
