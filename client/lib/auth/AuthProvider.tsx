import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';
import { accountRole, type Profile } from '../types/profile';
import { browserClearOptions, clearUserData, hasStaleAccountData } from './clearUserData';
import { isAddAccountCallback, profileStore } from './session';
import { ACCOUNT_RESTORED_MESSAGE, profileIsDeactivated, reactivateAccount } from './reactivation';

// Owns the session and the signed-in user's profile for the whole app. One
// getSession + onAuthStateChange here replaces per-page session and profile
// lookups; pages and layouts read it through useAuth().

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** The verified user's profile; a cached copy until the first fetch settles. */
  profile: Profile | null;
  profileError: Error | null;
  refreshProfile: () => Promise<void>;
}

const noop = async () => {};
const initialState: AuthState = { status: 'loading', session: null, user: null, profile: null, profileError: null, refreshProfile: noop };
const AuthContext = createContext<AuthState>(initialState);

const CACHED_PROFILE_KEY = 'varoom_cached_profile';

interface LegacyCachedProfile {
  id?: string;
  full_name?: string;
  username?: string;
  avatar_url?: string | null;
  email?: string;
  role?: string;
  homeState?: unknown;
}

function readLegacyCachedProfile(userId: string): Profile | null {
  try {
    const raw = window.localStorage.getItem(CACHED_PROFILE_KEY);
    const cached = raw ? (JSON.parse(raw) as LegacyCachedProfile) : null;
    if (!cached || cached.id !== userId || !accountRole({ role: cached.role || null })) return null;
    return {
      id: userId,
      full_name: cached.full_name || null,
      username: cached.username || null,
      avatar_url: cached.avatar_url || null,
      role: cached.role || null,
      onboarding_completed: null,
      interested_categories: null,
      looking_timeline: null,
      verified: null,
    };
  } catch {
    return null;
  }
}

// Legacy scripts and the account switcher read the current identity from
// varoom_cached_profile; keep it in the shape they expect, preserving homeState.
function writeLegacyCachedProfile(profile: Profile, user: User) {
  try {
    const raw = window.localStorage.getItem(CACHED_PROFILE_KEY);
    const previous = raw ? (JSON.parse(raw) as LegacyCachedProfile) : null;
    const next: LegacyCachedProfile = {
      ...(previous && previous.id === profile.id ? previous : {}),
      id: profile.id,
      full_name: profile.full_name || (user.user_metadata && user.user_metadata.full_name) || '',
      username: profile.username || (user.email ? user.email.split('@')[0] : ''),
      avatar_url: profile.avatar_url || null,
      email: user.email || '',
      role: profile.role || '',
    };
    window.localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable.
  }
}

// Legacy pages read these role hints for their first paint.
function applyRoleAttribute(profile: Profile | null) {
  const role = accountRole(profile);
  if (!role) return;
  document.documentElement.setAttribute('data-account-role', role);
  try {
    window.sessionStorage.setItem('varoom_user_role', role);
    window.localStorage.setItem('varoom_last_role', role);
  } catch {
    // Storage unavailable.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'refreshProfile'>>(initialState);
  const [restoredNotice, setRestoredNotice] = useState(false);
  const restoredTimer = useRef<number | null>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return undefined;

    // The add-account callback runs on an isolated temporary client; its
    // session is not the primary account, so it must not drive app state.
    if (isAddAccountCallback()) {
      setState({ ...initialState, status: 'signed-out' });
      return undefined;
    }

    const store = profileStore();
    let disposed = false;
    let currentUserId: string | null | undefined;
    let currentUser: User | null = null;
    let currentSession: Session | null = null;
    const reactivating = new Set<string>();

    // Signed in to a deactivated account: signing in restores it.
    const restoreIfDeactivated = (userId: string, profile: Profile | null) => {
      const token = currentSession?.access_token;
      if (!profileIsDeactivated(profile) || !token || reactivating.has(userId)) return;
      reactivating.add(userId);
      void reactivateAccount(token).then(async (result) => {
        if (disposed || currentUserId !== userId) return;
        if (result.status === 'reactivated' || result.status === 'active') {
          await store.get(userId, { force: true });
          if (result.status === 'reactivated' && !disposed) {
            setRestoredNotice(true);
            if (restoredTimer.current) window.clearTimeout(restoredTimer.current);
            restoredTimer.current = window.setTimeout(() => setRestoredNotice(false), 6000);
          }
        } else if (result.status === 'sign-in-required') {
          // A session from before the deactivation: only a new sign-in restores the account.
          await client.auth.signOut({ scope: 'local' });
          window.location.href = '/?auth=login&account=deactivated';
        } else {
          reactivating.delete(userId);
          console.error('Account reactivation failed:', result.message);
        }
      });
    };

    // Successful fetches arrive through the store subscription below; this
    // handles cache hits (no fetch) and errors.
    const loadProfile = (user: User) => {
      void store.get(user.id).then((result) => {
        if (disposed || currentUserId !== user.id) return;
        if (result.data) {
          writeLegacyCachedProfile(result.data, user);
          applyRoleAttribute(result.data);
          restoreIfDeactivated(user.id, result.data);
        }
        setState((previous) => (previous.user?.id === user.id
          ? { ...previous, profile: result.data || previous.profile, profileError: result.error }
          : previous));
      });
    };

    const apply = (session: Session | null) => {
      if (disposed) return;
      const user = session?.user || null;
      const userId = user?.id || null;
      const previousUserId = currentUserId;
      currentUserId = userId;
      currentUser = user;
      currentSession = session;

      if (previousUserId && previousUserId !== userId) {
        void clearUserData(previousUserId, browserClearOptions(store));
      } else if (previousUserId === undefined && !userId && hasStaleAccountData(window.localStorage)) {
        void clearUserData(null, browserClearOptions(store));
      }

      if (!user) {
        setState({ ...initialState, status: 'signed-out' });
        return;
      }

      const sameUser = previousUserId === user.id;
      const cached = store.peek(user.id) || readLegacyCachedProfile(user.id);
      setState((previous) => ({
        status: 'signed-in',
        session,
        user,
        profile: sameUser ? previous.profile || cached : cached,
        profileError: sameUser ? previous.profileError : null,
      }));
      if (!sameUser) applyRoleAttribute(cached);
      loadProfile(user);
    };

    client.auth.getSession().then(({ data }) => apply(data.session)).catch(() => apply(null));
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      // Supabase calls must not run inside the auth callback; defer.
      window.setTimeout(() => apply(session), 0);
    });

    // Fresh rows from any consumer's fetch (including a refetch after a
    // profile write) flow back into app state.
    const unsubscribe = store.subscribe((userId, profile) => {
      if (disposed || !currentUser || userId !== currentUser.id) return;
      if (profile) writeLegacyCachedProfile(profile, currentUser);
      applyRoleAttribute(profile);
      restoreIfDeactivated(userId, profile);
      setState((previous) => (previous.user?.id === userId ? { ...previous, profile, profileError: null } : previous));
    });

    return () => {
      disposed = true;
      subscription.unsubscribe();
      unsubscribe();
      if (restoredTimer.current) window.clearTimeout(restoredTimer.current);
    };
  }, []);

  const userId = state.user?.id;
  const refreshProfile = useCallback(async () => {
    if (userId) await profileStore().get(userId, { force: true });
  }, [userId]);

  const value = useMemo<AuthState>(() => ({ ...state, refreshProfile }), [state, refreshProfile]);
  return (
    <AuthContext.Provider value={value}>
      {children}
      {restoredNotice && (
        <div
          role="status"
          aria-live="polite"
          style={{ position: 'fixed', left: '50%', bottom: '1.5rem', transform: 'translateX(-50%)', zIndex: 400, maxWidth: 'min(92vw, 30rem)', padding: '.8rem 1.4rem', borderRadius: 100, background: '#1f1b18', color: '#fff', fontSize: '.88rem', fontWeight: 600, textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}
        >
          {ACCOUNT_RESTORED_MESSAGE}
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
