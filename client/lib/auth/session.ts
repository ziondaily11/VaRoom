import { getSupabaseClient } from '../supabase/client';
import { getProfileStore, type ProfileResult, type ProfileStore } from './profileStore';

/** The app-wide profile store, bound to the shared Supabase client. */
export function profileStore(): ProfileStore {
  return getProfileStore(getSupabaseClient);
}

/** True on the add-account OAuth callback, where the client is a temporary, isolated one. */
export function isAddAccountCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search || '');
  return params.get('add_account_callback') === '1' || params.get('addAccount') === 'true';
}

/**
 * The account's profile from the shared cache, including its niche. A profile
 * cached before `listing_categories` was read is fetched again once.
 */
export async function profileWithNiche(userId: string): Promise<ProfileResult> {
  const store = profileStore();
  const result = await store.get(userId);
  if (result.data && result.data.listing_categories === undefined) return store.get(userId, { force: true });
  return result;
}
