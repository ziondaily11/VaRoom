import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../supabase/client';
import { loadBookmarks, peekBookmarks, subscribeBookmarks } from './bookmarks';

/**
 * The listing ids this account has saved, shared with the rest of the app
 * (Marketplace, public host profiles): the cached set at once, loaded once
 * per account, and updated when a save anywhere changes it. Empty when
 * signed out.
 */
export function useSavedListingIds(userId: string | null): ReadonlySet<string> {
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!userId) { setSaved(new Set()); return undefined; }
    const cached = peekBookmarks(userId);
    if (cached) setSaved(cached);
    const unsubscribe = subscribeBookmarks((owner, ids) => { if (owner === userId) setSaved(ids); });
    const client = getSupabaseClient();
    if (client && !cached) loadBookmarks(client, userId).catch((error) => console.warn('Saved listings could not be loaded:', error));
    return unsubscribe;
  }, [userId]);
  return saved;
}
