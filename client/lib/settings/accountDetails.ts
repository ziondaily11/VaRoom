import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalisePhone, normalizeUsername, phoneValid, usernameTaken } from '../onboarding/onboarding';

// Settings → Your Account → Account Information: full name, username and
// phone are changed here only (the /profile editor keeps city, bio and the
// photo). The database also requires a recently signed-in or verified
// session for these (migration 20261105_000062), so going around this page
// doesn't help.

export type AccountDetailKey = 'full_name' | 'username' | 'phone';

/** As the database allows them (profiles.username_format). */
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const DETAIL_MESSAGES = {
  nameRequired: 'Enter your full name (2–80 characters).',
  usernameFormat: 'Use 3–20 lowercase letters, numbers or underscores.',
  usernameTaken: 'That username is already taken. Try another.',
  phone: 'Please enter a valid phone number.',
  stepUp: 'For your security, verify your identity again to change your account details: reopen Your Account in Settings.',
  failed: 'That change could not be saved. Please try again.',
};

/** The value to save, or the message to show. */
export function accountDetailUpdate(key: AccountDetailKey, raw: string): { value: string; error: null } | { value: null; error: string } {
  if (key === 'full_name') {
    const value = raw.trim().replace(/\s+/g, ' ');
    return value.length >= 2 && value.length <= 80 ? { value, error: null } : { value: null, error: DETAIL_MESSAGES.nameRequired };
  }
  if (key === 'username') {
    const value = normalizeUsername(raw);
    return USERNAME_PATTERN.test(value) ? { value, error: null } : { value: null, error: DETAIL_MESSAGES.usernameFormat };
  }
  return phoneValid(raw) ? { value: normalisePhone(raw), error: null } : { value: null, error: DETAIL_MESSAGES.phone };
}

/** What a failed save means for the person changing it. */
export function accountDetailError(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error) return null;
  const message = error.message || '';
  if (/step_up_required/.test(message)) return DETAIL_MESSAGES.stepUp;
  if (error.code === '23505' || /duplicate key|profiles_username/i.test(message)) return DETAIL_MESSAGES.usernameTaken;
  if (error.code === '23514' || /username_format/i.test(message)) return DETAIL_MESSAGES.usernameFormat;
  return DETAIL_MESSAGES.failed;
}

// ---- Username availability (checked as the person types) ----

export type UsernameAvailability = 'idle' | 'current' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

/** Wait this long after the last keystroke before asking. */
export const USERNAME_CHECK_DELAY_MS = 400;

/** What the field can tell without asking the server (null: ask). */
export function usernameLocalState(draft: string, current: string | null): { state: UsernameAvailability; value: string } | null {
  const value = normalizeUsername(draft);
  if (!value) return { state: 'idle', value };
  if (current && value === current.toLowerCase()) return { state: 'current', value };
  if (!USERNAME_PATTERN.test(value)) return { state: 'invalid', value };
  return null;
}

/**
 * Whether the username being typed is free. Asks once typing pauses; an
 * answer for an older draft is ignored; the pending check stops on unmount.
 */
export function useUsernameAvailability(
  client: SupabaseClient | null, userId: string, draft: string, current: string | null, enabled: boolean,
  taken: (client: SupabaseClient, username: string, userId: string) => Promise<boolean> = usernameTaken,
): UsernameAvailability {
  const [state, setState] = useState<UsernameAvailability>('idle');
  useEffect(() => {
    if (!enabled) { setState('idle'); return undefined; }
    const local = usernameLocalState(draft, current);
    if (local) { setState(local.state); return undefined; }
    if (!client) { setState('error'); return undefined; }
    let stale = false;
    setState('checking');
    const timer = window.setTimeout(() => {
      taken(client, normalizeUsername(draft), userId)
        .then((isTaken) => { if (!stale) setState(isTaken ? 'taken' : 'available'); })
        .catch(() => { if (!stale) setState('error'); });
    }, USERNAME_CHECK_DELAY_MS);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [client, userId, draft, current, enabled, taken]);
  return state;
}

/** Saves one detail; resolves the message to show, or null when saved. */
export async function saveAccountDetail(client: SupabaseClient, userId: string, key: AccountDetailKey, value: string): Promise<string | null> {
  const { error } = await client.from('profiles').update({ [key]: value }).eq('id', userId);
  return accountDetailError(error);
}
