const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const clientDir = path.join(__dirname, '..');

test('SharedHostSidebar and HostLayout exist and export React components', () => {
  const sidebarCode = fs.readFileSync(path.join(clientDir, 'components', 'SharedHostSidebar.jsx'), 'utf8');
  const layoutCode = fs.readFileSync(path.join(clientDir, 'components', 'HostLayout.jsx'), 'utf8');

  // Verify authoritative dimensions & layout classes
  assert.match(sidebarCode, /id="sidebar"/, 'Contains authoritative #sidebar id');
  assert.match(sidebarCode, /<span className="va">Va<\/span>/, 'Contains VaRoom branding');
  assert.match(layoutCode, /295px minmax\(0, 1fr\)/, 'HostLayout enforces 295px sidebar column');
  assert.match(layoutCode, /host-app-layout/, 'Contains host-app-layout class');
  assert.match(layoutCode, /host-page-content/, 'Contains host-page-content container');
  assert.match(layoutCode, /<SharedHostSidebar/, 'HostLayout mounts SharedHostSidebar once');
});

test('SharedHostSidebar has all reference navigation and account switcher elements', () => {
  const sidebarCode = fs.readFileSync(path.join(clientDir, 'components', 'SharedHostSidebar.jsx'), 'utf8');

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

test('_app.js wraps designated host-facing routes with persistent HostLayout', () => {
  const appCode = fs.readFileSync(path.join(clientDir, 'pages', '_app.js'), 'utf8');

  assert.match(appCode, /import HostLayout from '\.\.\/components\/HostLayout';/, 'Imports HostLayout');
  assert.match(appCode, /isHostHome/, 'Detects host-home route');
  assert.match(appCode, /isAnalytics/, 'Detects analytics route');
  assert.match(appCode, /isSharedRoute/, 'Detects shared host routes');
  assert.match(appCode, /<HostLayout>\{pageElement\}<\/HostLayout>/, 'Mounts persistent HostLayout');
});

test('Duplicate sidebars are suppressed in HostLayout and cleaned up', () => {
  const layoutCode = fs.readFileSync(path.join(clientDir, 'components', 'HostLayout.jsx'), 'utf8');
  const slugCode = fs.readFileSync(path.join(clientDir, 'pages', '[...slug].js'), 'utf8');

  // Check CSS suppression rules in HostLayout
  assert.match(layoutCode, /\.host-layout-active \.host-page-content aside\.sidebar/);
  assert.match(layoutCode, /\.host-layout-active \.host-page-content aside\.profile-sidebar/);
  assert.match(layoutCode, /\.host-layout-active \.host-page-content aside\.host-profile-sidebar/);

  // Check dynamic suppression in [...slug].js
  assert.match(slugCode, /purgeDuplicateSidebars/);
});

test('Host profile uses the shared sidebar without colliding or covering it while loading', () => {
  const profileCode = fs.readFileSync(path.join(clientDir, 'legacy-pages', 'profile.html'), 'utf8');

  assert.doesNotMatch(profileCode, /<aside class="profile-sidebar" id="sidebar"/);
  assert.doesNotMatch(profileCode, /getElementById\('sidebar'\)/);
  assert.match(profileCode, /\.host-layout-active \.host-page-content #loading-state\{\s*position:absolute/);
  assert.match(profileCode, /\.host-layout-active \.host-page-content #loading-state > \.skeleton-sidebar,[\s\S]*?display:none !important/);
  assert.match(profileCode, /\.host-layout-active \.host-page-content #profile-content \.profile-main\{\s*width:100%; height:auto; min-height:100vh; overflow:visible;/);
});
