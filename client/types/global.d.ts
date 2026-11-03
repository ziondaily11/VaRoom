import type * as SupabaseJs from '@supabase/supabase-js';
import type { Session, SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import type { LegacyProfileStoreApi } from '../lib/auth/profileStore';
import type { DataCacheApi } from '../lib/cache/dataCache';
import type { AccountSwitcher } from '../lib/account/accountActions';
import type { LegacyCountsApi } from '../lib/counts/CountsBridge';

// Browser globals shared between the React app and the legacy public/js
// scripts. Extend this as more legacy globals gain typed React consumers.
declare global {
  interface Window {
    supabase?: typeof SupabaseJs;
    supabaseClient?: SupabaseClient;
    VAROOM_SUPABASE_URL?: string;
    VAROOM_SUPABASE_ANON_KEY?: string;
    __varoomCacheUserId?: string | null;
    VaRoomAccountAuth?: {
      clientOptions(options: {
        usesRedirect?: boolean;
        isCallback?: boolean;
        flowId?: string;
        storageKey?: string;
      }): SupabaseClientOptions<'public'>;
      createFlowId(): string;
      createClient(
        supabase: typeof SupabaseJs,
        url: string,
        anonKey: string,
        options: { usesRedirect?: boolean; flowId?: string },
      ): SupabaseClient;
      /** Refresh the added account's session (rejects if it is no longer that account). */
      refreshAccountAddSession(client: SupabaseClient, session: Session): Promise<Session>;
      /** Remove the temporary add-account session for this flow. */
      clearTemporarySession(flowId: string): void;
    };
    VaRoomDataCache?: DataCacheApi;
    VaRoomNotificationAPI?: {
      create(payload: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    };
    VaRoomProfileStore?: LegacyProfileStoreApi;
    VaRoomAccountSwitcher?: AccountSwitcher;
    VaRoomCounts?: LegacyCountsApi;
    VaRoomAccount?: {
      logout(): Promise<void>;
      switchAccount(accountId: string): Promise<void>;
    };
    __varoomAddAccountModalMounted?: boolean;
    /** Client Home's Saved view, when that page defines it. */
    showSavedView?: () => void;
    VaRoomChatCache?: {
      clearUser(userId: string): Promise<void>;
      clearMedia(): Promise<void>;
      clearAll(): Promise<void>;
    };
  }
}

export {};
