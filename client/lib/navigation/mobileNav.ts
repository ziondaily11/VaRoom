// The mobile navigation's items and route rules (moved out of
// components/shell/MobileNav.tsx, unchanged behaviour).

export type NavKey = 'home' | 'marketplace' | 'create' | 'chats' | 'bookings' | 'notifications';

export interface NavItem { key: NavKey; label: string; href: string }

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

export function scrollHides(pathname: string): boolean {
  return ['/client-home', '/host-home', '/bookings', '/booking', '/booking-approved'].includes(pathname);
}

/** The route the navigation follows: the visible URL without query or hash. */
export const mobileNavPath = (asPath: string | null | undefined): string => (asPath || '/').split(/[?#]/)[0];

/** Shown on app pages for a signed-in, onboarded account, except where a page owns its bottom area. */
export function showsMobileNav(enabled: boolean, role: string | null, onboardingCompleted: boolean | null | undefined, pathname: string): boolean {
  return Boolean(enabled && role && onboardingCompleted && !hidesMobileNav(pathname));
}
