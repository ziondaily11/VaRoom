import { NotificationItem, detailsFor, groupForDate, searchableText } from '../notificationsCache';

// Pure view helpers for the Notifications page: tab filter, search, date
// grouping and the header/empty-state copy.

export type NotificationsFilter = 'all' | 'booking' | 'message' | 'other';

/** The tabs, in order. */
export const NOTIFICATION_TABS: Array<{ key: NotificationsFilter; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'booking', label: 'Bookings' }, { key: 'message', label: 'Messages' }, { key: 'other', label: 'Other' },
];

export interface GroupedNotifications {
  Today: NotificationItem[];
  Yesterday: NotificationItem[];
  Older: NotificationItem[];
}

/** Notifications matching the active tab and the (case-insensitive) search query. */
export function filterNotifications(
  notifications: NotificationItem[],
  currentFilter: NotificationsFilter,
  searchQuery: string
): NotificationItem[] {
  const q = searchQuery.trim().toLowerCase();
  return notifications.filter((notification) => {
    const details = detailsFor(notification.type);
    const matchesFilter = currentFilter === 'all' || details.category === currentFilter;
    const matchesSearch = !q || searchableText(notification, details).includes(q);
    return matchesFilter && matchesSearch;
  });
}

/** Splits notifications into Today, Yesterday and Older, keeping their order. */
export function groupNotificationsByDate(notifications: NotificationItem[]): GroupedNotifications {
  const groups: GroupedNotifications = {
    Today: [],
    Yesterday: [],
    Older: [],
  };
  notifications.forEach((notification) => {
    const groupKey = groupForDate(notification.created_at);
    groups[groupKey].push(notification);
  });
  return groups;
}

/** How many notifications each tab holds. */
export function countByTab(notifications: NotificationItem[]): Record<NotificationsFilter, number> {
  const counts: Record<NotificationsFilter, number> = { all: notifications.length, booking: 0, message: 0, other: 0 };
  notifications.forEach((n) => { counts[detailsFor(n.type).category] += 1; });
  return counts;
}

export type NotificationAction = 'read' | 'select' | 'select-all' | 'delete';

/** A notification's menu (right-click, or long-press on phones); icons are the page's sprite ids. */
export function notificationMenuItems(read: boolean): Array<{ action: NotificationAction; icon: string; label: string }> {
  return [
    ...(read ? [] : [{ action: 'read' as const, icon: 'nt-read', label: 'Mark as read' }]),
    { action: 'select', icon: 'nt-select', label: 'Select' },
    { action: 'select-all', icon: 'nt-select-all', label: 'Select all' },
    { action: 'delete', icon: 'nt-trash', label: 'Delete' },
  ];
}

/** Delete asks once, for one notification or many. */
export function deleteNotificationsQuestion(count: number): { title: string; message: string; confirmLabel: string } {
  return count === 1
    ? { title: 'Delete this notification?', message: 'It will be removed from your notifications.', confirmLabel: 'Delete' }
    : { title: `Delete ${count} notifications?`, message: 'They will be removed from your notifications.', confirmLabel: `Delete ${count}` };
}

export function notificationsSubtitle(unreadCount: number): string {
  return unreadCount
    ? `You have ${unreadCount} new notification${unreadCount === 1 ? '' : 's'}`
    : "You're all caught up";
}

/** The empty state: no search match, an empty tab, or nothing at all yet. */
export function emptyNotificationsMessage(searchQuery: string, filter: NotificationsFilter = 'all'): { title: string; text: string } {
  if (searchQuery.trim()) return { title: 'No matches', text: `Nothing matches “${searchQuery.trim()}”. Try other words.` };
  if (filter === 'booking') return { title: 'No booking updates', text: 'Requests, confirmations and cancellations appear here.' };
  if (filter === 'message') return { title: 'No message alerts', text: 'When someone sends you a message, you will see it here.' };
  if (filter === 'other') return { title: 'Nothing else yet', text: 'Reviews, team invitations and account updates appear here.' };
  return { title: "You're all set", text: 'Bookings, messages and reviews will appear here as they happen.' };
}
