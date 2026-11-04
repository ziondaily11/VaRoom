// The persistent shell's frame for each variant (moved out of
// components/shell/AppShell.tsx, unchanged behaviour). Every variant uses the
// same element structure (wrapper > sidebar slot > main > notice), so only
// classes and ids change when the role resolves and the page is not remounted.

export type ShellVariant = 'host' | 'client' | null;
export type ShellKey = 'host' | 'client' | 'pending';

const SHELL_CLASS: Record<'host' | 'client', string> = {
  host: 'host-app-layout host-layout-active',
  client: 'client-app-layout client-layout-active',
};

const CONTENT_PROPS: Record<ShellKey, { className: string; id?: string }> = {
  host: { className: 'host-page-content', id: 'host-page-content' },
  client: { className: 'client-page-content', id: 'client-main-content' },
  pending: { className: 'app-shell-pending-content' },
};

export interface ShellFrame {
  key: ShellKey;
  shellClass: string;
  content: { className: string; id?: string };
}

export function shellFrame(variant: ShellVariant, className = ''): ShellFrame {
  const key: ShellKey = variant || 'pending';
  return {
    key,
    shellClass: variant ? `${SHELL_CLASS[variant]} ${className}`.trim() : 'app-shell-pending',
    content: CONTENT_PROPS[key],
  };
}

/** `data-shell-state`: legacy page scripts wait for 'ready' before reading the shell. */
export const shellState = (variant: ShellVariant, settled: boolean): 'ready' | 'pending' => (variant || settled ? 'ready' : 'pending');

/**
 * True once the account's role is known (or known to be absent): signed out,
 * or signed in with a profile row (or a failed profile load).
 */
export function isShellSettled(status: string, profile: unknown, profileError: unknown): boolean {
  if (status === 'loading') return false;
  if (status === 'signed-out') return true;
  return Boolean(profile || profileError);
}
