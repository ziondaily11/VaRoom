import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import {
  NotificationItem,
  NotificationDetails,
  getCachedNotifications,
  setCachedNotifications,
  markCachedNotificationRead,
  markAllCachedNotificationsRead,
  detailsFor,
  notificationTarget,
  groupForDate,
  timeAgo,
  searchableText,
} from '../lib/notificationsCache';

function syncSidebarUnreadCount(count: number) {
  if (typeof window === 'undefined') return;
  try {
    if ((window as any).VaroomSidebar && typeof (window as any).VaroomSidebar.setUnreadCount === 'function') {
      (window as any).VaroomSidebar.setUnreadCount(count);
    }
  } catch (e) {}
  try {
    window.dispatchEvent(new CustomEvent('varoom_notification_count', { detail: { count } }));
  } catch (e) {}
}

const ApprovedIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m5 12 4 4L19 6" />
  </svg>
);

const DeclinedIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

const RequestIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

function renderIcon(iconKind: 'approved' | 'declined' | 'request') {
  if (iconKind === 'approved') return <ApprovedIcon />;
  if (iconKind === 'declined') return <DeclinedIcon />;
  return <RequestIcon />;
}

export default function NotificationsPage() {
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentFilter, setCurrentFilter] = useState<'all' | 'booking'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'host' | 'client'>('client');
  const [userId, setUserId] = useState<string | null>(null);

  const requestVersionRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);
  const realtimeChannelRef = useRef<any>(null);
  const clientRef = useRef<SupabaseClient | null>(null);

  // Helper to open sidebar on mobile
  const handleOpenMobileSidebar = () => {
    if (typeof window === 'undefined') return;
    if ((window as any).VaroomSidebar && typeof (window as any).VaroomSidebar.open === 'function') {
      (window as any).VaroomSidebar.open();
    }
    window.dispatchEvent(new CustomEvent('varoom-toggle-sidebar'));
    window.dispatchEvent(new CustomEvent('open-client-sidebar'));
    window.dispatchEvent(new CustomEvent('open-host-sidebar'));
  };

  // Fetch notifications from Supabase
  const fetchNotifications = useCallback(
    async (currentUserId: string, client: any, isBackground = false) => {
      const version = ++requestVersionRef.current;

      try {
        const [listResult, countResult] = await Promise.all([
          client
            .from('notifications')
            .select('id,title,message,type,read,created_at,booking_id,related_entity_type,related_entity_id,metadata')
            .eq('recipient_user_id', currentUserId)
            .order('created_at', { ascending: false })
            .limit(100),
          client
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_user_id', currentUserId)
            .eq('read', false),
        ]);

        if (version !== requestVersionRef.current || !mountedRef.current) return;

        if (listResult.error) {
          console.error('Unable to load notifications:', listResult.error);
          if (!isBackground) {
            setErrorMessage('Unable to load notifications. Please refresh and try again.');
            setLoading(false);
          }
          return;
        }

        const items: NotificationItem[] = listResult.data || [];
        const nextUnread: number = typeof countResult.count === 'number'
          ? countResult.count
          : items.filter((n) => !n.read).length;

        setNotifications(items);
        setUnreadCount(nextUnread);
        setErrorMessage(null);
        setLoading(false);

        setCachedNotifications(items, currentUserId, nextUnread);
        syncSidebarUnreadCount(nextUnread);
      } catch (err) {
        if (version !== requestVersionRef.current || !mountedRef.current) return;
        console.error('Notification fetch error:', err);
        if (!isBackground) {
          setErrorMessage('Unable to load notifications. Please refresh and try again.');
          setLoading(false);
        }
      }
    },
    []
  );

  // Mark single notification as read
  const handleMarkRead = async (notification: NotificationItem) => {
    if (notification.read || !userId) return;

    // Optimistically update
    const prevItems = notifications;
    const prevUnread = unreadCount;

    const cacheResult = markCachedNotificationRead(notification.id, userId);
    if (cacheResult) {
      setNotifications(cacheResult.items);
      setUnreadCount(cacheResult.unreadCount);
      syncSidebarUnreadCount(cacheResult.unreadCount);
    } else {
      const nextItems = notifications.map((item) =>
        item.id === notification.id ? { ...item, read: true } : item
      );
      const nextUnread = Math.max(0, unreadCount - 1);
      setNotifications(nextItems);
      setUnreadCount(nextUnread);
      syncSidebarUnreadCount(nextUnread);
    }

    const client = clientRef.current || getSupabaseClient();
    if (!client) return;

    try {
      const result = await client
        .from('notifications')
        .update({ read: true })
        .eq('id', notification.id)
        .eq('recipient_user_id', userId);

      if (result.error) {
        console.error('Unable to mark notification as read:', result.error);
        // Roll back optimistic state on failure
        setNotifications(prevItems);
        setUnreadCount(prevUnread);
        setCachedNotifications(prevItems, userId, prevUnread);
        syncSidebarUnreadCount(prevUnread);
      }
    } catch (e) {
      console.error('Error marking notification read:', e);
      setNotifications(prevItems);
      setUnreadCount(prevUnread);
      setCachedNotifications(prevItems, userId, prevUnread);
      syncSidebarUnreadCount(prevUnread);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    if (!userId || unreadCount === 0) return;

    const prevItems = notifications;
    const prevUnread = unreadCount;

    // Optimistically update
    const cacheResult = markAllCachedNotificationsRead(userId);
    if (cacheResult) {
      setNotifications(cacheResult.items);
      setUnreadCount(0);
      syncSidebarUnreadCount(0);
    } else {
      setNotifications(notifications.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      syncSidebarUnreadCount(0);
    }

    const client = clientRef.current || getSupabaseClient();
    if (!client) return;

    try {
      const result = await client
        .from('notifications')
        .update({ read: true })
        .eq('recipient_user_id', userId)
        .eq('read', false);

      if (result.error) {
        console.error('Unable to mark all notifications read:', result.error);
        setErrorMessage('Unable to update notifications. Please try again.');
        // Rollback
        setNotifications(prevItems);
        setUnreadCount(prevUnread);
        setCachedNotifications(prevItems, userId, prevUnread);
        syncSidebarUnreadCount(prevUnread);
      }
    } catch (e) {
      console.error('Error marking all notifications read:', e);
      setErrorMessage('Unable to update notifications. Please try again.');
      setNotifications(prevItems);
      setUnreadCount(prevUnread);
      setCachedNotifications(prevItems, userId, prevUnread);
      syncSidebarUnreadCount(prevUnread);
    }
  };

  // Notification card click handler
  const handleNotificationClick = async (notification: NotificationItem) => {
    const target = notificationTarget(notification, userRole);
    if (!notification.read) {
      await handleMarkRead(notification);
    }
    if (target) {
      if (target.startsWith('/')) {
        router.push(target);
      } else {
        window.location.href = target;
      }
    }
  };

  // Main authentication, cache check, and realtime setup
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    let earlyUserId: string | null = null;
    // Immediately alert _app.js and environment of cached role & hydrate cache instantly
    try {
      const cachedRaw = localStorage.getItem('varoom_cached_profile');
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed?.id) earlyUserId = parsed.id;
        if (parsed && (parsed.role === 'host' || parsed.role === 'client')) {
          document.documentElement.setAttribute('data-account-role', parsed.role);
          window.dispatchEvent(new CustomEvent('varoom_role_change', { detail: { role: parsed.role } }));
        }
      } else {
        const stored = localStorage.getItem('varoom_last_role') || sessionStorage.getItem('varoom_user_role');
        if (stored === 'host' || stored === 'client') {
          document.documentElement.setAttribute('data-account-role', stored);
          window.dispatchEvent(new CustomEvent('varoom_role_change', { detail: { role: stored } }));
        }
      }
      if (!earlyUserId) {
        earlyUserId = localStorage.getItem('varoom_active_account_id');
      }
    } catch (e) {}

    // Instant cache presentation: if we have a known active user, display cached notifications immediately
    if (earlyUserId) {
      setUserId(earlyUserId);
      const earlyCached = getCachedNotifications(earlyUserId);
      if (earlyCached && earlyCached.items) {
        setNotifications(earlyCached.items);
        setUnreadCount(earlyCached.unreadCount);
        setLoading(false);
        syncSidebarUnreadCount(earlyCached.unreadCount);
      }
    }

    const initAuthAndData = async () => {
      let client = getSupabaseClient();
      if (!client || !client.auth) {
        // Wait briefly if client is initializing
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 50));
          client = getSupabaseClient();
          if (client && client.auth) break;
        }
      }

      if (!client || !client.auth) {
        if (!cancelled) {
          router.push(loginUrl('/notifications'));
        }
        return;
      }

      clientRef.current = client;

      const sessionResult = await client.auth.getSession();
      if (sessionResult.error || !sessionResult.data?.session?.user) {
        if (!cancelled) {
          router.push(loginUrl('/notifications'));
        }
        return;
      }

      const user = sessionResult.data.session.user;
      if (cancelled) return;
      setUserId(user.id);

      // Determine role from profile or cache
      let role: 'host' | 'client' = 'client';
      try {
        const cachedRaw = localStorage.getItem('varoom_cached_profile');
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && parsed.id === user.id && (parsed.role === 'host' || parsed.role === 'client')) {
            role = parsed.role;
          }
        }
      } catch (e) {}

      try {
        const profileResult = await client
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (profileResult.data?.role === 'host' || profileResult.data?.role === 'client') {
          role = profileResult.data.role;
        }
      } catch (e) {}

      if (cancelled) return;
      setUserRole(role);
      document.documentElement.setAttribute('data-account-role', role);
      try {
        sessionStorage.setItem('varoom_user_role', role);
        localStorage.setItem('varoom_last_role', role);
      } catch (e) {}
      window.dispatchEvent(new CustomEvent('varoom_role_change', { detail: { role } }));

      // 1. Check cache for instant rendering
      const cached = getCachedNotifications(user.id);
      if (cached && cached.items) {
        setNotifications(cached.items);
        setUnreadCount(cached.unreadCount);
        setLoading(false);
        syncSidebarUnreadCount(cached.unreadCount);

        // Background refresh if cache is stale
        if (!cached.isFresh) {
          void fetchNotifications(user.id, client, true);
        }
      } else {
        setLoading(true);
        void fetchNotifications(user.id, client, false);
      }

      // 2. Set up page-owned Realtime channel
      if (realtimeChannelRef.current) {
        try {
          client.removeChannel(realtimeChannelRef.current);
        } catch (e) {}
      }

      const pageChannel = client
        .channel(`notifications-page-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_user_id=eq.${user.id}`,
          },
          () => {
            void fetchNotifications(user.id, client, true);
          }
        )
        .subscribe();

      realtimeChannelRef.current = pageChannel;
    };

    void initAuthAndData();

    const handleAccountChange = () => {
      const currentActiveId = localStorage.getItem('varoom_active_account_id');
      if (currentActiveId && currentActiveId !== userId) {
        setUserId(currentActiveId);
        const nextCached = getCachedNotifications(currentActiveId);
        if (nextCached && nextCached.items) {
          setNotifications(nextCached.items);
          setUnreadCount(nextCached.unreadCount);
          setLoading(false);
          syncSidebarUnreadCount(nextCached.unreadCount);
        } else {
          setNotifications([]);
          setUnreadCount(0);
          setLoading(true);
        }
        void initAuthAndData();
      }
    };
    window.addEventListener('varoom_active_account_changed', handleAccountChange);
    window.addEventListener('varoom_linked_accounts_changed', handleAccountChange);

    return () => {
      mountedRef.current = false;
      cancelled = true;
      requestVersionRef.current += 1;
      window.removeEventListener('varoom_active_account_changed', handleAccountChange);
      window.removeEventListener('varoom_linked_accounts_changed', handleAccountChange);

      // Clean up ONLY the page-owned realtime channel
      if (realtimeChannelRef.current) {
        try {
          const client = (window as any).supabaseClient;
          if (client) {
            client.removeChannel(realtimeChannelRef.current);
          }
        } catch (e) {}
        realtimeChannelRef.current = null;
      }
    };
  }, [fetchNotifications, router]);

  // Compute filtered notifications
  const filteredNotifications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notifications.filter((notification) => {
      const details = detailsFor(notification.type);
      const matchesFilter =
        currentFilter === 'all' || (currentFilter === 'booking' && details.category === 'booking');
      const matchesSearch = !q || searchableText(notification, details).includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [notifications, currentFilter, searchQuery]);

  // Group notifications into Today, Yesterday, Older
  const groupedNotifications = useMemo(() => {
    const groups: { Today: NotificationItem[]; Yesterday: NotificationItem[]; Older: NotificationItem[] } = {
      Today: [],
      Yesterday: [],
      Older: [],
    };
    filteredNotifications.forEach((notification) => {
      const groupKey = groupForDate(notification.created_at);
      groups[groupKey].push(notification);
    });
    return groups;
  }, [filteredNotifications]);

  const bookingCount = useMemo(() => {
    return notifications.filter((n) => detailsFor(n.type).category === 'booking').length;
  }, [notifications]);

  const subtitleText = unreadCount
    ? `You have ${unreadCount} new notification${unreadCount === 1 ? '' : 's'}`
    : "You're all caught up";

  const isAllRead = unreadCount === 0;

  return (
    <>
      <Head>
        <title>Notifications · VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="notifications-page-main">
        <div className="main-inner">
          {/* SKELETON LOADER (Rendered while initial cache is unavailable) */}
          {loading ? (
            <div className="notifications-skeleton" role="status" aria-label="Loading notifications">
              <div className="notification-skeleton-header">
                <div className="notification-skeleton-heading">
                  <div className="notification-skeleton-block notification-skeleton-title"></div>
                  <div className="notification-skeleton-block notification-skeleton-subtitle"></div>
                </div>
                <div className="notification-skeleton-header-actions">
                  <div className="notification-skeleton-block notification-skeleton-header-action"></div>
                  <div className="notification-skeleton-block notification-skeleton-header-action"></div>
                </div>
              </div>
              <div className="notification-skeleton-toolbar">
                <div className="notification-skeleton-tabs">
                  <div className="notification-skeleton-block notification-skeleton-tab"></div>
                  <div className="notification-skeleton-block notification-skeleton-tab"></div>
                </div>
                <div className="notification-skeleton-search">
                  <div className="notification-skeleton-block notification-skeleton-search-icon"></div>
                  <div className="notification-skeleton-block notification-skeleton-search-text"></div>
                </div>
              </div>
              <div className="notification-skeleton-section">
                <div className="notification-skeleton-block notification-skeleton-section-title"></div>
                <div className="notification-skeleton-list">
                  <div className="notification-skeleton-row">
                    <div className="notification-skeleton-block notification-skeleton-icon"></div>
                    <div className="notification-skeleton-copy">
                      <div className="notification-skeleton-block notification-skeleton-title-line"></div>
                      <div className="notification-skeleton-block notification-skeleton-description"></div>
                      <div className="notification-skeleton-actions">
                        <div className="notification-skeleton-block notification-skeleton-button"></div>
                        <div className="notification-skeleton-block notification-skeleton-button short"></div>
                      </div>
                    </div>
                    <div className="notification-skeleton-meta">
                      <div className="notification-skeleton-block notification-skeleton-time"></div>
                      <div className="notification-skeleton-block notification-skeleton-dot"></div>
                    </div>
                  </div>
                  <div className="notification-skeleton-row">
                    <div className="notification-skeleton-block notification-skeleton-icon"></div>
                    <div className="notification-skeleton-copy">
                      <div className="notification-skeleton-block notification-skeleton-title-line"></div>
                      <div className="notification-skeleton-block notification-skeleton-description"></div>
                      <div className="notification-skeleton-actions">
                        <div className="notification-skeleton-block notification-skeleton-button"></div>
                      </div>
                    </div>
                    <div className="notification-skeleton-meta">
                      <div className="notification-skeleton-block notification-skeleton-time"></div>
                      <div className="notification-skeleton-block notification-skeleton-dot"></div>
                    </div>
                  </div>
                  <div className="notification-skeleton-row">
                    <div className="notification-skeleton-block notification-skeleton-icon"></div>
                    <div className="notification-skeleton-copy">
                      <div className="notification-skeleton-block notification-skeleton-title-line"></div>
                      <div className="notification-skeleton-block notification-skeleton-description"></div>
                      <div className="notification-skeleton-actions">
                        <div className="notification-skeleton-block notification-skeleton-button"></div>
                      </div>
                    </div>
                    <div className="notification-skeleton-meta">
                      <div className="notification-skeleton-block notification-skeleton-time"></div>
                      <div className="notification-skeleton-block notification-skeleton-dot"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ACTUAL NOTIFICATIONS CONTENT */
            <div className="notifications-content" aria-hidden="false">
              {/* PAGE HEADER */}
              <div className="page-header">
                <div className="page-header-left">
                  <button
                    className="menu-toggle"
                    id="menu-toggle"
                    type="button"
                    onClick={handleOpenMobileSidebar}
                    aria-label="Open menu"
                  >
                    <svg
                      className="icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <div>
                    <h1>Notifications</h1>
                    <p id="notif-subtitle">{subtitleText}</p>
                  </div>
                </div>
                <div className="header-actions">
                  <button
                    className={`icon-btn confirm ${isAllRead ? 'is-complete' : ''}`}
                    type="button"
                    title={isAllRead ? 'All notifications are read' : 'Mark all as read'}
                    aria-label={isAllRead ? 'All notifications are read' : 'Mark all as read'}
                    onClick={handleMarkAllRead}
                  >
                    {isAllRead ? (
                      <svg
                        className="icon mark-all-read-complete-icon"
                        viewBox="0 0 32 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m3 12 4 4 8-9" />
                        <path d="m14 12 4 4 8-9" />
                      </svg>
                    ) : (
                      <svg
                        className="icon"
                        viewBox="0 0 28 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m4 12 4 4 8-9" />
                      </svg>
                    )}
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    title="Notification settings"
                    aria-label="Notification settings"
                    onClick={() => router.push('/settings?section=notifications')}
                  >
                    <svg
                      className="icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* TOOLBAR: TABS AND SEARCH */}
              <div className="toolbar">
                <div className="tabs">
                  <button
                    className={`tab ${currentFilter === 'all' ? 'active' : ''}`}
                    data-filter="all"
                    type="button"
                    onClick={() => setCurrentFilter('all')}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    className={`tab ${currentFilter === 'booking' ? 'active' : ''}`}
                    data-filter="booking"
                    type="button"
                    onClick={() => setCurrentFilter('booking')}
                  >
                    Bookings ({bookingCount})
                  </button>
                </div>
                <div className="toolbar-search">
                  <svg
                    className="icon-sm"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search notifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* ERROR STATE */}
              {errorMessage && (
                <div className="section">
                  <div className="card-list">
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--red, #C41E3A)' }}>
                      {errorMessage}
                    </div>
                  </div>
                </div>
              )}

              {/* EMPTY STATE */}
              {!errorMessage && filteredNotifications.length === 0 && (
                <div className="section">
                  <div className="card-list">
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {searchQuery.trim().length > 0 ? 'No notifications found' : 'Nothing here yet.'}
                    </div>
                  </div>
                </div>
              )}

              {/* GROUPED NOTIFICATION SECTIONS: TODAY, YESTERDAY, OLDER */}
              {!errorMessage &&
                (['Today', 'Yesterday', 'Older'] as const).map((groupKey) => {
                  const items = groupedNotifications[groupKey];
                  if (!items || items.length === 0) return null;

                  return (
                    <div className="section" key={groupKey}>
                      <p className="section-title">{groupKey}</p>
                      <div className="card-list">
                        {items.map((notification) => {
                          const details = detailsFor(notification.type);
                          const title = notification.title || details.title;
                          const target = notificationTarget(notification, userRole);

                          return (
                            <div
                              key={notification.id}
                              className={`notif-card ${notification.read ? '' : 'unread'}`}
                              data-notification-id={notification.id}
                              onClick={() => handleNotificationClick(notification)}
                              style={{ cursor: target ? 'pointer' : 'default' }}
                            >
                              <div className={`notif-icon ${details.tint}`}>
                                {renderIcon(details.iconKind)}
                              </div>
                              <div className="notif-body">
                                <div className="notif-top">
                                  <span className="notif-title">{title}</span>
                                  <span className={`tag ${details.category}`}>{details.tag}</span>
                                </div>
                                <p className="notif-desc">{notification.message || title}</p>
                                <div className="notif-actions" data-actions>
                                  {target && (
                                    <button
                                      className="action-btn primary"
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleNotificationClick(notification);
                                      }}
                                    >
                                      Open
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="notif-meta">
                                <span className="notif-time">{timeAgo(notification.created_at)}</span>
                                {!notification.read && <span className="dot"></span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        :root {
          --black: #14141a;
          --white: #ffffff;
          --red: #C41E3A;
          --red-soft: #FBE9EC;
          --red-soft-2: #F6D3D8;
          --grey-bg: #F6F6F7;
          --border: #EAEAEC;
          --text: #17171C;
          --text-muted: #6E6E76;
          --ink: #0F1419;
          --muted: #536471;
          --green: #1B8A5A;
          --green-soft: #E7F7EE;
          --amber: #B45309;
          --amber-soft: #FFF4E1;
          --radius-lg: 16px;
          --radius-md: 12px;
          --radius-sm: 8px;
          --shadow-card: 0 1px 2px rgba(20, 20, 26, 0.04);
        }
        [data-theme="dark"] {
          --grey-bg: #000000;
          --white: #000000;
          --text: #E7E9EA;
          --text-muted: #71767b;
          --ink: #FFFFFF;
          --muted: #71767b;
          --border: rgba(255, 255, 255, 0.12);
          --red-soft: rgba(196, 30, 58, 0.15);
          --red-soft-2: rgba(196, 30, 58, 0.22);
          --green-soft: rgba(30, 107, 60, 0.15);
          --amber-soft: rgba(180, 83, 9, 0.15);
          --shadow-card: none;
        }

        .notifications-page-main {
          flex: 1;
          min-width: 0;
          width: 100%;
          min-height: 100vh;
          overflow-y: auto;
          background: var(--grey-bg);
          color: var(--text);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .client-layout-active .notifications-page-main,
        .host-layout-active .notifications-page-main {
          min-height: 100%;
          height: auto;
          overflow-y: visible;
        }

        .main-inner {
          max-width: 980px;
          margin: 0 auto;
          padding: 28px 32px 60px;
        }

        .icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }
        .icon-sm {
          width: 15px;
          height: 15px;
          flex-shrink: 0;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .page-header h1 {
          font-size: 26px;
          font-weight: 800;
          margin: 0 0 4px;
          letter-spacing: -0.02em;
        }
        .page-header p {
          margin: 0;
          color: var(--text-muted);
          font-size: 14px;
        }
        .header-actions {
          display: flex;
          gap: 8px;
        }
        .icon-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--white);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text);
          transition: background 0.12s ease;
        }
        .icon-btn:hover {
          background: var(--grey-bg);
        }
        .icon-btn.confirm svg {
          color: var(--red);
        }
        .icon-btn.confirm.is-complete {
          color: #2EAF65;
        }
        .icon-btn.confirm.is-complete:hover {
          color: #39C878;
        }

        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
          flex-wrap: wrap;
          gap: 10px;
        }
        .tabs {
          display: flex;
          gap: 6px;
          background: var(--white);
          padding: 4px;
          border-radius: 11px;
          border: 1px solid var(--border);
        }
        .tab {
          padding: 7px 14px;
          border-radius: 8px;
          border: none;
          background: transparent;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
        }
        .tab.active {
          background: var(--black);
          color: var(--white);
        }
        [data-theme="dark"] .tab.active {
          background: #EFF3F4;
          color: #0F1419;
        }

        .toolbar-search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 8px 12px;
          min-width: 220px;
        }
        .toolbar-search input {
          border: none;
          outline: none;
          background: transparent;
          font-size: 13.5px;
          width: 100%;
          color: var(--text);
        }
        .toolbar-search svg {
          color: var(--text-muted);
        }

        .section {
          margin-bottom: 26px;
        }
        .section-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-muted);
          margin: 0 0 10px;
          padding-left: 2px;
        }

        .card-list {
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .notif-card {
          display: flex;
          gap: 14px;
          padding: 16px 18px;
          border-bottom: 1px solid var(--border);
          transition: background 0.12s ease;
        }
        .notif-card:last-child {
          border-bottom: none;
        }
        .notif-card:hover {
          background: #FCFCFD;
        }
        [data-theme="dark"] .notif-card:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .notif-icon {
          width: 42px;
          height: 42px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .notif-icon.tint-red {
          background: var(--red-soft);
          color: var(--red);
        }
        .notif-icon.tint-green {
          background: var(--green-soft);
          color: var(--green);
        }
        .notif-icon.tint-amber {
          background: var(--amber-soft);
          color: var(--amber);
        }
        .notif-icon.tint-black {
          background: #F0F0F1;
          color: var(--black);
        }
        [data-theme="dark"] .notif-icon.tint-black {
          background: rgba(255, 255, 255, 0.1);
          color: #E7E9EA;
        }

        .notif-body {
          flex: 1;
          min-width: 0;
        }
        .notif-top {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .notif-title {
          font-size: 14.5px;
          font-weight: 700;
        }
        .tag {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 100px;
          letter-spacing: 0.01em;
        }
        .tag.booking {
          background: var(--red-soft);
          color: var(--red);
        }
        .tag.payment {
          background: var(--green-soft);
          color: var(--green);
        }
        .tag.alert {
          background: var(--red-soft-2);
          color: var(--red);
        }
        .tag.reminder {
          background: var(--amber-soft);
          color: var(--amber);
        }
        .tag.review {
          background: #F0F0F1;
          color: var(--black);
        }
        [data-theme="dark"] .tag.review {
          background: rgba(255, 255, 255, 0.1);
          color: #E7E9EA;
        }

        .notif-desc {
          font-size: 13.5px;
          color: var(--text-muted);
          margin: 4px 0 0;
          line-height: 1.5;
        }
        .notif-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .action-btn {
          font-size: 12.5px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--white);
          cursor: pointer;
          color: var(--text);
        }
        .action-btn:hover {
          background: var(--grey-bg);
        }
        .action-btn.primary {
          background: var(--black);
          color: var(--white);
          border-color: var(--black);
        }
        .action-btn.primary:hover {
          background: #000;
        }
        [data-theme="dark"] .action-btn.primary {
          background: #EFF3F4;
          color: #0F1419;
          border-color: #EFF3F4;
        }
        [data-theme="dark"] .action-btn.primary:hover {
          background: #D7DBDC;
        }

        .notif-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          flex-shrink: 0;
          padding-top: 2px;
        }
        .notif-time {
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--red);
        }

        /* SKELETON STYLES */
        .notification-skeleton-block {
          background: rgba(128, 110, 100, 0.18);
          border-radius: 5px;
          animation: notification-skeleton-shimmer 1.5s ease-in-out infinite;
        }
        @keyframes notification-skeleton-shimmer {
          50% {
            opacity: 0.48;
          }
        }
        .notification-skeleton-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .notification-skeleton-heading {
          width: 220px;
        }
        .notification-skeleton-title {
          height: 27px;
          width: 170px;
          margin-bottom: 8px;
        }
        .notification-skeleton-subtitle {
          height: 14px;
          width: 205px;
        }
        .notification-skeleton-header-actions {
          display: flex;
          gap: 8px;
        }
        .notification-skeleton-header-action {
          width: 38px;
          height: 38px;
          border-radius: 10px;
        }
        .notification-skeleton-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        .notification-skeleton-tabs {
          display: flex;
          gap: 6px;
          padding: 4px;
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 11px;
        }
        .notification-skeleton-tab {
          width: 74px;
          height: 34px;
          border-radius: 8px;
        }
        .notification-skeleton-tab:last-child {
          width: 102px;
        }
        .notification-skeleton-search {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px;
          width: 240px;
          height: 40px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--white);
        }
        .notification-skeleton-search-icon {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .notification-skeleton-search-text {
          width: 120px;
          height: 12px;
        }
        .notification-skeleton-section {
          margin-bottom: 26px;
        }
        .notification-skeleton-section-title {
          height: 14px;
          width: 72px;
          margin: 0 0 10px 2px;
        }
        .notification-skeleton-list {
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          background: var(--white);
        }
        .notification-skeleton-row {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          align-items: start;
          gap: 14px;
          padding: 16px 18px;
          border-bottom: 1px solid var(--border);
        }
        .notification-skeleton-row:last-child {
          border-bottom: 0;
        }
        .notification-skeleton-icon {
          width: 42px;
          height: 42px;
          border-radius: 11px;
        }
        .notification-skeleton-copy {
          min-width: 0;
          padding-top: 1px;
        }
        .notification-skeleton-title-line {
          display: flex;
          gap: 8px;
          width: auto;
          height: 15px;
          margin-bottom: 10px;
          background: transparent;
          animation: none;
        }
        .notification-skeleton-title-line::before,
        .notification-skeleton-title-line::after {
          content: "";
          height: 15px;
          border-radius: 5px;
          background: rgba(128, 110, 100, 0.18);
          animation: notification-skeleton-shimmer 1.5s ease-in-out infinite;
        }
        .notification-skeleton-title-line::before {
          width: 150px;
        }
        .notification-skeleton-title-line::after {
          width: 52px;
          border-radius: 100px;
        }
        .notification-skeleton-description {
          height: 14px;
          width: 78%;
          margin-bottom: 10px;
        }
        .notification-skeleton-actions {
          display: flex;
          gap: 8px;
        }
        .notification-skeleton-button {
          height: 33px;
          width: 76px;
          border-radius: 8px;
        }
        .notification-skeleton-button.short {
          width: 66px;
        }
        .notification-skeleton-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
          padding-top: 4px;
        }
        .notification-skeleton-time {
          height: 12px;
          width: 60px;
        }
        .notification-skeleton-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        [data-theme="dark"] .notification-skeleton-block,
        [data-theme="dark"] .notification-skeleton-title-line::before,
        [data-theme="dark"] .notification-skeleton-title-line::after {
          background: rgba(245, 239, 236, 0.18);
        }

        /* MOBILE RESPONSIVE REFINEMENTS */
        .menu-toggle {
          display: none;
        }

        @media (max-width: 860px) {
          .menu-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: var(--white);
            margin-right: 10px;
            cursor: pointer;
            flex-shrink: 0;
            color: var(--text);
          }
          .page-header {
            align-items: center;
          }
          .page-header-left {
            display: flex;
            align-items: center;
          }
          .main-inner {
            padding: 18px 16px 40px;
          }
          .toolbar-search {
            display: none;
          }
          .notification-skeleton-search {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .page-header h1 {
            font-size: 21px;
          }
          .page-header p {
            font-size: 12.5px;
          }
          .header-actions {
            gap: 6px;
          }
          .icon-btn {
            width: 36px;
            height: 36px;
          }
          .tabs {
            width: 100%;
          }
          .tab {
            flex: 1;
            text-align: center;
          }
          .notif-card {
            flex-wrap: wrap;
            padding: 14px;
          }
          .notif-icon {
            width: 38px;
            height: 38px;
          }
          .notif-meta {
            order: 5;
            width: 100%;
            flex-direction: row;
            align-items: center;
            justify-content: flex-end;
            gap: 6px;
            margin-top: 8px;
            padding-top: 0;
          }
          .notif-meta .dot {
            order: -1;
          }
          .notif-actions {
            flex-direction: column;
          }
          .action-btn {
            width: 100%;
            text-align: center;
            padding: 9px 12px;
          }
          .notification-skeleton-header {
            align-items: center;
          }
          .notification-skeleton-heading {
            width: auto;
            min-width: 0;
          }
          .notification-skeleton-title {
            width: 140px;
          }
          .notification-skeleton-subtitle {
            width: 160px;
          }
          .notification-skeleton-toolbar {
            display: block;
          }
          .notification-skeleton-tabs {
            width: 100%;
            margin-bottom: 10px;
          }
          .notification-skeleton-tab {
            flex: 1;
            width: auto;
          }
          .notification-skeleton-tab:last-child {
            width: auto;
          }
          .notification-skeleton-search {
            display: none;
          }
          .notification-skeleton-row {
            grid-template-columns: 38px minmax(0, 1fr);
            gap: 12px;
            padding: 14px;
          }
          .notification-skeleton-icon {
            width: 38px;
            height: 38px;
          }
          .notification-skeleton-meta {
            grid-column: 2;
            flex-direction: row;
            justify-content: flex-end;
            gap: 6px;
            margin-top: 0;
            padding: 0;
          }
          .notification-skeleton-description {
            width: 95%;
          }
        }
      `}</style>
    </>
  );
}
