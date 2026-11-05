// Signing in again restores a deactivated account (Privacy Policy and Terms,
// "Account Deletion"). AuthProvider calls this once a freshly loaded profile
// shows deactivated_at; the server checks the sign-in is newer than the
// deactivation, so a leftover session cannot restore it.

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type ReactivationResult =
  | { status: 'reactivated'; wasScheduledForDeletion: boolean }
  | { status: 'active' }
  | { status: 'sign-in-required' }
  | { status: 'failed'; message: string };

export const ACCOUNT_RESTORED_MESSAGE = 'Welcome back — your account has been reactivated and everything is restored.';

/** Whether this profile row belongs to a deactivated account. */
export const profileIsDeactivated = (profile: { deactivated_at?: string | null } | null | undefined): boolean =>
  Boolean(profile && profile.deactivated_at);

export async function reactivateAccount(token: string, fetchFn: FetchFn = fetch): Promise<ReactivationResult> {
  let response: Response;
  try {
    response = await fetchFn('/api/account/reactivate', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
  const body = (await response.json().catch(() => ({}))) as { reactivated?: boolean; wasScheduledForDeletion?: boolean; code?: string; error?: string };
  if (response.status === 403 && body.code === 'sign_in_required') return { status: 'sign-in-required' };
  if (!response.ok) return { status: 'failed', message: body.error || `Reactivation failed (${response.status})` };
  return body.reactivated ? { status: 'reactivated', wasScheduledForDeletion: Boolean(body.wasScheduledForDeletion) } : { status: 'active' };
}

/** What the sign-in panel says after Delete or Deactivate (?deleted=1, ?deactivated=1, ?account=deactivated). */
export function deactivationNotice(query: Record<string, string | string[] | undefined>): string | null {
  if (query.deleted === '1') return 'Your account is deactivated and will be permanently deleted in 30 days. Sign in before then to keep it.';
  if (query.deactivated === '1') return 'Your account is deactivated. Sign in at any time to reactivate it.';
  if (query.account === 'deactivated') return 'This account is deactivated. Sign in again to reactivate it.';
  return null;
}
