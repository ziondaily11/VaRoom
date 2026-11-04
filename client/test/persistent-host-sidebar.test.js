const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { resolveAvatarUrl, resolveStoredPhotoUrl } = loadTs(path.join(__dirname, '..', 'components', 'resolveStoredPhotoUrl.ts'));
const { getAccountLayout } = require('../lib/accountRoleLayout');

const clientDir = path.join(__dirname, '..');

test('HostSidebar and the host shell styles exist', () => {
  const sidebarCode = fs.readFileSync(path.join(clientDir, 'components', 'shell/HostSidebar.tsx'), 'utf8');
  const layoutCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'shellStyles.ts'), 'utf8');

  // Verify authoritative dimensions & layout classes
  assert.match(sidebarCode, /id="host-sidebar"/, 'Uses an id isolated from the legacy sidebar script');
  assert.match(sidebarCode, /<span className="va">Va<\/span>/, 'Contains VaRoom branding');
  assert.match(layoutCode, /295px minmax\(0, 1fr\)/, 'HostLayout enforces 295px sidebar column');
  assert.match(layoutCode, /host-app-layout/, 'Contains host-app-layout class');
  assert.match(layoutCode, /host-page-content/, 'Contains host-page-content container');
  const shellCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'AppShell.tsx'), 'utf8');
  assert.match(shellCode, /variant === 'host' \? <HostSidebar \/>/, 'AppShell mounts HostSidebar once');
});

test('AppShell keeps one element structure for every variant so pages are not remounted', () => {
  const shellCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'AppShell.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'shellStyles.ts'), 'utf8');
  assert.match(shellCode, /<main className=\{content\.className\} id=\{content\.id\}>\s*\{children\}\s*<\/main>/);
  assert.match(shellCode, /data-shell-state=\{variant \|\| settled \? 'ready' : 'pending'\}/);
  assert.match(styles, /\.app-shell-pending,\s*\.app-shell-pending > \.app-shell-pending-content \{\s*display: contents;/);
});

test('SharedHostSidebar has all reference navigation and account switcher elements', () => {
  const sidebarCode = fs.readFileSync(path.join(clientDir, 'components', 'shell/HostSidebar.tsx'), 'utf8');

  // Nav items
  assert.match(sidebarCode, /Home/, 'Contains Home nav item');
  assert.match(sidebarCode, /Marketplace/, 'Contains Marketplace nav item');
  assert.match(sidebarCode, /Saved/, 'Contains Saved nav item');
  assert.match(sidebarCode, /Bookings/, 'Contains Bookings nav item');
  assert.match(sidebarCode, /Chats/, 'Contains Chats nav item');
  assert.match(sidebarCode, /Notifications/, 'Contains Notifications nav item');
  assert.match(sidebarCode, /List a space/, 'Contains List a space button');
  assert.match(sidebarCode, /My Listings/, 'Contains My Listings nav item');
  assert.match(sidebarCode, /Profile/, 'Contains Profile nav item');
  assert.match(sidebarCode, /id="more-nav-btn"/, 'Contains More menu button');

  // More menu popover
  assert.match(sidebarCode, /id="more-menu"/, 'Contains more-menu popover');
  assert.match(sidebarCode, /Analytics/, 'Contains Analytics in more menu');
  assert.match(sidebarCode, /Settings/, 'Contains Settings in more menu');
  assert.match(sidebarCode, /Help &amp; Support/, 'Contains Help & Support in more menu');

  // Account identity and switcher
  assert.match(sidebarCode, /id="account-identity-btn"/, 'Contains account identity button');
  assert.match(sidebarCode, /id="account-menu"/, 'Contains account switcher menu');
  assert.match(sidebarCode, /id="account-add-btn"/, 'Contains add account button');
  assert.match(sidebarCode, /id="account-manage-btn"/, 'Contains manage accounts button');
  assert.match(sidebarCode, /id="account-logout-btn"/, 'Contains log out button');
});

test('_app.tsx wraps designated account routes with the persistent AppShell', () => {
  const appCode = fs.readFileSync(path.join(clientDir, 'pages', '_app.tsx'), 'utf8');

  assert.match(appCode, /import AppShell from '\.\.\/components\/shell\/AppShell';/, 'Imports AppShell');
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

test('HostSidebar defers browser-specific account data until after hydration', () => {
  const sidebarCode = fs.readFileSync(path.join(clientDir, 'components', 'shell/HostSidebar.tsx'), 'utf8');
  const chrome = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'useShellChrome.ts'), 'utf8');
  const initialUser = sidebarCode.match(/function getInitialUser\(\): ShellIdentity \{([\s\S]*?)\n\}/);

  assert.ok(initialUser, 'Has a deterministic initial account');
  assert.doesNotMatch(initialUser[1], /window|localStorage|sessionStorage/);
  assert.match(chrome, /useEffect\(\(\) => \{\s*setHasMounted\(true\);\s*const active = activeLinkedAccount\(\);/, 'Reads the stored account in an effect');
  assert.match(sidebarCode, /id="host-profile-nav-link"/);
  assert.doesNotMatch(sidebarCode, /id="profile-brand-link"/, 'Does not reuse the profile page brand-link ID');
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
  const navCode = fs.readFileSync(path.join(clientDir, 'components', 'shell', 'MobileNav.tsx'), 'utf8');
  const clientItems = navCode.match(/export const CLIENT_MOBILE_ITEMS[\s\S]*?\];/)[0];
  assert.doesNotMatch(clientItems, /\/list|create/);
  assert.match(navCode, /\['\/booking', '\/chat-settings', '\/pricing', '\/list', '\/properties', '\/client-home'\]/);
  assert.equal(fs.existsSync(path.join(clientDir, 'public', 'js', 'varoom-mobile-nav.js')), false, 'The legacy script nav is retired');
  assert.equal(fs.existsSync(path.join(clientDir, 'pages', '[...slug].js')), false, 'the legacy catch-all is retired (E1)');
});
