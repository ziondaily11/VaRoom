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

// ---------- Many listings (a feed) ----------

export interface FeedLikeState {
  count: number;
  liked: boolean;
  confirmedCount: number;
  confirmedLiked: boolean;
  loaded: boolean;
  loading: boolean;
  loadFailed: boolean;
  unavailable: boolean;
  changed: boolean;
  version: number;
  saving: boolean;
}

const freshLikeState = (): FeedLikeState => ({
  count: 0, liked: false, confirmedCount: 0, confirmedLiked: false,
  loaded: false, loading: false, loadFailed: false, unavailable: false, changed: false, version: 0, saving: false,
});

/**
 * Likes for a feed's cards, as on Host home: summaries load in batches of
 * 100 (each listing once), a tap is optimistic, and a failed save reconciles
 * with the server (or marks the like unavailable). `notify` shows the toasts.
 */
export function useFeedLikes(client: SupabaseClient | null, notify: (message: string) => void) {
  const states = useRef(new Map<string, FeedLikeState>());
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((tick) => tick + 1), []);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const stateOf = useCallback((id: string): FeedLikeState => {
    let state = states.current.get(id);
    if (!state) { state = freshLikeState(); states.current.set(id, state); }
    return state;
  }, []);

  const load = useCallback(async (listingIds: string[]) => {
    if (!client) return;
    const ids = Array.from(new Set(listingIds.map(String))).filter((id) => {
      const state = stateOf(id);
      if (state.loaded || state.loading || state.loadFailed) return false;
      state.loading = true;
      return true;
    });
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      const versions = new Map(batch.map((id) => [id, stateOf(id).version]));
      try {
        const { data, error } = await client.rpc('get_listing_like_summaries', { p_listing_ids: batch });
        if (error) throw error;
        const byId = new Map(((data || []) as LikeSummary[]).map((summary) => [summary.listing_id, summary]));
        if (!batch.every((id) => isValidLikeSummary(byId.get(id)))) throw new Error('The listing-like summary response was incomplete.');
        batch.forEach((id) => {
          const state = stateOf(id);
          state.loading = false;
          state.loaded = true;
          if (state.version === versions.get(id) && !state.changed) {
            const summary = byId.get(id) as LikeSummary;
            state.confirmedCount = Number(summary.like_count);
            state.confirmedLiked = summary.liked_by_current_user;
            state.loadFailed = false;
            state.unavailable = false;
            state.liked = state.confirmedLiked;
            state.count = state.confirmedCount;
          }
        });
      } catch (error) {
        console.error('Listing likes could not be loaded:', error);
        batch.forEach((id) => { Object.assign(stateOf(id), { loading: false, loadFailed: true, unavailable: true }); });
        notifyRef.current("Couldn't load listing likes. Please refresh and try again.");
      }
      rerender();
    }
  }, [client, stateOf, rerender]);

  const reconcile = useCallback(async (id: string, failure: unknown) => {
    if (!client) return;
    const state = stateOf(id);
    console.error('Listing like update failed:', failure);
    let reconciled = false;
    try {
      const summary = await fetchLikeSummary(client, id);
      state.confirmedCount = summary.count;
      state.confirmedLiked = summary.liked;
      state.loaded = true;
      state.unavailable = false;
      reconciled = true;
    } catch (error) {
      console.error('Listing like state could not be reconciled:', error);
    }
    if (reconciled) {
      state.liked = state.confirmedLiked;
      state.count = state.confirmedCount;
    } else {
      state.unavailable = true;
      state.loadFailed = true;
      state.count = 0;
    }
    state.changed = false;
    state.version += 1;
    rerender();
    notifyRef.current(reconciled ? "Couldn't update that like. The server state was restored." : "Couldn't confirm that like. Please refresh to reload its state.");
  }, [client, stateOf, rerender]);

  const toggle = useCallback(async (id: string) => {
    if (!client) return;
    const state = stateOf(id);
    state.liked = !state.liked;
    state.changed = true;
    state.version += 1;
    state.count = shownCount(state.confirmedCount, state.confirmedLiked, state.liked);
    rerender();
    if (state.saving) return;
    state.saving = true;
    try {
      while (state.liked !== state.confirmedLiked) {
        try {
          const summary = await saveLike(client, id, state.liked);
          state.confirmedCount = summary.count;
          state.confirmedLiked = summary.liked;
          state.loaded = true;
          state.unavailable = false;
          state.count = shownCount(state.confirmedCount, state.confirmedLiked, state.liked);
          rerender();
        } catch (error) {
          await reconcile(id, error);
          break;
        }
      }
      state.changed = false;
    } finally {
      state.saving = false;
    }
  }, [client, stateOf, reconcile, rerender]);

  /** Back from the browser's cache: load these listings' likes again. */
  const reload = useCallback((ids: string[]) => {
    ids.forEach((id) => { Object.assign(stateOf(id), { loaded: false, loading: false, loadFailed: false }); stateOf(id).version += 1; });
    void load(ids);
  }, [stateOf, load]);

  return { stateOf, load, toggle, reload };
}
