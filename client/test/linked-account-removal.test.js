// X/Y/Z -> Y/Z -> Y/Z/K: permanent removal, slot reuse and no silent restore.
// The backend below applies the same rules as
// server/migrations/*_linked_account_groups.sql and
// *_remove_linked_account_group_member.sql (one group per user, at most three
// members, removal only within the caller's group). Each "browser" is a fresh
// copy of public/js/account-switcher.js with its own localStorage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const switcherSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'account-switcher.js'), 'utf8');

function createBackend(initialGroups = []) {
  const groupOf = new Map();
  let nextGroup = 1;
  for (const members of initialGroups) {
    const groupId = `g${nextGroup++}`;
    members.forEach((id) => groupOf.set(id, groupId));
  }
  const membersOf = (userId) => {
    const groupId = groupOf.get(userId);
    return groupId ? [...groupOf.entries()].filter(([, g]) => g === groupId).map(([id]) => id) : [userId];
  };
  const snapshot = (userId) => ({
    group_id: groupOf.get(userId) || null,
    current_user_id: userId,
    members: membersOf(userId).map((id) => ({ id, full_name: id.toUpperCase(), username: id, role: 'client', email: '' })),
  });
  const json = (status, body) => ({ ok: status < 400, status, async json() { return body; } });
  const userFromToken = (token) => (token && token.startsWith('access-') ? token.slice('access-'.length) : null);

  async function fetch(url, options = {}) {
    const user = userFromToken(String((options.headers || {}).Authorization || '').replace('Bearer ', ''));
    if (!user) return json(401, { error: 'Invalid or expired session' });
    if (url === '/api/account-groups/current') return json(200, snapshot(user));
    if (url === '/api/account-groups/link' && options.method === 'POST') {
      const other = userFromToken(JSON.parse(options.body).additional_access_token);
      const a = groupOf.get(user);
      const b = groupOf.get(other);
      if (a && a === b) return json(200, snapshot(user));
      const combined = new Set([...membersOf(user), ...membersOf(other)]);
      if (combined.size > 3) return json(409, { error: 'Account limit reached (3/3). This group cannot include another account.' });
      const target = a || b || `g${nextGroup++}`;
      combined.forEach((id) => groupOf.set(id, target));
      return json(200, snapshot(user));
    }
    const removeMatch = url.match(/^\/api\/account-groups\/([^/]+)$/);
    if (removeMatch && options.method === 'DELETE') {
      const removed = decodeURIComponent(removeMatch[1]);
      if (removed === user) return json(400, { error: 'Switch accounts before removing the current account.' });
      if (!groupOf.get(user) || groupOf.get(user) !== groupOf.get(removed)) {
        return json(409, { error: 'This account is no longer linked. Refresh and try again.' });
      }
      groupOf.delete(removed); // membership only; the user and their data remain
      return json(200, snapshot(user));
    }
    return json(404, { error: 'not found' });
  }
  return { fetch, membersOf, groupOf };
}

const session = (id) => ({ user: { id, email: `${id}@example.test`, user_metadata: {} }, access_token: `access-${id}`, refresh_token: `refresh-${id}`, expires_at: 2_000_000_000 });
const stored = (id) => ({ id, email: `${id}@example.test`, full_name: id.toUpperCase(), access_token: `access-${id}`, refresh_token: `refresh-${id}`, expires_at: 2_000_000_000 });

// A browser profile: its own storage, switcher copy and Supabase client.
function createBrowser(backend, signedInAs, storage = new Map()) {
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const window = { localStorage, fetch: backend.fetch, dispatchEvent() {} };
  vm.runInNewContext(switcherSource, {
    window, localStorage, document: {}, alert() {},
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  let active = signedInAs ? session(signedInAs) : null;
  const setSessionCalls = [];
  const client = {
    auth: {
      async getSession() { return { data: { session: active }, error: null }; },
      async setSession(tokens) {
        setSessionCalls.push(tokens.refresh_token);
        const id = tokens.refresh_token.replace('refresh-', '');
        active = session(id);
        return { data: { session: active, user: active.user }, error: null };
      },
    },
    from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } }; },
  };
  return {
    api: window.VaRoomAccountSwitcher,
    client,
    storage,
    setSessionCalls,
    activeId: () => active && active.user.id,
    cachedIds: () => JSON.parse(storage.get('varoom_linked_accounts') || '[]').map((a) => a.id).sort(),
    ids: () => window.VaRoomAccountSwitcher.getLinkedAccounts().map((a) => a.id).sort(),
    // Simulate earlier "add account" sign-ins that left credentials here.
    async seed(...accountIds) {
      await window.VaRoomAccountSwitcher.loadLinkedAccounts(client, active, { force: true });
      accountIds.forEach((id) => window.VaRoomAccountSwitcher.upsertAccount(stored(id)));
    },
  };
}

test('X/Y/Z -> remove X -> Y/Z -> link K -> Y/Z/K, across browsers and fresh logins', async () => {
  const backend = createBackend([['x', 'y', 'z']]);

  // Y's browser holds sessions for every member; X's browser has a page open
  // from before the removal with Y and Z's credentials.
  const yBrowser = createBrowser(backend, 'y');
  await yBrowser.seed('x', 'y', 'z');
  const xBrowserStale = createBrowser(backend, 'x');
  await xBrowserStale.seed('x', 'y', 'z');
  assert.deepEqual(yBrowser.ids(), ['x', 'y', 'z']);
  assert.equal(yBrowser.api.canAddAccount(), false, 'group starts full');

  // 1. Remove X from Settings in Y's browser.
  await yBrowser.api.removeLinkedAccount(yBrowser.client, 'x');
  assert.deepEqual(backend.membersOf('y').sort(), ['y', 'z'], 'authoritative group updated');
  assert.deepEqual(backend.membersOf('x'), ['x'], 'X has no group; the account itself still exists');
  assert.deepEqual(yBrowser.ids(), ['y', 'z']);
  assert.deepEqual(yBrowser.cachedIds(), ['y', 'z'], "X's switching credentials removed from this browser");

  // 3. The slot is free immediately.
  assert.equal(yBrowser.api.canAddAccount(), true);

  // 5. A page in X's browser loaded before the removal cannot switch into Y.
  await assert.rejects(
    xBrowserStale.api.switchAccount(xBrowserStale.client, stored('y')),
    /no longer linked/,
  );
  assert.deepEqual(xBrowserStale.setSessionCalls, [], 'no stored credential was used');
  assert.equal(xBrowserStale.activeId(), 'x');
  assert.deepEqual(xBrowserStale.cachedIds(), ['x'], "the re-check pruned Y and Z's credentials from X's browser");

  // 2. Fresh logins: X sees only itself (vice versa), Z no longer sees X,
  // even in a browser whose storage still lists X.
  const xFresh = createBrowser(backend, 'x', new Map(xBrowserStale.storage));
  await xFresh.api.loadLinkedAccounts(xFresh.client);
  assert.deepEqual(xFresh.ids(), ['x']);
  const zBrowserWithStaleStorage = createBrowser(backend, 'z', new Map([['varoom_linked_accounts', JSON.stringify([stored('x'), stored('z')])]]));
  await zBrowserWithStaleStorage.api.loadLinkedAccounts(zBrowserWithStaleStorage.client);
  assert.deepEqual(zBrowserWithStaleStorage.ids(), ['y', 'z']);
  assert.deepEqual(zBrowserWithStaleStorage.cachedIds(), ['z'], 'stale X credentials are dropped, not imported');

  // 4. Link K from Y's browser: the group becomes Y/Z/K.
  const linked = await yBrowser.api.linkAdditionalSession(yBrowser.client, session('k'));
  assert.equal(linked.id, 'k');
  assert.deepEqual(backend.membersOf('y').sort(), ['k', 'y', 'z']);
  assert.deepEqual(yBrowser.ids(), ['k', 'y', 'z']);
  assert.equal(yBrowser.api.canAddAccount(), false, 'group is full again');

  // All three recognise one another on fresh logins.
  for (const id of ['y', 'z', 'k']) {
    const fresh = createBrowser(backend, id);
    await fresh.api.loadLinkedAccounts(fresh.client);
    assert.deepEqual(fresh.ids(), ['k', 'y', 'z'], `${id} sees Y/Z/K`);
  }
  const xAgain = createBrowser(backend, 'x');
  await xAgain.api.loadLinkedAccounts(xAgain.client);
  assert.deepEqual(xAgain.ids(), ['x'], 'X stays disconnected');

  // Switching inside the new group works: Y -> K, then K -> Z.
  await yBrowser.api.switchAccount(yBrowser.client, yBrowser.api.getLinkedAccounts().find((a) => a.id === 'k'));
  assert.equal(yBrowser.activeId(), 'k');
  yBrowser.api.upsertAccount(stored('z'));
  await yBrowser.api.switchAccount(yBrowser.client, yBrowser.api.getLinkedAccounts().find((a) => a.id === 'z'));
  assert.equal(yBrowser.activeId(), 'z');

  // X cannot be re-added to the full group, and nothing restored it silently.
  await assert.rejects(yBrowser.api.linkAdditionalSession(yBrowser.client, session('x')), /limit reached/i);
  assert.deepEqual(backend.membersOf('x'), ['x']);
});

test('a membership lookup failure blocks switching instead of trusting stored credentials', async () => {
  const backend = createBackend([['a', 'b']]);
  const browser = createBrowser(backend, 'a');
  await browser.seed('a', 'b');
  const failingFetch = async () => ({ ok: false, status: 503, async json() { return { error: 'Unable to load linked accounts' }; } });
  const offline = createBrowser({ ...backend, fetch: failingFetch }, 'a', new Map(browser.storage));
  await assert.rejects(offline.api.switchAccount(offline.client, stored('b')), /Unable to load linked accounts/);
  assert.deepEqual(offline.setSessionCalls, []);
  assert.equal(offline.activeId(), 'a');
});

test('server removal only deletes the membership row, never the user or their data', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'migrations', '20261026_000050_remove_linked_account_group_member.sql'), 'utf8');
  const statements = sql.replace(/--.*$/gm, '').toLowerCase();
  assert.match(statements, /delete from public\.account_group_members\s+where user_id = p_removed_user/);
  assert.doesNotMatch(statements, /delete from (auth\.users|public\.profiles|public\.listings|public\.bookings|public\.messages)/);
  assert.equal((statements.match(/delete from/g) || []).length, 1);
});
