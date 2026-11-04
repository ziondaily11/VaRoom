const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { resolveAvatarUrl, resolveStoredPhotoUrl } = loadTs(path.join(__dirname, '..', 'components', 'resolveStoredPhotoUrl.ts'));
const clientDir = path.join(__dirname, '..');
const { getAccountLayout, getSessionBoundCachedRole } = loadTs(path.join(clientDir, 'lib', 'accountRoleLayout.ts'));
const { shellFrame, shellState, isShellSettled } = loadTs(path.join(clientDir, 'lib', 'shell', 'appShell.ts'));
const { hostActiveNav, clientActiveNav, HOST_MORE_ITEMS, CLIENT_MORE_ITEMS } = loadTs(path.join(clientDir, 'lib', 'navigation', 'activeNav.ts'));
const identity = loadTs(path.join(clientDir, 'lib', 'shell', 'shellIdentity.ts'));
const mobileNav = loadTs(path.join(clientDir, 'lib', 'navigation', 'mobileNav.ts'));
const shellCss = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'shellStyles.ts'), 'utf8');

test('the shell frame: host and client classes and content ids; pending adds no layout', () => {
  assert.deepEqual(shellFrame('host'), { key: 'host', shellClass: 'host-app-layout host-layout-active', content: { className: 'host-page-content', id: 'host-page-content' } });
  assert.deepEqual(shellFrame('client'), { key: 'client', shellClass: 'client-app-layout client-layout-active', content: { className: 'client-page-content', id: 'client-main-content' } });
  assert.deepEqual(shellFrame(null), { key: 'pending', shellClass: 'app-shell-pending', content: { className: 'app-shell-pending-content' } });
  assert.equal(shellFrame('host', 'extra').shellClass, 'host-app-layout host-layout-active extra');
  assert.equal(shellFrame('client').shellClass, 'client-app-layout client-layout-active', 'no trailing space without a page class');
  assert.equal(shellFrame(null, 'extra').shellClass, 'app-shell-pending', 'a page class is only added once the role is known');
  // Every class the frame uses is styled, and the host sidebar column is 295 px.
  for (const variant of ['host', 'client', null]) {
    const frame = shellFrame(variant);
    for (const cls of [...frame.shellClass.split(' '), frame.content.className]) assert.ok(shellCss.includes(`.${cls}`), cls);
  }
  assert.match(shellCss, /295px minmax\(0, 1fr\)/, 'host shell keeps the 295px sidebar column');
  assert.match(shellCss, /\.app-shell-pending,\s*\.app-shell-pending > \.app-shell-pending-content \{\s*display: contents;/);
});

test('the shell is ready for legacy scripts once a variant is chosen or the role is known', () => {
  assert.equal(shellState('host', false), 'ready');
  assert.equal(shellState(null, true), 'ready');
  assert.equal(shellState(null, false), 'pending');
  assert.equal(isShellSettled('loading', { id: 'u' }, null), false);
  assert.equal(isShellSettled('signed-out', null, null), true);
  assert.equal(isShellSettled('signed-in', null, null), false, 'waits for the profile');
  assert.equal(isShellSettled('signed-in', { id: 'u' }, null), true);
  assert.equal(isShellSettled('signed-in', null, new Error('down')), true, 'a failed profile load settles too');
});

test('AppShell keeps one element structure for every variant so pages are not remounted', () => {
  // The element-structure guarantee cannot be checked without a DOM renderer.
  const shellCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'AppShell.tsx'), 'utf8');
  assert.match(shellCode, /<main className=\{content\.className\} id=\{content\.id\}>\s*\{children\}\s*<\/main>/);
  assert.match(shellCode, /variant === 'host' \? <HostSidebar \/> : variant === 'client' \? <ClientSidebar \/> : null/);
});

test('HostSidebar keeps its reference navigation, More menu and account switcher', () => {
  const sidebarCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'HostSidebar.tsx'), 'utf8');
  // Element ids are used by the shell CSS and legacy page scripts (UI contract).
  for (const id of ['host-sidebar', 'more-nav-btn', 'more-menu', 'account-identity-btn', 'account-menu', 'account-add-btn', 'account-manage-btn', 'account-logout-btn', 'host-profile-nav-link']) {
    assert.ok(sidebarCode.includes(`id="${id}"`), id);
  }
  assert.doesNotMatch(sidebarCode, /id="profile-brand-link"/, 'Does not reuse the profile page brand-link ID');
  assert.match(sidebarCode, /<span className="va">Va<\/span>/, 'Contains VaRoom branding');
  for (const label of ['Home', 'Marketplace', 'Saved', 'Bookings', 'Chats', 'Notifications', 'List a space', 'My Listings', 'Profile', 'Analytics', 'Settings', 'Help &amp; Support']) {
    assert.ok(sidebarCode.includes(label), label);
  }
});

test('host sidebar active item follows the route, Host Home views and the More menu', () => {
  assert.equal(hostActiveNav('/host-home', '/host-home', ''), 'home');
  assert.equal(hostActiveNav('/host-home', '/host-home?view=my-listings', 'my-listings'), 'my-listings');
  assert.equal(hostActiveNav('/host-home', '/host-home?view=saved', 'saved'), 'saved');
  assert.equal(hostActiveNav('/host-home', '/host-home?view=saved', ''), 'home', 'views are ignored before hydration');
  assert.equal(hostActiveNav('/marketplace', '/marketplace?q=x', ''), 'marketplace');
  assert.equal(hostActiveNav('/bookings', '/bookings', ''), 'bookings');
  assert.equal(hostActiveNav('/chats', '/chats', ''), 'chats');
  assert.equal(hostActiveNav('/notifications', '/notifications', ''), 'notifications');
  assert.equal(hostActiveNav('/profile', '/profile', ''), 'profile');
  assert.equal(hostActiveNav('/host/[hostId]', '/host/abc', ''), 'profile', 'a host profile page');
  assert.equal(hostActiveNav('/analytics', '/analytics', ''), 'analytics');
  assert.equal(hostActiveNav('/settings', '/settings', ''), 'settings');
  assert.equal(hostActiveNav('/support', '/support', ''), 'support');
  assert.equal(hostActiveNav('/list', '/list', ''), 'home', 'other routes fall back to Home');
  assert.deepEqual(HOST_MORE_ITEMS, ['analytics', 'settings', 'support', 'upgrade']);
});

test('client sidebar active item follows the route; Saved is a Client Home view', () => {
  assert.equal(clientActiveNav('/client-home', '/client-home'), 'home');
  assert.equal(clientActiveNav('/client-home', '/client-home?view=saved'), 'saved');
  assert.equal(clientActiveNav('/marketplace', '/marketplace'), 'marketplace');
  assert.equal(clientActiveNav('/bookings', '/bookings'), 'bookings');
  assert.equal(clientActiveNav('/chats', '/chats'), 'chats');
  assert.equal(clientActiveNav('/notifications', '/notifications'), 'notifications');
  assert.equal(clientActiveNav('/profile', '/profile'), 'profile');
  assert.equal(clientActiveNav('/settings', '/settings'), 'settings');
  assert.equal(clientActiveNav('/support', '/support'), 'support');
  assert.equal(clientActiveNav('/signup-host', '/signup-host'), 'signup-host');
  assert.equal(clientActiveNav('/list', '/list'), '', 'no item for other routes');
  assert.deepEqual(CLIENT_MORE_ITEMS, ['profile', 'settings', 'support', 'signup-host']);
});

test('_app.tsx wraps designated account routes with the persistent AppShell', () => {
  // Wiring in _app (outside this group); the route/role decision itself is tested below.
  const appCode = fs.readFileSync(path.join(clientDir, 'pages', '_app.tsx'), 'utf8');
  assert.match(appCode, /getAccountLayout\(path, asPath, role\)/, 'Uses the tested role-aware route selector');
  assert.match(appCode, /<AppShell variant=\{accountLayout === 'none' \? null : accountLayout\}>\{pageElement\}<\/AppShell>/, 'Mounts AppShell, pending until the role is known');
  assert.match(appCode, /<MobileNav enabled=\{isShellRoute \|\| Boolean\(Component\.appNavigation\)\} \/>/, 'One persistent mobile navigation');
  assert.match(appCode, /const role: ShellRole = getSessionBoundCachedRole\(session, profile\);/, 'Role comes only from the verified session and its profile');
  assert.match(appCode, /<AuthProvider>/, 'AuthProvider owns the session for every page');
  assert.doesNotMatch(appCode, /varoom_role_change|attributeFilter/, 'Page-level role hints no longer trigger profile re-queries');
  assert.doesNotMatch(appCode, /useState\(\(\) => \{[\s\S]*?sessionStorage/, 'Does not read browser storage during initial render');
});

test('confirmed client roles select ClientLayout on shared routes and never HostLayout', () => {
  assert.equal(getAccountLayout('/[...slug]', '/bookings', 'client'), 'client');
  assert.equal(getAccountLayout('/[...slug]', '/settings', 'client'), 'client');
  assert.equal(getAccountLayout('/[...slug]', '/client-home', 'client'), 'client');
  assert.notEqual(getAccountLayout('/[...slug]', '/bookings', 'client'), 'host');
  assert.equal(getAccountLayout('/[...slug]', '/bookings', 'host'), 'host');
});

test('account layout per route and role: shell routes only, none until the role is known', () => {
  for (const route of ['/host-home', '/client-home', '/bookings', '/notifications', '/profile', '/settings', '/host/abc']) {
    assert.equal(getAccountLayout(route, route, 'host'), 'host', route);
    assert.equal(getAccountLayout(route, route, 'client'), 'client', route);
    assert.equal(getAccountLayout(route, route, null), 'none', `${route} waits for the role`);
  }
  assert.equal(getAccountLayout('/bookings', '/bookings?tab=past', 'host'), 'host', 'query strings still match');
  assert.equal(getAccountLayout('/profile', '/profile/edit', 'client'), 'client', 'sub-paths still match');
  for (const route of ['/', '/marketplace', '/chats', '/list', '/support', '/bookingsx']) {
    assert.equal(getAccountLayout(route, route, 'host'), 'none', route);
  }
  assert.equal(getAccountLayout('/analytics', '/analytics', 'host'), 'none', 'analytics has its own shell');
});

test('the shell role comes only from a profile that belongs to the signed-in session', () => {
  const session = { user: { id: 'u1' } };
  assert.equal(getSessionBoundCachedRole(session, { id: 'u1', role: 'host' }), 'host');
  assert.equal(getSessionBoundCachedRole(session, { id: 'u1', role: 'client' }), 'client');
  assert.equal(getSessionBoundCachedRole(session, { id: 'u2', role: 'host' }), null, "another account's cached profile");
  assert.equal(getSessionBoundCachedRole(session, { id: 'u1', role: 'admin' }), null);
  assert.equal(getSessionBoundCachedRole(null, { id: 'u1', role: 'host' }), null);
  assert.equal(getSessionBoundCachedRole(session, null), null);
});

test('sidebar identity: a fixed placeholder until mounted, then the stored account, then the verified profile', () => {
  const initial = identity.hostInitialIdentity();
  assert.deepEqual({ ...initial }, { full_name: 'Amazing Stays \u{1F334}', username: 'amazingstays', avatar_url: null, email: 'host@varoom.co.ke' });
  assert.deepEqual(identity.hostInitialIdentity(), initial, 'deterministic for server render and hydration');
  assert.deepEqual({ ...identity.clientInitialIdentity() }, { full_name: 'VaRoom Member', username: 'member', avatar_url: null, email: '' });
  const fallback = identity.HOST_FALLBACK_IDENTITY;
  const stored = identity.storedIdentity({ id: 'u1', full_name: null, username: 'zion', avatar_url: 'a.jpg', email: 'z@x.co', role: 'host' }, fallback);
  assert.deepEqual({ ...stored }, { id: 'u1', full_name: 'VaRoom Host', username: 'zion', avatar_url: 'a.jpg', email: 'z@x.co', role: 'host' });
  const base = { authUser: null, profile: null, stored, initial, fallback };
  assert.equal(identity.resolveShellIdentity({ ...base, hasMounted: false }), initial, 'stored accounts are not read before hydration');
  assert.equal(identity.resolveShellIdentity({ ...base, hasMounted: true }), stored);
  assert.equal(identity.resolveShellIdentity({ ...base, stored: null, hasMounted: true }), fallback);
  const authUser = { id: 'u1', email: 'zion@example.com', user_metadata: { full_name: 'Meta Name', avatar_url: 'meta.jpg' } };
  const verified = identity.resolveShellIdentity({ ...base, hasMounted: false, authUser, profile: { id: 'u1', full_name: null, username: null, avatar_url: null, role: 'client' } });
  assert.deepEqual({ ...verified }, { id: 'u1', full_name: 'Meta Name', username: 'zion', avatar_url: 'meta.jpg', email: 'zion@example.com', role: 'client' });
  assert.equal(identity.resolveShellIdentity({ ...base, hasMounted: true, authUser, profile: { id: 'other', role: 'host' } }), stored, "another account's profile is ignored");
});

test('Duplicate legacy sidebars are hidden without mutating legacy page DOM', () => {
  const layoutCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'shellStyles.ts'), 'utf8');
  assert.equal(fs.existsSync(path.join(clientDir, 'pages', '[...slug].js')), false, 'the legacy catch-all is retired (E1)');

  assert.match(layoutCode, /\.host-layout-active \.host-page-content aside\.sidebar/);
  assert.match(layoutCode, /\.host-layout-active \.host-page-content aside\.profile-sidebar/);
  assert.match(layoutCode, /\.host-layout-active \.host-page-content aside\.host-profile-sidebar/);
  assert.match(layoutCode, /\.host-layout-active \.host-page-content #sidebar/);
});

test('Host Home renders only its content inside the persistent host shell', () => {
  const hostHome = fs.readFileSync(path.join(clientDir, 'pages', 'host-home.tsx'), 'utf8');
  const layoutCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'shellStyles.ts'), 'utf8');
  assert.doesNotMatch(hostHome, /<aside className="sidebar"|account-identity|more-menu|bottom-bar/, 'the shell provides the sidebar, account menu and mobile nav');
  assert.doesNotMatch(hostHome, /getLayout/, '_app wraps /host-home in the host shell');
  assert.match(layoutCode, /\.host-layout-active \.host-page-content aside\.sidebar[\s\S]*?display:\s*none\s*!important/);
});

test('R2 avatar keys use the application photo route rather than Supabase Storage', () => {
  const key = 'photos/production/avatars/user-id/photo-id/original.jpg';
  const supabaseClient = {
    storage: {
      from() {
        throw new Error('R2 keys must not use Supabase Storage');
      }
    }
  };

  assert.equal(
    resolveAvatarUrl(key, supabaseClient),
    '/api/photos/avatars/photos/production/avatars/user-id/photo-id/original.jpg'
  );
  assert.equal(
    resolveAvatarUrl(`https://project.supabase.co/storage/v1/object/public/avatars/${key}`, supabaseClient),
    '/api/photos/avatars/photos/production/avatars/user-id/photo-id/original.jpg'
  );
});

test('R2 listing metadata and seeded URLs use the listing photo route', () => {
  const key = 'photos/production/listing-photos/user-id/photo-id/original.jpg';
  const supabaseClient = {
    storage: {
      from() {
        throw new Error('R2 keys must not use Supabase Storage');
      }
    }
  };

  assert.equal(
    resolveStoredPhotoUrl(key, 'listing-photos', supabaseClient),
    `/api/photos/listing-photos/${key}`
  );
  assert.equal(
    resolveStoredPhotoUrl(`https://project.supabase.co/storage/v1/object/public/listing-photos/${key}`, 'listing-photos', supabaseClient),
    `/api/photos/listing-photos/${key}`
  );
});

test('Legacy avatar keys and external avatar URLs keep their existing behavior', () => {
  const legacyKey = 'user-id/avatar.jpg';
  const supabaseClient = {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'avatars');
        return { getPublicUrl: (key) => ({ data: { publicUrl: `https://project.supabase.co/${key}` } }) };
      }
    }
  };

  assert.equal(resolveAvatarUrl(legacyKey, supabaseClient), `https://project.supabase.co/${legacyKey}`);
  assert.equal(resolveAvatarUrl('https://images.example/avatar.jpg', supabaseClient), 'https://images.example/avatar.jpg');
  
  
});

test('Host profile uses the shared sidebar without colliding or covering it while loading', () => {
  const stylesCode = fs.readFileSync(path.join(clientDir, 'components', 'profile', 'profileStyles.ts'), 'utf8');
  const pageCode = fs.readFileSync(path.join(clientDir, 'pages', 'profile.tsx'), 'utf8');
  const skeletonCode = fs.readFileSync(path.join(clientDir, 'components', 'profile', 'ProfileSkeleton.tsx'), 'utf8');
  const layoutCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'shellStyles.ts'), 'utf8');
  const loadingRule = stylesCode.match(/\.host-layout-active \.host-page-content #loading-state\{([^}]+)\}/);

  assert.doesNotMatch(pageCode + skeletonCode, /profile-sidebar|skeleton-sidebar/, 'the shell renders the only sidebar');
  assert.ok(loadingRule, 'Keeps the profile loading skeleton within the shared content area');
  assert.match(loadingRule[1], /grid-template-columns:minmax\(0,1fr\)/, 'Uses the full shared content width for the skeleton');
  assert.doesNotMatch(layoutCode, /host-page-content \.skeleton-shell/, 'Does not force the loading shell to remain displayed');
  assert.match(pageCode, /\(loading \|\| resolvingVisit\) && <ProfileSkeleton \/>/, 'The skeleton shows only while the profile loads');
  assert.match(stylesCode, /\.host-layout-active \.host-page-content #profile-content \.profile-main\{\s*width:100%; height:auto; min-height:100vh; overflow:visible;/);
});

test('Video player treats pause-interrupted play requests separately from playback failures', () => {
  const playerCode = fs.readFileSync(path.join(clientDir, 'components', 'media', 'VideoPlayer.tsx'), 'utf8');

  assert.match(playerCode, /video\.play\(\)\.catch\(\(error: Error\) => \{\s*if \(error && error\.name === 'AbortError'\) return;/);
  assert.match(playerCode, /console\.warn\('Video playback was blocked or failed:', error\)/);
});

test('one mobile navigation: client items have no host tools and Client Home keeps its own bar', () => {
  assert.deepEqual(mobileNav.CLIENT_MOBILE_ITEMS.map((item) => item.href), ['/client-home', '/marketplace', '/chats', '/bookings', '/notifications']);
  assert.deepEqual(mobileNav.HOST_MOBILE_ITEMS.map((item) => [item.key, item.href]), [['home', '/host-home'], ['marketplace', '/marketplace'], ['create', '/list'], ['chats', '/chats'], ['bookings', '/bookings']]);
  for (const route of ['/booking', '/chat-settings', '/pricing', '/list', '/properties', '/client-home']) assert.equal(mobileNav.hidesMobileNav(route), true, route);
  assert.equal(mobileNav.hidesMobileNav('/bookings'), false);
  assert.equal(mobileNav.showsMobileNav(true, 'host', true, '/bookings'), true);
  assert.equal(mobileNav.showsMobileNav(true, 'client', true, '/client-home'), false, 'Client Home keeps its own bar');
  assert.equal(mobileNav.showsMobileNav(true, 'client', false, '/bookings'), false, 'not during onboarding');
  assert.equal(mobileNav.showsMobileNav(true, null, true, '/bookings'), false, 'not signed out');
  assert.equal(mobileNav.showsMobileNav(false, 'host', true, '/bookings'), false, 'not outside app pages');
  assert.equal(mobileNav.mobileNavPath('/bookings?tab=past#top'), '/bookings');
  assert.equal(mobileNav.mobileNavPath(''), '/');
  assert.equal(mobileNav.activeMobileKey('/booking-approved'), 'bookings');
  assert.equal(mobileNav.activeMobileKey('/chat'), 'chats');
  assert.equal(mobileNav.activeMobileKey('/list'), 'create');
  assert.equal(mobileNav.activeMobileKey('/'), 'home');
  assert.equal(mobileNav.activeMobileKey('/settings'), null);
  assert.equal(mobileNav.scrollHides('/host-home'), true);
  assert.equal(mobileNav.scrollHides('/notifications'), false);
  assert.equal(fs.existsSync(path.join(clientDir, 'public', 'js', 'varoom-mobile-nav.js')), false, 'The legacy script nav is retired');
  assert.equal(fs.existsSync(path.join(clientDir, 'pages', '[...slug].js')), false, 'the legacy catch-all is retired (E1)');
});
