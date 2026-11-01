const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const { createCountsStore } = loadTs(path.join(root, 'lib', 'counts', 'countsStore.ts'), {
  mocks: { react: { useEffect() {}, useState: (v) => [typeof v === 'function' ? v() : v, () => {}] } },
});

// A Supabase-like client: notification count (head), paged booking rows and
// one realtime channel per subscribe call.
function fakeClient({ unread = 3, bookingRows = [], failNotifications = false } = {}) {
  const log = { countQueries: 0, bookingPages: 0, channels: [], removed: 0 };
  const client = {
    log,
    from(table) {
      assert.equal(table, 'notifications');
      const query = { head: false, range: null };
      const builder = {
        select(_columns, options) { query.head = Boolean(options && options.head); return builder; },
        eq() { return builder; },
        in() { return builder; },
        order() { return builder; },
        range(from, to) { query.range = [from, to]; return builder; },
        then(resolve, reject) {
          if (query.head) {
            log.countQueries += 1;
            return Promise.resolve(failNotifications ? { count: null, error: new Error('boom') } : { count: unread, error: null }).then(resolve, reject);
          }
          log.bookingPages += 1;
          const [from, to] = query.range;
          return Promise.resolve({ data: bookingRows.slice(from, to + 1), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
    channel(name) {
      const channel = { name, handlers: [], status: null };
      channel.on = (_type, _filter, handler) => { channel.handlers.push(handler); return channel; };
      channel.subscribe = (callback) => { channel.statusCallback = callback; return channel; };
      log.channels.push(channel);
      return channel;
    },
    removeChannel() { log.removed += 1; return Promise.resolve(); },
  };
  return client;
}

function harness(clientOptions = {}, chatUnread = 2) {
  const client = fakeClient(clientOptions);
  const timers = [];
  const repeats = new Map();
  let clock = 1_000;
  let chatCalls = 0;
  const store = createCountsStore({
    getClient: () => client,
    fetchChatUnread: async () => { chatCalls += 1; return chatUnread; },
    now: () => clock,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
    setRepeat: (fn, ms) => { const id = repeats.size + 1; repeats.set(id, { fn, ms }); return id; },
    clearRepeat: (id) => { repeats.delete(id); },
  });
  return {
    store, client, timers, repeats,
    advance: (ms) => { clock += ms; },
    chatCalls: () => chatCalls,
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

test('start loads all three counts once and opens a single realtime channel', async () => {
  const h = harness({ unread: 5, bookingRows: [{ booking_id: 'b1' }, { booking_id: 'b1' }, { booking_id: 'b2' }] }, 4);
  h.store.start('user-1');
  await h.settle();
  const counts = h.store.get();
  assert.deepEqual([counts.userId, counts.notifications, counts.bookings, counts.chats], ['user-1', 5, 2, 4]);
  assert.equal(h.client.log.channels.length, 1);
  assert.equal(h.client.log.channels[0].name, 'counts-user-1');
  assert.equal(h.client.log.channels[0].handlers.length, 2, 'notifications + messages');
  h.store.start('user-1');
  assert.equal(h.client.log.channels.length, 1, 'starting the same user again is a no-op');
});

test('realtime events are debounced into one refresh, and concurrent refreshes share a request', async () => {
  const h = harness();
  h.store.start('user-1');
  await h.settle();
  const before = h.client.log.countQueries;
  const [notificationsHandler, messagesHandler] = h.client.log.channels[0].handlers;
  notificationsHandler(); messagesHandler(); notificationsHandler();
  assert.equal(h.timers.length, 3);
  h.timers.at(-1)();
  await Promise.all([h.store.refresh(), h.store.refresh()]);
  await h.settle();
  assert.equal(h.client.log.countQueries - before, 1);
});

test('refreshIfStale skips fresh counts and refreshes stale ones', async () => {
  const h = harness();
  h.store.start('user-1');
  await h.settle();
  const before = h.client.log.countQueries;
  await h.store.refreshIfStale(30_000);
  assert.equal(h.client.log.countQueries, before);
  h.advance(31_000);
  await h.store.refreshIfStale(30_000);
  assert.equal(h.client.log.countQueries, before + 1);
});

test('a failed query keeps the previous value; the page-reported count is applied', async () => {
  const h = harness({ unread: 7 });
  h.store.start('user-1');
  await h.settle();
  assert.equal(h.store.get().notifications, 7);
  const failing = harness({ failNotifications: true });
  failing.store.start('user-2');
  await failing.settle();
  assert.equal(failing.store.get().notifications, 0, 'never loaded: stays zero');
  failing.store.setNotifications(9);
  await failing.store.refresh();
  assert.equal(failing.store.get().notifications, 9, 'a failed refresh does not overwrite it');
  assert.equal(failing.store.get().chats, 2, 'other counts still update');
});

test('switching or signing out resets counts and closes the channel', async () => {
  const h = harness({ unread: 4 });
  h.store.start('user-1');
  await h.settle();
  h.store.start('user-2');
  assert.equal(h.client.log.removed, 1);
  assert.equal(h.store.get().userId, 'user-2');
  assert.equal(h.store.get().notifications, 0, "user-1's counts are not shown for user-2");
  await h.settle();
  h.store.stop();
  assert.equal(h.client.log.removed, 2);
  assert.deepEqual([h.store.get().userId, h.store.get().notifications], [null, 0]);
});

test('without realtime the store falls back to a one-minute refresh, and stops it once connected', async () => {
  const h = harness();
  h.store.start('user-1');
  await h.settle();
  h.client.log.channels[0].statusCallback('CHANNEL_ERROR');
  assert.equal(h.repeats.size, 1);
  assert.equal([...h.repeats.values()][0].ms, 60_000);
  h.client.log.channels[0].statusCallback('SUBSCRIBED');
  assert.equal(h.repeats.size, 0);
});

test('booking counts page through more than 1000 unread booking notifications', async () => {
  const rows = Array.from({ length: 2300 }, (_, i) => ({ booking_id: `b${i % 1500}` }));
  const h = harness({ bookingRows: rows });
  h.store.start('user-1');
  await h.settle(); await h.settle();
  assert.equal(h.store.get().bookings, 1500);
  assert.equal(h.client.log.bookingPages, 3);
});

test('legacy varoom-sidebar.js and Chats use the shared store inside the app', () => {
  const legacy = fs.readFileSync(path.join(root, 'public', 'js', 'varoom-sidebar.js'), 'utf8');
  assert.match(legacy, /if \(window\.VaRoomCounts && client === window\.supabaseClient\)/);
  assert.match(legacy, /return window\.VaRoomCounts\.refreshIfStale\(\);/);
  const chats = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
  assert.match(chats, /void window\.VaRoomCounts\.refresh\(\);/);
  for (const file of ['SharedHostSidebar.jsx', 'SharedClientSidebar.jsx']) {
    const sidebar = fs.readFileSync(path.join(root, 'components', file), 'utf8');
    assert.doesNotMatch(sidebar, /from\('notifications'\)/, `${file} no longer queries counts`);
  }
});
