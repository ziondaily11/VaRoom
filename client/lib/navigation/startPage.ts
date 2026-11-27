import type { SupabaseClient } from '@supabase/supabase-js';

// A host's start page: the sidebar page they pin, opened first after signing
// in (email and Google). Stored on the profile (`profiles.start_page`) so it
// follows the account across devices. Only the host sidebar's own pages can
// be pinned, so a stored value can never send anyone off VaRoom.

export const HOST_START_PAGES = [
  '/host-home',
  '/marketplace',
  '/bookings',
  '/calendar',
  '/chats',
  '/notifications',
  '/host-home?view=my-listings',
  '/profile',
  '/analytics',
  '/settings',
  '/support',
  '/pricing',
] as const;

export type HostStartPage = typeof HOST_START_PAGES[number];

export function isHostStartPage(value: unknown): value is HostStartPage {
  return typeof value === 'string' && (HOST_START_PAGES as readonly string[]).includes(value);
}

/** The pinned page for this profile, or null (hosts only; anything unknown is ignored). */
export function startPageFor(profile: { role?: string | null; start_page?: string | null } | null | undefined): HostStartPage | null {
  if (!profile || profile.role !== 'host') return null;
  return isHostStartPage(profile.start_page) ? profile.start_page : null;
}

/** Pin a page (or null to unpin). Throws on failure. */
export async function saveStartPage(client: SupabaseClient, userId: string, page: HostStartPage | null): Promise<void> {
  const { error } = await client.from('profiles').update({ start_page: page }).eq('id', userId);
  if (error) throw new Error(error.message || 'Your start page could not be saved.');
}
