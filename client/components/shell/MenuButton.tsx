import React from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useCounts } from '../../lib/counts/countsStore';
import { hasUnread, phoneMenuState } from '../../lib/shell/phoneMenu';
import { useSidebarDrawer } from './SidebarDrawer';

// The phone hamburger: opens the account's sidebar drawer, with a dot while
// notifications or chats are unread. Pages place it at the left of their own
// header. The default look (styles/phoneMenu.css) shows on phones only; pages
// that already had a menu button pass their own class and icon.

export const MenuIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);

export default function MenuButton({ className = 'va-menu-btn', children }: { className?: string; children?: React.ReactNode }) {
  const { status, user, profile, profileError } = useAuth();
  const { open, setOpen } = useSidebarDrawer();
  const counts = useCounts();
  const state = phoneMenuState(status, profile, Boolean(profileError));
  if (state === 'hidden') return null;
  const dot = state === 'shown' && hasUnread(counts, user?.id);
  return (
    <button
      type="button"
      className={`va-menu-trigger ${className}`}
      data-menu-state={state}
      aria-label={dot ? 'Open menu (unread)' : 'Open menu'}
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      {children || <MenuIcon />}
      {dot && <span className="va-menu-dot" aria-hidden="true" />}
    </button>
  );
}
