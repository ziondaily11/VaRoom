import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Head from 'next/head';
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
  deleteNotificationsRequest,
  fetchNotificationsSnapshot,
  markAllNotificationsReadRequest,
  markAllReadLocally,
  markNotificationReadRequest,
  markReadLocally,
  removeLocally,
  restoreNotificationsSnapshot,
  subscribeToNotificationChanges,
  syncSidebarUnreadCount,
} from '../lib/notifications/notificationsData';
import {
  NOTIFICATION_TABS,
  NotificationAction,
  NotificationsFilter,
  countByTab,
  deleteNotificationsQuestion,
  emptyNotificationsMessage,
  filterNotifications,
  groupNotificationsByDate,
  notificationMenuItems,
  notificationsSubtitle,
} from '../lib/notifications/notificationsView';
import { toggleSelection } from '../lib/chat/inbox';
import { refreshCounts } from '../lib/counts/CountsBridge';
import { usePresentValue } from '../lib/motion/usePresence';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import MessageActionMenu, { MESSAGE_MENU_EXIT_MS } from '../components/chat/MessageActionMenu';
import ConfirmSheet from '../components/bookings/ConfirmSheet';
import NotificationSettingsPanel from '../components/notifications/NotificationSettingsPanel';
import { NOTIFICATIONS_STYLES } from '../components/notifications/notificationsStyles';
import {
  AlertIcon,
  ChevronIcon,
  ClearIcon,
  MarkAllIcon,
  MenuIcon,
  NotificationKindIcon,
  NotificationSprite,
  SearchIcon,
  SettingsIcon,
  SpriteIcon,
} from '../components/notifications/NotificationIcons';

/** How long the first-load row reveal runs before new rows stop animating. */
const REVEAL_MS = 700;
/** A press this long opens a row's menu on touch screens (as in Chats). */
const LONG_PRESS_MS = 500;

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
  // Notification Settings beside the list (as Chat Settings in Chats); mounted on first open, then kept.
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [settingsMounted, setSettingsMounted] = useState<boolean>(false);
  // A row's menu (right-click, or long-press on phones), and the rows ticked in selection mode (null: not selecting).
  const [menu, setMenu] = useState<{ notification: NotificationItem; x: number; y: number } | null>(null);
  const { shown: shownMenu, closing: menuClosing } = usePresentValue(menu, MESSAGE_MENU_EXIT_MS);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  // Notifications waiting for Delete's confirmation.
  const [pendingDelete, setPendingDelete] = useState<NotificationItem[] | null>(null);

  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  const pressOpenedMenuRef = useRef<boolean>(false);
  const deleteCountRef = useRef<number>(1);
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

  // ---------- Notification Settings panel ----------
  const toggleSettings = () => {
    setSettingsMounted(true);
    setSettingsOpen((open) => !open);
  };
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsBtnRef.current?.focus();
  }, []);

  // ---------- Selection mode and delete ----------
  const selectedItems = selected ? notifications.filter((n) => selected.has(n.id)) : [];
  const allShownSelected = Boolean(selected) && filteredNotifications.every((n) => selected!.has(n.id));
  const selectAllShown = () => setSelected((current) => new Set(Array.from(current || []).concat(filteredNotifications.map((n) => n.id))));

  // Another tab or account: start again. Escape leaves selection mode.
  useEffect(() => { setSelected(null); }, [currentFilter, userId]);
  useEffect(() => {
    if (!selected) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  const cancelDelete = useCallback(() => setPendingDelete(null), []);
  if (pendingDelete) deleteCountRef.current = pendingDelete.length;
  const deleteQuestion = deleteNotificationsQuestion(deleteCountRef.current);

  // Removed at once; the ones the server keeps come back with a note.
  const deleteNotifications = async (doomed: NotificationItem[]) => {
    setPendingDelete(null);
    setSelected(null);
    const client = clientRef.current || getSupabaseClient();
    if (!userId || !client || !doomed.length) return;
    const ids = doomed.map((n) => n.id);
    const before = { items: notifications, unreadCount };
    requestVersionRef.current += 1; // a load already under way would bring them back
    setActionError(null);
    const next = removeLocally(notifications, unreadCount, ids, userId);
    setNotifications(next.items);
    setUnreadCount(next.unreadCount);
    syncSidebarUnreadCount(next.unreadCount);

    let deleted: string[] = [];
    try {
      deleted = await deleteNotificationsRequest(client, ids, userId);
    } catch (e) {
      console.error('Unable to delete notifications:', e);
    }
    // The sidebars' booking count includes unread booking notifications.
    if (deleted.length) refreshCounts();
    if (deleted.length === ids.length) return;
    const restored = removeLocally(before.items, before.unreadCount, deleted, userId);
    setNotifications(restored.items);
    setUnreadCount(restored.unreadCount);
    syncSidebarUnreadCount(restored.unreadCount);
    setActionError(ids.length === 1 ? 'That notification could not be deleted. Please try again.' : 'Some notifications could not be deleted. Please try again.');
  };

  const onMenuAction = (notification: NotificationItem, action: NotificationAction) => {
    setMenu(null);
    if (action === 'read') void handleMarkRead(notification);
    else if (action === 'select') setSelected((current) => new Set(current || []).add(notification.id));
    else if (action === 'select-all') selectAllShown();
    else setPendingDelete([notification]);
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  // Right-click (or the keyboard's menu key) on laptops and desktops; phones use the long-press below.
  const onRowContextMenu = (event: React.MouseEvent<HTMLButtonElement>, notification: NotificationItem) => {
    event.preventDefault();
    if (window.matchMedia('(max-width: 760px)').matches) return;
    let { clientX: x, clientY: y } = event;
    if (!x && !y) {
      const box = event.currentTarget.getBoundingClientRect();
      x = box.left + 24;
      y = box.bottom;
    }
    setMenu({ notification, x, y });
  };
  const cancelPress = () => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };
  useEffect(() => cancelPress, []);
  const onRowTouchStart = (event: React.TouchEvent, notification: NotificationItem) => {
    if (event.touches.length !== 1) return;
    cancelPress();
    pressOpenedMenuRef.current = false;
    const { clientX: x, clientY: y } = event.touches[0];
    const timer = window.setTimeout(() => {
      pressRef.current = null;
      pressOpenedMenuRef.current = true;
      setMenu({ notification, x, y });
    }, LONG_PRESS_MS);
    pressRef.current = { timer, x, y };
  };
  const onRowTouchMove = (event: React.TouchEvent) => {
    const press = pressRef.current;
    const touch = event.touches[0];
    if (press && touch && Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 10) cancelPress();
  };
  // Selecting (or Ctrl/⌘-click) ticks the row; otherwise it opens.
  const onRowClick = (event: React.MouseEvent, notification: NotificationItem) => {
    if (pressOpenedMenuRef.current) {
      pressOpenedMenuRef.current = false;
      return;
    }
    if (selected || event.ctrlKey || event.metaKey) {
      setSelected((current) => toggleSelection(current, notification.id));
      return;
    }
    void handleNotificationClick(notification);
  };

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
        <NotificationSprite />
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
                    ref={settingsBtnRef}
                    className={`notif-btn${settingsOpen ? ' is-active' : ''}`}
                    type="button"
                    title="Notification settings"
                    aria-label="Notification settings"
                    aria-expanded={settingsOpen}
                    onClick={toggleSettings}
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

              {selected && (
                <div className="notif-select-bar" role="toolbar" aria-label="Selected notifications">
                  <button type="button" className="notif-select-cancel" aria-label="Cancel selection" title="Cancel" onClick={() => setSelected(null)}>
                    <SpriteIcon id="nt-close" />
                  </button>
                  <span className="notif-select-count" aria-live="polite">{selectedItems.length} selected</span>
                  <button type="button" className="notif-select-action" disabled={allShownSelected} onClick={selectAllShown}>
                    <SpriteIcon id="nt-select-all" />
                    <span>Select all</span>
                  </button>
                  <button type="button" className="notif-select-action danger" disabled={!selectedItems.length} onClick={() => setPendingDelete(selectedItems)}>
                    <SpriteIcon id="nt-trash" />
                    <span>Delete</span>
                  </button>
                </div>
              )}

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
                        <button type="button" className="pill-btn" onClick={() => { setSettingsMounted(true); setSettingsOpen(true); }}>Notification settings</button>
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
                            const isSelected = Boolean(selected && selected.has(notification.id));

                            return (
                              <li key={notification.id} style={{ '--i': index } as React.CSSProperties}>
                                <button
                                  type="button"
                                  className={`notif-row${notification.read ? '' : ' is-unread'}${isSelected ? ' is-selected' : ''}`}
                                  data-notification-id={notification.id}
                                  role={selected ? 'checkbox' : undefined}
                                  aria-checked={selected ? isSelected : undefined}
                                  onClick={(e) => onRowClick(e, notification)}
                                  onContextMenu={(e) => onRowContextMenu(e, notification)}
                                  onTouchStart={(e) => onRowTouchStart(e, notification)}
                                  onTouchMove={onRowTouchMove}
                                  onTouchEnd={cancelPress}
                                  onTouchCancel={cancelPress}
                                >
                                  <span className={`notif-badge ${details.tint}`}>
                                    <NotificationKindIcon kind={details.iconKind} />
                                    {isSelected && <span className="notif-select-check" aria-hidden="true"><SpriteIcon id="nt-read" /></span>}
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

        {settingsMounted && userId && (
          <NotificationSettingsPanel userId={userId} isHost={userRole === 'host'} open={settingsOpen} onClose={closeSettings} onError={setActionError} />
        )}
        {/* Below 1080px the panel covers the list; a tap outside closes it. */}
        {settingsOpen && <div className="notif-settings-scrim" aria-hidden="true" onClick={closeSettings} />}

        {shownMenu && (
          <MessageActionMenu<NotificationAction>
            x={shownMenu.x}
            y={shownMenu.y}
            closing={menuClosing}
            label="Notification actions"
            items={notificationMenuItems(shownMenu.notification.read)}
            onSelect={(action) => onMenuAction(shownMenu.notification, action)}
            onClose={closeMenu}
          />
        )}
      </div>

      <ConfirmSheet
        open={Boolean(pendingDelete)}
        title={deleteQuestion.title}
        message={deleteQuestion.message}
        confirmLabel={deleteQuestion.confirmLabel}
        cancelLabel="Cancel"
        onConfirm={() => { if (pendingDelete) void deleteNotifications(pendingDelete); }}
        onClose={cancelDelete}
      />
    </>
  );
}
