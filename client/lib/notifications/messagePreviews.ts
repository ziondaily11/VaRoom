import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import type { NotificationItem } from '../notificationsCache';

// Message previews (Chat Settings) on "New message" notifications. Chat
// messages stay encrypted; the server decrypts a preview for its recipient
// only while the setting is on. Previews live in this page's memory and are
// never cached or stored.

const BATCH = 50;

/** The chat message a "New message" notification is about, if any. */
export function notificationMessageId(notification: NotificationItem): string | null {
  if (notification.type !== 'new_message') return null;
  const id = notification.metadata ? notification.metadata.message_id : null;
  return typeof id === 'string' && id ? id : null;
}

interface PreviewResponse {
  enabled?: boolean;
  previews?: Record<string, string>;
}

/** Previews by message id for the notifications shown, fetched once each (50 per request). */
export function useMessagePreviews(userId: string | null, notifications: NotificationItem[], enabled: boolean): Record<string, string> {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const requestedRef = useRef(new Set<string>());
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  // Another account, or the setting changed: start again.
  useEffect(() => {
    requestedRef.current = new Set();
    setPreviews({});
  }, [userId, enabled]);

  useEffect(() => {
    if (!userId || !enabled) return;
    const requested = requestedRef.current;
    const ids = Array.from(new Set(notifications.map(notificationMessageId).filter((id): id is string => Boolean(id) && !requested.has(id as string))));
    if (!ids.length) return;
    ids.forEach((id) => requested.add(id));
    void (async () => {
      for (let index = 0; index < ids.length; index += BATCH) {
        const batch = ids.slice(index, index + BATCH);
        try {
          const result = await apiFetch<PreviewResponse>(`/api/chat/message-previews?ids=${batch.map(encodeURIComponent).join(',')}`);
          if (!activeRef.current || requestedRef.current !== requested) return;
          if (result.enabled === false) return;
          setPreviews((current) => ({ ...current, ...(result.previews || {}) }));
        } catch {
          // Shown without previews; a later visit asks again.
          batch.forEach((id) => requested.delete(id));
        }
      }
    })();
  }, [userId, enabled, notifications]);

  return previews;
}
