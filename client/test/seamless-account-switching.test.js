// Switching between linked accounts must never need a new sign-in, through
// refresh-token rotation, expired access tokens, browser restarts and other
// tabs. The auth model below follows Supabase with enable_refresh_token_rotation
// (each refresh issues a new pair; the previous refresh token is then rejected).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const switcherSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'account-switcher.js'), 'utf8');
const HOUR = 3600;

function createAuthServer(userIds, clock) {
  const latestRefresh = new Map();
  let counter = 0;
  const issue = (userId) => {
    counter += 1;
    const pair = {
      user: { id: userId, email: `${userId}@example.test`, user_metadata: {} },
      access_token: `access-${userId}-${counter}`,
      refresh_token: `refresh-${userId}-${counter}`,
      expires_at: clock.now + HOUR,
    };
    latestRefresh.set(userId, pair.refresh_token);
    return pair;
  };
  const userOf = (token) => token.split('-')[1];
  return {
    issue,
    signIn: (userId) => issue(userId),
    // setSession: an unexpired access token is used as is; otherwise the
    // refresh token must be the latest one for that user.
    setSession(tokens, knownSessions) {
      const known = knownSessions.get(tokens.access_token);
      if (known && known.expires_at > clock.now && latestRefresh.get(known.user.id) === tokens.refresh_token) return { session: known };
      const userId = userOf(tokens.refresh_token);
      if (latestRefresh.get(userId) !== tokens.refresh_token) {
        return { error: Object.assign(new Error('Invalid Refresh Token: Already Used'), { code: 'refresh_token_already_used' }) };
      }
      return { session: issue(userId) };
    },
    refresh(session) {
      if (latestRefresh.get(session.user.id) !== session.refresh_token) throw new Error('rotated elsewhere');
      return issue(session.user.id);
    },
  };
}

function createBackend(memberIds) {
  return async (url, options = {}) => {
    const auth = String((options.headers || {}).Authorization || '');
    if (!auth.startsWith('Bearer ')) return { ok: false, status: 401, async json() { return { error: 'Invalid or expired session' }; } };
    if (url === '/api/account-groups/current') {
      return { ok: true, status: 200, async json() { return { members: memberIds.map((id) => ({ id, full_name: id.toUpperCase(), username: id, role: 'client', email: '' })) }; } };
    }
    return { ok: false, status: 404, async json() { return {}; } };
  };
}

// One browser tab: a switcher copy and a Supabase-like client over shared
// localStorage (the auth session is shared across tabs, like supabase-js).
function createTab({ server, storage, authStore, memberIds, watch = true }) {
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const timers = [];
  const window = { localStorage, fetch: createBackend(memberIds), dispatchEvent() {} };
  vm.runInNewContext(switcherSource, {
    window, localStorage, document: {}, alert() {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  const listeners = [];
  const known = authStore.known;
  const setActive = (next, event) => {
    authStore.active = next;
    if (next) known.set(next.access_token, next);
    if (event) listeners.forEach((listener) => listener(event, next));
  };
  const client = {
    signInCalls: 0,
    auth: {
      async getSession() { return { data: { session: authStore.active }, error: null }; },
      async setSession(tokens) {
        const result = server.setSession(tokens, known);
        if (result.error) return { data: { session: null }, error: result.error };
        setActive(result.session, 'SIGNED_IN');
        return { data: { session: result.session, user: result.session.user }, error: null };
      },
      onAuthStateChange(listener) { listeners.push(listener); return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } }; },
  };
  const api = window.VaRoomAccountSwitcher;
  if (watch && api.watchSessionTokens) api.watchSessionTokens(client);
  return {
    api,
    client,
    // Background refresh by supabase-js in this tab (emits TOKEN_REFRESHED).
    autoRefresh() { setActive(server.refresh(authStore.active), 'TOKEN_REFRESHED'); },
    // A refresh this tab never hears about (e.g. done by another client).
    silentRefresh() { setActive(server.refresh(authStore.active)); },
    // Run deferred callbacks, then let the async saves they start settle.
    async flush() {
      for (let round = 0; round < 5; round += 1) {
        while (timers.length) timers.shift()();
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    activeId: () => authStore.active && authStore.active.user.id,
    stored: (id) => JSON.parse(storage.get('varoom_linked_accounts') || '[]').find((a) => a.id === id),
  };
}

async function linkedBrowser(ids, options = {}) {
  const clock = { now: 1_000_000 };
  const server = createAuthServer(ids, clock);
  const storage = new Map();
  const authStore = { active: null, known: new Map() };
  const tab = createTab({ server, storage, authStore, memberIds: ids, ...options });
  // Each account signed in once on this browser (add-account flow); the
  // first one is the active session.
  const sessions = ids.map((id) => server.signIn(id));
  sessions.forEach((signedIn) => authStore.known.set(signedIn.access_token, signedIn));
  authStore.active = sessions[0];
  await tab.api.loadLinkedAccounts(tab.client, authStore.active, { force: true });
  for (const signedIn of sessions) {
    const id = signedIn.user.id;
    tab.api.upsertAccount({ id, email: `${id}@example.test`, full_name: id.toUpperCase(), access_token: signedIn.access_token, refresh_token: signedIn.refresh_token, expires_at: signedIn.expires_at });
  }
  return { clock, server, storage, authStore, tab };
}

const memberFor = (tab, id) => tab.api.getLinkedAccounts().find((a) => a.id === id);

test('switching in both directions between all three accounts never needs a sign-in, across token rotation and expiry', async () => {
  const { clock, tab } = await linkedBrowser(['a', 'b', 'c']);
  const route = ['b', 'c', 'a', 'c', 'b', 'a', 'b', 'a', 'c', 'a'];
  for (const target of route) {
    // An hour or more passes on the current account: its access token
    // expires and supabase-js rotates its refresh token in the background.
    clock.now += HOUR + 60;
    tab.autoRefresh();
    await tab.flush();
    await tab.api.switchAccount(tab.client, memberFor(tab, target));
    await tab.flush();
    assert.equal(tab.activeId(), target, `switched to ${target}`);
  }
});

test('stored tokens follow every background refresh of the active account', async () => {
  const { tab, authStore } = await linkedBrowser(['a', 'b']);
  tab.autoRefresh();
  tab.autoRefresh();
  await tab.flush();
  assert.equal(tab.stored('a').refresh_token, authStore.active.refresh_token);
});

test('the outgoing account is saved before switching even when its refresh went unobserved', async () => {
  const { clock, tab } = await linkedBrowser(['a', 'b'], { watch: false });
  clock.now += HOUR + 60;
  tab.silentRefresh(); // stored copy of A is now stale
  await tab.api.switchAccount(tab.client, memberFor(tab, 'b'));
  await tab.api.switchAccount(tab.client, memberFor(tab, 'a'));
  assert.equal(tab.activeId(), 'a');
});

test('after a browser restart with every access token expired, switching still works', async () => {
  const { clock, server, storage, authStore } = await linkedBrowser(['a', 'b', 'c']);
  clock.now += 12 * HOUR; // browser closed overnight
  const reopened = createTab({ server, storage, authStore, memberIds: ['a', 'b', 'c'] });
  await reopened.api.loadLinkedAccounts(reopened.client);
  for (const target of ['c', 'b', 'a']) {
    await reopened.api.switchAccount(reopened.client, memberFor(reopened, target));
    await reopened.flush();
    assert.equal(reopened.activeId(), target);
  }
});

test("a rotation by another tab after the menu was read does not force a sign-in", async () => {
  const { clock, server, storage, authStore, tab } = await linkedBrowser(['a', 'b']);
  const staleMenuCopyOfB = { ...memberFor(tab, 'b') };
  // Tab 2 switches to B (rotating B's tokens), then back to A.
  const tab2 = createTab({ server, storage, authStore, memberIds: ['a', 'b'] });
  await tab2.api.loadLinkedAccounts(tab2.client);
  clock.now += HOUR + 60;
  await tab2.api.switchAccount(tab2.client, memberFor(tab2, 'b'));
  await tab2.flush();
  await tab2.api.switchAccount(tab2.client, memberFor(tab2, 'a'));
  await tab2.flush();
  // Tab 1 still holds the pre-rotation copy of B from its menu.
  await tab.api.switchAccount(tab.client, staleMenuCopyOfB);
  assert.equal(tab.activeId(), 'b');
});
