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

  if (matches('/analytics')) return 'none';

  const isClientHome = matches('/client-home');
  const isHostHome = matches('/host-home');
  const isHostProfile = paths.some((path) => path.startsWith('/host/'));
  const isSharedRoute = ['/bookings', '/notifications', '/profile', '/settings'].some(matches);

  if (isClientHome || isHostHome || isHostProfile || isSharedRoute) {
    if (role === 'client') return 'client';
    if (role === 'host') return 'host';
    return 'none';
  }
  return 'none';
}
