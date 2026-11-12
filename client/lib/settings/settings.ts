import type { SupabaseClient } from '@supabase/supabase-js';

// Settings (migrated from legacy-pages/settings.html): the preferences kept on
// the profile, the re-check that guards Your Account, and account deletion.
// Import-free apart from types, so it can be tested directly.

/** Profile columns Settings needs that the app's profile store does not carry. */
export const PREFERENCE_COLUMNS = 'phone,theme_preference,message_notifications,notify_bookings,notify_booking_reminders,notify_reviews,notify_account_updates,notify_marketing,profile_visibility,who_can_message,location_visibility';

export interface Preferences {
  phone: string | null;
  theme_preference: string | null;
  message_notifications: boolean | null;
  notify_bookings: boolean | null;
  notify_booking_reminders: boolean | null;
  notify_reviews: boolean | null;
  notify_account_updates: boolean | null;
  notify_marketing: boolean | null;
  profile_visibility: string | null;
  who_can_message: string | null;
  location_visibility: string | null;
}

export type NotificationKey = 'message_notifications' | 'notify_bookings' | 'notify_booking_reminders' | 'notify_reviews' | 'notify_account_updates' | 'notify_marketing';

/** hostOnly rows are shown to hosts only. */
export const NOTIFICATION_ROWS: Array<{ key: NotificationKey; label: string; desc?: string; hostOnly?: boolean }> = [
  { key: 'message_notifications', label: 'Messages', desc: 'New messages in your chats (the same switch as in Chat settings).' },
  { key: 'notify_bookings', label: 'Bookings', desc: 'Requests, confirmations, declines, cancellations and expiries.' },
  { key: 'notify_booking_reminders', label: 'Requests about to expire', desc: 'A reminder 6 hours before an unanswered request expires.', hostOnly: true },
  { key: 'notify_reviews', label: 'Reviews', desc: 'New reviews of your listings, and when your own reviews are published.' },
  { key: 'notify_account_updates', label: 'Important account updates' },
  { key: 'notify_marketing', label: 'Promotional & marketing' },
];

export async function loadPreferences(client: SupabaseClient, userId: string): Promise<Preferences> {
  const { data, error } = await client.from('profiles').select(PREFERENCE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data || {}) as Preferences;
}

/** Save profile preferences; resolves the error message, or null. */
export async function savePreferences(client: SupabaseClient, userId: string, patch: Partial<Preferences>): Promise<string | null> {
  const { error } = await client.from('profiles').update(patch).eq('id', userId);
  return error ? error.message || 'Could not save.' : null;
}

// ---- Display ----

export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_KEY = 'varoom_theme';
export const FONT_SIZE_KEY = 'varoom_font_size';

// Five stages (like X), Default in the middle. It scales the root font size,
// and VaRoom sizes text in rem, so the choice applies on every page (the
// same scales are in _app's boot script).
export const FONT_SIZES = [
  { key: 'xsmall', label: 'Extra small', scale: '0.85' },
  { key: 'small', label: 'Small', scale: '0.9' },
  { key: 'default', label: 'Default', scale: '1' },
  { key: 'large', label: 'Large', scale: '1.1' },
  { key: 'xlarge', label: 'Extra large', scale: '1.2' },
];
export const DEFAULT_FONT_INDEX = 2;

export function savedTheme(storage: Pick<Storage, 'getItem'> | null): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function fontSizeIndex(storage: Pick<Storage, 'getItem'> | null): number {
  let key = 'default';
  try { key = storage?.getItem(FONT_SIZE_KEY) || 'default'; } catch { /* default */ }
  const index = FONT_SIZES.findIndex((size) => size.key === key);
  return index >= 0 ? index : DEFAULT_FONT_INDEX;
}

/** Apply a font size app-wide (the same tokens _app sets on load). */
export function applyFontSize(doc: Document, index: number): (typeof FONT_SIZES)[number] {
  const size = FONT_SIZES[index] || FONT_SIZES[DEFAULT_FONT_INDEX];
  doc.documentElement.style.setProperty('--varoom-font-scale', size.scale);
  doc.documentElement.setAttribute('data-font-size', size.key);
  return size;
}

// ---- Your Account lock (risk-based) ----
//
// The server decides (server/lib/stepUp.js): a session signed into within
// 12 hours, or verified within 24 hours, is unlocked; otherwise it asks once.
// What it answered is remembered for this session in sessionStorage, keyed
// by the session id, so returning to Settings doesn't ask (or wait) again.
// That memory only decides what the page shows; the server and database
// enforce the lock.

export interface SecurityStatus {
  unlocked: boolean;
  reason: 'fresh_sign_in' | 'verified' | 'stale_session';
  unlockedUntil: string | null;
}

export const UNLOCK_STORAGE_PREFIX = 'varoom:account-unlock:v1:';

/** The session id inside an access token (a cache key only; the server checks the token). */
export function tokenSessionId(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as { session_id?: unknown };
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch {
    return null;
  }
}

/** Until when this session was last known to be unlocked (ms), or null. */
export function rememberedUnlock(storage: Pick<Storage, 'getItem'> | null, sessionId: string | null, now = Date.now()): number | null {
  if (!storage || !sessionId) return null;
  try {
    const until = Number(storage.getItem(UNLOCK_STORAGE_PREFIX + sessionId));
    return Number.isFinite(until) && until > now ? until : null;
  } catch {
    return null;
  }
}

export function rememberUnlock(storage: Pick<Storage, 'setItem'> | null, sessionId: string | null, unlockedUntil: string | null): void {
  const until = unlockedUntil ? Date.parse(unlockedUntil) : NaN;
  if (!storage || !sessionId || !Number.isFinite(until)) return;
  try { storage.setItem(UNLOCK_STORAGE_PREFIX + sessionId, String(until)); } catch { /* This visit only. */ }
}

export async function loadSecurityStatus(token: string, fetchFn: typeof fetch = fetch): Promise<SecurityStatus> {
  const response = await fetchFn('/api/account/security-status', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const result = await json(response);
  if (!response.ok) throw new Error((result.error as string) || 'Could not check your account security.');
  return result as unknown as SecurityStatus;
}

/** Verify with the account password (checked by the server); resolves until when this session is unlocked. */
export async function verifyPassword(token: string, password: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; unlockedUntil: string | null } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetchFn('/api/account/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    });
  } catch {
    return { ok: false, error: 'Network error — please try again.' };
  }
  const result = await json(response);
  if (response.ok && result.unlocked) return { ok: true, unlockedUntil: (result.unlockedUntil as string) || null };
  return { ok: false, error: (result.error as string) || 'Incorrect password. Please try again.' };
}

export const VERIFICATION_SESSION_KEY = 'varoom_account_verification_session';
export const VERIFICATION_ERROR_KEY = 'varoom_account_verification_error';
const json = (response: Response) => response.json().catch(() => ({})) as Promise<Record<string, unknown>>;

/** Google re-check is offered only to Google-only accounts (the server decides). */
export async function googleVerificationEligible(token: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchFn('/api/account-information/google-verification/eligibility', { headers: { Authorization: `Bearer ${token}` } });
    const result = await json(response);
    return Boolean(response.ok && result.eligible);
  } catch {
    return false;
  }
}

export async function startGoogleVerification(token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const response = await fetchFn('/api/account-information/google-verification/start', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const result = await json(response);
  if (!response.ok) throw new Error((result.error as string) || 'Could not start Google verification.');
}

/** Whether Google returned the same VaRoom user who started (server-checked). */
export async function completeGoogleVerification(token: string, fetchFn: typeof fetch = fetch): Promise<{ verified: boolean; error: string | null; unlockedUntil: string | null }> {
  const response = await fetchFn('/api/account-information/google-verification/complete', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const result = await json(response);
  if (response.ok && result.verified) return { verified: true, error: null, unlockedUntil: (result.unlockedUntil as string) || null };
  return { verified: false, error: (result.error as string) || 'The Google account does not match this VaRoom account.', unlockedUntil: null };
}

// ---- Delete account ----

/** As the server accepts them (server.js /api/delete-account). */
export const DELETE_REASONS = ['I no longer use VaRoom', 'I created another account', 'Privacy concerns', "I'm unhappy with the service", 'Technical issues', 'Other'];

export function canDelete(reason: string, details: string): boolean {
  return Boolean(reason) && (reason !== 'Other' || Boolean(details.trim()));
}

/** "Deactivate account": hidden and signed out everywhere, nothing deleted; signing in again reactivates it. */
export async function deactivateAccount(token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const response = await fetchFn('/api/account/deactivate', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const result = await json(response);
  if (!response.ok) throw new Error((result.error as string) || 'Unable to deactivate account');
}

/** "Delete account": deactivated at once, permanently deleted after 30 days unless the person signs in again. */
export async function deleteAccount(token: string, reason: string, details: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const response = await fetchFn('/api/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason, reason_details: details.trim() }),
  });
  const result = await json(response);
  if (!response.ok) throw new Error((result.error as string) || 'Unable to delete account');
}

/** The categories on the main list, for search (titles only, as before). */
export const CATEGORY_TITLES: Record<string, string> = {
  account: 'Your Account',
  plans: 'Plans & Billing',
  notifications: 'Notifications',
  display: 'Display',
  privacy: 'Privacy & Security',
  support: 'Support & About',
  'login-accounts': 'Login & Accounts',
  payments: 'Payments & Payouts',
};

export function matchesSearch(title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || title.toLowerCase().includes(q);
}
