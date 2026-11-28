import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { activeLinkedAccount, logout, switchAccount } from '../../lib/account/accountActions';
import { resolveShellIdentity, storedIdentity, type ShellIdentity } from '../../lib/shell/shellIdentity';
import { useSidebarDrawer } from './SidebarDrawer';

// Behaviour shared by the host and client sidebars: the More and account
// popovers, closing on outside click or Escape, the mobile drawer (its state
// is SidebarDrawer's, opened by MenuButton), the displayed identity and the
// account actions.

function positionPopover(button: HTMLElement | null, menu: HTMLElement | null) {
  if (!button || !menu) return;
  const rect = button.getBoundingClientRect();
  const GAP = 8;
  menu.style.position = 'fixed';
  menu.style.zIndex = '99999';
  menu.style.left = `${rect.left}px`;
  menu.style.width = `${rect.right - rect.left}px`;
  menu.style.right = 'auto';
  menu.style.bottom = `${window.innerHeight - rect.top + GAP}px`;
  menu.style.top = 'auto';
  menu.style.maxHeight = `${Math.max(200, rect.top - GAP * 2)}px`;
  menu.style.overflowY = 'auto';
}

export function useShellChrome() {
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { open: mobileOpen, setOpen: setMobileOpen } = useSidebarDrawer();
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const identityBtnRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moreOpen) positionPopover(moreBtnRef.current, moreMenuRef.current);
  }, [moreOpen]);

  useEffect(() => {
    if (accountOpen) positionPopover(identityBtnRef.current, accountMenuRef.current);
  }, [accountOpen]);

  useEffect(() => {
    if (!moreOpen && !accountOpen) return undefined;
    const reposition = () => {
      if (moreOpen) positionPopover(moreBtnRef.current, moreMenuRef.current);
      if (accountOpen) positionPopover(identityBtnRef.current, accountMenuRef.current);
    };
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [moreOpen, accountOpen]);

  // Close menus on outside pointer-down or Escape.
  useEffect(() => {
    const inside = (event: Event, ...nodes: Array<HTMLElement | null>) => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      return nodes.some((node) => Boolean(node && (path.includes(node) || node.contains(event.target as Node))));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event, moreBtnRef.current, moreMenuRef.current)) setMoreOpen(false);
      if (!inside(event, identityBtnRef.current, accountMenuRef.current)) setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      setAccountOpen(false);
      setMobileOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [setMobileOpen]);

  const closeMobile = useCallback(() => setMobileOpen(false), [setMobileOpen]);

  return {
    moreOpen, setMoreOpen,
    accountOpen, setAccountOpen,
    mobileOpen, setMobileOpen, closeMobile,
    moreBtnRef, moreMenuRef, identityBtnRef, accountMenuRef,
  };
}

export type { ShellIdentity };

/**
 * The identity shown in a sidebar. Server render and first client render use
 * `initial` (no browser storage, so hydration matches); after mount the
 * account switcher's active account fills in until the verified profile from
 * AuthProvider is available.
 */
export function useShellIdentity(initial: ShellIdentity, fallback: ShellIdentity): { user: ShellIdentity; hasMounted: boolean } {
  const { user: authUser, profile } = useAuth();
  const [hasMounted, setHasMounted] = useState(false);
  const [stored, setStored] = useState<ShellIdentity | null>(null);

  useEffect(() => {
    setHasMounted(true);
    const active = activeLinkedAccount();
    if (active) setStored(storedIdentity(active, fallback));
    // Initial values are constants per sidebar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { hasMounted, user: resolveShellIdentity({ authUser, profile, hasMounted, stored, initial, fallback }) };
}

export function openAddAccountModal(): void {
  if (typeof window === 'undefined') return;
  if (window.VaRoomAccountSwitcher && typeof window.VaRoomAccountSwitcher.openAddAccountModal === 'function') {
    window.VaRoomAccountSwitcher.openAddAccountModal();
  } else {
    window.dispatchEvent(new CustomEvent('varoom:open-add-account'));
  }
}

export async function switchToAccount(accountId: string): Promise<void> {
  try {
    await switchAccount(accountId);
  } catch (error) {
    console.error('Account switch failed:', error);
    window.alert((error instanceof Error && error.message) || 'Unable to switch account.');
  }
}

export { logout };
