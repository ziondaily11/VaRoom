import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { saveStartPage, startPageFor, type HostStartPage } from '../../lib/navigation/startPage';

// The host's start page in the sidebar: a pin at the end of each page's row
// (shown on hover or keyboard focus, and always on the pinned page), and the
// same choice from a right-click / long-press / menu-key menu. The pin is
// saved on the profile and opens first after the next sign-in.

export interface StartPageState {
  pinned: HostStartPage | null;
  /** Pin the page, or unpin it if it is already the start page. */
  toggle: (page: HostStartPage, label: string) => void;
  message: string;
}

export function useStartPage(): StartPageState {
  const { user, profile, refreshProfile } = useAuth();
  const userId = user?.id || null;
  const saved = startPageFor(profile);
  // The choice shows at once; the saved profile catches up after the write.
  const [optimistic, setOptimistic] = useState<{ page: HostStartPage | null } | null>(null);
  const [message, setMessage] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => { setOptimistic(null); }, [userId]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const announce = useCallback((text: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    setMessage(text);
    timer.current = window.setTimeout(() => setMessage(''), 2800);
  }, []);

  const pinned = optimistic ? optimistic.page : saved;

  const toggle = useCallback((page: HostStartPage, label: string) => {
    const client = getSupabaseClient();
    if (!client || !userId) return;
    const next = pinned === page ? null : page;
    setOptimistic({ page: next });
    announce(next ? `${label} will open first when you sign in.` : 'Start page removed. Home will open first.');
    saveStartPage(client, userId, next)
      .then(() => refreshProfile())
      .then(() => setOptimistic(null))
      .catch((error: Error) => {
        console.error('Start page could not be saved:', error);
        setOptimistic(null);
        announce('Your start page could not be saved. Please try again.');
      });
  }, [pinned, userId, refreshProfile, announce]);

  return { pinned, toggle, message };
}

export function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

export interface MenuRequest { page: HostStartPage; label: string; href: string; x: number; y: number; returnFocus: HTMLElement | null }

/**
 * A sidebar row that can be pinned: the nav item itself plus a pin button
 * beside it (not inside it, so the link stays a plain link).
 */
export function PinnableRow({ page, label, href, state, onMenu, children }: {
  page: HostStartPage; label: string; href: string; state: StartPageState;
  onMenu: (request: MenuRequest) => void; children: React.ReactElement;
}) {
  const isPinned = state.pinned === page;
  const press = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });
  const cancelPress = () => { if (press.current.timer) window.clearTimeout(press.current.timer); press.current.timer = null; };
  useEffect(() => cancelPress, []);

  const openAt = (x: number, y: number, target: HTMLElement | null) => onMenu({ page, label, href, x, y, returnFocus: target });

  return (
    <div
      className={`nav-row${isPinned ? ' is-start-page' : ''}`}
      onContextMenu={(event) => {
        event.preventDefault();
        cancelPress();
        openAt(event.clientX, event.clientY, event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('a,[role="button"],button') : null);
      }}
      onKeyDown={(event) => {
        // The keyboard's menu key or Shift+F10 opens the same menu.
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const box = (event.target as HTMLElement).getBoundingClientRect();
          openAt(box.left + 12, box.bottom, event.target as HTMLElement);
        }
      }}
      onPointerDown={(event) => {
        // Touch: a long press opens the menu (phones have no hover or right-click).
        if (event.pointerType !== 'touch') return;
        const { clientX, clientY } = event;
        const target = event.target as HTMLElement;
        press.current.fired = false;
        cancelPress();
        press.current.timer = window.setTimeout(() => {
          press.current.fired = true;
          openAt(clientX, clientY, target.closest<HTMLElement>('a,[role="button"],button'));
        }, 500);
      }}
      onPointerMove={(event) => { if (event.pointerType === 'touch') cancelPress(); }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onClickCapture={(event) => {
        // The tap that ended a long press does not also navigate.
        if (press.current.fired) { press.current.fired = false; event.preventDefault(); event.stopPropagation(); }
      }}
    >
      {children}
      <button
        type="button"
        className="nav-pin"
        aria-pressed={isPinned}
        aria-label={isPinned ? `Unpin ${label} as your start page` : `Pin ${label} as your start page`}
        title={isPinned ? 'Start page · click to unpin' : 'Pin as start page'}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); state.toggle(page, label); }}
      >
        <PinIcon filled={isPinned} />
      </button>
    </div>
  );
}

/** The right-click menu: open, open in a new tab, and pin / unpin. */
export function StartPageMenu({ request, state, onOpen, onClose }: {
  request: MenuRequest | null; state: StartPageState; onOpen: (href: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Kept inside the window; placed before paint so it never flashes.
  useLayoutEffect(() => {
    if (!request || !ref.current) { setPosition(null); return; }
    const box = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(request.x, window.innerWidth - box.width - 8));
    const top = Math.max(8, Math.min(request.y, window.innerHeight - box.height - 8));
    setPosition({ left, top });
  }, [request]);

  useEffect(() => {
    if (!request) return undefined;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (restore: boolean) => {
      onClose();
      if (restore) request.returnFocus?.focus();
    };
    const onPointerDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) close(false); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(true); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    const onDismiss = () => close(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('blur', onDismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('blur', onDismiss);
    };
  }, [request, onClose]);

  if (!request) return null;
  const isPinned = state.pinned === request.page;
  return (
    <div
      ref={ref}
      className="account-menu start-page-menu"
      role="menu"
      aria-label={`${request.label} options`}
      style={{ position: 'fixed', zIndex: 100000, left: position?.left ?? request.x, top: position?.top ?? request.y, visibility: position ? 'visible' : 'hidden' }}
    >
      <button type="button" role="menuitem" className="account-menu-action" onClick={() => { onClose(); onOpen(request.href); }}>
        Open
      </button>
      <button type="button" role="menuitem" className="account-menu-action" onClick={() => { onClose(); window.open(request.href, '_blank', 'noopener'); }}>
        Open in new tab
      </button>
      <div className="account-menu-divider" />
      <button
        type="button"
        role="menuitem"
        className="account-menu-action start-page-menu-pin"
        onClick={() => { onClose(); state.toggle(request.page, request.label); request.returnFocus?.focus(); }}
      >
        <PinIcon filled={isPinned} />
        {isPinned ? 'Unpin start page' : 'Pin as start page'}
      </button>
      <p className="start-page-menu-hint">{isPinned ? 'Opens first when you sign in.' : 'Open this page first every time you sign in.'}</p>
    </div>
  );
}

export function StartPageToast({ message }: { message: string }) {
  return <div className={`start-page-toast${message ? ' show' : ''}`} role="status" aria-live="polite">{message}</div>;
}
