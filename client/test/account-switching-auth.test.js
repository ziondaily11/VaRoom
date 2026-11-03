const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const accountSwitcherSource = fs.readFileSync(
  path.join(__dirname, '../public/js/account-switcher.js'),
  'utf8'
);
const accountAuthSource = fs.readFileSync(
  path.join(__dirname, '../public/js/account-auth.js'),
  'utf8'
);
const addAccountModalSource = fs.readFileSync(
  path.join(__dirname, '../components/AddAccountModal.tsx'),
  'utf8'
);
// Sign-in is the landing auth panel (legacy login.html is retired).
const authPanelSource = fs.readFileSync(
  path.join(__dirname, '../components/landing/AuthPanel.tsx'),
  'utf8'
);
const supabaseBrowserClientSource = fs.readFileSync(
  path.join(__dirname, '../lib/supabase/client.ts'),
  'utf8'
);
const callbackSource = fs.readFileSync(
  path.join(__dirname, '../lib/auth/authCallback.ts'),
  'utf8'
);
const supabaseClientSource = fs.readFileSync(
  path.join(__dirname, '../public/js/supabase-client.js'),
  'utf8'
);

function createSwitcher(storage = new Map(), memberIds = []) {
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const window = {
    localStorage,
    fetch: async () => ({
      ok: true,
      async json() {
        return { members: memberIds.map((id) => ({ id, full_name: id, username: id })) };
      }
    }),
    dispatchEvent() {}
  };
  vm.runInNewContext(accountSwitcherSource, { window, localStorage, document: {}, alert() {}, CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  return { api: window.VaRoomAccountSwitcher, storage, localStorage };
}

function account(id, accessToken, refreshToken) {
  return {
    id,
    email: `${id}@example.test`,
    full_name: id,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: 2_000_000_000
  };
}

function session(id, accessToken, refreshToken) {
  return {
    user: { id, email: `${id}@example.test`, user_metadata: {} },
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: 2_000_000_000
  };
}

function createMockClient(initialSession, refreshSessions) {
  let activeSession = initialSession;
  const calls = [];
  return {
    calls,
    auth: {
      async getSession() {
        return { data: { session: activeSession }, error: null };
      },
      async setSession(tokens) {
        calls.push(tokens);
        const next = refreshSessions.get(tokens.refresh_token);
        if (!next) {
          return { data: { session: null }, error: new Error('Invalid Refresh Token: Refresh Token Not Found') };
        }
        activeSession = next;
        return { data: { session: next, user: next.user }, error: null };
      },
      async signOut() {
        activeSession = null;
        return { error: null };
      }
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: null, error: null }; }
      };
    },
    setActiveSession(next) { activeSession = next; },
    getActiveSession() { return activeSession; }
  };
}

test('switching an expired account authenticates the selected user and persists its rotated tokens before returning', async () => {
  const context = createSwitcher(new Map(), ['account-a', 'account-b']);
  const currentA = session('account-a', 'access-a', 'refresh-a');
  const rotatedB = session('account-b', 'access-b-rotated', 'refresh-b-rotated');
  const tokens = new Map([
    ['refresh-b-old', rotatedB],
    ['refresh-a', currentA],
    ['refresh-b-rotated', rotatedB]
  ]);
  const client = createMockClient(currentA, tokens);
  await context.api.loadLinkedAccounts(client, currentA);
  context.api.upsertAccount(account('account-a', 'access-a', 'refresh-a'));
  context.api.upsertAccount(account('account-b', 'access-b-old', 'refresh-b-old'));

  const switched = await context.api.switchAccount(client, context.api.getLinkedAccounts()[1]);
  assert.equal(switched.user.id, 'account-b');
  assert.equal(client.getActiveSession().user.id, 'account-b');
  assert.equal(client.calls[0].refresh_token, 'refresh-b-old');
  const cachedB = context.api.getLinkedAccounts().find((item) => item.id === 'account-b');
  assert.equal(cachedB.access_token, 'access-b-rotated');
  assert.equal(cachedB.refresh_token, 'refresh-b-rotated');

  const cachedA = context.api.getLinkedAccounts().find((item) => item.id === 'account-a');
  const switchedBack = await context.api.switchAccount(client, cachedA);
  assert.equal(switchedBack.user.id, 'account-a');
  assert.equal(client.calls[1].refresh_token, 'refresh-a');

  const switchedToBAgain = await context.api.switchAccount(client, cachedB);
  assert.equal(switchedToBAgain.user.id, 'account-b');
  assert.equal(client.calls[2].refresh_token, 'refresh-b-rotated');
});

test('revoked refresh tokens ask for a new sign-in without changing the active session or saved membership', async () => {
  const context = createSwitcher(new Map(), ['account-a', 'account-b']);
  const currentA = session('account-a', 'access-a', 'refresh-a');
  const client = createMockClient(currentA, new Map([['refresh-a', currentA]]));
  const revokedB = account('account-b', 'access-b', 'refresh-b-rotated-away');
  await context.api.loadLinkedAccounts(client, currentA);
  context.api.upsertAccount(account('account-a', 'access-a', 'refresh-a'));
  context.api.upsertAccount(revokedB);

  // A caller's incomplete copy falls back to the stored tokens; a revoked
  // refresh token surfaces as a clear "sign in again", never a raw API error.
  await assert.rejects(context.api.switchAccount(client, { ...revokedB, refresh_token: '' }), /needs you to sign in again/i);
  await assert.rejects(context.api.switchAccount(client, { ...revokedB, access_token: '' }), /needs you to sign in again/i);
  await assert.rejects(context.api.switchAccount(client, revokedB), (error) => {
    assert.match(error.message, /needs you to sign in again/i);
    assert.match(String(error.cause && error.cause.message), /Refresh Token Not Found/);
    return true;
  });
  assert.equal(client.getActiveSession().user.id, 'account-a');
  assert.equal(context.api.getLinkedAccounts().map((item) => item.id).join(','), 'account-a,account-b');
});

test('an account with no stored sign-in in this browser asks for a sign-in', async () => {
  const context = createSwitcher(new Map(), ['account-a', 'account-b']);
  const currentA = session('account-a', 'access-a', 'refresh-a');
  const client = createMockClient(currentA, new Map([['refresh-a', currentA]]));
  await context.api.loadLinkedAccounts(client, currentA);
  await assert.rejects(context.api.switchAccount(client, { id: 'account-b' }), /needs you to sign in again/i);
  assert.equal(client.calls.length, 0);
});

test('a localStorage failure after setSession restores the original session and keeps the saved account', async () => {
  const storage = new Map();
  const context = createSwitcher(storage, ['account-a', 'account-b']);
  const currentA = session('account-a', 'access-a', 'refresh-a');
  const rotatedB = session('account-b', 'access-b-new', 'refresh-b-new');
  const client = createMockClient(currentA, new Map([
    ['refresh-b-old', rotatedB],
    ['refresh-a', currentA]
  ]));
  await context.api.loadLinkedAccounts(client, currentA);
  context.api.upsertAccount(account('account-a', 'access-a', 'refresh-a'));
  context.api.upsertAccount(account('account-b', 'access-b-old', 'refresh-b-old'));
  const originalSetItem = context.localStorage.setItem;
  context.localStorage.setItem = (key, value) => {
    if (String(value).includes('access-b-new')) throw new Error('storage unavailable');
    originalSetItem(key, value);
  };

  await assert.rejects(context.api.switchAccount(client, context.api.getLinkedAccounts()[1]), /Could not save/);
  assert.equal(client.getActiveSession().user.id, 'account-a');
  assert.equal(context.api.getLinkedAccounts().map((item) => item.id).join(','), 'account-a,account-b');
});

test('a concurrent cross-tab switch is not overwritten by rollback from an older switch attempt', async () => {
  const context = createSwitcher(new Map(), ['account-a', 'account-b']);
  const currentA = session('account-a', 'access-a', 'refresh-a');
  const selectedB = session('account-b', 'access-b', 'refresh-b');
  const otherTabC = session('account-c', 'access-c', 'refresh-c');
  const client = createMockClient(currentA, new Map([['refresh-b', selectedB], ['refresh-a', currentA]]));
  await context.api.loadLinkedAccounts(client, currentA);
  context.api.upsertAccount(account('account-b', 'access-b', 'refresh-b'));
  const originalGetSession = client.auth.getSession;
  let reads = 0;
  client.auth.getSession = async () => {
    reads += 1;
    // Read 1: the session before switching; read 2: the membership re-check
    // that switchAccount now performs; read 3 happens after setSession, which
    // is where another tab's switch must not be rolled back.
    if (reads === 3) client.setActiveSession(otherTabC);
    return originalGetSession();
  };

  await assert.rejects(context.api.switchAccount(client, context.api.getLinkedAccounts().find((item) => item.id === 'account-b')), /changed while loading|session changed/);
  assert.equal(client.getActiveSession().user.id, 'account-c');
  assert.equal(client.calls.length, 1);
  assert.equal(context.api.getLinkedAccounts().length, 0);
});

test('add-account auth uses isolated storage and OAuth callback uses the same temporary namespace', () => {
  const localStorage = new Map();
  const window = { localStorage: { removeItem(key) { localStorage.delete(key); } } };
  vm.runInNewContext(accountAuthSource, { window });
  const emailOptions = window.VaRoomAccountAuth.clientOptions({ usesRedirect: false });
  const flowId = window.VaRoomAccountAuth.createFlowId();
  const oauthOptions = window.VaRoomAccountAuth.clientOptions({ usesRedirect: true, flowId });
  const callbackOptions = window.VaRoomAccountAuth.clientOptions({ usesRedirect: true, isCallback: true, flowId });

  assert.equal(emailOptions.auth.persistSession, false);
  assert.equal(emailOptions.auth.detectSessionInUrl, false);
  assert.equal(oauthOptions.auth.persistSession, true);
  assert.equal(oauthOptions.auth.detectSessionInUrl, false);
  assert.equal(callbackOptions.auth.detectSessionInUrl, true);
  assert.notEqual(emailOptions.auth.storageKey, oauthOptions.auth.storageKey);
  assert.equal(oauthOptions.auth.storage, window.localStorage);
  assert.equal(oauthOptions.auth.storageKey, callbackOptions.auth.storageKey);
  assert.match(oauthOptions.auth.storageKey, /^varoom-add-account-auth-/);
  assert.notEqual(oauthOptions.auth.storageKey, window.VaRoomAccountAuth.clientOptions({ usesRedirect: true, flowId: window.VaRoomAccountAuth.createFlowId() }).auth.storageKey);

  const blockedStorageWindow = {};
  Object.defineProperty(blockedStorageWindow, 'localStorage', {
    get() { throw new Error('blocked'); }
  });
  vm.runInNewContext(accountAuthSource, { window: blockedStorageWindow });
  assert.throws(
    () => blockedStorageWindow.VaRoomAccountAuth.clientOptions({ usesRedirect: true, flowId: 'blocked-flow' }),
    /cannot keep the temporary sign-in state/i
  );
});

test('Google add-account callback refreshes the session and uses the rotated tokens for the same identity', async () => {
  const initial = session('google-added-account', 'callback-access-stale', 'callback-refresh-current');
  const rotated = session('google-added-account', 'callback-access-current', 'callback-refresh-rotated');
  let requestedRefreshToken;
  const client = {
    auth: {
      async refreshSession(tokens) {
        requestedRefreshToken = tokens.refresh_token;
        return { data: { session: rotated }, error: null };
      }
    }
  };
  const window = {};
  vm.runInNewContext(accountAuthSource, { window });

  const fresh = await window.VaRoomAccountAuth.refreshAccountAddSession(client, initial);
  assert.equal(requestedRefreshToken, 'callback-refresh-current');
  assert.equal(fresh.user.id, 'google-added-account');
  assert.equal(fresh.access_token, 'callback-access-current');
  assert.equal(fresh.refresh_token, 'callback-refresh-rotated');
});

test('Google add-account callback rejects missing, rejected, or cross-identity refresh results', async () => {
  const window = {};
  vm.runInNewContext(accountAuthSource, { window });
  const original = session('google-added-account', 'access', 'refresh');
  await assert.rejects(
    window.VaRoomAccountAuth.refreshAccountAddSession({ auth: {} }, original),
    /signed in again/i
  );
  await assert.rejects(
    window.VaRoomAccountAuth.refreshAccountAddSession({ auth: { async refreshSession() { return { data: { session: null }, error: new Error('invalid') }; } } }, original),
    /signed in again/i
  );
  await assert.rejects(
    window.VaRoomAccountAuth.refreshAccountAddSession({ auth: { async refreshSession() { return { data: { session: session('different-account', 'other-access', 'other-refresh') }, error: null }; } } }, original),
    /signed in again/i
  );
});

test('email and Google add-account flows use isolated auth clients; callback links accounts without replacing the active session', () => {
  assert.match(addAccountModalSource, /VaRoomAccountAuth\.createClient\([\s\S]*?\{\s*usesRedirect: false,\s*flowId: accountAuthFlow\s*\}\s*\)/);
  assert.match(accountSwitcherSource, /VaRoomAccountAuth\.createClient\([\s\S]*?\{\s*usesRedirect: false,\s*flowId: window\.VaRoomAccountAuth\.createFlowId\(\)\s*\}\s*\)/);
  assert.match(addAccountModalSource, /\{ usesRedirect: true, flowId: accountAuthFlow \}/);
  assert.match(addAccountModalSource, /\/auth-callback\?addAccount=true&account_auth_flow=\$\{encodeURIComponent\(accountAuthFlow\)\}/);
  assert.match(supabaseBrowserClientSource, /params\.get\('addAccount'\) === 'true'/);
  assert.match(callbackSource, /linkAdditionalSession\(env\.createPrimaryClient\(\), additional\)/);
  assert.match(callbackSource, /refreshAccountAddSession\(env\.client, session\)/);
  assert.match(callbackSource, /access_token: additional\.access_token/);
  assert.match(callbackSource, /clearTemporarySession\(flowId\)/);
  assert.match(callbackSource, /signOut\(\{ scope: 'local' \}\)/);
});

// The callback's behaviour on success and failure is tested in auth-callback.test.js.

test('normal login remains on the primary client and refresh-token rotation stays enabled', async () => {
  // Email and Google sign-in use the one primary client, never an add-account client.
  assert.match(authPanelSource, /const client = \(window as any\)\.supabaseClient;[\s\S]*?client\.auth\.signInWithPassword/);
  assert.match(authPanelSource, /const googleClient = [\s\S]*?\.supabaseClient \|\| null;/);
  assert.doesNotMatch(authPanelSource, /VaRoomAccountAuth\.createClient/);
  assert.match(supabaseClientSource, /add_account_callback/);
  assert.match(fs.readFileSync(path.join(__dirname, '../../supabase/config.toml'), 'utf8'), /enable_refresh_token_rotation\s*=\s*true/);
});

test('a later token expiry already written by another tab cannot be replaced by an older refresh event', () => {
  const sharedStorage = new Map();
  const newerTab = createSwitcher(sharedStorage, ['account-a']);
  const olderTab = createSwitcher(sharedStorage, ['account-a']);
  const activeSession = session('account-a', 'access-session', 'refresh-session');
  const client = createMockClient(activeSession, new Map());
  const setup = Promise.all([
    newerTab.api.loadLinkedAccounts(client, activeSession),
    olderTab.api.loadLinkedAccounts(client, activeSession)
  ]);
  return setup.then(() => {
  newerTab.api.upsertAccount({ ...account('account-a', 'access-newer', 'refresh-newer'), expires_at: 2_000_000_200 });
  olderTab.api.upsertAccount({ ...account('account-a', 'access-older', 'refresh-older'), expires_at: 2_000_000_100 });

  const stored = newerTab.api.getLinkedAccounts()[0];
  assert.equal(stored.access_token, 'access-newer');
  assert.equal(stored.refresh_token, 'refresh-newer');
  });
});

test('switching while the session watcher reacts to SIGNED_IN does not fail on a superseded membership load', async () => {
  // setSession emits SIGNED_IN, so the watcher saves the new session while the
  // switch itself saves it: two membership loads for the same account race.
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  let membershipRequests = 0;
  const window = {
    localStorage,
    fetch: (url) => new Promise((resolve) => {
      if (String(url).includes('/api/account-groups/current')) membershipRequests += 1;
      setTimeout(() => resolve({ ok: true, async json() { return { members: ['account-a', 'account-b'].map((id) => ({ id, full_name: id, username: id })) }; } }), 5);
    }),
    dispatchEvent() {}
  };
  vm.runInNewContext(accountSwitcherSource, { window, localStorage, document: {}, alert() {}, setTimeout, clearTimeout, CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  const api = window.VaRoomAccountSwitcher;

  const currentA = session('account-a', 'access-a', 'refresh-a');
  const sessionB = session('account-b', 'access-b', 'refresh-b');
  const client = createMockClient(currentA, new Map([['refresh-b', sessionB], ['refresh-a', currentA]]));
  const listeners = [];
  client.auth.onAuthStateChange = (callback) => { listeners.push(callback); return { data: { subscription: { unsubscribe() {} } } }; };
  const setSession = client.auth.setSession;
  client.auth.setSession = async (tokens) => {
    const result = await setSession(tokens);
    if (result.data && result.data.session) listeners.forEach((listener) => listener('SIGNED_IN', result.data.session));
    return result;
  };
  api.watchSessionTokens(client);

  await api.loadLinkedAccounts(client, currentA);
  api.upsertAccount(account('account-a', 'access-a', 'refresh-a'));
  api.upsertAccount(account('account-b', 'access-b', 'refresh-b'));

  const switched = await api.switchAccount(client, api.getLinkedAccounts().find((item) => item.id === 'account-b'));
  assert.equal(switched.user.id, 'account-b');
  assert.equal(client.getActiveSession().user.id, 'account-b', 'the switch is not rolled back');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(api.getLinkedAccounts().some((item) => item.id === 'account-b'));
  assert.ok(membershipRequests <= 3, `membership loads for one account are shared (${membershipRequests})`);
});
