import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { notificationMessageId, useMessagePreviews } from '../lib/notifications/messagePreviews';
import { useProfileChatSettings } from '../components/chat/useProfileChatSettings';
import {
  NotificationItem,
  getCachedNotifications,
  setCachedNotifications,
  detailsFor,
  notificationTarget,
  timeAgo,
} from '../lib/notificationsCache';
import {
  fetchNotificationsSnapshot,
  markAllNotificationsReadRequest,
  markAllReadLocally,
  markNotificationReadRequest,
  markReadLocally,
  restoreNotificationsSnapshot,
  subscribeToNotificationChanges,
  syncSidebarUnreadCount,
} from '../lib/notifications/notificationsData';
import {
  NOTIFICATION_TABS,
  NotificationsFilter,
  countByTab,
  emptyNotificationsMessage,
  filterNotifications,
  groupNotificationsByDate,
  notificationsSubtitle,
} from '../lib/notifications/notificationsView';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { NOTIFICATIONS_STYLES } from '../components/notifications/notificationsStyles';
import {
  AlertIcon,
  ChevronIcon,
  ClearIcon,
  MarkAllIcon,
  MenuIcon,
  NotificationKindIcon,
  SearchIcon,
  SettingsIcon,
} from '../components/notifications/NotificationIcons';

/** How long the first-load row reveal runs before new rows stop animating. */
const REVEAL_MS = 700;

export default function NotificationsPage() {
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentFilter, setCurrentFilter] = useState<NotificationsFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // A failed load replaces the list; a failed action shows a banner above it.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<boolean>(false);
  // Rows rise in only when the list first arrives from the network.
  const [revealing, setRevealing] = useState<boolean>(false);
  // The double tick draws in only right after "Mark all as read", not on every visit.
  const [justMarkedAll, setJustMarkedAll] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<'host' | 'client'>('client');
  const [userId, setUserId] = useState<string | null>(null);

  const requestVersionRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);

  // Opens the shell's mobile drawer. Only the role's own sidebar listens to
  // its event; the button has no #menu-toggle id, so the shell's document
  // click handler does not toggle the drawer a second time.
  const handleOpenMobileSidebar = () => {
    window.dispatchEvent(new Event(userRole === 'host' ? 'open-host-sidebar' : 'open-client-sidebar'));
  };

  // Fetch notifications from Supabase
  const fetchNotifications = useCallback(
    async (currentUserId: string, client: SupabaseClient, isBackground = false) => {
      const version = ++requestVersionRef.current;

      try {
        const result = await fetchNotificationsSnapshot(client, currentUserId);

        if (version !== requestVersionRef.current || !mountedRef.current) return;

        if (result.error) {
          console.error('Unable to load notifications:', result.error);
          if (!isBackground) {
            setErrorMessage('We could not load your notifications. Check your connection and try again.');
            setLoading(false);
          }
          return;
        }

        const { items, unreadCount: nextUnread } = result;

        setNotifications(items);
        setUnreadCount(nextUnread);
        setErrorMessage(null);
        setLoading(false);
        if (!isBackground) setRevealing(true);

        setCachedNotifications(items, currentUserId, nextUnread);
        syncSidebarUnreadCount(nextUnread);
      } catch (err) {
        if (version !== requestVersionRef.current || !mountedRef.current) return;
        console.error('Notification fetch error:', err);
        if (!isBackground) {
          setErrorMessage('We could not load your notifications. Check your connection and try again.');
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

    const next = markReadLocally(notifications, unreadCount, notification.id, userId);
    setNotifications(next.items);
    setUnreadCount(next.unreadCount);
    syncSidebarUnreadCount(next.unreadCount);

    const client = clientRef.current || getSupabaseClient();
    if (!client) return;

    try {
      const result = await markNotificationReadRequest(client, notification.id, userId);

      if (result.error) {
        console.error('Unable to mark notification as read:', result.error);
        // Roll back optimistic state on failure
        setNotifications(prevItems);
        setUnreadCount(prevUnread);
        restoreNotificationsSnapshot(prevItems, userId, prevUnread);
      }
    } catch (e) {
      console.error('Error marking notification read:', e);
      setNotifications(prevItems);
      setUnreadCount(prevUnread);
      restoreNotificationsSnapshot(prevItems, userId, prevUnread);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    if (!userId || unreadCount === 0) return;

    const prevItems = notifications;
    const prevUnread = unreadCount;
    setActionError(null);
    setJustMarkedAll(true);

    // Optimistically update
    const next = markAllReadLocally(notifications, userId);
    setNotifications(next.items);
    setUnreadCount(0);
    syncSidebarUnreadCount(0);

    const client = clientRef.current || getSupabaseClient();
    if (!client) return;

    try {
      const result = await markAllNotificationsReadRequest(client, userId);

      if (result.error) {
        console.error('Unable to mark all notifications read:', result.error);
        setActionError('Unable to update notifications. Please try again.');
        // Rollback
        setNotifications(prevItems);
        setUnreadCount(prevUnread);
        restoreNotificationsSnapshot(prevItems, userId, prevUnread);
      }
    } catch (e) {
      console.error('Error marking all notifications read:', e);
      setActionError('Unable to update notifications. Please try again.');
      setNotifications(prevItems);
      setUnreadCount(prevUnread);
      restoreNotificationsSnapshot(prevItems, userId, prevUnread);
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

  // Identity comes from AuthProvider: cached notifications render only for the
  // verified signed-in user, never for an id read from browser storage.
  const auth = useAuth();
  const authUserId = auth.user?.id || null;
  const profileRole = accountRole(auth.profile);
  // Message previews (Chat Settings): the text of "New message" notifications.
  const chatPrefs = useProfileChatSettings(authUserId);
  const messagePreviews = useMessagePreviews(authUserId, notifications, chatPrefs ? chatPrefs.messagePreviews : false);

  useEffect(() => {
    if (profileRole) setUserRole(profileRole);
  }, [profileRole]);

  // Cache check and realtime setup for the signed-in user
  useEffect(() => {
    if (auth.status === 'loading') return undefined;
    if (auth.status === 'signed-out' || !authUserId) {
      router.push(loginUrl('/notifications'));
      return undefined;
    }

    const client = getSupabaseClient();
    if (!client) return undefined;
    mountedRef.current = true;
    clientRef.current = client;
    setUserId(authUserId);

    // 1. Check cache for instant rendering
    const cached = getCachedNotifications(authUserId);
    if (cached && cached.items) {
      setNotifications(cached.items);
      setUnreadCount(cached.unreadCount);
      setLoading(false);
      syncSidebarUnreadCount(cached.unreadCount);

      // Background refresh if cache is stale
      if (!cached.isFresh) {
        void fetchNotifications(authUserId, client, true);
      }
    } else {
      setLoading(true);
      void fetchNotifications(authUserId, client, false);
    }

    // 2. Set up page-owned Realtime channel
    const pageChannel = subscribeToNotificationChanges(client, authUserId, () => {
      void fetchNotifications(authUserId, client, true);
    });
    realtimeChannelRef.current = pageChannel;

    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;

      // Clean up ONLY the page-owned realtime channel
      if (realtimeChannelRef.current) {
        try {
          client.removeChannel(realtimeChannelRef.current);
        } catch (e) {}
        realtimeChannelRef.current = null;
      }
    };
  }, [auth.status, authUserId, fetchNotifications, router]);

  // Compute filtered notifications
  const filteredNotifications = useMemo(
    () => filterNotifications(notifications, currentFilter, searchQuery),
    [notifications, currentFilter, searchQuery]
  );

  // Group notifications into Today, Yesterday, Older
  const groupedNotifications = useMemo(
    () => groupNotificationsByDate(filteredNotifications),
    [filteredNotifications]
  );

  const tabCounts = useMemo(() => countByTab(notifications), [notifications]);

  // The reveal plays once; rows that arrive later (realtime) appear at once.
  useEffect(() => {
    if (!revealing) return undefined;
    const timer = window.setTimeout(() => setRevealing(false), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealing]);

  const retryLoad = async () => {
    const client = clientRef.current || getSupabaseClient();
    if (!userId || !client || retrying) return;
    setRetrying(true);
    await fetchNotifications(userId, client, false);
    if (mountedRef.current) setRetrying(false);
  };

  // While a load has failed, the header must not claim "all caught up".
  const loadFailed = Boolean(errorMessage);
  const subtitleText = loadFailed ? 'Notifications could not load' : notificationsSubtitle(unreadCount);
  const isAllRead = !loadFailed && unreadCount === 0;
  const empty = emptyNotificationsMessage(searchQuery, currentFilter);
  let rowIndex = 0;

  return (
    <>
      <Head>
        <title>Notifications · VaRoom</title>
      </Head>
      <style dangerouslySetInnerHTML={{ __html: NOTIFICATIONS_STYLES }} />

      <div className="notifications-page">
        <div className="main-inner">
          {loading ? (
            <div className="notifications-skeleton" role="status" aria-label="Loading notifications">
              <div className="sk-header">
                <div>
                  <span className="sk sk-title" />
                  <span className="sk sk-sub" />
                </div>
                <div className="sk-actions">
                  <span className="sk sk-circle" />
                  <span className="sk sk-circle" />
                </div>
              </div>
              <div className="sk-toolbar">
                <span className="sk sk-tabs" />
                <span className="sk sk-search" />
              </div>
              <span className="sk sk-label" />
              <div className="notif-group">
                {[0, 1, 2].map((key) => (
                  <div className="sk-row" key={key}>
                    <span className="sk sk-icon" />
                    <div className="sk-lines">
                      <span className="sk sk-line1" />
                      <span className="sk sk-line2" />
                    </div>
                    <span className="sk sk-time" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`notifications-content${revealing ? ' is-revealing' : ''}`}>
              <header className="page-header">
                <div className="page-header-left">
                  <button className="notif-menu-btn" type="button" onClick={handleOpenMobileSidebar} aria-label="Open menu">
                    <MenuIcon />
                  </button>
                  <div>
                    <h1>Notifications</h1>
                    <p id="notif-subtitle" aria-live="polite">{subtitleText}</p>
                  </div>
                </div>
                <div className="header-actions">
                  <button
                    className={`notif-btn mark-all${isAllRead ? ' is-complete' : ''}`}
                    type="button"
                    title={isAllRead ? 'All notifications are read' : 'Mark all as read'}
                    aria-label={isAllRead ? 'All notifications are read' : 'Mark all as read'}
                    disabled={isAllRead || loadFailed}
                    onClick={handleMarkAllRead}
                  >
                    <MarkAllIcon done={isAllRead} animate={justMarkedAll} />
                  </button>
                  <button
                    className="notif-btn"
                    type="button"
                    title="Notification settings"
                    aria-label="Notification settings"
                    onClick={() => router.push('/settings?section=notifications')}
                  >
                    <SettingsIcon />
                  </button>
                </div>
              </header>

              <div className="toolbar">
                <SegmentedTabs label="Notification types" activeKey={currentFilter}>
                  {NOTIFICATION_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={currentFilter === tab.key}
                      aria-controls="notif-list"
                      data-filter={tab.key}
                      onClick={() => setCurrentFilter(tab.key)}
                    >
                      {tab.label} <span className="vr-seg-count">{tabCounts[tab.key]}</span>
                    </button>
                  ))}
                </SegmentedTabs>
                <div className="notif-search" role="search">
                  <SearchIcon />
                  <input
                    type="search"
                    placeholder="Search notifications"
                    aria-label="Search notifications"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery(''); }}
                  />
                  {searchQuery && (
                    <button type="button" className="notif-search-clear" aria-label="Clear search" onClick={() => setSearchQuery('')}>
                      <ClearIcon />
                    </button>
                  )}
                </div>
              </div>

              {actionError && (
                <div className="notif-banner" role="alert">
                  <AlertIcon />
                  <span>{actionError}</span>
                  <button type="button" onClick={() => setActionError(null)}>Dismiss</button>
                </div>
              )}

              <div id="notif-list">
                {errorMessage ? (
                  <div className="notif-state is-error" role="alert">
                    <span className="notif-state-badge"><AlertIcon /></span>
                    <h2>Something went wrong</h2>
                    <p>{errorMessage}</p>
                    <div className="notif-state-actions">
                      <button type="button" className="pill-btn primary" onClick={retryLoad} disabled={retrying}>
                        {retrying ? 'Trying again…' : 'Try again'}
                      </button>
                    </div>
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="notif-state">
                    <span className="notif-state-badge"><NotificationKindIcon kind="update" /></span>
                    <h2>{empty.title}</h2>
                    <p>{empty.text}</p>
                    <div className="notif-state-actions">
                      {searchQuery.trim() ? (
                        <button type="button" className="pill-btn" onClick={() => setSearchQuery('')}>Clear search</button>
                      ) : (
                        <Link href="/settings?section=notifications" className="pill-btn">Notification settings</Link>
                      )}
                    </div>
                  </div>
                ) : (
                  (['Today', 'Yesterday', 'Older'] as const).map((groupKey) => {
                    const items = groupedNotifications[groupKey];
                    if (!items || items.length === 0) return null;
                    const headingId = `notif-group-${groupKey.toLowerCase()}`;

                    return (
                      <section className="notif-section" key={groupKey} aria-labelledby={headingId}>
                        <h2 className="notif-section-title" id={headingId}>{groupKey}</h2>
                        <ul className="notif-group">
                          {items.map((notification) => {
                            const details = detailsFor(notification.type);
                            const title = notification.title || details.title;
                            const target = notificationTarget(notification, userRole);
                            const messageId = notificationMessageId(notification);
                            const preview = messageId ? messagePreviews[messageId] : null;
                            const index = Math.min(rowIndex++, 10);

                            return (
                              <li key={notification.id} style={{ '--i': index } as React.CSSProperties}>
                                <button
                                  type="button"
                                  className={`notif-row${notification.read ? '' : ' is-unread'}`}
                                  data-notification-id={notification.id}
                                  onClick={() => handleNotificationClick(notification)}
                                >
                                  <span className={`notif-badge ${details.tint}`}>
                                    <NotificationKindIcon kind={details.iconKind} />
                                  </span>
                                  <span className="notif-body">
                                    <span className="notif-top">
                                      <span className="notif-title">{title}</span>
                                      <span className="notif-tag">{details.tag}</span>
                                    </span>
                                    <span className="notif-desc">{notification.message || title}</span>
                                    {preview && <span className="notif-preview">“{preview}”</span>}
                                  </span>
                                  <span className="notif-meta">
                                    <span className="notif-time">{timeAgo(notification.created_at)}</span>
                                    <span className="notif-meta-row">
                                      <span className={`notif-dot${notification.read ? ' is-read' : ''}`} aria-hidden="true" />
                                      {target && <ChevronIcon />}
                                    </span>
                                  </span>
                                  {!notification.read && <span className="sr-only">Unread.</span>}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
