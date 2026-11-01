import type * as SupabaseJs from '@supabase/supabase-js';
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import type { LegacyProfileStoreApi } from '../lib/auth/profileStore';

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
    };
    VaRoomDataCache?: {
      invalidate(prefix: string): void;
    };
    VaRoomNotificationAPI?: {
      create(payload: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    };
    VaRoomProfileStore?: LegacyProfileStoreApi;
    VaRoomChatCache?: {
      clearUser(userId: string): Promise<void>;
      clearMedia(): Promise<void>;
      clearAll(): Promise<void>;
    };
  }
}

export {};
