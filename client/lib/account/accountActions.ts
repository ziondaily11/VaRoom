import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';
import { browserClearOptions, clearUserData } from '../auth/clearUserData';
import { isAddAccountCallback, profileStore } from '../auth/session';

// One logout and one account switch for the whole app, over the legacy
// window.VaRoomAccountSwitcher (which keeps the token storage and its safety
// rules). Exposed as window.VaRoomAccount so legacy pages use the same path.
//
// Linked accounts reach React only without their tokens; switching looks the
// stored tokens up inside the switcher by account id.

export const LOGIN_PATH = '/?auth=login';
const CHANNEL_NAME = 'varoom-account';

export interface LinkedAccount {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
}

interface StoredLinkedAccount extends Partial<LinkedAccount> {
  id: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface LinkResult {
  session_cached?: boolean;
}

/** The parts of public/js/account-switcher.js the React app uses. */
export interface AccountSwitcher {
  switchAccount(client: SupabaseClient, account: StoredLinkedAccount): Promise<unknown>;
  getLinkedAccounts(): StoredLinkedAccount[];
  getActiveAccount?(): StoredLinkedAccount | null;
  loadLinkedAccounts?(client: SupabaseClient, session?: unknown, options?: { force?: boolean }): Promise<StoredLinkedAccount[]>;
  linkAdditionalSession?(client: SupabaseClient, session: unknown): Promise<LinkResult>;
  upsertFromSession?(client: SupabaseClient, session: unknown): Promise<unknown>;
  canAddAccount?(): boolean;
  openAddAccountModal?: () => void;
  watchSessionTokens?(client: SupabaseClient): void;
}

type AccountMessage = { type: 'signed-out' } | { type: 'switched'; userId: string };

export interface AccountActionDeps {
  getClient: () => SupabaseClient | null;
  getSwitcher: () => AccountSwitcher | null;
  clear: (userId: string | null) => Promise<void>;
  navigate: (path: string) => void;
  reload: () => void;
  post: (message: AccountMessage) => void;
}

export function toLinkedAccount(account: StoredLinkedAccount | null | undefined): LinkedAccount | null {
  if (!account || !account.id) return null;
  return {
    id: account.id,
    email: account.email || '',
    full_name: account.full_name || null,
    username: account.username || null,
    avatar_url: account.avatar_url || null,
    role: account.role || null,
  };
}

export function createAccountActions(deps: AccountActionDeps) {
  async function currentUserId(client: SupabaseClient): Promise<string | null> {
    try {
      const { data } = await client.auth.getSession();
      return data.session?.user?.id || null;
    } catch {
      return null;
    }
  }

  return {
    /** Clear this account's private data, sign out, tell other tabs, go to login. */
    async logout(): Promise<void> {
      const client = deps.getClient();
      const userId = client ? await currentUserId(client) : null;
      // Clear before navigating: the page unload would cut an async clear short.
      await deps.clear(userId);
      try {
        if (client) await client.auth.signOut();
      } catch (error) {
        console.error('Sign out error:', error);
      }
      deps.post({ type: 'signed-out' });
      deps.navigate(LOGIN_PATH);
    },

    /**
     * Switch to a linked account. The switcher verifies the identity, restores
     * the previous session on failure and never deletes the saved account;
     * failures are thrown for the caller to show.
     */
    async switchAccount(accountId: string): Promise<void> {
      const client = deps.getClient();
      const switcher = deps.getSwitcher();
      if (!client || !switcher) throw new Error('Account switching is not available. Refresh the page and try again.');
      // Legacy pages re-run account-switcher.js, replacing the global with an
      // instance that has not loaded the group yet; load it before giving up.
      let target = switcher.getLinkedAccounts().find((account) => account.id === accountId);
      if (!target && switcher.loadLinkedAccounts) {
        const loaded = await switcher.loadLinkedAccounts(client, null, { force: true }).catch(() => []);
        target = loaded.find((account) => account.id === accountId);
      }
      if (!target) throw new Error('This account is no longer linked. Refresh the page and try again.');

      const previousUserId = await currentUserId(client);
      await switcher.switchAccount(client, target);
      if (previousUserId && previousUserId !== accountId) await deps.clear(previousUserId);
      deps.post({ type: 'switched', userId: accountId });
      deps.reload();
    },
  };
}

let channel: BroadcastChannel | null = null;

function accountChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

const browserActions = createAccountActions({
  getClient: getSupabaseClient,
  getSwitcher: () => (typeof window === 'undefined' ? null : window.VaRoomAccountSwitcher || null),
  clear: (userId) => clearUserData(userId, browserClearOptions(profileStore())),
  navigate: (path) => window.location.assign(path),
  reload: () => window.location.reload(),
  post: (message) => {
    try {
      accountChannel()?.postMessage(message);
    } catch {
      // Other tabs still follow the Supabase session through its own channel.
    }
  },
});

export const logout = browserActions.logout;
export const switchAccount = browserActions.switchAccount;

/**
 * Follow account changes made in other tabs of this browser, and expose the
 * shared actions to legacy pages. Called once from _app.
 */
export function installAccountActions(): void {
  if (typeof window === 'undefined' || window.VaRoomAccount) return;
  window.VaRoomAccount = { logout, switchAccount };
  // Keep the stored copy of the active account's tokens current through every
  // refresh, so switching back to it never needs a new sign-in. Not on the
  // add-account callback, whose client is a temporary isolated one.
  const client = getSupabaseClient();
  if (client && !isAddAccountCallback()) window.VaRoomAccountSwitcher?.watchSessionTokens?.(client);
  const shared = accountChannel();
  if (!shared) return;
  shared.onmessage = (event: MessageEvent<AccountMessage>) => {
    if (event.data?.type === 'switched') window.location.reload();
    if (event.data?.type === 'signed-out') window.location.assign(LOGIN_PATH);
  };
}

function readLinkedAccounts(): LinkedAccount[] {
  const switcher = typeof window === 'undefined' ? null : window.VaRoomAccountSwitcher;
  try {
    return (switcher?.getLinkedAccounts() || []).map(toLinkedAccount).filter((account): account is LinkedAccount => Boolean(account));
  } catch {
    return [];
  }
}

/** Linked accounts for the account menu, without their tokens. */
export function useLinkedAccounts(): LinkedAccount[] {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);

  useEffect(() => {
    const switcher = window.VaRoomAccountSwitcher;
    setAccounts(readLinkedAccounts());

    const sanitize = (list: StoredLinkedAccount[] | undefined) =>
      (list || []).map(toLinkedAccount).filter((account): account is LinkedAccount => Boolean(account));

    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ accounts?: StoredLinkedAccount[] }>).detail;
      setAccounts(detail?.accounts ? sanitize(detail.accounts) : readLinkedAccounts());
    };
    // Another tab linked or removed an account: reload the server-backed list.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'varoom_linked_accounts') return;
      const client = getSupabaseClient();
      if (switcher?.loadLinkedAccounts && client) {
        switcher.loadLinkedAccounts(client).then((list) => setAccounts(sanitize(list))).catch(() => setAccounts([]));
      } else {
        setAccounts(readLinkedAccounts());
      }
    };

    window.addEventListener('varoom_linked_accounts_changed', onChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('varoom_linked_accounts_changed', onChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return accounts;
}

/** The active account from the switcher, without tokens (sidebar placeholder identity). */
export function activeLinkedAccount(): LinkedAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    return toLinkedAccount(window.VaRoomAccountSwitcher?.getActiveAccount?.());
  } catch {
    return null;
  }
}
