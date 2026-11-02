import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { isModifiedClick } from '../../lib/navigation/clicks';
import { useAuth } from '../../lib/auth/AuthProvider';
import { accountRole } from '../../lib/types/profile';
import { MOBILE_NAV_STYLES } from './shellStyles';

// Role-aware mobile navigation (ported from public/js/varoom-mobile-nav.js).
// Rendered once from _app, so it persists across routes and its active item
// follows client-side navigation. Same items, icons, classes and styles.
// While shown, pages' own .bottom-bar / .mobile-bottom-nav are hidden.

type NavKey = 'home' | 'marketplace' | 'create' | 'chats' | 'bookings' | 'notifications';

const ICONS: Record<NavKey, React.ReactElement> = {
  home: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H9v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4h2.5a1 1 0 0 0 1-1v-9" /></svg>,
  marketplace: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></svg>,
  create: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  chats: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>,
  bookings: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>,
  notifications: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 0-3.46 0" /></svg>,
};

interface NavItem { key: NavKey; label: string; href: string }

export const CLIENT_MOBILE_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', href: '/client-home' },
  { key: 'marketplace', label: 'Marketplace', href: '/marketplace' },
  { key: 'chats', label: 'Chats', href: '/chats' },
  { key: 'bookings', label: 'Bookings', href: '/bookings' },
  { key: 'notifications', label: 'Notifications', href: '/notifications' },
];

export const HOST_MOBILE_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', href: '/host-home' },
  { key: 'marketplace', label: 'Marketplace', href: '/marketplace' },
  { key: 'create', label: 'Create', href: '/list' },
  { key: 'chats', label: 'Chats', href: '/chats' },
  { key: 'bookings', label: 'Bookings', href: '/bookings' },
];

export function activeMobileKey(pathname: string): NavKey | null {
  if (pathname === '/marketplace') return 'marketplace';
  if (pathname === '/chats' || pathname === '/chat') return 'chats';
  if (pathname === '/bookings' || pathname === '/booking' || pathname === '/booking-approved') return 'bookings';
  if (pathname === '/notifications') return 'notifications';
  if (pathname === '/list') return 'create';
  if (pathname === '/host-home' || pathname === '/client-home' || pathname === '/') return 'home';
  return null;
}

/** Pages that own their bottom area: focused workspaces, and Client Home's own bar. */
export function hidesMobileNav(pathname: string): boolean {
  return ['/booking', '/chat-settings', '/pricing', '/list', '/properties', '/client-home'].includes(pathname);
}

function scrollHides(pathname: string): boolean {
  return ['/client-home', '/host-home', '/bookings', '/booking', '/booking-approved'].includes(pathname);
}

/** `enabled`: the route is an app page (shell route or legacy page). */
export default function MobileNav({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { profile } = useAuth();
  const role = accountRole(profile);
  const pathname = (router.asPath || '/').split(/[?#]/)[0];
  const show = Boolean(enabled && role && profile?.onboarding_completed && !hidesMobileNav(pathname));
  const [scrollHidden, setScrollHidden] = useState(false);
  const lastPosition = useRef(0);

  // Body padding and hiding pages' own bottom bars (CSS keyed on this class).
  useEffect(() => {
    if (!show) return undefined;
    document.body.classList.add('has-varoom-mobile-nav');
    return () => document.body.classList.remove('has-varoom-mobile-nav');
  }, [show]);

  useEffect(() => {
    setScrollHidden(false);
    if (!show || !scrollHides(pathname)) return undefined;
    const position = () => {
      const area = document.querySelector<HTMLElement>('.feed-area');
      return Math.max(window.scrollY || 0, area ? area.scrollTop : 0);
    };
    lastPosition.current = position();
    const onScroll = () => {
      const current = position();
      const delta = current - lastPosition.current;
      if (current <= 0) setScrollHidden(false);
      else if (delta >= 8) setScrollHidden(true);
      else if (delta <= -8) setScrollHidden(false);
      if (Math.abs(delta) >= 8) lastPosition.current = current;
    };
    const area = document.querySelector<HTMLElement>('.feed-area');
    window.addEventListener('scroll', onScroll, { passive: true });
    area?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      area?.removeEventListener('scroll', onScroll);
    };
  }, [show, pathname]);

  if (!show || !role) return null;
  const items = role === 'host' ? HOST_MOBILE_ITEMS : CLIENT_MOBILE_ITEMS;
  const active = activeMobileKey(pathname);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MOBILE_NAV_STYLES }} />
      <nav
        className={`varoom-mobile-nav${scrollHidden ? ' is-scroll-hidden' : ''}`}
        aria-label={role === 'host' ? 'Host mobile navigation' : 'Client mobile navigation'}
        data-role={role}
      >
        {items.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className={item.key === active ? 'active' : undefined}
            aria-current={item.key === active ? 'page' : undefined}
            data-mobile-nav={item.key}
            onClick={(event) => {
              if (isModifiedClick(event)) return;
              event.preventDefault();
              void router.push(item.href);
            }}
          >
            {ICONS[item.key]}
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
