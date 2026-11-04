import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSafeRedirect } from '../safeRedirect';

// What /auth-callback does after Google sign-in, an email link, password
// recovery or adding a Google account (migrated from
// legacy-pages/auth-callback.html). Browser parts come in through `env` so
// every path can be tested.
//
// Security: the destination stays on this origin (getSafeRedirect); adding an
// account runs on an isolated temporary client, so the signed-in account is
// never replaced, and only that temporary session is cleared on failure;
// popup results carry the request id and go only to this origin.

export const GOOGLE_AUTH_CHANNEL = 'varoom-google-auth';
export const ADD_ACCOUNT_REDIRECT_KEY = 'varoom_add_account_redirect';
export const ADD_ACCOUNT_NOTICE_KEY = 'varoom_add_account_notice';
/** Set after a full-page account add: the returned page switches to that account. */
export const ADD_ACCOUNT_SWITCH_KEY = 'varoom_add_account_switch';
export const INTENDED_ROLE_KEY = 'varoom_intended_role';
export const ADD_ACCOUNT_FAILED_MESSAGE = 'We couldn’t add that Google account. Please try again.';

export interface PopupOpener {
  closed?: boolean;
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface AuthCallbackEnv {
  search: string;
  hash: string;
  origin: string;
  /** The page's client: the primary one, or the isolated temporary one while adding an account. */
  client: SupabaseClient;
  /** A client on the primary session, for linking an added account. */
  createPrimaryClient: () => SupabaseClient;
  accountAuth: {
    refreshAccountAddSession(client: SupabaseClient, session: Session): Promise<Session>;
    clearTemporarySession(flowId: string): void;
  } | null;
  accountSwitcher: { linkAdditionalSession(client: SupabaseClient, session: Session): Promise<{ session_cached?: boolean } | unknown> } | null;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  opener: PopupOpener | null;
  /** Post on the Google sign-in BroadcastChannel; false when unavailable. */
  broadcast: (message: Record<string, unknown>) => boolean;
  replace: (url: string) => void;
  close: () => void;
  now?: () => number;
}

type Role = 'host' | 'client';

export function roleDestination(role: string, onboardingCompleted: boolean, redirect: string): string {
  if (!onboardingCompleted) return `/onboarding${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`;
  if (redirect) return redirect;
  return role === 'host' ? '/host-home' : '/client-home';
}

function read(storage: AuthCallbackEnv['storage'], key: string): string | null {
  try { return storage ? storage.getItem(key) : null; } catch { return null; }
}
function remove(storage: AuthCallbackEnv['storage'], key: string): void {
  try { storage?.removeItem(key); } catch { /* Storage unavailable. */ }
}

export async function runAuthCallback(env: AuthCallbackEnv): Promise<void> {
  const query = new URLSearchParams(env.search || '');
  const hashParams = new URLSearchParams((env.hash || '').replace(/^#/, ''));
  const redirect = getSafeRedirect(query.get('redirect') || '', env.origin);
  const isAddAccount = query.get('addAccount') === 'true';
  const flowId = query.get('account_auth_flow') || '';
  const isPopup = query.get('auth_popup') === '1';
  const popupId = query.get('auth_popup_id') || '';

  const notifyPopup = (message: Record<string, unknown>): boolean => {
    if (!isPopup || !popupId) return false;
    const result = { requestId: popupId, ...message };
    let notified = env.broadcast(result);
    if (env.opener) {
      try {
        env.opener.postMessage(result, env.origin);
        notified = true;
      } catch {
        console.error('Could not return the sign-in result with postMessage.');
      }
    }
    return notified;
  };
  const finish = (destination: string) => {
    if (notifyPopup({ type: 'varoom:google-auth-complete', destination })) env.close();
    else env.replace(destination);
  };
  const fail = (message: string) => {
    if (notifyPopup({ type: 'varoom:google-auth-error', message })) env.close();
    // `redirect` is already checked against this origin.
    else env.replace(`/?auth=login${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ''}`);
  };

  const { data, error: sessionError } = await env.client.auth.getSession();
  const session = data && data.session;

  if (isAddAccount) {
    const clearTemporary = () => {
      try { if (flowId) env.accountAuth?.clearTemporarySession(flowId); } catch { /* Already cleared. */ }
    };
    const returnTo = getSafeRedirect(read(env.storage, ADD_ACCOUNT_REDIRECT_KEY) || '', env.origin) || redirect || '/profile';
    const addFailed = async () => {
      if (session) {
        try { await env.client.auth.signOut({ scope: 'local' }); } catch { /* The temporary session is cleared below. */ }
      }
      clearTemporary();
      remove(env.storage, ADD_ACCOUNT_REDIRECT_KEY);
      // In the popup, tell the add-account dialog that opened it.
      if (env.opener && !env.opener.closed) {
        try {
          env.opener.postMessage({ type: 'VAROOM_ADD_ACCOUNT_ERROR', message: ADD_ACCOUNT_FAILED_MESSAGE }, env.origin);
          env.close();
          return;
        } catch {
          // Fall through to returning this window to where it started.
        }
      }
      try {
        env.storage?.setItem(ADD_ACCOUNT_NOTICE_KEY, JSON.stringify({ message: ADD_ACCOUNT_FAILED_MESSAGE, at: (env.now || Date.now)() }));
      } catch { /* The page still returns without the notice. */ }
      env.replace(returnTo);
    };

    if (!session || !session.user || !env.accountAuth) {
      await addFailed();
      return;
    }
    try {
      const additional = await env.accountAuth.refreshAccountAddSession(env.client, session);
      if (env.opener && !env.opener.closed) {
        try {
          env.opener.postMessage({
            type: 'VAROOM_ADD_ACCOUNT_SUCCESS',
            session: {
              access_token: additional.access_token,
              refresh_token: additional.refresh_token,
              expires_at: additional.expires_at,
              user: additional.user,
            },
          }, env.origin);
          clearTemporary();
          env.close();
          return;
        } catch (error) {
          console.warn('Could not postMessage to opener:', error);
        }
      }
      if (!env.accountSwitcher || !flowId) throw new Error('The temporary account sign-in has expired. Please try again.');
      // Keep the added account's session: the linked-account cache needs its
      // refresh token for a later switch. Only the temporary storage goes.
      const linked = await env.accountSwitcher.linkAdditionalSession(env.createPrimaryClient(), additional) as { session_cached?: boolean } | null;
      clearTemporary();
      remove(env.storage, ADD_ACCOUNT_REDIRECT_KEY);
      // The added account becomes the active one once its sign-in is saved.
      if (linked && linked.session_cached && additional.user && additional.user.id) {
        try {
          env.storage?.setItem(ADD_ACCOUNT_SWITCH_KEY, JSON.stringify({ id: additional.user.id, at: (env.now || Date.now)() }));
        } catch { /* The account stays linked; the user can switch from the menu. */ }
      }
      env.replace(returnTo);
    } catch {
      await addFailed();
    }
    return;
  }

  if (!session) {
    if (sessionError) console.error('Sign-in callback failed to load the session.');
    fail('Google sign-in did not finish. Please try again.');
    return;
  }

  const authType = hashParams.get('type') || query.get('type') || '';
  if (authType === 'recovery') {
    finish('/?auth=recovery&step=password');
    return;
  }

  const user = session.user;
  const { data: profile, error: profileError } = await env.client
    .from('profiles')
    .select('role, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Sign-in callback could not load the profile.');
    fail('VaRoom could not load your account. Please try again.');
    return;
  }
  const existing = profile as { role?: string | null; onboarding_completed?: boolean | null } | null;
  if (existing && existing.role) {
    finish(roleDestination(existing.role, Boolean(existing.onboarding_completed), redirect));
    return;
  }

  // First Google sign-in: create the profile with the role chosen at sign-up.
  const metadata = (user.user_metadata || {}) as { role?: string; full_name?: string; name?: string };
  const intendedRole = read(env.storage, INTENDED_ROLE_KEY) || metadata.role;
  if (intendedRole !== 'host' && intendedRole !== 'client') {
    finish('/?auth=signup');
    return;
  }
  const fullName = metadata.full_name || metadata.name || user.email;
  const { error: upsertError } = await env.client
    .from('profiles')
    .upsert({ id: user.id, role: intendedRole as Role, full_name: fullName }, { onConflict: 'id' });
  if (upsertError) {
    console.error('Sign-in callback could not finish setting up the profile.');
    fail('VaRoom could not finish setting up your account. Please try again.');
    return;
  }
  remove(env.storage, INTENDED_ROLE_KEY);
  finish(roleDestination(intendedRole, false, redirect));
}

/** The account to switch to after a full-page account add (within five minutes), once. */
export function takePendingAccountSwitch(storage: AuthCallbackEnv['storage'], now: number = Date.now()): string | null {
  const raw = read(storage, ADD_ACCOUNT_SWITCH_KEY);
  if (!raw) return null;
  remove(storage, ADD_ACCOUNT_SWITCH_KEY);
  try {
    const pending = JSON.parse(raw) as { id?: string; at?: number };
    if (!pending.id || !Number.isFinite(pending.at) || now - (pending.at as number) > 5 * 60 * 1000) return null;
    return pending.id;
  } catch {
    return null;
  }
}

/** A one-time notice left by a failed account add (shown within five minutes). */
export function takeAddAccountNotice(storage: AuthCallbackEnv['storage'], now: number = Date.now()): string | null {
  const raw = read(storage, ADD_ACCOUNT_NOTICE_KEY);
  if (!raw) return null;
  remove(storage, ADD_ACCOUNT_NOTICE_KEY);
  try {
    const notice = JSON.parse(raw) as { message?: string; at?: number };
    if (!notice.message || !Number.isFinite(notice.at) || now - (notice.at as number) > 5 * 60 * 1000) return null;
    return notice.message;
  } catch {
    return null;
  }
}

/**
 * On the page a full-page account add returned to: switch to the added
 * account when its sign-in was saved (switching reloads the page), else show
 * the one-time failure notice, if any. Used by components/shell/AddAccountNotice.
 */
export function resumeAddAccount(
  storage: AuthCallbackEnv['storage'],
  switchTo: (accountId: string) => Promise<void>,
  show: (message: string) => void,
): void {
  const pendingSwitch = takePendingAccountSwitch(storage);
  if (pendingSwitch) {
    switchTo(pendingSwitch).catch((error: unknown) => {
      show(`Account added, but switching failed: ${(error as Error)?.message || 'please try again from the account menu.'}`);
    });
    return;
  }
  const notice = takeAddAccountNotice(storage);
  if (notice) show(notice);
}
