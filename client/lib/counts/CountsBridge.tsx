import { useEffect } from 'react';
import { apiFetch } from '../api';
import { getSupabaseClient } from '../supabase/client';
import { useAuth } from '../auth/AuthProvider';
import { getCountsStore, type Counts, type CountsStore } from './countsStore';

export interface LegacyCountsApi {
  get(): Counts;
  subscribe(listener: (counts: Counts) => void): () => void;
  refresh(): Promise<void>;
  refreshIfStale(maxAgeMs?: number): Promise<void>;
}

function countsStore(): CountsStore {
  return getCountsStore({
    getClient: getSupabaseClient,
    fetchChatUnread: async () => {
      const payload = await apiFetch<{ count?: number }>('/api/chat/unread-count');
      return Number(payload.count) || 0;
    },
  });
}

/** Create the store once and share it with legacy scripts. Called from _app. */
export function installCounts(): void {
  if (typeof window === 'undefined' || window.VaRoomCounts) return;
  const store = countsStore();
  window.VaRoomCounts = {
    get: store.get,
    subscribe: store.subscribe,
    refresh: store.refresh,
    refreshIfStale: store.refreshIfStale,
  };
  // Pages that compute the exact unread count (Notifications) report it.
  window.addEventListener('varoom_notification_count', (event) => {
    const count = (event as CustomEvent<{ count?: number }>).detail?.count;
    if (typeof count === 'number') store.setNotifications(count);
  });
  // Catch up after the tab was in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void store.refreshIfStale();
  });
}

/** Starts and stops the counts with the signed-in account. */
export function CountsBridge(): null {
  const { status, user } = useAuth();
  const userId = user?.id || null;
  useEffect(() => {
    const store = countsStore();
    if (status === 'signed-in' && userId) store.start(userId);
    else if (status === 'signed-out') store.stop();
  }, [status, userId]);
  return null;
}
