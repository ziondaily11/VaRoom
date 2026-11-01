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
const loginSource = fs.readFileSync(
  path.join(__dirname, '../legacy-pages/login.html'),
  'utf8'
);
const callbackSource = fs.readFileSync(
  path.join(__dirname, '../legacy-pages/auth-callback.html'),
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

test('missing or rotated refresh tokens fail without changing the active session or saved membership', async () => {
  const context = createSwitcher(new Map(), ['account-a', 'account-b']);
  const currentA = session('account-a', 'access-a', 'refresh-a');
  const client = createMockClient(currentA, new Map([['refresh-a', currentA]]));
  const staleB = account('account-b', 'access-b', 'refresh-b-rotated-away');
  await context.api.loadLinkedAccounts(client, currentA);
  context.api.upsertAccount(account('account-a', 'access-a', 'refresh-a'));
  context.api.upsertAccount(staleB);

  await assert.rejects(context.api.switchAccount(client, { ...staleB, refresh_token: '' }), /sign in again/i);
  await assert.rejects(context.api.switchAccount(client, { ...staleB, access_token: '' }), /sign in again/i);
  await assert.rejects(context.api.switchAccount(client, staleB), /Refresh Token Not Found/);
  assert.equal(client.getActiveSession().user.id, 'account-a');
  assert.equal(context.api.getLinkedAccounts().map((item) => item.id).join(','), 'account-a,account-b');
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
    if (reads === 2) client.setActiveSession(otherTabC);
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
  assert.match(loginSource, /createClient\(window\.supabase,[\s\S]*?\{ usesRedirect: false, flowId: window\.VaRoomAccountAuth\.createFlowId\(\) \}\)/);
  assert.match(addAccountModalSource, /VaRoomAccountAuth\.createClient\([\s\S]*?\{\s*usesRedirect: false,\s*flowId: accountAuthFlow\s*\}\s*\)/);
  assert.match(accountSwitcherSource, /VaRoomAccountAuth\.createClient\([\s\S]*?\{\s*usesRedirect: false,\s*flowId: window\.VaRoomAccountAuth\.createFlowId\(\)\s*\}\s*\)/);
  assert.match(loginSource, /createClient\(window\.supabase,[\s\S]*?\{ usesRedirect: true, flowId: accountAuthFlow \}\)/);
  assert.match(loginSource, /add_account_callback=1/);
  assert.match(callbackSource, /add_account_callback/);
  assert.match(callbackSource, /linkAdditionalSession\(primaryClient, additionalSession\)/);
  assert.match(callbackSource, /refreshAccountAddSession\(supabaseClient, session\)/);
  assert.match(callbackSource, /access_token: additionalSession\.access_token/);
  assert.match(callbackSource, /linkAddAccountSession\(additionalSession\)/);
  assert.match(callbackSource, /clearTemporarySession\(accountAuthFlow\)/);
  assert.match(callbackSource, /signOut\(\{ scope: 'local' \}\)/);
});

test('successful Google add-account callbacks keep the added session valid for linking and switching', () => {
  assert.match(callbackSource, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/);

  const legacyCallbackStart = callbackSource.indexOf("if (queryParams.get('add_account_callback') === '1')");
  const legacyCallbackCatch = callbackSource.indexOf('      } catch (_error) {', legacyCallbackStart);
  assert.ok(legacyCallbackStart >= 0 && legacyCallbackCatch > legacyCallbackStart);
  assert.doesNotMatch(callbackSource.slice(legacyCallbackStart, legacyCallbackCatch), /signOut\(\{ scope: 'local' \}\)/);

  const popupStart = callbackSource.indexOf('if (window.opener && !window.opener.closed)');
  const popupCatch = callbackSource.indexOf('        } catch (e) {', popupStart);
  assert.ok(popupStart >= 0 && popupCatch > popupStart);
  assert.doesNotMatch(callbackSource.slice(popupStart, popupCatch), /signOut\(\{ scope: 'local' \}\)/);

  const redirectStart = callbackSource.indexOf('      await linkAddAccountSession(additionalSession);', popupCatch);
  const redirectCatch = callbackSource.indexOf('    } catch (_error) {', redirectStart);
  assert.ok(redirectStart >= 0 && redirectCatch > redirectStart);
  assert.doesNotMatch(callbackSource.slice(redirectStart, redirectCatch), /signOut\(\{ scope: 'local' \}\)/);

  // Failed and cancelled flows still revoke their unlinked temporary session.
  assert.match(callbackSource.slice(legacyCallbackCatch), /signOut\(\{ scope: 'local' \}\)/);
});

test('concurrent refresh callbacks cannot let an older profile lookup overwrite newer tokens', async () => {
  const context = createSwitcher(new Map(), ['account-a']);
  let releaseOlderProfile;
  let profileCalls = 0;
  const client = createMockClient(session('account-a', 'access-old', 'refresh-old'), new Map());
  client.from = function () {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          profileCalls += 1;
          if (profileCalls === 1) return new Promise((resolve) => { releaseOlderProfile = resolve; });
          return Promise.resolve({ data: null, error: null });
        }
      };
  };
  await context.api.loadLinkedAccounts(client, session('account-a', 'access-old', 'refresh-old'));
  context.api.upsertAccount(account('account-a', 'access-old', 'refresh-old'));
  const olderWrite = context.api.upsertFromSession(client, session('account-a', 'access-old', 'refresh-old'));
  const newerSession = session('account-a', 'access-new', 'refresh-new');
  await context.api.upsertFromSession(client, newerSession);
  releaseOlderProfile({ data: null, error: null });
  await olderWrite;

  const cached = context.api.getLinkedAccounts()[0];
  assert.equal(cached.access_token, 'access-new');
  assert.equal(cached.refresh_token, 'refresh-new');
});

test('normal login remains on the primary client and refresh-token rotation stays enabled', async () => {
  assert.match(loginSource, /var authClient = supabaseClient/);
  assert.match(loginSource, /authClient = window\.VaRoomAccountAuth\.createClient/);
  assert.match(loginSource, /: supabaseClient/);
  assert.match(loginSource, /oauthClient\.auth\.signInWithOAuth/);
  assert.match(loginSource, /authClient\.auth\.signInWithPassword/);
  assert.match(supabaseClientSource, /add_account_callback/);
  assert.match(fs.readFileSync(path.join(__dirname, '../../supabase/config.toml'), 'utf8'), /enable_refresh_token_rotation\s*=\s*true/);
});

test('edited login and callback inline scripts remain syntactically valid', () => {
  for (const [filename, html] of [
    ['login.html', loginSource],
    ['auth-callback.html', callbackSource]
  ]) {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const [, source] of scripts) {
      if (!source.trim()) continue;
      new vm.Script(source, { filename });
    }
  }
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
