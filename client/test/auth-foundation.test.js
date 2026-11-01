const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => Array.from(map.keys()),
  };
}

// Minimal PostgREST-like client: from('profiles').select().eq().maybeSingle()
// and thenable mutation builders, with a request log.
function fakeClient(rows) {
  const log = [];
  const client = {
    log,
    from(table) {
      const builder = {
        select(columns) {
          return {
            eq(_column, id) {
              return {
                maybeSingle: async () => {
                  log.push({ table, columns, id });
                  await Promise.resolve();
                  return { data: rows[id] ? { ...rows[id] } : null, error: null };
                },
              };
            },
          };
        },
        update(values) {
          const filter = {
            eq(_column, id) { rows[id] = { ...rows[id], ...values }; return filter; },
            then(onFulfilled, onRejected) { return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected); },
          };
          return filter;
        },
      };
      return builder;
    },
  };
  return client;
}

function loadStoreModule() {
  return loadTs(path.join(root, 'lib', 'auth', 'profileStore.ts'), { globals: { window: undefined } });
}

test('profile store deduplicates concurrent reads and serves fresh rows without a request', async () => {
  const { createProfileStore, PROFILE_COLUMNS } = loadStoreModule();
  const client = fakeClient({ u1: { id: 'u1', role: 'host', full_name: 'Ann' } });
  let clock = 1000;
  const store = createProfileStore({ getClient: () => client, getStorage: () => memoryStorage(), now: () => clock });

  const [a, b, c] = await Promise.all([store.get('u1'), store.get('u1'), store.get('u1')]);
  assert.equal(client.log.length, 1, 'one request for three concurrent callers');
  assert.equal(client.log[0].columns, PROFILE_COLUMNS);
  assert.equal(a.data.full_name, 'Ann');
  assert.equal(b.data, a.data);
  assert.equal(c.error, null);

  clock += 60 * 1000;
  await store.get('u1');
  assert.equal(client.log.length, 1, 'fresh within the TTL');

  clock += 5 * 60 * 1000;
  await store.get('u1');
  assert.equal(client.log.length, 2, 'refetches after the TTL');
});

test('profile store survives a hard load through sessionStorage and keeps users isolated', async () => {
  const { createProfileStore } = loadStoreModule();
  const storage = memoryStorage();
  const client = fakeClient({ a: { id: 'a', role: 'host' }, b: { id: 'b', role: 'client' } });
  const first = createProfileStore({ getClient: () => client, getStorage: () => storage });
  await first.get('a');

  const afterReload = createProfileStore({ getClient: () => client, getStorage: () => storage });
  assert.equal(afterReload.peek('a').role, 'host');
  assert.equal(afterReload.peek('b'), null, 'no row for another user');
  await afterReload.get('a');
  assert.equal(client.log.length, 1, 'no request after a hard load within the TTL');
  assert.equal((await afterReload.get('b')).data.role, 'client');
  assert.equal(client.log.length, 2);
});

test('writes to profiles through the shared client invalidate the cached row', async () => {
  const { createProfileStore } = loadStoreModule();
  const client = fakeClient({ u1: { id: 'u1', full_name: 'Old' } });
  const store = createProfileStore({ getClient: () => client, getStorage: () => memoryStorage() });
  store.installWriteHook(client);
  store.installWriteHook(client);

  await store.get('u1');
  await client.from('profiles').update({ full_name: 'New' }).eq('id', 'u1');
  const result = await store.get('u1');
  assert.equal(result.data.full_name, 'New');
  assert.equal(client.log.length, 2, 'the write forced exactly one refetch');
});

test('invalidate refetches for subscribers; clear removes the row', async () => {
  const { createProfileStore } = loadStoreModule();
  const storage = memoryStorage();
  const client = fakeClient({ u1: { id: 'u1', role: 'client' } });
  const store = createProfileStore({ getClient: () => client, getStorage: () => storage });
  const seen = [];
  store.subscribe((userId, profile) => seen.push([userId, profile && profile.role]));

  await store.get('u1');
  store.invalidate('u1');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(client.log.length, 2);
  assert.deepEqual(seen, [['u1', 'client'], ['u1', 'client']]);

  store.clear('u1');
  assert.equal(store.peek('u1'), null);
  assert.equal(storage.keys().length, 0);
});

test('a read started before clear() cannot repopulate the cleared row', async () => {
  const { createProfileStore } = loadStoreModule();
  const client = fakeClient({ u1: { id: 'u1' } });
  const store = createProfileStore({ getClient: () => client, getStorage: () => memoryStorage() });
  const pending = store.get('u1');
  store.clear('u1');
  await pending;
  assert.equal(store.peek('u1'), null);
});

test('clearUserData removes the previous account\'s private data and keeps drafts, theme and linked accounts', async () => {
  const { clearUserData, hasStaleAccountData } = loadTs(path.join(root, 'lib', 'auth', 'clearUserData.ts'), {
    globals: { window: undefined, sessionStorage: undefined },
  });
  const local = memoryStorage({
    varoom_cached_profile: JSON.stringify({ id: 'a', full_name: 'A', role: 'host' }),
    varoom_active_account_id: 'a',
    varoom_linked_accounts: '[]',
    varoom_theme: 'dark',
    'varoom_listing_draft_pointer:a': 'draft',
  });
  const session = memoryStorage({
    'varoom:profile:v1:a': '{}',
    // VaRoomDataCache URL-encodes its keys; this is the real stored form.
    ['varoom:data-cache:v1:' + encodeURIComponent('account:a:bookings')]: '{}',
    ['varoom:data-cache:v1:' + encodeURIComponent('public:listings')]: '{}',
    'varoom:client-home:profile:v1:a': '{}',
    'varoom:listings:feed:v1:client:a:home': '{}',
    varoom_notifications_cache_v1_a: '{}',
    varoom_user_role: 'host',
  });
  const chatCalls = [];
  const chatCache = {
    clearUser: async (id) => chatCalls.push(['clearUser', id]),
    clearMedia: async () => chatCalls.push(['clearMedia']),
    clearAll: async () => chatCalls.push(['clearAll']),
  };
  const profileStoreCalls = [];

  assert.equal(hasStaleAccountData(local), true);
  await clearUserData('a', {
    localStorage: local,
    sessionStorage: session,
    profileStore: { clear: (id) => profileStoreCalls.push(id) },
    loadChatCache: async () => chatCache,
  });

  assert.deepEqual(local.keys().sort(), ['varoom_linked_accounts', 'varoom_listing_draft_pointer:a', 'varoom_theme']);
  assert.deepEqual(session.keys().sort(), ['varoom:data-cache:v1:' + encodeURIComponent('public:listings'), 'varoom_user_role']);
  assert.deepEqual(profileStoreCalls, ['a']);
  assert.deepEqual(chatCalls, [['clearUser', 'a'], ['clearMedia']]);
  assert.equal(hasStaleAccountData(local), false);
});

test('clearUserData keeps another account\'s cached identity (account switch)', async () => {
  const { clearUserData } = loadTs(path.join(root, 'lib', 'auth', 'clearUserData.ts'), {
    globals: { window: undefined, sessionStorage: undefined },
  });
  const local = memoryStorage({
    varoom_cached_profile: JSON.stringify({ id: 'b', full_name: 'B', role: 'client' }),
    varoom_active_account_id: 'b',
  });
  await clearUserData('a', { localStorage: local, sessionStorage: memoryStorage() });
  assert.equal(JSON.parse(local.getItem('varoom_cached_profile')).id, 'b');
  assert.equal(local.getItem('varoom_active_account_id'), 'b');
});
