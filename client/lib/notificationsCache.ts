import { createCache } from './cache/createCache';
import { CACHE_NAMESPACES } from './cache/namespaces';

export interface NotificationItem {
  id: string;
  title?: string | null;
  message?: string | null;
  type: string;
  read: boolean;
  created_at: string;
  booking_id?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  metadata?: Record<string, any> | null;
}

export interface CachedNotificationsResult {
  items: NotificationItem[];
  unreadCount: number;
  isFresh: boolean;
  age: number;
}

export interface NotificationDetails {
  category: 'booking' | 'other';
  title: string;
  tint: string;
  tag: string;
  iconKind: 'approved' | 'declined' | 'request';
}

// Notifications are mutable and event-driven; 30 seconds fresh TTL
export const NOTIFICATIONS_CACHE_TTL_MS = 30 * 1000;

interface NotificationsSnapshot {
  items: NotificationItem[];
  unreadCount: number;
}

// One entry per account (keyed by user id), cleared on sign-out.
const cache = createCache<NotificationsSnapshot>({
  namespace: CACHE_NAMESPACES.notifications,
  ttlMs: NOTIFICATIONS_CACHE_TTL_MS,
  maxEntries: 5,
  userScoped: true,
  validate: (value) => Boolean(value && Array.isArray((value as NotificationsSnapshot).items)),
});

function unreadOf(items: NotificationItem[]): number {
  return items.filter((item) => !item.read).length;
}

export function getCachedNotifications(currentUserId: string): CachedNotificationsResult | null {
  if (!currentUserId) return null;
  const cached = cache.read(currentUserId);
  if (!cached) return null;
  const { items, unreadCount } = cached.value;
  return {
    items,
    unreadCount: typeof unreadCount === 'number' ? unreadCount : unreadOf(items),
    isFresh: cached.isFresh,
    age: cached.age,
  };
}

export function setCachedNotifications(
  items: NotificationItem[],
  currentUserId: string,
  unreadCount?: number
): void {
  if (!currentUserId) return;
  cache.write(currentUserId, { items, unreadCount: typeof unreadCount === 'number' ? unreadCount : unreadOf(items) });
}

export function markCachedNotificationRead(
  notificationId: string,
  currentUserId: string
): { items: NotificationItem[]; unreadCount: number } | null {
  const cached = getCachedNotifications(currentUserId);
  if (!cached) return null;

  let changed = false;
  const updatedItems = cached.items.map((item) => {
    if (item.id === notificationId && !item.read) {
      changed = true;
      return { ...item, read: true };
    }
    return item;
  });
  if (!changed) return { items: updatedItems, unreadCount: cached.unreadCount };

  const nextUnread = Math.max(0, cached.unreadCount - 1);
  setCachedNotifications(updatedItems, currentUserId, nextUnread);
  return { items: updatedItems, unreadCount: nextUnread };
}

export function markAllCachedNotificationsRead(
  currentUserId: string
): { items: NotificationItem[]; unreadCount: number } | null {
  const cached = getCachedNotifications(currentUserId);
  if (!cached) return null;
  const updatedItems = cached.items.map((item) => ({ ...item, read: true }));
  setCachedNotifications(updatedItems, currentUserId, 0);
  return { items: updatedItems, unreadCount: 0 };
}

export function clearNotificationsCache(userId?: string): void {
  if (userId) cache.remove(userId);
  else cache.clear();
}

export function detailsFor(type: string): NotificationDetails {
  if (type === 'booking_approved') {
    return { category: 'booking', title: 'Booking Confirmed', tint: 'tint-green', tag: 'Booking', iconKind: 'approved' };
  }
  if (type === 'booking_declined') {
    return { category: 'booking', title: 'Booking Declined', tint: 'tint-red', tag: 'Booking', iconKind: 'declined' };
  }
  if (type === 'booking_cancelled') {
    return { category: 'booking', title: 'Booking Cancelled', tint: 'tint-red', tag: 'Booking', iconKind: 'declined' };
  }
  if (type === 'booking_request') {
    return { category: 'booking', title: 'New Booking Request', tint: 'tint-red', tag: 'Booking', iconKind: 'request' };
  }
  if (type === 'new_message') {
    return { category: 'other', title: 'New message', tint: 'tint-amber', tag: 'Message', iconKind: 'request' };
  }
  if (type === 'new_review' || type === 'review_published') {
    return {
      category: 'other',
      title: type === 'new_review' ? 'New review' : 'Review published',
      tint: 'tint-green',
      tag: 'Review',
      iconKind: 'approved',
    };
  }
  return { category: 'other', title: 'Notification', tint: 'tint-black', tag: 'Update', iconKind: 'request' };
}

export function notificationTarget(notification: NotificationItem, role: 'host' | 'client'): string | null {
  const bookingId = notification.related_entity_id || notification.booking_id;
  if (
    role === 'host' &&
    (notification.related_entity_type === 'booking' || notification.booking_id) &&
    bookingId
  ) {
    return `/bookings?booking=${encodeURIComponent(bookingId)}`;
  }
  if (notification.related_entity_type === 'conversation' && notification.related_entity_id) {
    return `/chats?c=${encodeURIComponent(notification.related_entity_id)}`;
  }
  if (notification.related_entity_type === 'review' && notification.related_entity_id) {
    return '/profile';
  }
  if (
    (notification.related_entity_type === 'booking' || notification.booking_id) &&
    bookingId
  ) {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1321px)').matches) {
      return `/bookings?booking=${encodeURIComponent(bookingId)}`;
    }
    return `/booking-approved?id=${encodeURIComponent(bookingId)}`;
  }
  return null;
}

export function groupForDate(value: string): 'Today' | 'Yesterday' | 'Older' {
  const date = new Date(value);
  const now = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return 'Older';
}

export function timeAgo(value: string): string {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function searchableText(notification: NotificationItem, details: NotificationDetails): string {
  const metadata = notification.metadata && typeof notification.metadata === 'object' ? notification.metadata : {};
  return [
    notification.title,
    notification.message,
    notification.type,
    details.title,
    details.tag,
    metadata.booking_name,
    metadata.booking_reference,
    metadata.listing_name,
    metadata.property_name,
    metadata.guest_name,
    ...Object.keys(metadata).map((key) => metadata[key]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
