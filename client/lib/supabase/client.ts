import * as supabaseJs from '@supabase/supabase-js';
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { installR2PhotoStorage } from './r2PhotoStorage';

// The one browser Supabase client. React code calls getSupabaseClient();
// legacy pages and public/js scripts keep reading window.supabaseClient,
// which is this same instance. _app initializes it before any page renders,
// so legacy scripts that load public/js/supabase-client.js adopt it instead
// of creating a second GoTrueClient on the same storage key.

export type VaRoomSupabaseClient = SupabaseClient;

type ClientOptions = SupabaseClientOptions<'public'>;

interface LegacyAwareClient extends SupabaseClient {
  __varoomDataCacheHookInstalled?: boolean;
}

// The add-account OAuth callback must run on an isolated temporary client so
// the primary session is never replaced. Mirrors public/js/supabase-client.js.
function resolveClientOptions(): ClientOptions | undefined {
  const params = new URLSearchParams(window.location.search || '');
  const isAddAccountCallback = params.get('add_account_callback') === '1' || params.get('addAccount') === 'true';
  if (!isAddAccountCallback) return undefined;

  const flowId = params.get('account_auth_flow');
  if (window.VaRoomAccountAuth && flowId) {
    return window.VaRoomAccountAuth.clientOptions({ usesRedirect: true, isCallback: true, flowId });
  }
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'varoom-invalid-add-account-callback',
    },
  };
}

// Legacy pages cache account data in VaRoomDataCache under "account:<id>:".
// Drop it when the signed-in user changes or signs out.
function installDataCacheInvalidation(client: SupabaseClient): void {
  const hookable = client as LegacyAwareClient;
  if (hookable.__varoomDataCacheHookInstalled) return;
  hookable.__varoomDataCacheHookInstalled = true;

  client.auth.onAuthStateChange((event, session) => {
    const nextUserId = session?.user?.id || null;
    const dataCache = window.VaRoomDataCache;
    if (dataCache && window.__varoomCacheUserId && window.__varoomCacheUserId !== nextUserId) {
      dataCache.invalidate('account:' + window.__varoomCacheUserId + ':');
    }
    window.__varoomCacheUserId = nextUserId;
    if (dataCache && event === 'SIGNED_OUT') dataCache.invalidate('account:');
  });
}

function installNotificationApi(client: SupabaseClient): void {
  if (window.VaRoomNotificationAPI) return;
  window.VaRoomNotificationAPI = {
    async create(payload) {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Authentication is required to create notifications.');
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload || {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to create notification.');
      return result.notification || null;
    },
  };
}

export function getSupabaseClient(): VaRoomSupabaseClient | null {
  if (typeof window === 'undefined') return null;

  // Legacy scripts read these globals instead of importing the SDK.
  if (!window.VAROOM_SUPABASE_URL) window.VAROOM_SUPABASE_URL = SUPABASE_URL;
  if (!window.VAROOM_SUPABASE_ANON_KEY) window.VAROOM_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  if (!window.supabase) window.supabase = supabaseJs;

  let client = window.supabaseClient;
  const created = !client?.auth;
  if (created) {
    client = supabaseJs.createClient(window.VAROOM_SUPABASE_URL, window.VAROOM_SUPABASE_ANON_KEY, resolveClientOptions());
    window.supabaseClient = client;
  }

  installR2PhotoStorage(client);
  installDataCacheInvalidation(client);
  installNotificationApi(client);

  if (created) window.dispatchEvent(new Event('varoom_supabase_ready'));
  return client;
}
