import { useSyncExternalStore } from 'react';
import type { Category } from '../onboarding/onboarding';

// Become a Host: a client account becomes a host account in place (same
// sign-in, same profile). The setup cards open over Client Home
// (?setup=host); nothing is saved until the last card, when one server call
// (POST /api/account/become-host) converts the account. The overlay lives in
// _app, so it stays on screen while the page moves to Host Home.

export const BECOME_HOST_HREF = '/client-home?setup=host';
export const isHostSetupQuery = (value: unknown) => value === 'host';

/** The steps shown while converting, each over real work (BecomeHostOverlay). */
export const PHASES = ['Warming up your host tools', 'Preparing your account', 'Adjusting your pages', 'Setting up analytics'] as const;
/** Each phase stays up at least this long, so the messages read as a smooth sequence. */
export const PHASE_MIN_MS = 900;

/** Resolves with `work` once both it and `ms` have finished. */
export async function atLeast<T>(ms: number, work: Promise<T>): Promise<T> {
  const [result] = await Promise.all([work, new Promise((resolve) => { setTimeout(resolve, ms); })]);
  return result;
}

export interface HostSetup {
  username: string;
  phone: string;
  city: string;
  niche: Category;
  discoverName: string;
  /** A photo uploaded to the account's avatars folder; null removes the current photo; absent keeps it. */
  avatarPath?: string | null;
}

export type ConvertResult = { ok: true } | { ok: false; error: string; code: 'step_up_required' | 'username_taken' | null };

export async function convertToHost(token: string, setup: HostSetup, fetchFn: typeof fetch = fetch): Promise<ConvertResult> {
  let response: Response;
  try {
    response = await fetchFn('/api/account/become-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(setup),
    });
  } catch {
    return { ok: false, error: 'Network error. Please check your connection and try again.', code: null };
  }
  const result = await response.json().catch(() => ({})) as { error?: string; code?: string };
  if (response.ok) return { ok: true };
  const code = result.code === 'step_up_required' || result.code === 'username_taken' ? result.code : null;
  return { ok: false, error: result.error || 'Your host account could not be set up. Please try again.', code };
}

// While converting, the overlay stays open whatever the URL says (the page
// moves from Client Home to Host Home underneath it).
let converting = false;
const listeners = new Set<() => void>();
export function setConverting(value: boolean): void {
  if (converting === value) return;
  converting = value;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useConverting = () => useSyncExternalStore(subscribe, () => converting, () => false);
