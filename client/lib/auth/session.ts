import { getSupabaseClient } from '../supabase/client';
import { getProfileStore, type ProfileStore } from './profileStore';

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
