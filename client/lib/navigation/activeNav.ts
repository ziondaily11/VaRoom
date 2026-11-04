// Which sidebar item is active for a route (moved out of the host and client
// sidebars, unchanged behaviour).

/** Host sidebar: `view` is Host Home's ?view= (empty before hydration). */
export function hostActiveNav(pathname: string, rawAsPath: string, view: string | string[]): string {
  const currentPath = pathname;
  const asPath = rawAsPath.split('?')[0];
  if (view === 'my-listings') return 'my-listings';
  if (view === 'saved') return 'saved';
  if (asPath.startsWith('/host-home') || currentPath === '/host-home') return 'home';
  if (asPath.startsWith('/marketplace') || currentPath.startsWith('/marketplace')) return 'marketplace';
  if (asPath.startsWith('/bookings') || currentPath.startsWith('/bookings')) return 'bookings';
  if (asPath.startsWith('/chats') || currentPath.startsWith('/chats')) return 'chats';
  if (asPath.startsWith('/notifications') || currentPath.startsWith('/notifications')) return 'notifications';
  if (asPath.startsWith('/profile') || asPath.startsWith('/host/') || currentPath.startsWith('/profile') || currentPath.startsWith('/host/')) return 'profile';
  if (asPath.startsWith('/analytics') || currentPath.startsWith('/analytics')) return 'analytics';
  if (asPath.startsWith('/settings') || currentPath.startsWith('/settings')) return 'settings';
  if (asPath.startsWith('/support') || currentPath.startsWith('/support')) return 'support';
  return 'home';
}

/** Host items that live in the More menu (which is then shown active). */
export const HOST_MORE_ITEMS = ['analytics', 'settings', 'support', 'upgrade'];

/** Client sidebar. */
export function clientActiveNav(p: string, as: string): string {
  if (p === '/client-home' || as.startsWith('/client-home')) {
    if (as.includes('view=saved')) return 'saved';
    return 'home';
  }
  if (p === '/marketplace' || as.startsWith('/marketplace')) return 'marketplace';
  if (p === '/bookings' || as.startsWith('/bookings')) return 'bookings';
  if (p === '/chats' || as.startsWith('/chats')) return 'chats';
  if (p === '/notifications' || as.startsWith('/notifications')) return 'notifications';
  if (p === '/profile' || as.startsWith('/profile')) return 'profile';
  if (p === '/settings' || as.startsWith('/settings')) return 'settings';
  if (p === '/support' || as.startsWith('/support')) return 'support';
  if (p === '/signup-host' || as.startsWith('/signup-host')) return 'signup-host';
  return '';
}

/** Client items that live in the More menu. */
export const CLIENT_MORE_ITEMS = ['profile', 'settings', 'support', 'signup-host'];
