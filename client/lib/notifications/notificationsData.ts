import type { PostgrestError, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  NotificationItem,
  markAllCachedNotificationsRead,
  markCachedNotificationRead,
  setCachedNotifications,
} from '../notificationsCache';

// Data access for the Notifications page: its Supabase queries, its own
// realtime channel and the unread-count event the shared counts store
// (lib/counts/CountsBridge) listens for.

export const NOTIFICATION_COLUMNS =
  'id,title,message,type,read,created_at,booking_id,related_entity_type,related_entity_id,metadata';

export type NotificationsSnapshotResult =
  | { error: PostgrestError; items?: undefined; unreadCount?: undefined }
  | { error?: undefined; items: NotificationItem[]; unreadCount: number };

export interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
}

/** Tells the sidebars (through the shared counts store) the exact unread count. */
export function syncSidebarUnreadCount(count: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('varoom_notification_count', { detail: { count } }));
  } catch (e) {}
}

/**
 * The latest 100 notifications and the exact unread count for one recipient.
 * When the count query returns no count, unread items in the list are counted.
 */
export async function fetchNotificationsSnapshot(
  client: SupabaseClient,
  currentUserId: string
): Promise<NotificationsSnapshotResult> {
  const [listResult, countResult] = await Promise.all([
    client
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('recipient_user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', currentUserId)
      .eq('read', false),
  ]);

  if (listResult.error) return { error: listResult.error };

  const items: NotificationItem[] = listResult.data || [];
  const unreadCount: number = typeof countResult.count === 'number'
    ? countResult.count
    : items.filter((n) => !n.read).length;
  return { items, unreadCount };
}

export function markNotificationReadRequest(client: SupabaseClient, notificationId: string, userId: string) {
  return client
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('recipient_user_id', userId);
}

export function markAllNotificationsReadRequest(client: SupabaseClient, userId: string) {
  return client
    .from('notifications')
    .update({ read: true })
    .eq('recipient_user_id', userId)
    .eq('read', false);
}

/** Optimistic state after opening one notification (cache first, else in memory). */
export function markReadLocally(
  items: NotificationItem[],
  unreadCount: number,
  notificationId: string,
  userId: string
): NotificationsState {
  const cacheResult = markCachedNotificationRead(notificationId, userId);
  if (cacheResult) return cacheResult;
  return {
    items: items.map((item) => (item.id === notificationId ? { ...item, read: true } : item)),
    unreadCount: Math.max(0, unreadCount - 1),
  };
}

/** Optimistic state after "Mark all as read". */
export function markAllReadLocally(items: NotificationItem[], userId: string): NotificationsState {
  const cacheResult = markAllCachedNotificationsRead(userId);
  if (cacheResult) return { items: cacheResult.items, unreadCount: 0 };
  return { items: items.map((n) => ({ ...n, read: true })), unreadCount: 0 };
}

/** Puts the cache and the sidebar badge back after a failed write. */
export function restoreNotificationsSnapshot(items: NotificationItem[], userId: string, unreadCount: number): void {
  setCachedNotifications(items, userId, unreadCount);
  syncSidebarUnreadCount(unreadCount);
}

/**
 * The page's own realtime channel for the recipient's notification rows. The
 * caller removes only this channel; the shared counts channel stays.
 */
export function subscribeToNotificationChanges(
  client: SupabaseClient,
  userId: string,
  onChange: () => void
): RealtimeChannel {
  return client
    .channel(`notifications-page-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${userId}`,
      },
      onChange
    )
    .subscribe();
}
