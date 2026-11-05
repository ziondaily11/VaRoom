const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const notificationsPagePath = path.join(root, 'pages', 'notifications.tsx');
const cacheModulePath = path.join(root, 'lib', 'notificationsCache.ts');
const dataModulePath = path.join(root, 'lib', 'notifications', 'notificationsData.ts');
const viewModulePath = path.join(root, 'lib', 'notifications', 'notificationsView.ts');
const shellStylesPath = path.join(root, 'components', 'shell', 'shellStyles.ts');
const slugPath = path.join(root, 'pages', '[...slug].js');
const { getAccountLayout } = loadTs(path.join(root, 'lib', 'accountRoleLayout.ts'));
const { HOST_INTERNAL_ROUTES, CLIENT_INTERNAL_ROUTES, isInternalHref } = loadTs(
  path.join(root, 'lib', 'navigation', 'appLinks.ts'),
);

const readPage = () => fs.readFileSync(notificationsPagePath, 'utf8');
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A browser-like window: sessionStorage for the caches, events for the
// unread-count bridge and matchMedia for the laptop/phone booking target.
function makeWindow({ desktop = true } = {}) {
  const store = new Map();
  const win = new EventTarget();
  win.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] || null,
  };
  win.matchMedia = (query) => ({ matches: desktop && query.includes('min-width: 861px'), media: query });
  return win;
}

// The cache, data and view modules share one cache instance and one window.
function loadModules(options) {
  const window = makeWindow(options);
  const cache = loadTs(cacheModulePath, { globals: { window } });
  const mocks = { '../notificationsCache': cache };
  const data = loadTs(dataModulePath, { globals: { window }, mocks });
  const view = loadTs(viewModulePath, { mocks });
  cache.clearNotificationsCache();
  return { window, cache, data, view };
}

function recordCountEvents(window) {
  const counts = [];
  window.addEventListener('varoom_notification_count', (event) => counts.push(event.detail.count));
  return counts;
}

// Records each Supabase query chain; `respond` returns the awaited result.
function fakeSupabase(respond = () => ({ data: [], error: null })) {
  const queries = [];
  const removed = [];
  const channels = [];
  const client = {
    from(table) {
      const query = { table, ops: [] };
      queries.push(query);
      const builder = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === 'then') {
              return (resolve, reject) => Promise.resolve().then(() => respond(query)).then(resolve, reject);
            }
            return (...args) => {
              query.ops.push([prop, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
    channel(name) {
      const channel = { name, handlers: [], subscribed: false };
      channel.on = (event, filter, handler) => {
        channel.handlers.push({ event, filter, handler });
        return channel;
      };
      channel.subscribe = () => {
        channel.subscribed = true;
        return channel;
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) {
      removed.push(channel);
    },
  };
  return { client, queries, channels, removed };
}

const op = (query, name) => query.ops.filter(([prop]) => prop === name).map(([, ...args]) => args);

function notification(overrides = {}) {
  return { id: 'n-1', title: 'Title', message: 'Message', type: 'system', read: false, created_at: iso(0), ...overrides };
}

test('1. Native React route and retired legacy files', () => {
  assert.ok(fs.existsSync(notificationsPagePath), 'notifications.tsx must exist');
  assert.equal(fs.existsSync(slugPath), false, 'the legacy catch-all is retired (E1)');
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'notifications.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'notifications-page.js')), false);
});

test('2. Correct client/host layout selection with no duplicate shell', () => {
  assert.equal(getAccountLayout('/notifications', '/notifications', 'client'), 'client');
  assert.equal(getAccountLayout('/notifications', '/notifications', 'host'), 'host');
  assert.equal(getAccountLayout('/notifications', '/notifications', null), 'none');

  // The shared layout owns the sidebar and app shell; the page renders only
  // its main column (which the layout-specific CSS overrides target).
  const pageSource = readPage();
  assert.doesNotMatch(pageSource, /<aside\b[^>]*\bid="sidebar"/, 'Must not render legacy sidebar');
  assert.doesNotMatch(pageSource, /<div\b[^>]*className="app-shell"/, 'Must not render duplicate app-shell');
  assert.match(pageSource, /className="notifications-page-main"/);
});

test('3a. Tab filter, search and booking count', () => {
  const { view, cache } = loadModules();
  const items = [
    notification({
      id: 'b-1',
      type: 'booking_approved',
      title: 'Booking Confirmed',
      message: 'Host approved your reservation',
      metadata: { listing_name: 'Kilimani Penthouse', guest_name: 'David', booking_reference: 'VAR-1029' },
    }),
    notification({ id: 'b-2', type: 'booking_request', title: null, message: 'New request' }),
    notification({ id: 'm-1', type: 'new_message', title: 'Hello', message: 'Are you there?' }),
  ];

  assert.deepEqual(view.filterNotifications(items, 'all', '').map((n) => n.id), ['b-1', 'b-2', 'm-1']);
  assert.deepEqual(view.filterNotifications(items, 'booking', '').map((n) => n.id), ['b-1', 'b-2']);
  assert.equal(view.countBookingNotifications(items), 2);

  // Search is trimmed, case-insensitive and covers metadata and the type's default title.
  assert.deepEqual(view.filterNotifications(items, 'all', '  KILIMANI ').map((n) => n.id), ['b-1']);
  assert.deepEqual(view.filterNotifications(items, 'all', 'var-1029').map((n) => n.id), ['b-1']);
  assert.deepEqual(view.filterNotifications(items, 'all', 'new booking request').map((n) => n.id), ['b-2']);
  assert.deepEqual(view.filterNotifications(items, 'booking', 'are you there').map((n) => n.id), []);
  assert.deepEqual(view.filterNotifications(items, 'all', 'nothing matches').map((n) => n.id), []);

  const searchable = cache.searchableText(items[0], cache.detailsFor('booking_approved'));
  for (const text of ['kilimani penthouse', 'david', 'var-1029', 'booking confirmed']) {
    assert.ok(searchable.includes(text), text);
  }
});

test('3b. Header subtitle, empty and error states', () => {
  const { view } = loadModules();
  assert.equal(view.notificationsSubtitle(0), "You're all caught up");
  assert.equal(view.notificationsSubtitle(1), 'You have 1 new notification');
  assert.equal(view.notificationsSubtitle(4), 'You have 4 new notifications');

  assert.equal(view.emptyNotificationsMessage(''), 'Nothing here yet.');
  assert.equal(view.emptyNotificationsMessage('   '), 'Nothing here yet.');
  assert.equal(view.emptyNotificationsMessage('rent'), 'No notifications found');

  // The skeleton and error copy are page markup.
  const pageSource = readPage();
  assert.match(pageSource, /className="notifications-skeleton" role="status" aria-label="Loading notifications"/);
  assert.match(pageSource, /Unable to load notifications\. Please refresh and try again\./);
  assert.match(pageSource, /Unable to update notifications\. Please try again\./);
});

test('3c. Time-ago labels, date groups and notification styling by type', () => {
  const { view, cache } = loadModules();
  assert.equal(cache.timeAgo(iso(20 * 1000)), 'just now');
  assert.equal(cache.timeAgo(iso(5 * MINUTE)), '5m ago');
  assert.equal(cache.timeAgo(iso(59 * MINUTE)), '59m ago');
  assert.equal(cache.timeAgo(iso(3 * HOUR)), '3h ago');
  assert.equal(cache.timeAgo(iso(2 * DAY + HOUR)), '2d ago');

  const now = new Date();
  const yesterdayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12).toISOString();
  const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 12).toISOString();
  const groups = view.groupNotificationsByDate([
    notification({ id: 'a', created_at: now.toISOString() }),
    notification({ id: 'b', created_at: yesterdayNoon }),
    notification({ id: 'c', created_at: lastWeek }),
    notification({ id: 'd', created_at: now.toISOString() }),
  ]);
  assert.deepEqual(
    { Today: groups.Today.map((n) => n.id), Yesterday: groups.Yesterday.map((n) => n.id), Older: groups.Older.map((n) => n.id) },
    { Today: ['a', 'd'], Yesterday: ['b'], Older: ['c'] },
  );

  assert.deepEqual(cache.detailsFor('booking_approved'), {
    category: 'booking', title: 'Booking Confirmed', tint: 'tint-green', tag: 'Booking', iconKind: 'approved',
  });
  assert.equal(cache.detailsFor('booking_declined').iconKind, 'declined');
  assert.equal(cache.detailsFor('booking_cancelled').title, 'Booking Cancelled');
  assert.equal(cache.detailsFor('booking_request').title, 'New Booking Request');
  assert.equal(cache.detailsFor('new_message').tag, 'Message');
  assert.equal(cache.detailsFor('new_review').title, 'New review');
  assert.equal(cache.detailsFor('review_published').title, 'Review published');
  assert.deepEqual(cache.detailsFor('something_else'), {
    category: 'other', title: 'Notification', tint: 'tint-black', tag: 'Update', iconKind: 'request',
  });
});

test('4. Cached repeat visits and background refresh policy (30s TTL)', () => {
  const { cache } = loadModules();
  assert.equal(cache.NOTIFICATIONS_CACHE_TTL_MS, 30 * 1000);

  cache.setCachedNotifications(
    [
      notification({ id: 'n-1', type: 'payment_success' }),
      notification({ id: 'n-2', type: 'booking_request', read: true }),
    ],
    'user-123',
    1,
  );
  const cached = cache.getCachedNotifications('user-123');
  assert.ok(cached);
  assert.equal(cached.items.length, 2);
  assert.equal(cached.unreadCount, 1);
  assert.equal(cached.isFresh, true);
  assert.ok(cached.age < 500);

  // Without an explicit count the unread items are counted.
  cache.setCachedNotifications([notification({ id: 'x' }), notification({ id: 'y', read: true })], 'user-456');
  assert.equal(cache.getCachedNotifications('user-456').unreadCount, 1);
  assert.equal(cache.getCachedNotifications(''), null);
});

test('5. Account switching and cache isolation', () => {
  const { cache } = loadModules();
  cache.setCachedNotifications([notification({ id: 'n-a1', message: 'Secret to A' })], 'user-A', 1);
  assert.equal(cache.getCachedNotifications('user-B'), null);

  cache.setCachedNotifications([notification({ id: 'n-b1', message: 'Secret to B' })], 'user-B', 1);
  const cachedB = cache.getCachedNotifications('user-B');
  assert.equal(cachedB.items[0].id, 'n-b1');
  assert.equal(cachedB.items[0].message, 'Secret to B');
  assert.equal(cache.getCachedNotifications('user-A').items[0].id, 'n-a1');

  cache.clearNotificationsCache('user-A');
  assert.equal(cache.getCachedNotifications('user-A'), null);
  assert.ok(cache.getCachedNotifications('user-B'));
});

test('6a. Mark-as-read: optimistic state, cache and unread count', () => {
  const { cache, data } = loadModules();
  const items = [notification({ id: 'n-1' }), notification({ id: 'n-2' })];
  cache.setCachedNotifications(items, 'user-mark', 2);

  const afterOne = data.markReadLocally(items, 2, 'n-1', 'user-mark');
  assert.equal(afterOne.unreadCount, 1);
  assert.equal(afterOne.items.find((i) => i.id === 'n-1').read, true);
  assert.equal(afterOne.items.find((i) => i.id === 'n-2').read, false);
  assert.equal(cache.getCachedNotifications('user-mark').unreadCount, 1, 'the cache follows the optimistic state');

  // Opening an already-read notification does not lower the count again.
  assert.equal(data.markReadLocally(afterOne.items, 1, 'n-1', 'user-mark').unreadCount, 1);

  const afterAll = data.markAllReadLocally(afterOne.items, 'user-mark');
  assert.equal(afterAll.unreadCount, 0);
  assert.ok(afterAll.items.every((i) => i.read === true));
  assert.equal(cache.getCachedNotifications('user-mark').unreadCount, 0);

  // Without a cache entry the page's in-memory list is updated instead.
  const uncached = data.markReadLocally(items, 0, 'n-2', 'nobody');
  assert.equal(uncached.unreadCount, 0, 'never below zero');
  assert.equal(uncached.items.find((i) => i.id === 'n-2').read, true);
  assert.equal(uncached.items.find((i) => i.id === 'n-1').read, false);
  assert.ok(data.markAllReadLocally(items, 'nobody').items.every((i) => i.read));
  assert.equal(cache.getCachedNotifications('nobody'), null, 'no cache entry is created for another account');
});

test('6b. A failed write restores the cache and the sidebar badge', () => {
  const { cache, data, window } = loadModules();
  const counts = recordCountEvents(window);
  const before = [notification({ id: 'n-1' }), notification({ id: 'n-2' })];
  cache.setCachedNotifications(before, 'user-fail', 2);

  data.markAllReadLocally(before, 'user-fail');
  assert.equal(cache.getCachedNotifications('user-fail').unreadCount, 0);

  data.restoreNotificationsSnapshot(before, 'user-fail', 2);
  const restored = cache.getCachedNotifications('user-fail');
  assert.equal(restored.unreadCount, 2);
  assert.ok(restored.items.every((i) => i.read === false));
  assert.deepEqual(counts, [2]);

  // Every failure path (error result and thrown error, for one and for all)
  // rolls the page state back and calls the restore.
  const pageSource = readPage();
  assert.equal(pageSource.match(/restoreNotificationsSnapshot\(prevItems, userId, prevUnread\)/g).length, 4);
  assert.equal(pageSource.match(/setNotifications\(prevItems\);\s*setUnreadCount\(prevUnread\);/g).length, 4);
});

test('6c. Supabase reads and writes are scoped to the recipient', async () => {
  const { data } = loadModules();
  const rows = [notification({ id: 'n-1' }), notification({ id: 'n-2', read: true }), notification({ id: 'n-3' })];

  const withCount = fakeSupabase((q) => (op(q, 'select')[0][1]?.head ? { count: 7, error: null } : { data: rows, error: null }));
  const snapshot = await data.fetchNotificationsSnapshot(withCount.client, 'user-1');
  assert.deepEqual(snapshot, { items: rows, unreadCount: 7 }, 'the exact unread count wins');
  const [list, count] = withCount.queries;
  assert.equal(list.table, 'notifications');
  assert.deepEqual(op(list, 'select'), [[data.NOTIFICATION_COLUMNS]]);
  assert.deepEqual(op(list, 'eq'), [['recipient_user_id', 'user-1']]);
  assert.deepEqual(op(list, 'order'), [['created_at', { ascending: false }]]);
  assert.deepEqual(op(list, 'limit'), [[100]]);
  assert.deepEqual(op(count, 'select'), [['id', { count: 'exact', head: true }]]);
  assert.deepEqual(op(count, 'eq'), [['recipient_user_id', 'user-1'], ['read', false]]);

  const noCount = fakeSupabase((q) => (op(q, 'select')[0][1]?.head ? { count: null, error: null } : { data: rows, error: null }));
  assert.equal((await data.fetchNotificationsSnapshot(noCount.client, 'user-1')).unreadCount, 2, 'falls back to unread rows');

  const empty = fakeSupabase((q) => (op(q, 'select')[0][1]?.head ? { count: 0, error: null } : { data: null, error: null }));
  assert.deepEqual(await data.fetchNotificationsSnapshot(empty.client, 'user-1'), { items: [], unreadCount: 0 });

  const failure = { message: 'denied' };
  const failing = fakeSupabase(() => ({ data: null, error: failure, count: null }));
  assert.deepEqual(await data.fetchNotificationsSnapshot(failing.client, 'user-1'), { error: failure });

  const writes = fakeSupabase(() => ({ error: null }));
  await data.markNotificationReadRequest(writes.client, 'n-9', 'user-1');
  await data.markAllNotificationsReadRequest(writes.client, 'user-1');
  const [one, all] = writes.queries;
  assert.deepEqual(op(one, 'update'), [[{ read: true }]]);
  assert.deepEqual(op(one, 'eq'), [['id', 'n-9'], ['recipient_user_id', 'user-1']]);
  assert.deepEqual(op(all, 'update'), [[{ read: true }]]);
  assert.deepEqual(op(all, 'eq'), [['recipient_user_id', 'user-1'], ['read', false]]);
});

test('7. Notification actions and their intended navigation destinations', () => {
  const desktop = loadModules({ desktop: true }).cache;
  const phone = loadModules({ desktop: false }).cache;

  const booking = notification({ type: 'booking_approved', booking_id: 'b-777', related_entity_type: 'booking' });
  assert.equal(desktop.notificationTarget({ ...booking, type: 'booking_request', booking_id: 'b-999' }, 'host'), '/bookings?booking=b-999');
  assert.equal(phone.notificationTarget({ ...booking, booking_id: 'b-999' }, 'host'), '/bookings?booking=b-999');
  // Clients open the Bookings rail on laptops/desktops and the booking page on phones.
  assert.equal(desktop.notificationTarget(booking, 'client'), '/bookings?booking=b-777');
  assert.equal(phone.notificationTarget(booking, 'client'), '/booking-approved?id=b-777');
  // related_entity_id wins over booking_id and is URL-encoded.
  assert.equal(
    desktop.notificationTarget({ ...booking, related_entity_id: 'a b' }, 'host'),
    '/bookings?booking=a%20b',
  );

  const chat = notification({ type: 'new_message', related_entity_type: 'conversation', related_entity_id: 'conv-123' });
  assert.equal(desktop.notificationTarget(chat, 'client'), '/chats?c=conv-123');
  const review = notification({ type: 'new_review', related_entity_type: 'review', related_entity_id: 'rev-456' });
  assert.equal(desktop.notificationTarget(review, 'client'), '/profile');
  assert.equal(desktop.notificationTarget(notification({ type: 'system' }), 'client'), null);
});

test('8. Request cancellation and prevention of stale responses', () => {
  // The version/mounted guard lives in the page's fetch callback (refs).
  const pageSource = readPage();
  const guard = /if \(version !== requestVersionRef\.current \|\| !mountedRef\.current\) return;/g;
  assert.equal(pageSource.match(guard).length, 2, 'both the result and the error path drop stale responses');
  assert.match(pageSource, /const version = \+\+requestVersionRef\.current/);
  assert.match(pageSource, /mountedRef\.current = false;\s*requestVersionRef\.current \+= 1;/, 'unmount invalidates in-flight requests');
});

test('9. The page-owned realtime channel and its cleanup', () => {
  const { data } = loadModules();
  const { client, channels } = fakeSupabase();
  let changes = 0;
  const channel = data.subscribeToNotificationChanges(client, 'user-7', () => { changes += 1; });

  assert.equal(channel, channels[0]);
  assert.equal(channel.name, 'notifications-page-user-7');
  assert.equal(channel.subscribed, true);
  assert.equal(channel.handlers.length, 1);
  assert.equal(channel.handlers[0].event, 'postgres_changes');
  assert.deepEqual(channel.handlers[0].filter, {
    event: '*', schema: 'public', table: 'notifications', filter: 'recipient_user_id=eq.user-7',
  });
  channel.handlers[0].handler({});
  assert.equal(changes, 1);

  // Cleanup removes only this channel, never every channel (the shared counts
  // store keeps its own).
  const pageSource = readPage();
  assert.match(pageSource, /client\.removeChannel\(realtimeChannelRef\.current\)/);
  assert.doesNotMatch(pageSource, /removeAllChannels/);
});

test('10. The unread count reaches the shared counts store the sidebars read', async () => {
  const { data, window } = loadModules();
  const react = { useEffect: () => {}, useState: (init) => [typeof init === 'function' ? init() : init, () => {}] };
  const countsStore = loadTs(path.join(root, 'lib', 'counts', 'countsStore.ts'), { mocks: { react } });
  const document = new EventTarget();
  const bridge = loadTs(path.join(root, 'lib', 'counts', 'CountsBridge.tsx'), {
    globals: { window, document },
    mocks: {
      react,
      './countsStore': countsStore,
      '../api': { apiFetch: async () => ({ count: 0 }) },
      '../supabase/client': { getSupabaseClient: () => null },
      '../auth/AuthProvider': { useAuth: () => ({ status: 'loading', user: null }) },
    },
  });

  bridge.installCounts();
  const store = countsStore.getCountsStore();
  store.start('user-1');
  await store.refresh();

  data.syncSidebarUnreadCount(5);
  assert.equal(store.get().notifications, 5);
  assert.equal(window.VaRoomCounts.get().notifications, 5);
  data.syncSidebarUnreadCount(0);
  assert.equal(store.get().notifications, 0);

  // The page reports every count change; the legacy sidebar global is gone (E2).
  const pageSource = readPage();
  assert.match(pageSource, /syncSidebarUnreadCount\(/);
  assert.doesNotMatch(pageSource, /VaroomSidebar/);

  const sharedClientSidebarSource = fs.readFileSync(path.join(root, 'components', 'shell/ClientSidebar.tsx'), 'utf8');
  const sharedHostSidebarSource = fs.readFileSync(path.join(root, 'components', 'shell/HostSidebar.tsx'), 'utf8');
  assert.match(sharedClientSidebarSource, /const unreadCount = useCounts\(\)\.notifications;/);
  assert.match(sharedHostSidebarSource, /const unreadCount = useCounts\(\)\.notifications;/);
  assert.doesNotMatch(sharedHostSidebarSource, /setInterval\(refreshUser/);

  // Both shells navigate to /notifications client-side.
  assert.equal(isInternalHref('/notifications', HOST_INTERNAL_ROUTES), true);
  assert.equal(isInternalHref('/notifications', CLIENT_INTERNAL_ROUTES), true);
});

test('11. Regression checks for Property News and other shared routing/layout behavior', () => {
  assert.equal(isInternalHref('/property-news', HOST_INTERNAL_ROUTES), true);
  assert.equal(isInternalHref('/property-news', CLIENT_INTERNAL_ROUTES), true);

  // Property News keeps its own editorial shell.
  assert.equal(getAccountLayout('/property-news', '/property-news', 'client'), 'none');
  assert.equal(getAccountLayout('/property-news', '/property-news', 'host'), 'none');

  for (const route of ['/bookings', '/notifications', '/profile', '/settings']) {
    assert.equal(getAccountLayout(route, route, 'client'), 'client');
    assert.equal(getAccountLayout(route, route, 'host'), 'host');
    assert.equal(getAccountLayout(route, route, null), 'none');
  }
});

test('12. Complete legacy unwiring verification', () => {
  const notifPageSource = readPage();

  // 1. Next.js and Vercel keep permanent compatibility redirects to the native route.
  const nextConfigSource = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8');
  assert.match(nextConfigSource, /source: '\/legacy-pages\/notifications\.html',\s*destination: '\/notifications'/);
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(vercelConfig.redirects.some(({ source, destination }) => source === '/:page.html' && destination === '/:page'));

  // 2. No legacy template route remains (the catch-all is retired).
  assert.equal(fs.existsSync(slugPath), false);

  // 3. The native profile's topbar opens /notifications (legacy profile.html is retired).
  const profileTopbarSource = fs.readFileSync(path.join(root, 'components', 'profile', 'ProfileTopbar.tsx'), 'utf8');
  assert.doesNotMatch(profileTopbarSource, /notifications\.html/, 'the profile topbar must not reference notifications.html');
  assert.match(profileTopbarSource, /router\.push\('\/notifications'\)/, 'the profile topbar must open /notifications');

  // 4. Role comes from the verified profile (AuthProvider); the page no longer
  // broadcasts role hints, which made _app re-query the profile in a loop.
  assert.match(notifPageSource, /accountRole\(auth\.profile\)/, 'notifications.tsx must take its role from AuthProvider');
  assert.doesNotMatch(notifPageSource, /varoom_role_change/, 'notifications.tsx must not broadcast role hints');

  // 5. Layout-specific CSS overrides for sidebar coexistence.
  assert.match(
    notifPageSource,
    /client-layout-active.*notifications-page-main|host-layout-active.*notifications-page-main/s,
    'notifications.tsx must include .client-layout-active or .host-layout-active CSS overrides',
  );

  // 6. _app resolves the layout role from the verified session, never from
  // unscoped event payloads.
  const appSource = fs.readFileSync(path.join(root, 'pages', '_app.tsx'), 'utf8');
  assert.match(appSource, /const \{ status, session, profile \} = useAuth\(\);/, '_app must take the role from AuthProvider');
  assert.doesNotMatch(appSource, /event\??\.detail\??\.role/, '_app must not trust role event payloads');
});

test('13. Shared sidebar username and name contrast and visibility in Client and Host layouts', () => {
  const shellStylesSource = fs.readFileSync(shellStylesPath, 'utf8');
  const notifPageSource = readPage();

  assert.match(shellStylesSource, /\.host-app-layout \.account-identity-name\s*\{[^}]*color:\s*var\(--layout-ink\)/);
  assert.match(shellStylesSource, /\.host-app-layout \.account-identity-username\s*\{[^}]*color:\s*var\(--layout-muted\)/);
  assert.doesNotMatch(shellStylesSource, /\.host-app-layout \.account-identity-name[^}]*#F5EFEC/);
  assert.doesNotMatch(shellStylesSource, /\.host-app-layout \.account-identity-username[^}]*#B8ACA8/);
  assert.match(shellStylesSource, /\.client-app-layout \.account-identity-name\s*\{[^}]*color:\s*var\(--layout-ink\)/);
  assert.match(shellStylesSource, /\.client-app-layout \.account-identity-username\s*\{[^}]*color:\s*var\(--layout-muted\)/);

  // notifications.tsx defines --ink and --muted tokens in :root and dark mode
  assert.match(notifPageSource, /--ink:\s*#0F1419/);
  assert.match(notifPageSource, /--muted:\s*#536471/);
  assert.match(notifPageSource, /--ink:\s*#FFFFFF/);
  assert.match(notifPageSource, /--muted:\s*#71767b/);
});

test('14. Unbroken notifications navigation from Bookings and client-side sidebar routing', () => {
  const bookingsPage = fs.readFileSync(path.join(root, 'pages', 'bookings.tsx'), 'utf8');
  assert.doesNotMatch(bookingsPage, /notif-nav-item/);
  assert.doesNotMatch(bookingsPage, /notif-bell/);

  const hostSidebarSource = fs.readFileSync(path.join(root, 'components', 'shell/HostSidebar.tsx'), 'utf8');
  assert.match(hostSidebarSource, /<a\b[^>]*href="\/notifications"[^>]*id="notif-nav-item"/);
  assert.match(hostSidebarSource, /data-nav="notifications"/);

  const clientSidebarSource = fs.readFileSync(path.join(root, 'components', 'shell/ClientSidebar.tsx'), 'utf8');
  assert.match(clientSidebarSource, /<a\b[^>]*href="\/notifications"[^>]*id="notif-nav-item"/);
  assert.match(clientSidebarSource, /data-nav="notifications"/);

  // Host Home must not hijack the shared sidebar's items (it bound every .nav-item before D2)
  const hostHome = fs.readFileSync(path.join(root, 'pages', 'host-home.tsx'), 'utf8');
  assert.doesNotMatch(hostHome, /notif-nav-item|\.nav-item/);
  assert.doesNotMatch(hostSidebarSource, /navItem\.click\(\)/, 'the sidebar switches Host Home views through ?view=');
});

test('15. Instant cache presentation is limited to the verified account', () => {
  const notifPageSource = readPage();

  // Cached notifications render instantly, but only for the AuthProvider-verified
  // user, and the effect re-runs when that user changes.
  assert.match(notifPageSource, /const authUserId = auth\.user\?\.id \|\| null;/);
  assert.match(notifPageSource, /const cached = getCachedNotifications\(authUserId\)/);
  assert.match(notifPageSource, /\[auth\.status, authUserId, fetchNotifications, router\]/);

  // Never for an account id read from browser storage before the session resolves.
  assert.doesNotMatch(notifPageSource, /earlyUserId/);
  assert.doesNotMatch(notifPageSource, /varoom_cached_profile/);
  assert.doesNotMatch(notifPageSource, /varoom_active_account_id/);
});

test('16. The legacy notification widget is retired with bookings.html', () => {
  const bookingsPage = fs.readFileSync(path.join(root, 'pages', 'bookings.tsx'), 'utf8');
  assert.doesNotMatch(bookingsPage, /notifications-widget/);
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'notifications-widget.js')), false);
});
