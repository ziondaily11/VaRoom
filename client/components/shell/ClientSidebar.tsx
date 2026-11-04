import React from 'react';
import { useRouter } from 'next/router';
import { isModifiedClick } from '../../lib/navigation/clicks';
import { CLIENT_MORE_ITEMS, clientActiveNav } from '../../lib/navigation/activeNav';
import { useCounts } from '../../lib/counts/countsStore';
import { useLinkedAccounts, type LinkedAccount } from '../../lib/account/accountActions';
import { logout, openAddAccountModal, switchToAccount, useShellChrome, useShellIdentity } from './useShellChrome';
import { clientInitialIdentity } from '../../lib/shell/shellIdentity';
import { resolveAvatarUrl } from '../resolveStoredPhotoUrl';

// The client sidebar (formerly components/SharedClientSidebar.jsx). Markup,
// ids and classes are unchanged; identity, counts, linked accounts, menus and
// the mobile drawer come from shared hooks and stores.

function getInitial(name?: string | null): string {
  const str = String(name || '').trim();
  return str ? str.charAt(0).toUpperCase() : '?';
}

function resolveAvatar(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  try {
    if (typeof window !== 'undefined' && window.supabaseClient) {
      return window.supabaseClient.storage.from('avatars').getPublicUrl(url).data.publicUrl;
    }
  } catch {
    // Fall through to the raw value.
  }
  return url;
}

const DRAWER_EVENTS = {
  toggleSelector: '#topbar-avatar-btn, #menu-toggle, .menu-toggle',
  openEvents: ['open-client-sidebar'],
  closeEvents: ['close-client-sidebar', 'varoom-close-sidebar'],
  toggleEvents: ['varoom-toggle-sidebar'],
};

export default function ClientSidebar({ activeNav: explicitActiveNav }: { activeNav?: string } = {}) {
  const router = useRouter();
  const { user, hasMounted } = useShellIdentity(clientInitialIdentity(), clientInitialIdentity());
  // Shared counts store (one realtime channel for the app); no sidebar polling.
  const unreadCount = useCounts().notifications;
  const linkedAccounts = useLinkedAccounts();
  const {
    moreOpen, setMoreOpen,
    accountOpen, setAccountOpen,
    mobileOpen, setMobileOpen,
    moreBtnRef, moreMenuRef, identityBtnRef, accountMenuRef,
  } = useShellChrome(DRAWER_EVENTS);

  // Compute active navigation item from router if not explicitly passed
  const activeNav: string = explicitActiveNav || clientActiveNav(router.pathname || '', router.asPath || '');

  const isMoreActive = CLIENT_MORE_ITEMS.includes(activeNav);

  // Navigation click handler
  const handleNav = (e: React.MouseEvent | React.KeyboardEvent, path: string, navKey?: string) => {
    // Ctrl/Cmd/Shift/middle-clicks keep the browser's default (new tab/window).
    if (isModifiedClick(e)) return;
    if (navKey === 'saved' && (router.pathname === '/client-home' || router.asPath.startsWith('/client-home'))) {
      e.preventDefault();
      setMobileOpen(false);
      if (typeof window !== 'undefined' && typeof window.showSavedView === 'function') {
        window.showSavedView();
      } else {
        router.push('/client-home?view=saved');
      }
      return;
    }
    if (path) {
      e.preventDefault();
      setMobileOpen(false);
      setMoreOpen(false);
      setAccountOpen(false);
      router.push(path);
    }
  };

  // Account switching handler
  const handleSwitchAccount = (targetAccount: LinkedAccount) => {
    if (!targetAccount || targetAccount.id === user?.id) return;
    void switchToAccount(targetAccount.id);
  };

  // Add existing account handler
  const handleAddAccount = () => {
    setAccountOpen(false);
    openAddAccountModal();
  };

  // Shared logout: clears this account's private data, signs out, informs
  // other tabs and goes to the login panel.
  const handleSignOut = async () => {
    setAccountOpen(false);
    await logout();
  };

  const displayName = hasMounted ? (user?.full_name || 'VaRoom Member') : 'VaRoom Member';
  const displayHandle = hasMounted
    ? (user?.username ? `@${user.username.replace(/^@/, '')}` : (user?.email || ''))
    : '';
  const avatarSrc = hasMounted ? (resolveAvatarUrl(user?.avatar_url) || resolveAvatar(user?.avatar_url)) : null;
  const initial = getInitial(displayName);

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'show' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="client-sidebar"
        className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Client navigation"
      >
        {/* Logo */}
        <a
          href="/client-home"
          className="logo"
          onClick={(e) => handleNav(e, '/client-home')}
        >
          <span className="va">Va</span>
          <span className="room">Room</span>
        </a>

        {/* Primary Navigation */}
        <nav className="nav-group">
          <a
            href="/client-home"
            className={`nav-item ${activeNav === 'home' ? 'active' : ''}`}
            data-nav="home"
            onClick={(e) => handleNav(e, '/client-home')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5.5 10v9a1 1 0 0 0 1 1H9v-4a1 1 0 0 1 1-1h2a1 1 0 0 0 1 1v4h2.5a1 1 0 0 0 1-1v-9" />
            </svg>
            Home
          </a>
          <a
            href="/marketplace"
            className={`nav-item ${activeNav === 'marketplace' ? 'active' : ''}`}
            data-nav="marketplace"
            onClick={(e) => handleNav(e, '/marketplace')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="m15 9-2 6-6 2 2-6 6-2Z" />
            </svg>
            Marketplace
          </a>
          <div
            className={`nav-item ${activeNav === 'saved' ? 'active' : ''}`}
            data-nav="saved"
            role="button"
            tabIndex={0}
            onClick={(e) => handleNav(e, '/client-home?view=saved', 'saved')}
            onKeyDown={(e) => e.key === 'Enter' && handleNav(e, '/client-home?view=saved', 'saved')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" />
            </svg>
            Saved
          </div>
        </nav>

        {/* My Activity */}
        <nav className="nav-group">
          <p className="nav-label">My activity</p>
          <a
            href="/bookings"
            className={`nav-item ${activeNav === 'bookings' ? 'active' : ''}`}
            onClick={(e) => handleNav(e, '/bookings')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3.5" y="5" width="17" height="16" rx="2" />
              <path d="M8 3v4M16 3v4M3.5 10h17" />
            </svg>
            Bookings
          </a>
          <a
            href="/chats"
            className={`nav-item ${activeNav === 'chats' ? 'active' : ''}`}
            data-mobile-hide
            onClick={(e) => handleNav(e, '/chats')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
            </svg>
            Chats
          </a>
          <a
            href="/notifications"
            className={`nav-item ${activeNav === 'notifications' ? 'active' : ''}`}
            data-nav="notifications"
            id="notif-nav-item"
            onClick={(e) => handleNav(e, '/notifications')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            Notifications
            {unreadCount > 0 && (
              <span className="notif-nav-badge" id="notif-nav-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </a>
        </nav>

        {/* More menu popup (fixed-position, opened upward) */}
        <div
          id="more-menu"
          ref={moreMenuRef}
          className="account-menu"
          role="menu"
          aria-label="More options"
          hidden={!moreOpen}
        >
          <a
            href="/profile"
            className={`account-menu-action ${activeNav === 'profile' ? 'active' : ''}`}
            role="menuitem"
            onClick={(e) => handleNav(e, '/profile')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '.45rem', flexShrink: 0 }}
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
            </svg>
            Profile
          </a>
          <a
            href="/settings"
            className={`account-menu-action ${activeNav === 'settings' ? 'active' : ''}`}
            role="menuitem"
            onClick={(e) => handleNav(e, '/settings')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '.45rem', flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
            Settings
          </a>
          <a
            href="/support"
            className={`account-menu-action ${activeNav === 'support' ? 'active' : ''}`}
            role="menuitem"
            onClick={(e) => handleNav(e, '/support')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '.45rem', flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.4 1.9-2.4 3.5" />
              <path d="M12 17.2v.1" />
            </svg>
            Help &amp; Support
          </a>
          <a
            href="/signup-host"
            className={`account-menu-action ${activeNav === 'signup-host' ? 'active' : ''}`}
            role="menuitem"
            onClick={(e) => handleNav(e, '/signup-host')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '.45rem', flexShrink: 0 }}
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            Become a Host
          </a>
        </div>

        {/* More button */}
        <button
          type="button"
          ref={moreBtnRef}
          className={`nav-item ${isMoreActive || moreOpen ? 'active' : ''}`}
          id="more-nav-btn"
          aria-haspopup="true"
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setAccountOpen(false);
            setMoreOpen((prev) => !prev);
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="8" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          More
        </button>

        {/* Account identity popup menu */}
        <div
          id="account-menu"
          ref={accountMenuRef}
          className="account-menu"
          role="menu"
          aria-label="Account menu"
          hidden={!accountOpen}
        >
          <div id="account-menu-list" className="account-menu-list">
            {linkedAccounts.length > 0 ? (
              linkedAccounts.map((acct) => {
                const isActive = acct.id === user?.id;
                const acctInitial = getInitial(acct.full_name || acct.username || acct.email);
                const acctAvatar = resolveAvatarUrl(acct.avatar_url) || resolveAvatar(acct.avatar_url);
                return (
                  <button
                    key={acct.id}
                    type="button"
                    className={`account-menu-row ${isActive ? 'active' : ''}`}
                    onClick={() => !isActive && handleSwitchAccount(acct)}
                  >
                    <span className="account-menu-row-avatar">
                      {acctAvatar ? <img src={acctAvatar} alt="" /> : acctInitial}
                    </span>
                    <span className="account-menu-row-info">
                      <span className="account-menu-row-name">
                        {acct.full_name || 'VaRoom Member'}
                      </span>
                      <span className="account-menu-row-username">
                        {acct.username ? `@${acct.username.replace(/^@/, '')}` : (acct.email || '')}
                      </span>
                    </span>
                    {isActive && (
                      <span className="account-menu-row-check" aria-label="Active account">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <button type="button" className="account-menu-row active">
                <span className="account-menu-row-avatar">
                  {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
                </span>
                <span className="account-menu-row-info">
                  <span className="account-menu-row-name">{displayName}</span>
                  <span className="account-menu-row-username">{displayHandle}</span>
                </span>
                <span className="account-menu-row-check" aria-label="Active account">
                  ✓
                </span>
              </button>
            )}
          </div>
          <div className="account-menu-divider" />
          <button
            type="button"
            className={`account-menu-action ${linkedAccounts.length >= 3 ? 'disabled' : ''}`}
            id="account-add-btn"
            disabled={linkedAccounts.length >= 3}
            onClick={handleAddAccount}
          >
            {linkedAccounts.length >= 3 ? 'Account limit reached (3/3)' : 'Add an existing account'}
          </button>
          <a
            href="/settings"
            className="account-menu-action"
            id="account-manage-btn"
            onClick={(e) => handleNav(e, '/settings')}
          >
            Manage accounts
          </a>
          <button
            type="button"
            className="account-menu-action account-menu-logout"
            id="account-logout-btn"
            onClick={handleSignOut}
          >
            Log out
          </button>
        </div>

        {/* Collapsed Account Identity Footer */}
        <button
          type="button"
          ref={identityBtnRef}
          className="account-identity"
          id="account-identity-btn"
          aria-haspopup="true"
          aria-expanded={accountOpen}
          aria-controls="account-menu"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMoreOpen(false);
            setAccountOpen((prev) => !prev);
          }}
        >
          <span className="account-identity-avatar" id="acct-avatar-collapsed" aria-hidden="true">
            {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
          </span>
          <span className="account-identity-info">
            <span className="account-identity-name" id="acct-name-collapsed">
              {displayName}
            </span>
            <span className="account-identity-username" id="acct-username-collapsed">
              {displayHandle}
            </span>
          </span>
          <svg
            className="account-identity-dots"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </aside>
    </>
  );
}
