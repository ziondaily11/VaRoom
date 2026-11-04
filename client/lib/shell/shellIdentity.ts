// The identity a sidebar shows (moved out of components/shell/useShellChrome.ts
// and the sidebars, unchanged behaviour). Server render and the first client
// render use a fixed placeholder, so hydration matches; after mount the
// switcher's stored active account fills in until AuthProvider's verified
// profile is available.

export interface ShellIdentity {
  id?: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  email: string;
  role?: string | null;
}

/** Host sidebar placeholder for server render and first client render. */
export function hostInitialIdentity(): ShellIdentity {
  return {
    full_name: 'Amazing Stays 🌴',
    username: 'amazingstays',
    avatar_url: null,
    email: 'host@varoom.co.ke',
  };
}

export const HOST_FALLBACK_IDENTITY: ShellIdentity = { full_name: 'VaRoom Host', username: 'host', avatar_url: null, email: '' };

/** Client sidebar placeholder (also its fallback). */
export function clientInitialIdentity(): ShellIdentity {
  return {
    full_name: 'VaRoom Member',
    username: 'member',
    avatar_url: null,
    email: '',
  };
}

export interface StoredAccountLike {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  email: string;
  role: string | null;
}

/** The switcher's active account as a sidebar identity. */
export function storedIdentity(active: StoredAccountLike, fallback: ShellIdentity): ShellIdentity {
  return {
    id: active.id,
    full_name: active.full_name || fallback.full_name,
    username: active.username || fallback.username,
    avatar_url: active.avatar_url,
    email: active.email,
    role: active.role,
  };
}

export interface IdentitySources {
  authUser: { id: string; email?: string | null; user_metadata?: unknown } | null;
  profile: { id: string; full_name?: string | null; username?: string | null; avatar_url?: string | null; role?: string | null } | null;
  hasMounted: boolean;
  stored: ShellIdentity | null;
  initial: ShellIdentity;
  fallback: ShellIdentity;
}

export function resolveShellIdentity({ authUser, profile, hasMounted, stored, initial, fallback }: IdentitySources): ShellIdentity {
  if (authUser && profile && profile.id === authUser.id) {
    const metadata = (authUser.user_metadata || {}) as { full_name?: string; avatar_url?: string };
    return {
      id: profile.id,
      full_name: profile.full_name || metadata.full_name || fallback.full_name,
      username: profile.username || (authUser.email ? authUser.email.split('@')[0] : fallback.username),
      avatar_url: profile.avatar_url || metadata.avatar_url || null,
      email: authUser.email || '',
      role: profile.role,
    };
  }
  if (!hasMounted) return initial;
  return stored || fallback;
}
