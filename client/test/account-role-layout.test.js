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

test('shared and Home routes use a neutral layout until the active account role is known', () => {
  assert.equal(getAccountLayout('/[...slug]', '/bookings', null), 'pending');
  assert.equal(getAccountLayout('/[...slug]', '/client-home', null), 'pending');
  assert.equal(getAccountLayout('/[...slug]', '/host-home', null), 'pending');
  assert.equal(getAccountLayout('/[...slug]', '/bookings', 'client'), 'client');
  assert.equal(getAccountLayout('/[...slug]', '/bookings', 'host'), 'host');
  assert.equal(getAccountLayout('/[...slug]', '/host-home', 'client'), 'pending');
  assert.equal(getAccountLayout('/[...slug]', '/client-home', 'host'), 'pending');
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
  assert.equal(getAccountLayout('/[...slug]', '/settings', getSessionBoundCachedRole(session, cached)), 'pending');
  cached = { id: 'host-b', role: 'host' };
  assert.equal(getAccountLayout('/[...slug]', '/settings', getSessionBoundCachedRole(session, cached)), 'host');
});

test('legacy Home cache restoration starts before the remaining UI wiring and profile refresh completes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'legacy-pages', 'client-home.html'), 'utf8').replace(/\r\n/g, '\n');
  const refreshIndex = source.indexOf('if (cachedHomeProfile) {');
  const earlyFeedIndex = source.indexOf('if (initialHomeFeedStarted) loadFeed();');
  const bottomViewIndex = source.indexOf("if (urlParams.get('view') === 'saved') {");
  const laterWidgetIndex = source.indexOf('loadClientPropertyNews();', bottomViewIndex);

  assert.ok(refreshIndex >= 0 && refreshIndex < earlyFeedIndex);
  assert.ok(earlyFeedIndex < bottomViewIndex);
  assert.ok(bottomViewIndex < laterWidgetIndex);
  assert.match(source, /const profileResult = cachedHomeProfile \? null : await profileRequest;/);
});
