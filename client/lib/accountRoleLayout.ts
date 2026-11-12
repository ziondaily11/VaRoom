import type { Session } from '@supabase/supabase-js';
import type { Profile } from './types/profile';

// Which account shell a route gets, decided from the verified session's role.

export type ShellRole = 'host' | 'client';
export type AccountLayout = ShellRole | 'none';

const VALID_ROLES = new Set<string>(['host', 'client']);

/** The cached profile's role, only when it belongs to the signed-in user. */
export function getSessionBoundCachedRole(session: Pick<Session, 'user'> | null | undefined, profile: Pick<Profile, 'id' | 'role'> | null | undefined): ShellRole | null {
  const sessionUserId = session && session.user && session.user.id;
  if (!sessionUserId || !profile || profile.id !== sessionUserId) return null;
  return profile.role && VALID_ROLES.has(profile.role) ? (profile.role as ShellRole) : null;
}

function matchesPath(path: string, route: string): boolean {
  return path === route || path.startsWith(route + '/') || path.startsWith(route + '?');
}

export function getAccountLayout(pathname: string | null | undefined, asPath: string | null | undefined, role: ShellRole | null | undefined): AccountLayout {
  const paths = [pathname || '', asPath || ''];
  const matches = (route: string) => paths.some((path) => matchesPath(path, route));

  // Host-only: the host shell with the icon-only rail (see usesIconRail).
  if (matches('/analytics')) return role === 'host' ? 'host' : 'none';

  const isClientHome = matches('/client-home');
  const isHostHome = matches('/host-home');
  const isHostProfile = paths.some((path) => path.startsWith('/host/'));
  const isSharedRoute = ['/bookings', '/notifications', '/profile', '/settings', '/marketplace'].some(matches);

  if (isClientHome || isHostHome || isHostProfile || isSharedRoute) {
    if (role === 'client') return 'client';
    if (role === 'host') return 'host';
    return 'none';
  }
  return 'none';
}

/**
 * The shell a home route is drawn in while a signed-in (or still loading)
 * session's role is unknown, so the sidebars and rails show at once instead
 * of an empty page. Only the static frame follows the route: the page itself
 * still redirects an account of the other role, and once the verified role is
 * known it replaces this hint without remounting the page (same AppShell).
 */
export function homeShellHint(pathname: string | null | undefined): ShellRole | null {
  if (pathname === '/host-home') return 'host';
  if (pathname === '/client-home') return 'client';
  return null;
}

/**
 * Routes that keep the account's shell but collapse its sidebar to an
 * icon-only rail, so wide pages get the room. The sidebar stays mounted.
 */
export function usesIconRail(pathname: string | null | undefined, asPath: string | null | undefined): boolean {
  return [pathname || '', asPath || ''].some((path) => matchesPath(path, '/analytics') || matchesPath(path, '/marketplace'));
}
