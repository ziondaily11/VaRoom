const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('native Client Home uses account-scoped feed caches before revalidation', () => {
  const source = fs.readFileSync(path.join(root, 'pages', 'client-home.tsx'), 'utf8');
  assert.match(source, /loadListingFeedCache\(\)/);
  assert.match(source, /cache\.current\.snapshot/);
  assert.match(source, /cache\.current\.revalidate\(key, fetcher\)/);
  assert.match(source, /\['client', user\.id, view, category/);
  assert.match(source, /feedContextKey\.current !== key/);
});

test('both sidebars show the verified profile only when it belongs to the session account', () => {
  for (const file of ['shell/HostSidebar.tsx', 'shell/ClientSidebar.tsx']) {
    const source = fs.readFileSync(path.join(root, 'components', file), 'utf8');
    assert.match(source, /useShellIdentity\(getInitialUser\(\), /, file);
    assert.doesNotMatch(source, /profileStore\(\)\.get|from\('profiles'\)/, file);
  }
  const chrome = fs.readFileSync(path.join(root, 'components', 'shell', 'useShellChrome.ts'), 'utf8');
  assert.match(chrome, /if \(authUser && profile && profile\.id === authUser\.id\)/);
  assert.match(chrome, /if \(!hasMounted\) return \{ user: initial, hasMounted \};/);
});

test('native Client Home keeps lifecycle work page-scoped and avoids stale state races', () => {
  const pageSource = fs.readFileSync(path.join(root, 'pages', 'client-home.tsx'), 'utf8');
  assert.match(pageSource, /if \(!active\) return;/);
  assert.match(pageSource, /epoch !== authEpoch\.current/);
  assert.match(pageSource, /feedContextVersion\.current/);
  assert.match(pageSource, /if \(contextVersion !== feedContextVersion\.current \|\| feedContextKey\.current !== key\) return;/);
});

test('Host Home is native; the legacy page lifecycle is retired', () => {
  assert.equal(fs.existsSync(path.join(root, 'pages', '[...slug].js')), false, 'the legacy catch-all is retired (E1)');
  for (const file of ['lib/legacyPageLifecycle.js', 'legacy-pages/host-home.html']) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  assert.ok(fs.existsSync(path.join(root, 'pages', 'host-home.tsx')));
});
