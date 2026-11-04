const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');

function loadActions() {
  return loadTs(path.join(root, 'lib', 'account', 'accountActions.ts'), {
    mocks: {
      react: { useEffect() {}, useState: (value) => [value, () => {}] },
      '@supabase/supabase-js': { createClient() { throw new Error('not used'); } },
    },
    globals: { window: undefined },
  });
}

function harness({ sessionUserId = 'user-a', accounts = [], switchError = null } = {}) {
  const log = [];
  const client = {
    auth: {
      async getSession() { return { data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } }; },
      async signOut() { log.push('signOut'); },
    },
  };
  const switcher = {
    getLinkedAccounts: () => accounts,
    async switchAccount(_client, account) {
      log.push(['switcher.switchAccount', account.id, Boolean(account.refresh_token)]);
      if (switchError) throw switchError;
    },
  };
  const deps = {
    getClient: () => client,
    getSwitcher: () => switcher,
    clear: async (userId) => { log.push(['clear', userId]); },
    navigate: (to) => log.push(['navigate', to]),
    reload: () => log.push('reload'),
    post: (message) => log.push(['post', message.type]),
  };
  return { log, deps };
}

test('logout clears the account data before signing out, then informs other tabs and goes to the login panel', async () => {
  const { createAccountActions, LOGIN_PATH } = loadActions();
  const { log, deps } = harness();
  await createAccountActions(deps).logout();
  assert.equal(LOGIN_PATH, '/?auth=login');
  assert.deepEqual(log, [['clear', 'user-a'], 'signOut', ['post', 'signed-out'], ['navigate', '/?auth=login']]);
});

test('switching looks up the stored tokens by id, clears the previous account and reloads', async () => {
  const { createAccountActions } = loadActions();
  const accounts = [{ id: 'user-b', email: 'b@example.com', access_token: 'a', refresh_token: 'r' }];
  const { log, deps } = harness({ accounts });
  await createAccountActions(deps).switchAccount('user-b');
  assert.deepEqual(log, [
    ['switcher.switchAccount', 'user-b', true],
    ['clear', 'user-a'],
    ['post', 'switched'],
    'reload',
  ]);
});

test('switching works with a fresh switcher instance that has not loaded the group yet (legacy pages)', async () => {
  const { createAccountActions } = loadActions();
  const { log, deps } = harness({ accounts: [] });
  const stored = [{ id: 'user-b', access_token: 'a', refresh_token: 'r' }];
  const switcher = deps.getSwitcher();
  switcher.loadLinkedAccounts = async (_client, _session, options) => {
    log.push(['loadLinkedAccounts', Boolean(options && options.force)]);
    return stored;
  };
  await createAccountActions(deps).switchAccount('user-b');
  assert.deepEqual(log[0], ['loadLinkedAccounts', true]);
  assert.deepEqual(log[1], ['switcher.switchAccount', 'user-b', true]);
  assert.equal(log[log.length - 1], 'reload');
});

test('a failed switch surfaces the error and neither clears data nor reloads', async () => {
  const { createAccountActions } = loadActions();
  const accounts = [{ id: 'user-b', access_token: 'a', refresh_token: 'r' }];
  const { log, deps } = harness({ accounts, switchError: new Error('This account needs you to sign in again.') });
  await assert.rejects(createAccountActions(deps).switchAccount('user-b'), /sign in again/);
  assert.deepEqual(log, [['switcher.switchAccount', 'user-b', true]]);

  const missing = harness({ accounts });
  await assert.rejects(createAccountActions(missing.deps).switchAccount('user-z'), /no longer linked/);
  assert.deepEqual(missing.log, []);
});

test('linked accounts reach React without their tokens', () => {
  const { toLinkedAccount } = loadActions();
  const safe = toLinkedAccount({
    id: 'user-b', email: 'b@example.com', full_name: 'B', username: 'bee', avatar_url: null, role: 'client',
    access_token: 'secret-access', refresh_token: 'secret-refresh', expires_at: 1,
  });
  assert.deepEqual(safe, { id: 'user-b', email: 'b@example.com', full_name: 'B', username: 'bee', avatar_url: null, role: 'client' });
  assert.equal(toLinkedAccount(null), null);
});

test('logout also removes the host\'s on-device listing drafts, after the account data, even if that fails', async () => {
  const { createAccountActions } = loadActions();
  const { log, deps } = harness();
  deps.clearDrafts = async (userId) => { log.push(['clearDrafts', userId]); throw new Error('storage unavailable'); };
  await createAccountActions(deps).logout();
  assert.deepEqual(log, [['clear', 'user-a'], ['clearDrafts', 'user-a'], 'signOut', ['post', 'signed-out'], ['navigate', '/?auth=login']]);
});

test('logout without a session still clears, informs other tabs and goes to login', async () => {
  const { createAccountActions } = loadActions();
  const { log, deps } = harness({ sessionUserId: null });
  await createAccountActions(deps).logout();
  assert.deepEqual(log, [['clear', null], 'signOut', ['post', 'signed-out'], ['navigate', '/?auth=login']]);
});

test('switching to the account already active keeps its data; no client or switcher is an error', async () => {
  const { createAccountActions } = loadActions();
  const same = harness({ sessionUserId: 'user-b', accounts: [{ id: 'user-b', access_token: 'a', refresh_token: 'r' }] });
  await createAccountActions(same.deps).switchAccount('user-b');
  assert.deepEqual(same.log, [['switcher.switchAccount', 'user-b', true], ['post', 'switched'], 'reload']);
  const none = harness();
  await assert.rejects(createAccountActions({ ...none.deps, getSwitcher: () => null }).switchAccount('user-b'), /not available/);
  await assert.rejects(createAccountActions({ ...none.deps, getClient: () => null }).switchAccount('user-b'), /not available/);
  assert.deepEqual(none.log, []);
});

test('both sidebars use the shared actions and keep no tokens in state', () => {
  // Wiring only (components cannot be rendered here); the actions are tested above.
  for (const file of ['shell/HostSidebar.tsx', 'shell/ClientSidebar.tsx']) {
    const source = fs.readFileSync(path.join(root, 'components', file), 'utf8');
    assert.match(source, /useLinkedAccounts\(\)/, file);
    assert.match(source, /await logout\(\);/, file);
    assert.match(source, /switchToAccount\((targetAcct|targetAccount)\.id\)/, file);
    assert.doesNotMatch(source, /auth\.signOut\(\)/, file);
    assert.doesNotMatch(source, /VaRoomAccountSwitcher\.switchAccount|getLinkedAccounts\(\)|getActiveAccount/, file);
  }
});

test('AddAccountModal: a Google popup closing after success is not a cancellation; the message listener lives only while open', () => {
  // Component effects (no DOM renderer here); message parsing itself is tested in add-account-modal.test.js.
  const source = fs.readFileSync(path.join(root, 'components', 'AddAccountModal.tsx'), 'utf8');
  assert.match(source, /googleSucceededRef\.current = true;/);
  assert.match(source, /if \(googleSucceededRef\.current\) return;/);
  assert.match(source, /if \(!isOpen\) return undefined;\s*const handleMessage/);
  assert.match(source, /switcher\.upsertFromSession\(window\.supabaseClient, session\)/, 'the active account is saved before adding another');
});

test('no legacy page keeps its own logout (every legacy page is retired)', () => {
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages')), false);
});

test('native Settings logs out through the shared logout', () => {
  const page = fs.readFileSync(path.join(root, 'pages', 'settings.tsx'), 'utf8');
  assert.match(page, /import \{ logout \} from '\.\.\/lib\/account\/accountActions';/);
  assert.match(page, /onLogout=\{logout\}/);
});
