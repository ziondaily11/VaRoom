const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const notificationsPagePath = path.join(root, 'pages', 'notifications.tsx');
const cacheModulePath = path.join(root, 'lib', 'notificationsCache.ts');
const clientLayoutPath = path.join(root, 'components', 'shell', 'shellStyles.ts');
const hostLayoutPath = path.join(root, 'components', 'shell', 'shellStyles.ts');
const slugPath = path.join(root, 'pages', '[...slug].js');
const { getAccountLayout } = require('../lib/accountRoleLayout');

function loadCacheModule() {
  const store = new Map();
  global.window = {
    sessionStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
      get length() {
        return store.size;
      },
      key: (i) => Array.from(store.keys())[i] || null,
    },
    matchMedia: (query) => ({
      matches: query.includes('min-width: 861px'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  };

  // The module imports the shared cache core; load it with relative imports resolved.
  const m = { exports: require('./helpers/loadTs').loadTs(cacheModulePath, { globals: { window: global.window } }) };
  return { cache: m.exports, store };
}

test('1. Native React route resolution and legacy catch-all exclusion', () => {
  assert.ok(fs.existsSync(notificationsPagePath), 'notifications.tsx must exist');
  const pageSource = fs.readFileSync(notificationsPagePath, 'utf8');
  assert.match(pageSource, /export default function NotificationsPage\(\)/);
  assert.match(pageSource, /import Head from 'next\/head'/);
  assert.match(pageSource, /import \{ useRouter \} from 'next\/router'/);

  // The native route is guarded from legacy catch-all resolution.
  assert.equal(fs.existsSync(slugPath), false, 'the legacy catch-all is retired (E1)');
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'notifications.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'notifications-page.js')), false);
});

test('2. Correct client/host layout selection with no duplicate shell', () => {
  // getAccountLayout returns correct role
  assert.equal(getAccountLayout('/notifications', '/notifications', 'client'), 'client');
  assert.equal(getAccountLayout('/notifications', '/notifications', 'host'), 'host');
  assert.equal(getAccountLayout('/notifications', '/notifications', null), 'none');

  // Verify page does not define a duplicate sidebar or double app-shell
  const pageSource = fs.readFileSync(notificationsPagePath, 'utf8');
  assert.doesNotMatch(pageSource, /<aside\b[^>]*\bid="sidebar"/, 'Must not render legacy sidebar');
  assert.doesNotMatch(pageSource, /<div\b[^>]*className="app-shell"/, 'Must not render duplicate app-shell');
  assert.match(pageSource, /className="notifications-page-main"/);
  assert.match(pageSource, /className="main-inner"/);
});

test('3. Initial loading, empty state, error state, and search filtering', () => {
  const { cache } = loadCacheModule();
  const pageSource = fs.readFileSync(notificationsPagePath, 'utf8');

  // Loading skeleton structure preserved
  assert.match(pageSource, /className="notifications-skeleton"/);
  assert.match(pageSource, /className="notification-skeleton-header"/);
  assert.match(pageSource, /className="notification-skeleton-toolbar"/);
  assert.match(pageSource, /className="notification-skeleton-list"/);

  // Empty state messages preserved
  assert.match(pageSource, /No notifications found/);
  assert.match(pageSource, /Nothing here yet\./);
  assert.match(pageSource, /You're all caught up/);

  // Error state preserved
  assert.match(pageSource, /Unable to load notifications\. Please refresh and try again\./);
  assert.match(pageSource, /Unable to update notifications\. Please try again\./);

  // Searchable text logic
  const mockNotification = {
    id: 'n-1',
    title: 'Booking Confirmed',
    message: 'Host approved your reservation',
    type: 'booking_approved',
    read: false,
    created_at: new Date().toISOString(),
    metadata: {
      listing_name: 'Kilimani Penthouse',
      guest_name: 'David',
      booking_reference: 'VAR-1029',
    },
  };
  const details = cache.detailsFor('booking_approved');
  const searchable = cache.searchableText(mockNotification, details);
  assert.ok(searchable.includes('kilimani penthouse'));
  assert.ok(searchable.includes('david'));
  assert.ok(searchable.includes('var-1029'));
  assert.ok(searchable.includes('booking confirmed'));
  delete global.window;
});

test('4. Cached repeat visits and background refresh policy (30s TTL)', () => {
  const { cache } = loadCacheModule();
  cache.clearNotificationsCache();

  const mockItems = [
    { id: 'n-1', title: 'Payment received', message: 'KSh 10,000 received', type: 'payment_success', read: false, created_at: new Date().toISOString() },
    { id: 'n-2', title: 'Booking request', message: 'New booking request', type: 'booking_request', read: true, created_at: new Date().toISOString() },
  ];

  cache.setCachedNotifications(mockItems, 'user-123', 1);

  const cached = cache.getCachedNotifications('user-123');
  assert.ok(cached);
  assert.equal(cached.items.length, 2);
  assert.equal(cached.unreadCount, 1);
  assert.equal(cached.isFresh, true);
  assert.ok(cached.age < 500);

  cache.clearNotificationsCache();
  delete global.window;
});

test('5. Account switching and cache isolation', () => {
  const { cache } = loadCacheModule();
  cache.clearNotificationsCache();

  const userAItems = [
    { id: 'n-a1', title: 'Account A Notice', message: 'Secret to A', type: 'system', read: false, created_at: new Date().toISOString() },
  ];
  const userBItems = [
    { id: 'n-b1', title: 'Account B Notice', message: 'Secret to B', type: 'system', read: false, created_at: new Date().toISOString() },
  ];

  cache.setCachedNotifications(userAItems, 'user-A', 1);

  // User B query must return null
  assert.equal(cache.getCachedNotifications('user-B'), null);

  // Set User B
  cache.setCachedNotifications(userBItems, 'user-B', 1);
  const cachedB = cache.getCachedNotifications('user-B');
  assert.ok(cachedB);
  assert.equal(cachedB.items[0].id, 'n-b1');
  assert.equal(cachedB.items[0].message, 'Secret to B');

  // Verify User A still retrieves User A's notifications from storage
  const cachedA = cache.getCachedNotifications('user-A');
  assert.ok(cachedA);
  assert.equal(cachedA.items[0].id, 'n-a1');

  cache.clearNotificationsCache();
  delete global.window;
});

test('6. Mark-as-read behavior, including failed requests and unread-count consistency', () => {
  const { cache } = loadCacheModule();
  cache.clearNotificationsCache();

  const mockItems = [
    { id: 'n-1', title: 'Notification 1', message: 'Msg 1', type: 'system', read: false, created_at: new Date().toISOString() },
    { id: 'n-2', title: 'Notification 2', message: 'Msg 2', type: 'system', read: false, created_at: new Date().toISOString() },
  ];

  cache.setCachedNotifications(mockItems, 'user-mark', 2);

  // Mark single item read
  const afterOne = cache.markCachedNotificationRead('n-1', 'user-mark');
  assert.ok(afterOne);
  assert.equal(afterOne.unreadCount, 1);
  assert.equal(afterOne.items.find((i) => i.id === 'n-1').read, true);
  assert.equal(afterOne.items.find((i) => i.id === 'n-2').read, false);

  // Mark all read
  const afterAll = cache.markAllCachedNotificationsRead('user-mark');
  assert.ok(afterAll);
  assert.equal(afterAll.unreadCount, 0);
  assert.ok(afterAll.items.every((i) => i.read === true));

  // Check page source handles optimistic rollback on failure
  const pageSource = fs.readFileSync(notificationsPagePath, 'utf8');
  assert.match(pageSource, /setNotifications\(prevItems\)/);
  assert.match(pageSource, /setUnreadCount\(prevUnread\)/);

  cache.clearNotificationsCache();
  delete global.window;
});

test('7. Notification actions and their intended navigation destinations', () => {
  const { cache } = loadCacheModule();

  // Host booking target
  const hostBooking = {
    id: 'n-h',
    type: 'booking_request',
    booking_id: 'b-999',
    related_entity_type: 'booking',
    read: false,
    created_at: new Date().toISOString(),
  };
  assert.equal(cache.notificationTarget(hostBooking, 'host'), '/bookings?booking=b-999');

  // Conversation target
  const chatNotif = {
    id: 'n-c',
    type: 'new_message',
    related_entity_type: 'conversation',
    related_entity_id: 'conv-123',
    read: false,
    created_at: new Date().toISOString(),
  };
  assert.equal(cache.notificationTarget(chatNotif, 'client'), '/chats?c=conv-123');

  // Review target
  const reviewNotif = {
    id: 'n-r',
    type: 'new_review',
    related_entity_type: 'review',
    related_entity_id: 'rev-456',
    read: false,
    created_at: new Date().toISOString(),
  };
  assert.equal(cache.notificationTarget(reviewNotif, 'client'), '/profile');

  // Client booking laptop/desktop target (min-width: 861px matches in mock)
  const clientBooking = {
    id: 'n-cb',
    type: 'booking_approved',
    booking_id: 'b-777',
    related_entity_type: 'booking',
    read: false,
    created_at: new Date().toISOString(),
  };
  assert.equal(cache.notificationTarget(clientBooking, 'client'), '/bookings?booking=b-777');

  delete global.window;
});

test('8. Request cancellation and prevention of stale responses', () => {
  const pageSource = fs.readFileSync(notificationsPagePath, 'utf8');

  // Request version sequencing
  assert.match(pageSource, /requestVersionRef\s*=\s*useRef/);
  assert.match(pageSource, /const version = \+\+requestVersionRef\.current/);
  assert.match(pageSource, /if \(version !== requestVersionRef\.current \|\| !mountedRef\.current\) return;/);

  // Mounted guard
  assert.match(pageSource, /mountedRef\.current = false/);
});

test('9. Subscription/listener cleanup without destroying shared services', () => {
  const pageSource = fs.readFileSync(notificationsPagePath, 'utf8');

  // Channel is scoped specifically to notifications-page-${user.id}
  assert.match(pageSource, /channel\(`notifications-page-\$\{authUserId\}`\)/);
  assert.match(pageSource, /realtimeChannelRef\.current/);

  // Cleanup unsubscribes only page channel, never sidebar-counts channel
  assert.match(pageSource, /client\.removeChannel\(realtimeChannelRef\.current\)/);
  assert.doesNotMatch(pageSource, /removeChannel\(.*?sidebar-counts/);
});

test('10. Existing sidebar unread-count behavior and synchronization', () => {
  const clientLayoutSource = fs.readFileSync(clientLayoutPath, 'utf8');
  const hostLayoutSource = fs.readFileSync(hostLayoutPath, 'utf8');
  const sharedClientSidebarSource = fs.readFileSync(path.join(root, 'components', 'shell/ClientSidebar.tsx'), 'utf8');
  const sharedHostSidebarSource = fs.readFileSync(path.join(root, 'components', 'shell/HostSidebar.tsx'), 'utf8');
  const pageSource = fs.readFileSync(notificationsPagePath, 'utf8');

  // Page dispatches sync
  assert.match(pageSource, /syncSidebarUnreadCount/);
  assert.match(pageSource, /VaroomSidebar\.setUnreadCount\(count\)/);
  assert.match(pageSource, /varoom_notification_count/);

  // The shared counts store receives varoom_notification_count; both sidebars
  // read the badge from it instead of polling or listening separately.
  const countsBridgeSource = fs.readFileSync(path.join(root, 'lib', 'counts', 'CountsBridge.tsx'), 'utf8');
  assert.match(countsBridgeSource, /addEventListener\('varoom_notification_count'/);
  assert.match(sharedClientSidebarSource, /const unreadCount = useCounts\(\)\.notifications;/);
  assert.match(sharedHostSidebarSource, /const unreadCount = useCounts\(\)\.notifications;/);
  assert.doesNotMatch(sharedHostSidebarSource, /setInterval\(refreshUser/);

  // Internal routes (shared link handler for both shells) include /notifications
  const appLinksSource = fs.readFileSync(path.join(root, 'lib', 'navigation', 'appLinks.ts'), 'utf8');
  assert.match(appLinksSource, /HOST_INTERNAL_ROUTES = \[[\s\S]*?'\/notifications'/);
  assert.match(appLinksSource, /CLIENT_INTERNAL_ROUTES = \[[\s\S]*?'\/notifications'/);
});

test('11. Regression checks for Property News and other shared routing/layout behavior', () => {
  const clientLayoutSource = fs.readFileSync(clientLayoutPath, 'utf8');
  const hostLayoutSource = fs.readFileSync(hostLayoutPath, 'utf8');

  // Property News remains a client-side route in both shells
  const appLinksSource = fs.readFileSync(path.join(root, 'lib', 'navigation', 'appLinks.ts'), 'utf8');
  assert.match(appLinksSource, /HOST_INTERNAL_ROUTES = \[[\s\S]*?'\/property-news'/);
  assert.match(appLinksSource, /CLIENT_INTERNAL_ROUTES = \[[\s\S]*?'\/property-news'/);

  // Layout role assignment for Property News remains editorial (none)
  assert.equal(getAccountLayout('/property-news', '/property-news', 'client'), 'none');
  assert.equal(getAccountLayout('/property-news', '/property-news', 'host'), 'none');

  // Layout role assignment for Bookings, Notifications, Profile, Settings
  for (const route of ['/bookings', '/notifications', '/profile', '/settings']) {
    assert.equal(getAccountLayout(route, route, 'client'), 'client');
    assert.equal(getAccountLayout(route, route, 'host'), 'host');
    assert.equal(getAccountLayout(route, route, null), 'none');
  }
});

test('12. Complete legacy unwiring verification', () => {
  const nextConfigPath = path.join(root, 'next.config.js');
  const vercelConfigPath = path.join(root, 'vercel.json');
  const profileTopbarPath = path.join(root, 'components', 'profile', 'ProfileTopbar.tsx');
  const slugPath2 = path.join(root, 'pages', '[...slug].js');
  const notifPageSource = fs.readFileSync(notificationsPagePath, 'utf8');

  // 1. Next.js retains permanent compatibility redirects to the native route.
  const nextConfigSource = fs.readFileSync(nextConfigPath, 'utf8');
  assert.match(nextConfigSource, /notifications\.html/, 'next.config.js must contain notifications.html redirect');
  assert.match(nextConfigSource, /\/notifications/, 'next.config.js must redirect to /notifications');
  assert.match(nextConfigSource, /source: '\/legacy-pages\/notifications\.html',\s*destination: '\/notifications'/);
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
  assert.ok(vercelConfig.redirects.some(({ source, destination }) => source === '/:page.html' && destination === '/:page'));

  // 2. No legacy template route remains (the catch-all is retired).
  assert.equal(fs.existsSync(slugPath2), false);
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'notifications.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'notifications-page.js')), false);

  // 3. The native profile's topbar opens /notifications (legacy profile.html is retired).
  const profileTopbarSource = fs.readFileSync(profileTopbarPath, 'utf8');
  assert.doesNotMatch(profileTopbarSource, /notifications\.html/, 'the profile topbar must not reference notifications.html');
  assert.match(profileTopbarSource, /router\.push\('\/notifications'\)/, 'the profile topbar must open /notifications');

  // 4. Role comes from the verified profile (AuthProvider); the page no longer
  // broadcasts role hints, which made _app re-query the profile in a loop.
  assert.match(notifPageSource, /accountRole\(auth\.profile\)/, 'notifications.tsx must take its role from AuthProvider');
  assert.doesNotMatch(notifPageSource, /varoom_role_change/, 'notifications.tsx must not broadcast role hints');

  // 5. notifications.tsx has layout-specific CSS overrides for sidebar coexistence
  assert.match(
    notifPageSource,
    /client-layout-active.*notifications-page-main|host-layout-active.*notifications-page-main/s,
    'notifications.tsx must include .client-layout-active or .host-layout-active CSS overrides'
  );

  // 6. _app.js resolves the layout role from the verified session, never from
  // unscoped event payloads
  const appJsPath = path.join(root, 'pages', '_app.tsx');
  const appJsSource = fs.readFileSync(appJsPath, 'utf8');
  assert.match(appJsSource, /const \{ session, profile \} = useAuth\(\);/, '_app.js must take the role from AuthProvider');
  assert.doesNotMatch(appJsSource, /event\??\.detail\??\.role/, '_app.js must not trust role event payloads');
});

test('13. Shared sidebar username and name contrast and visibility in Client and Host layouts', () => {
  const hostLayoutSource = fs.readFileSync(hostLayoutPath, 'utf8');
  const clientLayoutSource = fs.readFileSync(clientLayoutPath, 'utf8');
  const notifPageSource = fs.readFileSync(notificationsPagePath, 'utf8');

  // 1. HostLayout must use var(--layout-ink) and var(--layout-muted) for identity
  assert.match(hostLayoutSource, /\.host-app-layout \.account-identity-name\s*\{[^}]*color:\s*var\(--layout-ink\)/);
  assert.match(hostLayoutSource, /\.host-app-layout \.account-identity-username\s*\{[^}]*color:\s*var\(--layout-muted\)/);

  // 2. HostLayout must not use faint fallback colors #F5EFEC or #B8ACA8 for identity
  assert.doesNotMatch(hostLayoutSource, /\.host-app-layout \.account-identity-name[^}]*#F5EFEC/);
  assert.doesNotMatch(hostLayoutSource, /\.host-app-layout \.account-identity-username[^}]*#B8ACA8/);

  // 3. ClientLayout must use var(--layout-ink) and var(--layout-muted)
  assert.match(clientLayoutSource, /\.client-app-layout \.account-identity-name\s*\{[^}]*color:\s*var\(--layout-ink\)/);
  assert.match(clientLayoutSource, /\.client-app-layout \.account-identity-username\s*\{[^}]*color:\s*var\(--layout-muted\)/);

  // 4. notifications.tsx defines --ink and --muted tokens in :root and dark mode
  assert.match(notifPageSource, /--ink:\s*#0F1419/);
  assert.match(notifPageSource, /--muted:\s*#536471/);
  assert.match(notifPageSource, /--ink:\s*#FFFFFF/);
  assert.match(notifPageSource, /--muted:\s*#71767b/);
});

test('14. Unbroken notifications navigation from Bookings and client-side sidebar routing', () => {
  const bookingsPagePath = path.join(root, 'pages', 'bookings.tsx');
  const hostSidebarPath = path.join(root, 'components', 'shell/HostSidebar.tsx');
  const clientSidebarPath = path.join(root, 'components', 'shell/ClientSidebar.tsx');
  const hostHomePath = path.join(root, 'pages', 'host-home.tsx');

  // 1. The Bookings page must not intercept #notif-nav-item or render its own notif-bell
  const bookingsPage = fs.readFileSync(bookingsPagePath, 'utf8');
  assert.doesNotMatch(bookingsPage, /notif-nav-item/);
  assert.doesNotMatch(bookingsPage, /notif-bell/);

  // 2. SharedHostSidebar renders Notifications as an accessible <a> link with href="/notifications"
  const hostSidebarSource = fs.readFileSync(hostSidebarPath, 'utf8');
  assert.match(hostSidebarSource, /<a\b[^>]*href="\/notifications"[^>]*id="notif-nav-item"/);
  assert.match(hostSidebarSource, /data-nav="notifications"/);

  // 3. SharedClientSidebar renders Notifications as an accessible <a> link with href="/notifications"
  const clientSidebarSource = fs.readFileSync(clientSidebarPath, 'utf8');
  assert.match(clientSidebarSource, /<a\b[^>]*href="\/notifications"[^>]*id="notif-nav-item"/);
  assert.match(clientSidebarSource, /data-nav="notifications"/);

  // 4. Host Home must not hijack the shared sidebar's items (it bound every .nav-item before D2)
  const hostHome = fs.readFileSync(hostHomePath, 'utf8');
  assert.doesNotMatch(hostHome, /notif-nav-item|\.nav-item/);
  assert.doesNotMatch(hostSidebarSource, /navItem\.click\(\)/, 'the sidebar switches Host Home views through ?view=');
});

test('15. Instant cache presentation is limited to the verified account', () => {
  const notifPageSource = fs.readFileSync(notificationsPagePath, 'utf8');

  // 1. Cached notifications render instantly, but only for the AuthProvider-verified user
  assert.match(notifPageSource, /const authUserId = auth\.user\?\.id \|\| null;/);
  assert.match(notifPageSource, /const cached = getCachedNotifications\(authUserId\)/);

  // 2. Never for an account id read from browser storage before the session resolves
  assert.doesNotMatch(notifPageSource, /earlyUserId/);
  assert.doesNotMatch(notifPageSource, /varoom_cached_profile/);
  assert.doesNotMatch(notifPageSource, /varoom_active_account_id/);

  // 3. Account changes re-run the effect through the verified user id
  assert.match(notifPageSource, /\[auth\.status, authUserId, fetchNotifications, router\]/);
});

test('16. The legacy notification widget is retired with bookings.html', () => {
  const bookingsPage = fs.readFileSync(path.join(root, 'pages', 'bookings.tsx'), 'utf8');
  assert.doesNotMatch(bookingsPage, /notifications-widget/);
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'notifications-widget.js')), false);
});
