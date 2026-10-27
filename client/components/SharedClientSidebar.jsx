import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
const { resolveAvatarUrl } = require('./resolveStoredPhotoUrl');

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
  return {
    full_name: 'VaRoom Member',
    username: 'member',
    avatar_url: null,
    email: ''
  };
}

function getStoredUser() {
  if (typeof window === 'undefined') {
    return {
      full_name: 'VaRoom Member',
      username: 'member',
      avatar_url: null,
      email: ''
    };
  }
  try {
    if (window.VaRoomAccountSwitcher) {
      const active = window.VaRoomAccountSwitcher.getActiveAccount?.();
      if (active) return active;
    }
  } catch (e) {}
  return {
    full_name: 'VaRoom Member',
    username: 'member',
    avatar_url: null,
    email: ''
  };
}

export default function SharedClientSidebar({ activeNav: explicitActiveNav } = {}) {
  const router = useRouter();
  const [user, setUser] = useState(getInitialUser);
  const [unreadCount, setUnreadCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [hasMounted, setHasMounted] = useState(false);

  const moreBtnRef = useRef(null);
  const moreMenuRef = useRef(null);
  const identityBtnRef = useRef(null);
  const accountMenuRef = useRef(null);

  // Compute active navigation item from router if not explicitly passed
  const activeNav = explicitActiveNav || (() => {
    const p = router.pathname || '';
    const as = router.asPath || '';
    if (p === '/client-home' || as.startsWith('/client-home')) {
      if (as.includes('view=saved')) return 'saved';
      return 'home';
    }
    if (p === '/marketplace' || as.startsWith('/marketplace')) return 'marketplace';
    if (p === '/bookings' || as.startsWith('/bookings')) return 'bookings';
    if (p === '/chats' || as.startsWith('/chats')) return 'chats';
    if (p === '/notifications' || as.startsWith('/notifications')) return 'notifications';
    if (p === '/profile' || as.startsWith('/profile')) return 'profile';
    if (p === '/settings' || as.startsWith('/settings')) return 'settings';
    if (p === '/support' || as.startsWith('/support')) return 'support';
    if (p === '/signup-host' || as.startsWith('/signup-host')) return 'signup-host';
    return '';
  })();

  const isMoreActive = ['profile', 'settings', 'support', 'signup-host'].includes(activeNav);

  // Load profile from Supabase or localStorage after mount to preserve hydration matching
  useEffect(() => {
    setHasMounted(true);
    setUser(getStoredUser());
    if (window.VaRoomAccountSwitcher) {
      setLinkedAccounts(window.VaRoomAccountSwitcher.getLinkedAccounts() || []);
    }

    let cancelled = false;

    const runLoadProfile = async () => {
      if (cancelled || typeof window === 'undefined') return;
      const client = window.supabaseClient;
      if (!client || !client.auth) return false; // signal: not ready

      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData?.session;
      if (!session || !session.user) {
        if (!cancelled) setUser({ full_name: 'VaRoom Member', username: 'member', avatar_url: null, email: '' });
        return true; // ready but no session
      }

      const userId = session.user.id;

      // The authenticated session is the authority for selecting a cached
      // identity; never hydrate the sidebar from another account's profile.
      const cachedProfile = window.VaRoomAccountProfileCache
        && window.VaRoomAccountProfileCache.readForAccount(userId);
      if (!cancelled && cachedProfile && cachedProfile.role === 'client') setUser(cachedProfile);

      if (window.VaRoomAccountSwitcher) {
        await window.VaRoomAccountSwitcher.upsertFromSession(client, session);
      }

      // Record active account ID now that we have an authoritative session
      try { localStorage.setItem('varoom_active_account_id', userId); } catch (e) {}

      // Load profile
      const { data: profile } = await client
        .from('profiles')
        .select('id,full_name,username,avatar_url,role')
        .eq('id', userId)
        .maybeSingle();

      if (!cancelled && profile) {
        const userData = {
          id: profile.id,
          full_name: profile.full_name || session.user.user_metadata?.full_name || 'VaRoom Member',
          username: profile.username || session.user.email?.split('@')[0] || 'member',
          avatar_url: profile.avatar_url || session.user.user_metadata?.avatar_url || null,
          email: session.user.email,
          role: profile.role || 'client',
        };
        if (!cancelled) setUser(userData);
        try {
          if (window.VaRoomAccountProfileCache) window.VaRoomAccountProfileCache.write(userData);
          else localStorage.setItem('varoom_cached_profile', JSON.stringify(userData));
        } catch (e) {}
      }

      // Load linked accounts from switcher if available
      if (!cancelled && window.VaRoomAccountSwitcher) {
        setLinkedAccounts(window.VaRoomAccountSwitcher.getLinkedAccounts() || []);
      }

      // Check notification unread count
      try {
        const { count } = await client
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_user_id', userId)
          .eq('read', false);
        if (!cancelled && typeof count === 'number') {
          setUnreadCount(count);
        }
      } catch (e) {}

      return true; // done
    };

    // Retry until window.supabaseClient is available (up to 3s, 50ms intervals)
    let retries = 0;
    const MAX_RETRIES = 60; // 60 * 50ms = 3 000ms
    const poll = async () => {
      if (cancelled) return;
      const ready = await runLoadProfile();
      if (!ready && retries < MAX_RETRIES) {
        retries++;
        setTimeout(poll, 50);
      }
    };
    poll();

    // Listen for storage changes from account switcher or other tabs
    const handleStorage = (e) => {
      if (e.key === 'varoom_cached_profile' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          const activeId = localStorage.getItem('varoom_active_account_id');
          // Only apply the new cached profile if it matches the active account
          if (activeId && parsed.id === activeId && parsed.role === 'client') {
            setUser(parsed);
          }
        } catch (err) {}
      }
      if (e.key === 'varoom_linked_accounts' && window.VaRoomAccountSwitcher && window.supabaseClient) {
        window.VaRoomAccountSwitcher.loadLinkedAccounts(window.supabaseClient)
          .then(setLinkedAccounts).catch(() => setLinkedAccounts([]));
      }
    };
    const handleAccountsChanged = (e) => {
      if (e.detail?.accounts) {
        setLinkedAccounts(e.detail.accounts);
      } else {
        setLinkedAccounts(window.VaRoomAccountSwitcher?.getLinkedAccounts?.() || []);
      }
    };
    window.addEventListener('storage', handleStorage);
    const handleCountUpdate = (e) => {
      if (typeof e?.detail?.count === 'number') setUnreadCount(e.detail.count);
    };
    window.addEventListener('varoom_linked_accounts_changed', handleAccountsChanged);
    window.addEventListener('varoom_notification_count', handleCountUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('varoom_linked_accounts_changed', handleAccountsChanged);
      window.removeEventListener('varoom_notification_count', handleCountUpdate);
    };
  }, []);

  // Position popovers upward above trigger buttons
  const positionPopover = (trigger, menu) => {
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
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

  useEffect(() => {
    if (!moreOpen && !accountOpen) return;
    const handleReposition = () => {
      if (moreOpen && moreBtnRef.current && moreMenuRef.current) {
        positionPopover(moreBtnRef.current, moreMenuRef.current);
      }
      if (accountOpen && identityBtnRef.current && accountMenuRef.current) {
        positionPopover(identityBtnRef.current, accountMenuRef.current);
      }
    };
    window.addEventListener('resize', handleReposition);
    return () => window.removeEventListener('resize', handleReposition);
  }, [moreOpen, accountOpen]);

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
      const trigger = e.target.closest('#topbar-avatar-btn, #menu-toggle, .menu-toggle');
      if (trigger) {
        e.preventDefault();
        setMobileOpen((prev) => !prev);
      }
    };

    const handleToggle = () => setMobileOpen((prev) => !prev);
    const handleOpen = () => setMobileOpen(true);
    const handleClose = () => setMobileOpen(false);

    document.addEventListener('click', handleTopbarClick);
    window.addEventListener('open-client-sidebar', handleOpen);
    window.addEventListener('close-client-sidebar', handleClose);
    window.addEventListener('varoom-toggle-sidebar', handleToggle);
    window.addEventListener('varoom-close-sidebar', handleClose);
    return () => {
      document.removeEventListener('click', handleTopbarClick);
      window.removeEventListener('open-client-sidebar', handleOpen);
      window.removeEventListener('close-client-sidebar', handleClose);
      window.removeEventListener('varoom-toggle-sidebar', handleToggle);
      window.removeEventListener('varoom-close-sidebar', handleClose);
    };
  }, []);

  // Navigation click handler
  const handleNav = (e, path, navKey) => {
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
  const handleSwitchAccount = async (targetAccount) => {
    if (!targetAccount || targetAccount.id === user?.id) return;
    try {
      if (window.VaRoomAccountSwitcher && window.supabaseClient) {
        await window.VaRoomAccountSwitcher.switchAccount(window.supabaseClient, targetAccount);
        window.location.reload();
      }
    } catch (err) {
      console.error('Account switch failed:', err);
    }
  };

  // Add existing account handler
  const handleAddAccount = () => {
    setAccountOpen(false);
    if (window.VaRoomAccountSwitcher && typeof window.VaRoomAccountSwitcher.openAddAccountModal === 'function') {
      window.VaRoomAccountSwitcher.openAddAccountModal();
    } else {
      window.dispatchEvent(new CustomEvent('varoom:open-add-account'));
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    setAccountOpen(false);
    setUser({ full_name: 'VaRoom Member', username: 'member', avatar_url: null, email: '' });
    try {
      if (window.supabaseClient?.auth) {
        await window.supabaseClient.auth.signOut();
      }
    } catch (err) {
      console.error('Sign out error:', err);
    }
    window.location.href = '/';
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
