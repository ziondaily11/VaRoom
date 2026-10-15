import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';

function getInitial(name) {
  const str = String(name || '').trim();
  return str ? str.charAt(0).toUpperCase() : '?';
}

function resolveAvatar(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  try {
    if (typeof window !== 'undefined' && window.supabaseClient) {
      return window.supabaseClient.storage.from('avatars').getPublicUrl(url).data.publicUrl;
    }
  } catch (e) {}
  return url;
}

function getInitialUser() {
  if (typeof window === 'undefined') {
    return {
      full_name: 'Amazing Stays 🌴',
      username: 'amazingstays',
      avatar_url: null,
      email: 'host@varoom.co.ke'
    };
  }
  try {
    if (window.VaRoomAccountSwitcher) {
      const active = window.VaRoomAccountSwitcher.getActiveAccount?.();
      if (active) return active;
    }
    const cached = localStorage.getItem('varoom_cached_profile') || sessionStorage.getItem('varoom_cached_profile');
    if (cached) return JSON.parse(cached);
    const linked = localStorage.getItem('varoom_linked_accounts');
    if (linked) {
      const list = JSON.parse(linked);
      if (Array.isArray(list) && list.length > 0) return list[0];
    }
  } catch (e) {}
  return {
    full_name: 'Amazing Stays 🌴',
    username: 'amazingstays',
    avatar_url: null,
    email: 'host@varoom.co.ke'
  };
}

export default function SharedHostSidebar({ activeNav: explicitActiveNav }) {
  const router = useRouter();
  const [user, setUser] = useState(getInitialUser);
  const [unreadCount, setUnreadCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState([]);

  const moreBtnRef = useRef(null);
  const moreMenuRef = useRef(null);
  const identityBtnRef = useRef(null);
  const accountMenuRef = useRef(null);

  // Compute active navigation item from router or explicit prop
  const currentPath = router.pathname || '';
  const currentView = router.query?.view || '';
  const asPath = router.asPath || '';

  let activeNav = explicitActiveNav || 'home';
  if (!explicitActiveNav) {
    if (asPath.includes('view=my-listings') || currentView === 'my-listings') {
      activeNav = 'my-listings';
    } else if (asPath.includes('view=saved') || currentView === 'saved') {
      activeNav = 'saved';
    } else if (asPath.startsWith('/host-home') || currentPath === '/host-home') {
      activeNav = 'home';
    } else if (asPath.startsWith('/marketplace') || currentPath.startsWith('/marketplace')) {
      activeNav = 'marketplace';
    } else if (asPath.startsWith('/bookings') || currentPath.startsWith('/bookings')) {
      activeNav = 'bookings';
    } else if (asPath.startsWith('/chats') || currentPath.startsWith('/chats')) {
      activeNav = 'chats';
    } else if (asPath.startsWith('/notifications') || currentPath.startsWith('/notifications')) {
      activeNav = 'notifications';
    } else if (asPath.startsWith('/profile') || asPath.startsWith('/host/') || currentPath.startsWith('/profile') || currentPath.startsWith('/host/')) {
      activeNav = 'profile';
    } else if (asPath.startsWith('/analytics') || currentPath.startsWith('/analytics')) {
      activeNav = 'analytics';
    } else if (asPath.startsWith('/settings') || currentPath.startsWith('/settings')) {
      activeNav = 'settings';
    } else if (asPath.startsWith('/support') || currentPath.startsWith('/support')) {
      activeNav = 'support';
    }
  }

  const isMoreActive = ['analytics', 'settings', 'support', 'upgrade'].includes(activeNav);

  // Load user profile & session
  const refreshUser = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const client = window.supabaseClient;
    if (!client?.auth) return;

    try {
      const { data } = await client.auth.getSession();
      const session = data?.session;
      if (!session?.user) return;

      const userId = session.user.id;
      const { data: profile } = await client
        .from('profiles')
        .select('id,full_name,username,avatar_url,role')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        const userData = {
          id: profile.id,
          full_name: profile.full_name || session.user.user_metadata?.full_name || 'Amazing Stays 🌴',
          username: profile.username || session.user.email?.split('@')[0] || 'amazingstays',
          avatar_url: profile.avatar_url || session.user.user_metadata?.avatar_url || null,
          email: session.user.email,
        };
        setUser(userData);
        try {
          localStorage.setItem('varoom_cached_profile', JSON.stringify(userData));
        } catch (e) {}
      }

      // Load linked accounts from switcher if available
      if (window.VaRoomAccountSwitcher) {
        setLinkedAccounts(window.VaRoomAccountSwitcher.getLinkedAccounts() || []);
      }

      // Check notification unread count
      try {
        const { count } = await client
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_user_id', userId)
          .eq('read', false);
        if (typeof count === 'number') {
          setUnreadCount(count);
        }
      } catch (e) {}
    } catch (err) {
      console.warn('Unable to load user profile in host sidebar:', err);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const interval = setInterval(refreshUser, 30000);
    return () => clearInterval(interval);
  }, [refreshUser]);

  // Position popover menus
  const positionPopover = (btn, menu) => {
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    const GAP = 8;
    menu.style.position = 'fixed';
    menu.style.zIndex = '99999';
    menu.style.left = `${rect.left}px`;
    menu.style.width = `${rect.right - rect.left}px`;
    menu.style.right = 'auto';
    const bottomFromViewport = window.innerHeight - rect.top + GAP;
    menu.style.bottom = `${bottomFromViewport}px`;
    menu.style.top = 'auto';
    menu.style.maxHeight = `${Math.max(200, rect.top - GAP * 2)}px`;
    menu.style.overflowY = 'auto';
  };

  useEffect(() => {
    if (moreOpen && moreBtnRef.current && moreMenuRef.current) {
      positionPopover(moreBtnRef.current, moreMenuRef.current);
    }
  }, [moreOpen]);

  useEffect(() => {
    if (accountOpen && identityBtnRef.current && accountMenuRef.current) {
      positionPopover(identityBtnRef.current, accountMenuRef.current);
    }
  }, [accountOpen]);

  // Close menus on outside click or Escape
  useEffect(() => {
    const handleDocumentClick = (e) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      const target = e.target;

      const isInsideMore =
        path.includes(moreBtnRef.current) ||
        path.includes(moreMenuRef.current) ||
        moreBtnRef.current?.contains(target) ||
        moreMenuRef.current?.contains(target);

      const isInsideAccount =
        path.includes(identityBtnRef.current) ||
        path.includes(accountMenuRef.current) ||
        identityBtnRef.current?.contains(target) ||
        accountMenuRef.current?.contains(target);

      if (!isInsideMore) {
        setMoreOpen(false);
      }
      if (!isInsideAccount) {
        setAccountOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        setAccountOpen(false);
        setMobileOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Mobile drawer listener (responds to topbar hamburger/avatar button clicks)
  useEffect(() => {
    const handleTopbarClick = (e) => {
      const trigger = e.target.closest('#topbar-avatar-btn, #menu-toggle');
      if (trigger) {
        e.preventDefault();
        setMobileOpen((prev) => !prev);
      }
    };

    const handleCustomOpen = () => setMobileOpen(true);
    const handleCustomClose = () => setMobileOpen(false);

    document.addEventListener('click', handleTopbarClick);
    window.addEventListener('open-host-sidebar', handleCustomOpen);
    window.addEventListener('close-host-sidebar', handleCustomClose);

    return () => {
      document.removeEventListener('click', handleTopbarClick);
      window.removeEventListener('open-host-sidebar', handleCustomOpen);
      window.removeEventListener('close-host-sidebar', handleCustomClose);
    };
  }, []);

  const closeMobile = () => setMobileOpen(false);

  // Navigation handlers
  const handleNav = (e, path, viewName) => {
    e.preventDefault();
    closeMobile();
    setMoreOpen(false);

    if (viewName) {
      if (router.pathname === '/host-home') {
        // Trigger page view handler directly without reload
        if (typeof window !== 'undefined') {
          const navItem = document.querySelector(`.nav-item[data-nav="${viewName}"]`);
          if (navItem && !navItem.classList.contains('active')) {
            navItem.click();
          }
        }
        router.push(`/host-home?view=${viewName}`, undefined, { shallow: true });
        return;
      }
      router.push(`/host-home?view=${viewName}`);
      return;
    }

    if (path === '/host-home' && router.pathname === '/host-home' && !router.query.view) {
      const dashMain = document.querySelector('.dash-main');
      if (dashMain) dashMain.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    router.push(path);
  };

  const handleLogout = async () => {
    try {
      if (typeof window !== 'undefined' && window.supabaseClient?.auth) {
        await window.supabaseClient.auth.signOut();
        sessionStorage.removeItem('varoom_user_role');
      }
    } catch (e) {}
    window.location.href = '/login';
  };

  const handleSwitchAccount = async (targetAcct) => {
    if (!targetAcct || typeof window === 'undefined') return;
    try {
      if (window.VaRoomAccountSwitcher && window.supabaseClient) {
        await window.VaRoomAccountSwitcher.switchAccount(window.supabaseClient, targetAcct);
        window.location.reload();
      }
    } catch (err) {
      alert(err.message || 'Unable to switch account.');
    }
  };

  const handleAddAccount = () => {
    if (typeof window !== 'undefined') {
      const dest = window.location.pathname;
      window.location.href = `/login.html?mode=add&redirect=${encodeURIComponent(dest)}`;
    }
  };

  const userAvatarUrl = user ? resolveAvatar(user.avatar_url) : null;
  const displayName = user?.full_name || 'VaRoom Host';
  const displayUsername = user?.username ? `@${user.username}` : (user?.email || '');

  return (
    <>
      <div
        id="sidebar-backdrop"
        className={`sidebar-backdrop ${mobileOpen ? 'show' : ''}`}
        onClick={closeMobile}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        id="sidebar"
        aria-label="Host navigation"
      >
        <a
          href="/host-home"
          className="logo"
          id="bookings-home-logo"
          onClick={(e) => handleNav(e, '/host-home')}
        >
          <span className="va">Va</span>
          <span className="room">Room</span>
        </a>

        {/* Primary nav group */}
        <nav className="nav-group">
          <a
            href="/host-home"
            className={`nav-item ${activeNav === 'home' ? 'active' : ''}`}
            data-nav="home"
            id="bookings-home-link"
            onClick={(e) => handleNav(e, '/host-home')}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5.5 10v9a1 1 0 0 1 1 1H9v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4h2.5a1 1 0 0 1 1-1v-9" />
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
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
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
            onClick={(e) => handleNav(e, '/host-home', 'saved')}
            onKeyDown={(e) => e.key === 'Enter' && handleNav(e, '/host-home', 'saved')}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" />
            </svg>
            Saved
          </div>
        </nav>

        {/* My activity nav group */}
        <nav className="nav-group">
          <p className="nav-label">My activity</p>
          <a
            href="/bookings"
            className={`nav-item ${activeNav === 'bookings' ? 'active' : ''}`}
            onClick={(e) => handleNav(e, '/bookings')}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
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
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
            </svg>
            Chats
          </a>
          <button
            type="button"
            className={`nav-item ${activeNav === 'notifications' ? 'active' : ''}`}
            id="notif-nav-item"
            onClick={(e) => handleNav(e, '/notifications')}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
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
          </button>
        </nav>

        {/* Host nav group */}
        <nav className="nav-group">
          <p className="nav-label">Host</p>
          <a
            href="/list"
            className="list-space-btn"
            onClick={(e) => handleNav(e, '/list')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            List a space
          </a>
          <div
            className={`nav-item ${activeNav === 'my-listings' ? 'active' : ''}`}
            data-nav="my-listings"
            role="button"
            tabIndex={0}
            onClick={(e) => handleNav(e, '/host-home', 'my-listings')}
            onKeyDown={(e) => e.key === 'Enter' && handleNav(e, '/host-home', 'my-listings')}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3.5" y="4" width="17" height="16" rx="2" />
              <path d="M7.5 9h9M7.5 13h9M7.5 17h5" />
            </svg>
            My Listings
          </div>
          <a
            href="/profile"
            className={`nav-item ${activeNav === 'profile' ? 'active' : ''}`}
            id="profile-brand-link"
            onClick={(e) => handleNav(e, '/profile')}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
            </svg>
            Profile
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
            href="/analytics"
            className={`account-menu-action ${activeNav === 'analytics' ? 'active' : ''}`}
            role="menuitem"
            onClick={(e) => handleNav(e, '/analytics')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '.45rem', flexShrink: 0 }}
            >
              <path d="M4 19V10M11 19V5M18 19v-7" />
              <path d="M3 19h18" />
            </svg>
            Analytics
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
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
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
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '.45rem', flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.4 1.9-2.4 3.5" />
              <path d="M12 17.2v.1" />
            </svg>
            Help &amp; Support
          </a>
          <a
            href="pricing.html"
            className={`account-menu-action ${activeNav === 'upgrade' ? 'active' : ''}`}
            role="menuitem"
            onClick={(e) => handleNav(e, '/pricing.html')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '.45rem', flexShrink: 0 }}
            >
              <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
              <path d="m19 16 .7 1.8L21.5 18l-1.8.7L19 20.5l-.7-1.8-1.8-.7L19 16Z" />
            </svg>
            Premium
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
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="8" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          More
        </button>

        {/* Account identity popup */}
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
                const acctAvatar = resolveAvatar(acct.avatar_url);
                return (
                  <button
                    key={acct.id}
                    type="button"
                    className={`account-menu-row ${isActive ? 'active' : ''}`}
                    onClick={() => !isActive && handleSwitchAccount(acct)}
                  >
                    <span className="account-menu-row-avatar">
                      {acctAvatar ? (
                        <img src={acctAvatar} alt="" />
                      ) : (
                        getInitial(acct.full_name)
                      )}
                    </span>
                    <span className="account-menu-row-info">
                      <span className="account-menu-row-name">
                        {acct.full_name || 'VaRoom member'}
                      </span>
                      <span className="account-menu-row-username">
                        {acct.username ? `@${acct.username}` : acct.email || ''}
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
            ) : user ? (
              <div className="account-menu-row active">
                <span className="account-menu-row-avatar">
                  {userAvatarUrl ? (
                    <img src={userAvatarUrl} alt="" />
                  ) : (
                    getInitial(user.full_name)
                  )}
                </span>
                <span className="account-menu-row-info">
                  <span className="account-menu-row-name">{displayName}</span>
                  <span className="account-menu-row-username">{displayUsername}</span>
                </span>
                <span className="account-menu-row-check" aria-label="Active account">
                  ✓
                </span>
              </div>
            ) : null}
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
            onClick={handleLogout}
          >
            Log out {user?.username ? `@${user.username}` : ''}
          </button>
        </div>

        {/* Account identity button at bottom */}
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
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt="" />
            ) : (
              getInitial(displayName)
            )}
          </span>
          <span className="account-identity-info">
            <span className="account-identity-name" id="acct-name-collapsed">
              {displayName}
            </span>
            <span className="account-identity-username" id="acct-username-collapsed">
              {displayUsername}
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
