const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

// Client Home's account-scoped feed cache, revalidation and stale-response
// guards are behaviour-tested in client-home-cache-first.test.js
// (lib/clientHome/feed.ts) and client-home-video.test.js.

// Which profile the sidebars show (only the session account's) is
// behaviour-tested through lib/shell/shellIdentity.ts in
// persistent-host-sidebar.test.js.
test('both sidebars reuse the shared identity instead of fetching the profile again', () => {
  for (const file of ['shell/HostSidebar.tsx', 'shell/ClientSidebar.tsx']) {
    const source = fs.readFileSync(path.join(root, 'components', file), 'utf8');
    assert.match(source, /useShellIdentity\(/, file);
    assert.doesNotMatch(source, /profileStore\(\)\.get|from\('profiles'\)/, file);
  }
});

test('Host Home is native; the legacy page lifecycle is retired', () => {
  assert.equal(fs.existsSync(path.join(root, 'pages', '[...slug].js')), false, 'the legacy catch-all is retired (E1)');
  for (const file of ['lib/legacyPageLifecycle.js', 'legacy-pages/host-home.html']) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  assert.ok(fs.existsSync(path.join(root, 'pages', 'host-home.tsx')));
});
