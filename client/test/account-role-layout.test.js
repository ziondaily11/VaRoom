const test = require('node:test');
const assert = require('node:assert/strict');
const { getAccountLayout, getSessionBoundCachedRole } = require('../lib/accountRoleLayout');

test('role cache is usable only after the authenticated session matches its account id', () => {
  const clientProfile = { id: 'client-a', role: 'client' };
  assert.equal(getSessionBoundCachedRole({ user: { id: 'client-a' } }, clientProfile), 'client');
  assert.equal(getSessionBoundCachedRole({ user: { id: 'host-b' } }, clientProfile), null);
  assert.equal(getSessionBoundCachedRole(null, clientProfile), null);
  assert.equal(getSessionBoundCachedRole({ user: { id: 'client-a' } }, { id: 'client-a', role: 'admin' }), null);
});

test('shared and Home routes use the authenticated account role without a full-screen pending layout', () => {
  assert.equal(getAccountLayout('/[...slug]', '/bookings', null), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/client-home', null), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/host-home', null), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/bookings', 'client'), 'client');
  assert.equal(getAccountLayout('/[...slug]', '/bookings', 'host'), 'host');
  assert.equal(getAccountLayout('/[...slug]', '/host-home', 'client'), 'client');
  assert.equal(getAccountLayout('/[...slug]', '/client-home', 'host'), 'host');
});

test('client Home to Property News and back preserves the client shell; host Home remains host-only', () => {
  const route = (asPath, role) => getAccountLayout('/[...slug]', asPath, role);
  assert.equal(route('/client-home', 'client'), 'client');
  assert.equal(route('/property-news', 'client'), 'none');
  assert.equal(route('/client-home', 'client'), 'client');
  assert.equal(route('/host-home', 'host'), 'host');
});

test('switching accounts changes the shell only from the matching account role', () => {
  let session = { user: { id: 'client-a' } };
  let cached = { id: 'client-a', role: 'client' };
  assert.equal(getAccountLayout('/[...slug]', '/settings', getSessionBoundCachedRole(session, cached)), 'client');

  session = { user: { id: 'host-b' } };
  assert.equal(getAccountLayout('/[...slug]', '/settings', getSessionBoundCachedRole(session, cached)), 'none');
  cached = { id: 'host-b', role: 'host' };
  assert.equal(getAccountLayout('/[...slug]', '/settings', getSessionBoundCachedRole(session, cached)), 'host');
});

test('native Client Home restores cache before profile refresh and keeps widget hydration later', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(source, /readClientHomeProfileSnapshot\(window\.sessionStorage, sessionUser\.id\)/);
  assert.match(source, /const profileResult = await profileRequest/);
  assert.match(source, /setFeedReady\(true\);/);
  assert.match(source, /PropertyNewsList items=\{news\} loading=\{newsLoading\} failed=\{newsFailed\}/);
  assert.match(source, /cache\.current\.revalidate\(key, fetcher\)/);
});
