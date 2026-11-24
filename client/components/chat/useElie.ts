import { useEffect, useSyncExternalStore } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { EMPTY_ELIE_STATE, createElieStore, type ElieStore } from '../../lib/chat/elieStore';

// The Elie conversation for the Chats page. It lives in one store for the
// whole app (lib/chat/elieStore.ts), so leaving Elie, the chat or the page
// never stops or loses it.

let shared: ElieStore | null = null;
function elieStore(): ElieStore {
  if (!shared) {
    shared = createElieStore({
      getClient: getSupabaseClient,
      getStorage: () => (typeof window === 'undefined' ? null : window.localStorage),
      getToken: async () => {
        const client = getSupabaseClient();
        return client ? (await client.auth.getSession()).data.session?.access_token ?? null : null;
      },
    });
  }
  return shared;
}

export function useElie(userId: string | null) {
  const store = elieStore();
  useEffect(() => { store.setUser(userId); }, [store, userId]);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getServerState);
  // Until the store has switched, another account's thread is never shown.
  const current = state.userId === userId ? state : EMPTY_ELIE_STATE;
  return {
    entries: current.entries,
    thinking: current.thinking,
    waking: current.waking,
    wallet: current.wallet,
    topupSignal: current.topupSignal,
    send: store.send,
    retry: store.retry,
    newSearch: store.newSearch,
    listSessions: store.listSessions,
    loadSession: store.loadSession,
    loadWallet: store.loadWallet,
    setWallet: store.setWallet,
  };
}
