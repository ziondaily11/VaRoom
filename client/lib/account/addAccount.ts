import type { Session, User, SupabaseClient } from '@supabase/supabase-js';
import type { AccountSwitcher, LinkResult } from './accountActions';

// The add-account dialog's non-visual steps (moved out of
// components/AddAccountModal.tsx, unchanged behaviour): form checks, the
// isolated per-flow sign-in, linking to the authenticated account group,
// reading the /auth-callback popup's message, and what happens once added.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The first problem with the email/password form, or null (`email` is trimmed). */
export function addAccountFormError(email: string, password: string): string | null {
  if (!email) return 'Please enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'Please enter a valid email address.';
  if (!password) return 'Please enter your password.';
  return null;
}

/** Supabase's password sign-in error, in the dialog's wording. */
export function passwordSignInMessage(message: string | undefined): string {
  const msg = message || 'Authentication failed.';
  if (msg.toLowerCase().includes('invalid login credentials')) return 'Incorrect email or password.';
  if (msg.toLowerCase().includes('email not confirmed')) return 'Please confirm your email before adding this account.';
  return msg;
}

export const addAccountCallbackUrl = (origin: string, flowId: string) =>
  `${origin}/auth-callback?addAccount=true&account_auth_flow=${encodeURIComponent(flowId)}`;

export interface IsolatedAuthEnv {
  supabase: Window['supabase'];
  accountAuth: Window['VaRoomAccountAuth'];
  url: string;
  anonKey: string;
}

/**
 * Signs the other account in on a temporary client with its own flow-specific
 * storage key, so the active account's session and its cross-tab auth lock are
 * never touched.
 */
export async function signInIsolatedWithPassword(env: IsolatedAuthEnv, email: string, password: string): Promise<{ session: Session; user: User }> {
  if (!env.supabase) {
    throw new Error('Authentication service is initializing. Please try again.');
  }
  const accountAuth = env.accountAuth;
  if (!accountAuth) throw new Error('Authentication service is initializing. Please try again.');
  const accountAuthFlow = accountAuth.createFlowId();
  const tempClient = accountAuth.createClient(
    env.supabase,
    env.url,
    env.anonKey,
    { usesRedirect: false, flowId: accountAuthFlow }
  );

  const { data, error: authError } = await tempClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) throw new Error(passwordSignInMessage(authError.message));

  if (!data?.session || !data?.user) {
    throw new Error('Failed to retrieve authentication tokens.');
  }
  return { session: data.session, user: data.user };
}

/** Adds the signed-in session to the active account's group through the authenticated API; fails closed. */
export async function linkAddedSession(switcher: AccountSwitcher | undefined, primary: SupabaseClient | undefined, session: Session): Promise<LinkResult> {
  if (!switcher?.linkAdditionalSession || !primary) {
    throw new Error('Secure account linking is not available. Refresh the page and try again.');
  }
  return switcher.linkAdditionalSession(primary, session);
}

export interface AddAccountMessage {
  type?: string;
  session?: Session;
  message?: string;
}

export type PopupOutcome = { kind: 'success'; session: Session } | { kind: 'error'; message: string } | null;

/** A message from the /auth-callback popup (same origin only). */
export function readAddAccountMessage(origin: string, ownOrigin: string, data: AddAccountMessage | null | undefined): PopupOutcome {
  if (origin !== ownOrigin) return null;
  if (data?.type === 'VAROOM_ADD_ACCOUNT_SUCCESS' && data?.session) return { kind: 'success', session: data.session };
  if (data?.type === 'VAROOM_ADD_ACCOUNT_ERROR') {
    return { kind: 'error', message: data.message || 'Could not add that Google account. Please try again.' };
  }
  return null;
}

/** An added account becomes the active one when its sign-in was saved in this browser. */
export const switchesToAdded = (linked: LinkResult, addedUserId: string | undefined): addedUserId is string =>
  Boolean(linked.session_cached && addedUserId);

/** The confirmation when the dialog does not switch. */
export const addedAccountMessage = (linked: LinkResult) => (linked.session_cached
  ? 'Account added! You can now switch to this account anytime.'
  : 'Account linked. Sign in again on this browser before switching to it.');

export const switchFailedMessage = (error: unknown) =>
  `Account added, but switching failed: ${(error as Error)?.message || 'please try again from the account menu.'}`;
