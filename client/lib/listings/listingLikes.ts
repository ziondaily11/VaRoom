import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// A listing's like button (the booking page's gallery): the count and whether
// this account likes it, toggled optimistically. Taps made while a save is
// running are sent afterwards, so the last tap wins; a failed save reloads
// the confirmed state. Same RPCs as before (get_listing_like_summaries,
// set_listing_like).

export interface LikeSummary { listing_id?: string; like_count: number | string; liked_by_current_user: boolean }

export function isValidLikeSummary(summary: unknown): summary is LikeSummary {
  if (!summary || typeof summary !== 'object') return false;
  const value = summary as Partial<LikeSummary>;
  const count = Number(value.like_count);
  return Number.isSafeInteger(count) && count >= 0 && typeof value.liked_by_current_user === 'boolean';
}

export async function fetchLikeSummary(client: SupabaseClient, listingId: string): Promise<{ count: number; liked: boolean }> {
  const { data, error } = await client.rpc('get_listing_like_summaries', { p_listing_ids: [listingId] });
  if (error) throw error;
  const summary = Array.isArray(data) ? (data as LikeSummary[]).find((item) => item.listing_id === listingId) : null;
  if (!isValidLikeSummary(summary)) throw new Error('The listing-like summary response was invalid.');
  return { count: Number(summary.like_count), liked: summary.liked_by_current_user };
}

export async function saveLike(client: SupabaseClient, listingId: string, liked: boolean): Promise<{ count: number; liked: boolean }> {
  const { data, error } = await client.rpc('set_listing_like', { p_listing_id: listingId, p_liked: liked });
  if (error) throw error;
  const summary = Array.isArray(data) ? data[0] : null;
  if (!isValidLikeSummary(summary)) throw new Error('The response was invalid.');
  return { count: Number(summary.like_count), liked: summary.liked_by_current_user };
}

/** What the button shows: the confirmed count, moved by one while an unsaved tap differs. */
export const shownCount = (confirmedCount: number, confirmedLiked: boolean, liked: boolean) =>
  Math.max(0, confirmedCount + (liked === confirmedLiked ? 0 : (liked ? 1 : -1)));

/** loading: the first summary hasn't arrived (ready false without it means it failed). */
export interface LikeView { loading: boolean; ready: boolean; liked: boolean; count: number }

export function useListingLike(client: SupabaseClient | null, listingId: string | null): LikeView & { toggle: () => void } {
  const [view, setView] = useState<LikeView>({ loading: true, ready: false, liked: false, count: 0 });
  const state = useRef({ liked: false, confirmedLiked: false, confirmedCount: 0, ready: false, saving: false });

  const publish = useCallback(() => {
    const s = state.current;
    setView({ loading: false, ready: s.ready, liked: s.liked, count: shownCount(s.confirmedCount, s.confirmedLiked, s.liked) });
  }, []);

  const refresh = useCallback(async () => {
    if (!client || !listingId) return;
    const s = state.current;
    try {
      const summary = await fetchLikeSummary(client, listingId);
      s.confirmedCount = summary.count;
      s.confirmedLiked = summary.liked;
      s.liked = summary.liked;
      s.ready = true;
    } catch (error) {
      console.error('Listing likes could not be loaded:', error);
      s.ready = false;
    }
  }, [client, listingId]);

  useEffect(() => {
    let active = true;
    state.current = { liked: false, confirmedLiked: false, confirmedCount: 0, ready: false, saving: false };
    setView({ loading: true, ready: false, liked: false, count: 0 });
    void refresh().then(() => { if (active) publish(); });
    return () => { active = false; };
  }, [refresh, publish]);

  const sync = useCallback(async () => {
    const s = state.current;
    if (!client || !listingId || s.saving || !s.ready) return;
    s.saving = true;
    try {
      while (s.liked !== s.confirmedLiked) {
        try {
          const summary = await saveLike(client, listingId, s.liked);
          s.confirmedCount = summary.count;
          s.confirmedLiked = summary.liked;
          publish();
        } catch (error) {
          console.error('Listing like update failed:', error);
          await refresh();
          break;
        }
      }
    } finally {
      s.saving = false;
    }
    s.liked = s.confirmedLiked;
    publish();
  }, [client, listingId, publish, refresh]);

  const toggle = useCallback(() => {
    const s = state.current;
    if (!s.ready) return;
    s.liked = !s.liked;
    publish();
    void sync();
  }, [publish, sync]);

  return { ...view, toggle };
}
