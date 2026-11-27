import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loadPreferences, NOTIFICATION_ROWS, savePreferences, type NotificationKey } from '../../lib/settings/settings';
import { ChatSettingsStyles, Section, ToggleRow } from '../chat/ChatSettings';

// Notification Settings beside the list, as Chat Settings opens inside Chats:
// the same choices as Settings → Notifications (the profile's notify_* columns),
// in Chat Settings' rows. Loaded once when first opened; each change saves at
// once and a failed save puts the old value back.

type Values = Partial<Record<NotificationKey, boolean>>;

export default function NotificationSettingsPanel({ userId, isHost, open, onClose, onError }: {
  userId: string;
  isHost: boolean;
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState<Values | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return undefined;
    let cancelled = false;
    setLoadFailed(false);
    loadPreferences(client, userId)
      .then((prefs) => { if (!cancelled) setValues(Object.fromEntries(NOTIFICATION_ROWS.map((row) => [row.key, Boolean(prefs[row.key])]))); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [userId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const change = async (key: NotificationKey, value: boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    const client = getSupabaseClient();
    const error = client ? await savePreferences(client, userId, { [key]: value }) : 'No connection.';
    if (error) {
      setValues((current) => ({ ...current, [key]: !value }));
      onError('That notification setting could not be saved. Please try again.');
    }
  };

  return (
    <aside className={`notif-settings-panel${open ? ' is-open' : ''}`} aria-label="Notification Settings" hidden={!open}>
      <div className="notif-settings-head">
        <span>Notification Settings</span>
        <button ref={closeRef} type="button" className="notif-settings-close" aria-label="Close Notification Settings" title="Close Notification Settings" onClick={onClose}>
          <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
        </button>
      </div>
      <ChatSettingsStyles />
      <div className="cs-embedded">
        <div className="cs">
          <Section title="Notify me about">
            {values ? (
              NOTIFICATION_ROWS.filter((row) => isHost || !row.hostOnly).map((row) => (
                <ToggleRow key={row.key} anchor={`notify-panel-${row.key}`} label={row.label} description={row.desc} checked={Boolean(values[row.key])} onChange={(v) => { void change(row.key, v); }} />
              ))
            ) : loadFailed ? (
              <div className="notif-settings-note" role="alert">
                Your notification settings could not load.
                <button type="button" onClick={load}>Try again</button>
              </div>
            ) : (
              <div className="notif-settings-note" role="status">Loading…</div>
            )}
          </Section>
        </div>
      </div>
    </aside>
  );
}
