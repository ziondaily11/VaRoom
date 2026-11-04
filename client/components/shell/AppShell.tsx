import React, { useEffect } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import HostSidebar from './HostSidebar';
import ClientSidebar from './ClientSidebar';
import AddAccountNotice from './AddAccountNotice';
import { isShellSettled, shellFrame, shellState, type ShellVariant } from '../../lib/shell/appShell';
import { CLIENT_SHELL_STYLES, HOST_SHELL_STYLES, PENDING_SHELL_STYLES } from './shellStyles';

export type { ShellVariant };

/**
 * True once the account's role is known (or known to be absent): signed out,
 * or signed in with a profile row (or a failed profile load).
 */
export function useShellSettled(): boolean {
  const { status, profile, profileError } = useAuth();
  return isShellSettled(status, profile, profileError);
}

/**
 * Keep the account switcher's stored account and the active-account marker
 * in step with the signed-in session, once per account.
 */
function useActiveAccountSync(enabled: boolean) {
  const { session, user } = useAuth();
  const userId = enabled ? user?.id : undefined;
  useEffect(() => {
    if (!userId || !session) return;
    try { window.localStorage.setItem('varoom_active_account_id', userId); } catch { /* Storage unavailable. */ }
    const client = getSupabaseClient();
    const switcher = window.VaRoomAccountSwitcher;
    if (client && switcher?.upsertFromSession) {
      switcher.upsertFromSession(client, session).catch((error: unknown) => {
        console.warn('Unable to save the active account:', error);
      });
    }
    // Once per account: token refreshes are saved by the switcher itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}

/**
 * The persistent application shell for host and client routes. Its element
 * structure is identical for every variant, so the page inside is never
 * remounted when the role resolves (pending → host/client) after a hard load:
 * while pending, the wrappers use `display: contents` and add no layout.
 * `data-shell-state` tells legacy page scripts when the shell is final.
 */
export default function AppShell({ variant, className = '', rail = false, children }: {
  variant: ShellVariant;
  className?: string;
  /** Host only: collapse the sidebar to an icon-only rail (desktop). */
  rail?: boolean;
  children: React.ReactNode;
}) {
  const settled = useShellSettled();
  useActiveAccountSync(Boolean(variant));
  const isRail = rail && variant === 'host';
  const styles = variant === 'host' ? HOST_SHELL_STYLES : variant === 'client' ? CLIENT_SHELL_STYLES : PENDING_SHELL_STYLES;
  const { key, shellClass, content } = shellFrame(variant, `${className}${isRail ? ' host-rail-layout' : ''}`);

  return (
    <div className={shellClass} data-app-shell={key} data-shell-state={shellState(variant, settled)}>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      {variant === 'host' ? <HostSidebar rail={isRail} /> : variant === 'client' ? <ClientSidebar /> : null}
      <main className={content.className} id={content.id}>
        {children}
      </main>
      <AddAccountNotice />
    </div>
  );
}
