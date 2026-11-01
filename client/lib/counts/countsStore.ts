import { useEffect, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// One source for the signed-in user's unread notification, chat and booking
// counts. One realtime channel and a refresh when the tab becomes visible
// replace the sidebars' polling and the legacy varoom-sidebar.js queries
// (which use this store through window.VaRoomCounts inside the Next app).

export interface Counts {
  userId: string | null;
  notifications: number;
  chats: number;
  bookings: number;
  updatedAt: number;
}

type Listener = (counts: Counts) => void;

export interface CountsDeps {
  getClient: () => SupabaseClient | null;
  /** Unread conversations from the Express API. */
  fetchChatUnread: () => Promise<number>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  setRepeat?: (fn: () => void, ms: number) => unknown;
  clearRepeat?: (handle: unknown) => void;
}

export interface CountsStore {
  get(): Counts;
  subscribe(listener: Listener): () => void;
  start(userId: string): void;
  stop(): void;
  refresh(): Promise<void>;
  /** Refresh unless the counts are younger than maxAgeMs. */
  refreshIfStale(maxAgeMs?: number): Promise<void>;
  /** A page that computed the exact unread notification count reports it. */
  setNotifications(count: number): void;
}

const BOOKING_TYPES = ['booking_request', 'booking_approved', 'booking_declined', 'booking_cancelled'];
const PAGE_SIZE = 1000;
const DEBOUNCE_MS = 150;
const FALLBACK_POLL_MS = 60 * 1000;
const STALE_MS = 30 * 1000;

const empty = (): Counts => ({ userId: null, notifications: 0, chats: 0, bookings: 0, updatedAt: 0 });
const clean = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
};

export function createCountsStore(deps: CountsDeps): CountsStore {
  const now = deps.now || (() => Date.now());
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const setRepeat = deps.setRepeat || ((fn, ms) => setInterval(fn, ms));
  const clearRepeat = deps.clearRepeat || ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));

  let counts = empty();
  let channel: RealtimeChannel | null = null;
  let channelClient: SupabaseClient | null = null;
  let debounce: unknown = null;
  let fallbackPoll: unknown = null;
  let inflight: Promise<void> | null = null;
  let generation = 0;
  const listeners = new Set<Listener>();

  const publish = (next: Counts) => {
    counts = next;
    listeners.forEach((listener) => listener(counts));
  };

  async function countBookings(client: SupabaseClient, userId: string): Promise<number> {
    const seen = new Set<string>();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await client.from('notifications').select('booking_id,related_entity_id')
        .eq('recipient_user_id', userId).eq('read', false)
        .in('type', BOOKING_TYPES)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data || []) as Array<{ booking_id: string | null; related_entity_id: string | null }>;
      rows.forEach((row, index) => seen.add(row.booking_id || row.related_entity_id || `notification-${offset}-${index}`));
      if (rows.length < PAGE_SIZE) return seen.size;
    }
  }

  async function load(userId: string, run: number): Promise<void> {
    const client = deps.getClient();
    if (!client) return;
    const [notifications, bookings, chats] = await Promise.allSettled([
      client.from('notifications').select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', userId).eq('read', false)
        .then(({ count, error }) => { if (error) throw error; return count || 0; }),
      countBookings(client, userId),
      deps.fetchChatUnread(),
    ]);
    if (run !== generation || counts.userId !== userId) return;
    // A failed piece keeps its previous value instead of dropping to zero.
    publish({
      userId,
      notifications: notifications.status === 'fulfilled' ? clean(notifications.value) : counts.notifications,
      bookings: bookings.status === 'fulfilled' ? clean(bookings.value) : counts.bookings,
      chats: chats.status === 'fulfilled' ? clean(chats.value) : counts.chats,
      updatedAt: now(),
    });
  }

  function stopFallbackPoll() {
    if (fallbackPoll !== null) clearRepeat(fallbackPoll);
    fallbackPoll = null;
  }

  const store: CountsStore = {
    get: () => counts,

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    start(userId) {
      if (!userId || counts.userId === userId) return;
      store.stop();
      generation += 1;
      publish({ ...empty(), userId });

      const client = deps.getClient();
      if (client) {
        const scheduleRefresh = () => {
          if (debounce !== null) clearTimer(debounce);
          debounce = setTimer(() => { debounce = null; void store.refresh(); }, DEBOUNCE_MS);
        };
        channelClient = client;
        channel = client.channel(`counts-${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_user_id=eq.${userId}` }, scheduleRefresh)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleRefresh);
        channel.subscribe((status: string) => {
          // Without realtime, fall back to the previous one-minute refresh.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (fallbackPoll === null && counts.userId === userId) fallbackPoll = setRepeat(() => { void store.refresh(); }, FALLBACK_POLL_MS);
          } else if (status === 'SUBSCRIBED') {
            stopFallbackPoll();
          }
        });
      }
      void store.refresh();
    },

    stop() {
      generation += 1;
      if (debounce !== null) clearTimer(debounce);
      debounce = null;
      stopFallbackPoll();
      if (channel && channelClient) {
        try { void channelClient.removeChannel(channel); } catch { /* already closed */ }
      }
      channel = null;
      channelClient = null;
      inflight = null;
      if (counts.userId !== null || counts.updatedAt) publish(empty());
    },

    refresh() {
      const userId = counts.userId;
      if (!userId) return Promise.resolve();
      if (inflight) return inflight;
      const request = load(userId, generation).catch(() => undefined).finally(() => {
        if (inflight === request) inflight = null;
      });
      inflight = request;
      return request;
    },

    refreshIfStale(maxAgeMs = STALE_MS) {
      if (counts.userId && now() - counts.updatedAt < maxAgeMs) return Promise.resolve();
      return store.refresh();
    },

    setNotifications(count) {
      if (!counts.userId) return;
      publish({ ...counts, notifications: clean(count) });
    },
  };

  return store;
}

let sharedStore: CountsStore | null = null;

export function getCountsStore(deps?: CountsDeps): CountsStore {
  if (!sharedStore) {
    if (!deps) throw new Error('The counts store has not been created yet.');
    sharedStore = createCountsStore(deps);
  }
  return sharedStore;
}

/** Live counts for React components (sidebars). */
export function useCounts(): Counts {
  const [value, setValue] = useState<Counts>(() => (sharedStore ? sharedStore.get() : empty()));
  useEffect(() => {
    if (!sharedStore) return undefined;
    setValue(sharedStore.get());
    return sharedStore.subscribe(setValue);
  }, []);
  return value;
}
