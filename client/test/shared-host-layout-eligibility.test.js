const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const appCode = fs.readFileSync(path.join(__dirname, '..', 'pages', '_app.js'), 'utf8');
const sharedRoutes = appCode.match(/const isSharedRoute = \[([\s\S]*?)\]\.some/);

test('Chats and Support retain their page layouts outside HostLayout', () => {
  assert.ok(sharedRoutes, 'Defines the HostLayout shared-route allowlist');
  assert.doesNotMatch(sharedRoutes[1], /['"]\/(?:chats|support)['"]/);
  assert.match(appCode, /isHostMode = !isClientHome && \(isHostRoute \|\| \(isSharedRoute && role !== 'client'\)\)/);
});

test('Host and intended shared routes remain eligible for HostLayout', () => {
  assert.ok(sharedRoutes, 'Defines the HostLayout shared-route allowlist');
  for (const route of ['/bookings', '/notifications', '/profile', '/settings', '/marketplace']) {
    assert.ok(sharedRoutes[1].includes(`'${route}'`), `${route} remains a shared host route`);
  }
  assert.match(appCode, /const isHostHome = path === '\/host-home'/);
  assert.match(appCode, /const isClientHome = path === '\/client-home'/);
});
