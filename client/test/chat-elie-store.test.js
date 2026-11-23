const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const { createElieStore, elieStorageKey, ELIE_PENDING_MS } = loadTs(path.join(root, 'lib', 'chat', 'elieStore.ts'));
const elie = loadTs(path.join(root, 'lib', 'chat', 'elie.ts'));

// Supabase as the store uses it: sessions, messages (with or without the results column).
function fakeClient({ rows = [], missingResults = false } = {}) {
  const calls = [];
  const db = { rows: rows.slice() };
  const from = (table) => ({
    insert(value) {
      calls.push(['insert', table, value]);
      const failed = table === 'elie_messages' && missingResults && JSON.stringify(value).includes('"results"');
      const result = table === 'elie_sessions' ? { data: { id: 'sess-1' }, error: null } : { data: null, error: failed ? { code: '42703', message: 'column "results" does not exist' } : null };
      const done = Promise.resolve(result);
      done.select = () => ({ single: async () => result });
      return done;
    },
    select(columns) {
      calls.push(['select', table, columns]);
      const query = {
        eq: () => query,
        order: async () => (missingResults && columns.includes('results')
          ? { data: null, error: { code: '42703', message: 'column "results" does not exist' } }
          : { data: db.rows.slice(), error: null }),
      };
      return query;
    },
    update(value) { calls.push(['update', table, value]); return { eq: async () => ({ error: null }) }; },
  });
  return { calls, db, client: { from } };
}

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key), items };
}

function makeStore({ client = fakeClient().client, storage = memoryStorage(), ask, now = () => 1000, wait = async () => {} } = {}) {
  return createElieStore({ getClient: () => client, getStorage: () => storage, getToken: async () => 'tok', ask, now, wait, fetchWallet: async () => ({ balance: 50, included: false }) });
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('asking creates the session once, sends it, and leaves saving to the Elie service', async () => {
  const { calls, client } = fakeClient();
  const storage = memoryStorage();
  const asked = [];
  const store = makeStore({ client, storage, ask: async (request) => { asked.push(request); return { reply: 'Here you go.', saved: true, vcoins: { balance: 40, included: false } }; } });
  store.setUser('u1');
  await settle();
  await store.send('Airbnbs in Kilimani');
  await store.send('cheaper ones');
  assert.equal(calls.filter(([op, table]) => op === 'insert' && table === 'elie_sessions').length, 1);
  assert.deepEqual(asked.map((request) => request.sessionId), ['sess-1', 'sess-1']);
  assert.deepEqual(asked[1].history.map((turn) => turn.text), ['Airbnbs in Kilimani', 'Here you go.', 'cheaper ones']);
  assert.equal(calls.some(([op, table]) => op === 'insert' && table === 'elie_messages'), false, 'the service saved both turns');
  const state = store.getState();
  assert.deepEqual(state.entries.map((entry) => entry.kind), ['user', 'elie', 'user', 'elie']);
  assert.equal(state.thinking, false);
  assert.equal(state.wallet.balance, 40);
  // The open search is remembered with no question waiting.
  assert.deepEqual(JSON.parse(storage.getItem(elieStorageKey('u1'))), { sessionId: 'sess-1', savedAt: 1000, pending: null });
});

test('when the service could not save, the page saves the question and answer, answer last', async () => {
  const { calls, client } = fakeClient({ missingResults: true });
  const store = makeStore({ client, ask: async () => ({ reply: 'Found two.', listings: [{ id: 'l1' }], saved: false }) });
  store.setUser('u1');
  await settle();
  await store.send('lofts');
  await settle();
  const inserts = calls.filter(([op, table]) => op === 'insert' && table === 'elie_messages').map(([, , rows]) => rows);
  assert.equal(inserts.length, 2, 'retried without the results column (before migration 000080)');
  assert.deepEqual(inserts[0].map((row) => [row.role, row.body]), [['user', 'lofts'], ['elie', 'Found two.']]);
  assert.deepEqual(inserts[0][1].results, { listings: [{ id: 'l1' }] });
  assert.equal('results' in inserts[1][1], false);
  assert.ok(inserts[0][0].created_at < inserts[0][1].created_at);
});

test('the answer lands even when nobody is watching (Elie left, chat or page switched)', async () => {
  let answer;
  const store = makeStore({ ask: () => new Promise((resolve) => { answer = resolve; }) });
  store.setUser('u1');
  await settle();
  const unsubscribe = store.subscribe(() => {});
  const asking = store.send('venues in Nakuru');
  await settle();
  unsubscribe();
  assert.equal(store.getState().thinking, true);
  answer({ reply: 'Here are venues.', saved: true });
  await asking;
  assert.deepEqual(store.getState().entries.map((entry) => entry.kind), ['user', 'elie']);
  assert.equal(store.getState().thinking, false);
});

test('another account starts empty and never receives the first account\'s answer or coins', async () => {
  let answer;
  const store = makeStore({ ask: () => new Promise((resolve) => { answer = resolve; }) });
  store.setUser('u1');
  await settle();
  const asking = store.send('offices');
  await settle();
  store.setUser('u2');
  await settle();
  answer({ reply: 'For u1 only', saved: true, vcoins: { balance: 7, included: false } });
  await asking;
  const state = store.getState();
  assert.equal(state.userId, 'u2');
  assert.deepEqual(state.entries, []);
  assert.equal(state.wallet, null);
  assert.equal(state.thinking, false);
});

test('after a reload the open search comes back, and an answer still on its way is waited for', async () => {
  const { client, db } = fakeClient({ rows: [{ role: 'user', body: 'hotels', results: null }, { role: 'elie', body: 'Two hotels.', results: { listings: [{ id: 'h1' }] } }] });
  const storage = memoryStorage({ [elieStorageKey('u1')]: JSON.stringify({ sessionId: 'sess-9', savedAt: 900, pending: { question: 'cheaper?', askedAt: 950 } }) });
  let waits = 0;
  const store = makeStore({
    client, storage,
    wait: async () => {
      waits += 1;
      if (waits === 2) db.rows.push({ role: 'user', body: 'cheaper?', results: null }, { role: 'elie', body: 'One under 5k.', results: null });
    },
  });
  store.setUser('u1');
  await settle(); await settle();
  for (let i = 0; i < 10 && store.getState().thinking; i += 1) await settle();
  const state = store.getState();
  assert.deepEqual(state.entries.map((entry) => entry.kind), ['user', 'elie', 'listings', 'user', 'elie'], 'listing cards come back from results');
  assert.equal(state.entries[4].text, 'One under 5k.');
  assert.equal(state.thinking, false);
  assert.equal(JSON.parse(storage.getItem(elieStorageKey('u1'))).pending, null);
});

test('an answer that never arrives ends with Ask again, and the open search is forgotten after a day', async () => {
  const { client } = fakeClient({ rows: [] });
  let time = 1000;
  const storage = memoryStorage({ [elieStorageKey('u1')]: JSON.stringify({ sessionId: 'sess-9', savedAt: 1000, pending: { question: 'venues', askedAt: 1000 } }) });
  const store = makeStore({ client, storage, now: () => time, wait: async () => { time += ELIE_PENDING_MS; } });
  store.setUser('u1');
  for (let i = 0; i < 10; i += 1) await settle();
  const last = store.getState().entries.at(-1);
  assert.equal(last.kind, 'error');
  assert.equal(last.retryText, 'venues');

  const stale = memoryStorage({ [elieStorageKey('u3')]: JSON.stringify({ sessionId: 'old', savedAt: 0, pending: null }) });
  const fresh = makeStore({ client, storage: stale, now: () => 2 * 24 * 60 * 60 * 1000 });
  fresh.setUser('u3');
  await settle();
  assert.deepEqual(fresh.getState().entries, []);
});

test('New search empties the thread and forgets the open search', async () => {
  const storage = memoryStorage();
  const store = makeStore({ storage, ask: async () => ({ reply: 'ok', saved: true }) });
  store.setUser('u1');
  await settle();
  await store.send('hi');
  assert.ok(storage.getItem(elieStorageKey('u1')));
  store.newSearch();
  assert.deepEqual(store.getState().entries, []);
  assert.equal(storage.getItem(elieStorageKey('u1')), null);
});

test('saved turns become the thread: questions, answers, news and listing cards', () => {
  const entries = elie.elieTurnEntries([
    { role: 'user', text: 'news on land rates', results: null },
    { role: 'elie', text: 'Rates rose.', results: { news: [{ title: 'Rates' }] } },
    { role: 'elie', text: 'Plain answer', results: null },
  ]);
  assert.deepEqual(entries.map((entry) => entry.kind), ['user', 'elie', 'news', 'elie']);
});
