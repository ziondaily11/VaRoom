import type { SupabaseClient } from '@supabase/supabase-js';

// Settings (migrated from legacy-pages/settings.html): the preferences kept on
// the profile, the re-check that guards Your Account, and account deletion.
// Import-free apart from types, so it can be tested directly.

/** Profile columns Settings needs that the app's profile store does not carry. */
export const PREFERENCE_COLUMNS = 'phone,theme_preference,notify_messages,notify_bookings,notify_account_updates,notify_marketing,profile_visibility,who_can_message,location_visibility';

export interface Preferences {
  phone: string | null;
  theme_preference: string | null;
  notify_messages: boolean | null;
  notify_bookings: boolean | null;
  notify_account_updates: boolean | null;
  notify_marketing: boolean | null;
  profile_visibility: string | null;
  who_can_message: string | null;
  location_visibility: string | null;
}

export type NotificationKey = 'notify_messages' | 'notify_bookings' | 'notify_account_updates' | 'notify_marketing';

export const NOTIFICATION_ROWS: Array<{ key: NotificationKey; label: string }> = [
  { key: 'notify_messages', label: 'Messages' },
  { key: 'notify_bookings', label: 'Bookings' },
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

export const FONT_SIZES = [
  { key: 'small', label: 'Small', scale: '0.9' },
  { key: 'default', label: 'Default', scale: '1' },
  { key: 'large', label: 'Large', scale: '1.1' },
  { key: 'xlarge', label: 'Extra large', scale: '1.2' },
];

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
  return index >= 0 ? index : 1;
}

/** Apply a font size app-wide (the same tokens _app sets on load). */
export function applyFontSize(doc: Document, index: number): (typeof FONT_SIZES)[number] {
  const size = FONT_SIZES[index] || FONT_SIZES[1];
  doc.documentElement.style.setProperty('--varoom-font-scale', size.scale);
  doc.documentElement.setAttribute('data-font-size', size.key);
  return size;
}

// ---- Your Account re-check ----

/**
 * Check the current password on a throwaway client that keeps no session,
 * so the signed-in session is never replaced.
 */
export async function verifyPassword(
  createClient: () => SupabaseClient,
  { email, password, userId }: { email: string; password: string; userId: string },
): Promise<boolean> {
  try {
    const { data, error } = await createClient().auth.signInWithPassword({ email, password });
    return Boolean(!error && data && data.user && data.user.id === userId);
  } catch {
    return false;
  }
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
export async function completeGoogleVerification(token: string, fetchFn: typeof fetch = fetch): Promise<{ verified: boolean; error: string | null }> {
  const response = await fetchFn('/api/account-information/google-verification/complete', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const result = await json(response);
  if (response.ok && result.verified) return { verified: true, error: null };
  return { verified: false, error: (result.error as string) || 'The Google account does not match this VaRoom account.' };
}

// ---- Delete account ----

/** As the server accepts them (server.js /api/delete-account). */
export const DELETE_REASONS = ['I no longer use VaRoom', 'I created another account', 'Privacy concerns', "I'm unhappy with the service", 'Technical issues', 'Other'];

export function canDelete(reason: string, details: string): boolean {
  return Boolean(reason) && (reason !== 'Other' || Boolean(details.trim()));
}

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
