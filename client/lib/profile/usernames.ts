// Usernames: one format and one list of blocked names, for onboarding,
// Settings, profile addresses and the public profile route.
//
// A host's public profile lives at varoom.co.ke/<username>, beside the app's
// own pages. A username may therefore never be a word the site uses (or will
// use) for a page, a redirect, a server path or a public folder. The database
// enforces the same rules (migration 20261118_000072_reserved_usernames.sql,
// constraint profiles_username_allowed); a test keeps the two lists equal and
// checks every page in pages/ and every redirect in next.config.js is blocked.

/** 3–20 lowercase letters, numbers or underscores (as the database allows). */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/**
 * Names no account may take. Only names that match USERNAME_PATTERN need to
 * be here: anything else (a dash, a dot, a capital) is already refused.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  // Next.js internals and app pages (client/pages).
  '404', '500', '_app', '_document', '_error', '_next', 'index',
  'admin', 'analytics', 'api', 'booking', 'bookings', 'chats', 'host', 'list',
  'map', 'marketplace', 'notifications', 'onboarding', 'pricing', 'privacy',
  'profile', 'properties', 'settings', 'support', 'terms',
  // Redirects (client/next.config.js) and server paths (server/server.js).
  'chat', 'elie', 'login', 'register', 'varoomadmin',
  // Public folders (client/public).
  'assets', 'favicon',
  // Words kept for pages the site may add, or that would mislead visitors.
  'about', 'account', 'accounts', 'auth', 'billing', 'blog', 'callback',
  'careers', 'checkout', 'contact', 'dashboard', 'discover', 'download',
  'explore', 'faq', 'feed', 'guest', 'guests', 'help', 'home', 'hosts',
  'inbox', 'legal', 'listing', 'listings', 'logout', 'messages', 'new',
  'news', 'null', 'official', 'payments', 'press', 'property', 'reviews',
  'root', 'search', 'security', 'signin', 'signout', 'signup', 'static',
  'staff', 'status', 'system', 'team', 'transactions', 'undefined', 'user',
  'users', 'varoom', 'verify', 'wallet', 'www',
];

const RESERVED = new Set(RESERVED_USERNAMES);

/** A username as typed: no spaces around it, no leading @, lowercase. */
export const normalizeUsername = (value: string) => value.trim().replace(/^@+/, '').toLowerCase();

/** Whether the site keeps this name for itself (case ignored). */
export const isReservedUsername = (username: string) => RESERVED.has(normalizeUsername(username));

/** Whether an account may have this username (format and not blocked). */
export const isAllowedUsername = (username: string) => USERNAME_PATTERN.test(username) && !RESERVED.has(username);

export const RESERVED_USERNAME_MESSAGE = 'This username is not available. Please choose another.';

/**
 * The username a single-segment address names (/amazingstays), or null when
 * the address is anything else: an app page, a blocked name, a sub-path, a
 * file. Accepts an address with a query or hash.
 */
export function profileUsernameFromPath(path: string | null | undefined): string | null {
  const match = /^\/([^/?#]+)\/?(?:[?#].*)?$/.exec(path || '');
  if (!match) return null;
  let segment: string;
  try { segment = decodeURIComponent(match[1]); } catch { return null; }
  const username = segment.replace(/^@/, '').toLowerCase();
  return isAllowedUsername(username) ? username : null;
}

/** A public profile's address: varoom.co.ke/<username>. */
export const profileAddress = (username: string) => `/${encodeURIComponent(normalizeUsername(username))}`;

/**
 * A host's public profile address: varoom.co.ke/<username> (usernames are
 * unique, ignoring case). A host without a usable username keeps /host/<id>,
 * which shows the same page.
 */
export function hostProfilePath(hostId: string, username?: string | null): string {
  const name = normalizeUsername(username || '');
  return isAllowedUsername(name) ? profileAddress(name) : `/host/${encodeURIComponent(hostId)}`;
}
