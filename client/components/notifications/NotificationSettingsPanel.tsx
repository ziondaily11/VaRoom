import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loadPreferences, NOTIFICATION_ROWS, savePreferences, type NotificationKey } from '../../lib/settings/settings';
import { DURATION, exitMs } from '../../lib/motion/tokens';
import { usePresence } from '../../lib/motion/usePresence';
import { ChatSettingsStyles, Section, ToggleRow } from '../chat/ChatSettings';

// Notification Settings beside the list, as Chat Settings opens inside Chats:
// the same choices as Settings → Notifications (the profile's notify_* columns),
// in Chat Settings' rows. Loaded once when first opened; each change saves at
// once and a failed save puts the old value back.
//
// Motion (animation.md §8.3 drawer): slides in from the right in 250 ms, its
// contents settling 40 ms later; slides back out in 200 ms, kept mounted by
// usePresence. On close it is pinned where it stood (position: fixed at its
// own box), so the list widens at once and slides under it (useFlipX on the
// page). The scrim on narrower screens fades with it.

/** How long the panel takes to leave (the CSS exit runs as long). */
export const PANEL_EXIT_MS = exitMs(DURATION.standard);

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
  const panelRef = useRef<HTMLElement | null>(null);
  const { mounted, closing } = usePresence(open, PANEL_EXIT_MS);

  // Leaving: pin the panel at its own box so it no longer takes room in the layout.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!closing || !el) return undefined;
    const box = el.getBoundingClientRect();
    Object.assign(el.style, { position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    return () => { Object.assign(el.style, { position: '', left: '', top: '', width: '', height: '' }); };
  }, [closing]);

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
    // It starts off-screen (sliding in): focusing must not scroll the page sideways.
    closeRef.current?.focus({ preventScroll: true });
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

  const state = closing ? ' is-closing' : open ? ' is-open' : '';
  return (
    <>
    {/* Below 1080px the panel covers the list; a tap outside closes it. */}
    {mounted && <div className={`notif-settings-scrim${state}`} aria-hidden="true" onClick={closing ? undefined : onClose} />}
    <aside ref={panelRef} className={`notif-settings-panel${state}`} aria-label="Notification Settings" aria-hidden={closing || undefined} hidden={!mounted}>
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
    </>
  );
}
