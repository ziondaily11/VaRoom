import { NotificationItem, detailsFor, groupForDate, searchableText } from '../notificationsCache';

// Pure view helpers for the Notifications page: tab filter, search, date
// grouping and the header/empty-state copy.

export type NotificationsFilter = 'all' | 'booking';

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
    const matchesFilter =
      currentFilter === 'all' || (currentFilter === 'booking' && details.category === 'booking');
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

/** Count shown on the Bookings tab. */
export function countBookingNotifications(notifications: NotificationItem[]): number {
  return notifications.filter((n) => detailsFor(n.type).category === 'booking').length;
}

export function notificationsSubtitle(unreadCount: number): string {
  return unreadCount
    ? `You have ${unreadCount} new notification${unreadCount === 1 ? '' : 's'}`
    : "You're all caught up";
}

export function emptyNotificationsMessage(searchQuery: string): string {
  return searchQuery.trim().length > 0 ? 'No notifications found' : 'Nothing here yet.';
}
