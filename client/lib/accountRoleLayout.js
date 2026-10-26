'use strict';

const VALID_ROLES = new Set(['host', 'client']);

function getSessionBoundCachedRole(session, profile) {
  const sessionUserId = session && session.user && session.user.id;
  if (!sessionUserId || !profile || profile.id !== sessionUserId) return null;
  return VALID_ROLES.has(profile.role) ? profile.role : null;
}

function matchesPath(path, route) {
  return path === route || path.startsWith(route + '/') || path.startsWith(route + '?');
}

function getAccountLayout(pathname, asPath, role) {
  const paths = [pathname || '', asPath || ''];
  const matches = (route) => paths.some((path) => matchesPath(path, route));

  if (matches('/analytics')) return 'none';

  const isClientHome = matches('/client-home');
  const isHostHome = matches('/host-home');
  const isHostProfile = paths.some((path) => path.startsWith('/host/'));
  const isSharedRoute = ['/bookings', '/notifications', '/profile', '/settings'].some(matches);

  if (isClientHome) return role === 'client' ? 'client' : 'pending';
  if (isHostHome) return role === 'host' ? 'host' : 'pending';
  if (isHostProfile || isSharedRoute) {
    if (role === 'client') return 'client';
    if (role === 'host') return 'host';
    return 'pending';
  }
  return 'none';
}

module.exports = { getAccountLayout, getSessionBoundCachedRole };
