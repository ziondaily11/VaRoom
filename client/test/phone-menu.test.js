const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/loadTs');

const clientDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(clientDir, ...parts), 'utf8');
const { phoneMenuState, hasUnread, PHONE_MENU_QUERY } = loadTs(path.join(clientDir, 'lib', 'shell', 'phoneMenu.ts'));

test('the phone menu shows for signed-in onboarded accounts, holds its place while loading', () => {
  assert.equal(phoneMenuState('loading', null, false), 'pending');
  assert.equal(phoneMenuState('signed-in', null, false), 'pending', 'profile still loading');
  assert.equal(phoneMenuState('signed-in', null, true), 'hidden', 'profile failed: no drawer to open');
  assert.equal(phoneMenuState('signed-out', null, false), 'hidden');
  assert.equal(phoneMenuState('signed-in', { role: 'host', onboarding_completed: true }, false), 'shown');
  assert.equal(phoneMenuState('signed-in', { role: 'client', onboarding_completed: null }, false), 'shown', 'the cached snapshot has no onboarding flag');
  assert.equal(phoneMenuState('signed-in', { role: 'client', onboarding_completed: false }, false), 'hidden', 'not during onboarding');
  assert.equal(phoneMenuState('signed-in', { role: null, onboarding_completed: true }, false), 'hidden');
  assert.equal(PHONE_MENU_QUERY, '(max-width: 860px)');
});

test('the unread dot: this account only, notifications or chats', () => {
  assert.equal(hasUnread({ userId: 'a', notifications: 1, chats: 0 }, 'a'), true);
  assert.equal(hasUnread({ userId: 'a', notifications: 0, chats: 2 }, 'a'), true);
  assert.equal(hasUnread({ userId: 'a', notifications: 0, chats: 0 }, 'a'), false);
  assert.equal(hasUnread({ userId: 'b', notifications: 5, chats: 5 }, 'a'), false, 'never another account\'s counts');
  assert.equal(hasUnread({ userId: null, notifications: 5, chats: 0 }, null), false);
});

function renderButton({ auth, counts = { userId: 'u1', notifications: 0, chats: 0 }, props = {} }) {
  const { default: MenuButton } = loadTs(path.join(clientDir, 'components', 'shell', 'MenuButton.tsx'), {
    mocks: {
      react: React,
      '../../lib/auth/AuthProvider': { useAuth: () => auth },
      '../../lib/counts/countsStore': { useCounts: () => counts },
      './SidebarDrawer': { useSidebarDrawer: () => ({ open: false, setOpen: () => undefined }) },
    },
  });
  return renderToStaticMarkup(React.createElement(MenuButton, props));
}

test('MenuButton: hidden for visitors, invisible while loading, a dot when unread, a page look when given', () => {
  const host = { status: 'signed-in', user: { id: 'u1' }, profile: { role: 'host', onboarding_completed: true }, profileError: null };
  assert.equal(renderButton({ auth: { status: 'signed-out', user: null, profile: null, profileError: null } }), '');
  assert.match(renderButton({ auth: { status: 'loading', user: null, profile: null, profileError: null } }), /data-menu-state="pending"/);
  const shown = renderButton({ auth: host });
  assert.match(shown, /class="va-menu-trigger va-menu-btn"/);
  assert.match(shown, /aria-label="Open menu"/);
  assert.match(shown, /aria-expanded="false"/);
  assert.doesNotMatch(shown, /va-menu-dot/);
  const unread = renderButton({ auth: host, counts: { userId: 'u1', notifications: 0, chats: 3 } });
  assert.match(unread, /va-menu-dot/);
  assert.match(unread, /aria-label="Open menu \(unread\)"/);
  const custom = renderButton({ auth: host, props: { className: 'topbar-avatar-btn', children: React.createElement('span', { className: 'own-icon' }) } });
  assert.match(custom, /class="va-menu-trigger topbar-avatar-btn"/);
  assert.match(custom, /<span class="own-icon"><\/span>/);
});

test('one drawer control: no selector listener or window events open the sidebar any more', () => {
  const chrome = read('components', 'shell', 'useShellChrome.ts');
  assert.match(chrome, /const \{ open: mobileOpen, setOpen: setMobileOpen \} = useSidebarDrawer\(\);/);
  assert.doesNotMatch(chrome, /toggleSelector|openEvents|closeEvents/);
  for (const sidebar of ['HostSidebar.tsx', 'ClientSidebar.tsx']) {
    const code = read('components', 'shell', sidebar);
    assert.match(code, /useShellChrome\(\)/, sidebar);
    assert.doesNotMatch(code, /DRAWER_EVENTS|topbar-avatar-btn|menu-toggle/, sidebar);
  }
  const app = read('pages', '_app.tsx');
  assert.match(app, /<SidebarDrawerProvider>\s*<AccountLayout/);
  assert.match(app, /\{Component\.phoneMenu && <LazyPhoneDrawer \/>\}/);
  assert.match(app, /import '\.\.\/styles\/phoneMenu\.css';/);
  assert.match(read('components', 'shell', 'SidebarDrawer.tsx'), /useEffect\(\(\) => setOpen\(false\), \[asPath\]\);/, 'closes after every navigation');
  for (const page of ['notifications.tsx', 'settings.tsx', 'bookings.tsx', 'host-home.tsx', 'client-home.tsx']) {
    const code = read('pages', page);
    assert.doesNotMatch(code, /open-host-sidebar|open-client-sidebar|id="topbar-avatar-btn"/, page);
  }
});

test('every page gets the hamburger; detail screens keep only their back arrow', () => {
  const placed = {
    'pages/marketplace.tsx': /<div className="mkt-heading"><MenuButton \/><h1>Marketplace<\/h1><\/div>/,
    'components/profile/ProfileTopbar.tsx': /<MenuButton \/>\s*<div className="topbar-spacer" \/>/,
    'components/hostProfile/ProfileBanner.tsx': /<div className="profile-banner-menu"><MenuButton \/><\/div>/,
    'components/calendar/CalendarHeader.tsx': /<div className="vc-head-date">\s*<MenuButton \/>/,
    'components/analytics/Analytics.tsx': /<div className="va-hello-row">\s*<MenuButton \/>/,
    'components/listWizard/StepFrame.tsx': /<div className="wz-progress-title"><MenuButton \/>/,
    'pages/chats.tsx': /<MenuButton \/>Messages<\/span>/,
    'pages/support.tsx': /<header className="topbar">\s*<MenuButton \/>/,
    'pages/pricing.tsx': /<div className="pricing-brand">\s*<MenuButton \/>/,
    'pages/property-news.tsx': /<div className="masthead-brand-row">\s*<MenuButton \/>/,
  };
  for (const [file, pattern] of Object.entries(placed)) assert.match(read(...file.split('/')), pattern, file);
  // Pages outside the shell bring the drawer with them.
  for (const [file, name] of [['chats.tsx', 'ChatsPage'], ['support.tsx', 'SupportPage'], ['pricing.tsx', 'PricingPage'], ['property-news.tsx', 'PropertyNewsPage']]) {
    assert.match(read('pages', file), new RegExp(`^${name}\\.phoneMenu = true;$`, 'm'), file);
  }
  for (const file of ['booking.tsx', 'booking-approved.tsx', 'map.tsx', 'chat-settings.tsx']) {
    assert.doesNotMatch(read('pages', file), /MenuButton|phoneMenu/, `${file} keeps its back arrow only`);
  }
});

test('phone menu styles: phones only, drawer outside the shell adds no layout', () => {
  const css = read('styles', 'phoneMenu.css');
  assert.match(css, /\.va-menu-btn \{\s*display: none;/);
  assert.match(css, /@media \(max-width: 860px\) \{ \.va-menu-btn \{ display: inline-flex; \} \}/);
  assert.match(css, /\.va-menu-trigger\[data-menu-state='pending'\] \{ visibility: hidden; \}/);
  assert.match(css, /\.host-app-layout\.phone-drawer,\s*\.client-app-layout\.phone-drawer \{ display: contents; \}/);
  assert.match(css, /@media \(min-width: 861px\) \{\s*\.host-app-layout\.phone-drawer,\s*\.client-app-layout\.phone-drawer \{ display: none; \}/);
  const lazy = read('components', 'shell', 'LazyPhoneDrawer.tsx');
  assert.match(lazy, /dynamic\(\(\) => import\('\.\/PhoneDrawer'\), \{ ssr: false \}\)/, 'code-split');
  assert.match(lazy, /requestIdleCallback/, 'mounted when idle');
});
