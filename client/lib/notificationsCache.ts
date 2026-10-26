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

const CACHE_KEY_PREFIX = 'varoom_notifications_cache_v1_';
// Notifications are mutable and event-driven; 30 seconds fresh TTL
export const NOTIFICATIONS_CACHE_TTL_MS = 30 * 1000;

interface InMemoryStore {
  items: NotificationItem[] | null;
  unreadCount: number | null;
  timestamp: number;
  userId: string | null;
}

const inMemoryStore: InMemoryStore = {
  items: null,
  unreadCount: null,
  timestamp: 0,
  userId: null,
};

function getStorageSafe(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

export function getCachedNotifications(currentUserId: string): CachedNotificationsResult | null {
  if (!currentUserId) return null;
  const now = Date.now();

  // 1. Check in-memory store (strictly scoped to currentUserId)
  if (inMemoryStore.items && inMemoryStore.userId === currentUserId) {
    const age = now - inMemoryStore.timestamp;
    const computedUnread = inMemoryStore.unreadCount !== null
      ? inMemoryStore.unreadCount
      : inMemoryStore.items.filter((item) => !item.read).length;

    return {
      items: inMemoryStore.items,
      unreadCount: computedUnread,
      isFresh: age < NOTIFICATIONS_CACHE_TTL_MS,
      age,
    };
  }

  // 2. Fall back to sessionStorage (strictly scoped to currentUserId)
  const storage = getStorageSafe();
  if (!storage) return null;

  try {
    const key = `${CACHE_KEY_PREFIX}${currentUserId}`;
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items) && typeof parsed.timestamp === 'number') {
      if (parsed.userId !== currentUserId) {
        return null;
      }
      const age = now - parsed.timestamp;
      const unreadCount = typeof parsed.unreadCount === 'number'
        ? parsed.unreadCount
        : parsed.items.filter((item: NotificationItem) => !item.read).length;

      inMemoryStore.items = parsed.items;
      inMemoryStore.unreadCount = unreadCount;
      inMemoryStore.timestamp = parsed.timestamp;
      inMemoryStore.userId = currentUserId;

      return {
        items: parsed.items,
        unreadCount,
        isFresh: age < NOTIFICATIONS_CACHE_TTL_MS,
        age,
      };
    }
  } catch (error) {
    console.warn('Unable to read notifications cache:', error);
  }

  return null;
}

export function setCachedNotifications(
  items: NotificationItem[],
  currentUserId: string,
  unreadCount?: number
): void {
  if (!currentUserId) return;
  const now = Date.now();
  const calculatedUnread = typeof unreadCount === 'number'
    ? unreadCount
    : items.filter((n) => !n.read).length;

  inMemoryStore.items = items;
  inMemoryStore.unreadCount = calculatedUnread;
  inMemoryStore.timestamp = now;
  inMemoryStore.userId = currentUserId;

  const storage = getStorageSafe();
  if (!storage) return;

  try {
    const key = `${CACHE_KEY_PREFIX}${currentUserId}`;
    storage.setItem(
      key,
      JSON.stringify({
        items,
        unreadCount: calculatedUnread,
        timestamp: now,
        userId: currentUserId,
      })
    );
  } catch (error) {
    console.warn('Unable to write notifications cache:', error);
  }
}

export function markCachedNotificationRead(
  notificationId: string,
  currentUserId: string
): { items: NotificationItem[]; unreadCount: number } | null {
  if (!currentUserId) return null;
  let items = inMemoryStore.items;
  let unreadCount = inMemoryStore.unreadCount;

  if (!items || inMemoryStore.userId !== currentUserId) {
    const cached = getCachedNotifications(currentUserId);
    if (!cached) return null;
    items = cached.items;
    unreadCount = cached.unreadCount;
  }

  let changed = false;
  const updatedItems = items.map((item) => {
    if (item.id === notificationId && !item.read) {
      changed = true;
      return { ...item, read: true };
    }
    return item;
  });

  if (!changed) {
    return {
      items: updatedItems,
      unreadCount: typeof unreadCount === 'number' ? unreadCount : 0,
    };
  }

  const nextUnread = typeof unreadCount === 'number' ? Math.max(0, unreadCount - 1) : updatedItems.filter((i) => !i.read).length;
  setCachedNotifications(updatedItems, currentUserId, nextUnread);

  return { items: updatedItems, unreadCount: nextUnread };
}

export function markAllCachedNotificationsRead(
  currentUserId: string
): { items: NotificationItem[]; unreadCount: number } | null {
  if (!currentUserId) return null;
  let items = inMemoryStore.items;

  if (!items || inMemoryStore.userId !== currentUserId) {
    const cached = getCachedNotifications(currentUserId);
    if (!cached) return null;
    items = cached.items;
  }

  const updatedItems = items.map((item) => ({ ...item, read: true }));
  setCachedNotifications(updatedItems, currentUserId, 0);

  return { items: updatedItems, unreadCount: 0 };
}

export function clearNotificationsCache(userId?: string): void {
  if (!userId || inMemoryStore.userId === userId) {
    inMemoryStore.items = null;
    inMemoryStore.unreadCount = null;
    inMemoryStore.timestamp = 0;
    inMemoryStore.userId = null;
  }

  const storage = getStorageSafe();
  if (storage) {
    try {
      if (userId) {
        storage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
      } else {
        // Clear all notification cache keys
        const keysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith(CACHE_KEY_PREFIX)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => storage.removeItem(k));
      }
    } catch {}
  }
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
