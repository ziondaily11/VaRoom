const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const sp = loadTs(path.join(root, 'lib', 'navigation', 'startPage.ts'));

test('only the host sidebar pages can be a start page', () => {
  for (const page of sp.HOST_START_PAGES) assert.equal(sp.isHostStartPage(page), true, page);
  for (const bad of ['/list', '/admin', '//evil.example', 'https://evil.example', '/bookings?x=1', '', null, undefined, 42]) {
    assert.equal(sp.isHostStartPage(bad), false, String(bad));
  }
  // Every start page also passes the database rule (migration 000070).
  const rule = /^\/[a-z-]+(\?view=[a-z-]+)?$/;
  for (const page of sp.HOST_START_PAGES) assert.match(page, rule);
  const migration = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261117_000070_profile_start_page.sql'), 'utf8');
  assert.ok(migration.includes("'^/[a-z-]+(\\?view=[a-z-]+)?$'"), 'the database rule matches the one tested here');
});

test('startPageFor reads a host profile only', () => {
  assert.equal(sp.startPageFor({ role: 'host', start_page: '/bookings' }), '/bookings');
  assert.equal(sp.startPageFor({ role: 'host', start_page: null }), null);
  assert.equal(sp.startPageFor({ role: 'host', start_page: '/elsewhere' }), null);
  assert.equal(sp.startPageFor({ role: 'client', start_page: '/bookings' }), null);
  assert.equal(sp.startPageFor(null), null);
});

test('saveStartPage writes the profile row and reports failures', async () => {
  const calls = [];
  const client = (error = null) => ({
    from(table) {
      return { update(row) { return { eq: async (column, value) => { calls.push({ table, row, column, value }); return { error }; } }; } };
    },
  });
  await sp.saveStartPage(client(), 'u1', '/analytics');
  await sp.saveStartPage(client(), 'u1', null);
  assert.deepEqual(calls, [
    { table: 'profiles', row: { start_page: '/analytics' }, column: 'id', value: 'u1' },
    { table: 'profiles', row: { start_page: null }, column: 'id', value: 'u1' },
  ]);
  await assert.rejects(sp.saveStartPage(client({ message: 'denied' }), 'u1', '/bookings'), /denied/);
});

test('email sign-in uses the same start page rule', () => {
  const panel = fs.readFileSync(path.join(root, 'components', 'landing', 'AuthPanel.tsx'), 'utf8');
  assert.match(panel, /redirect \|\| startPageFor\(profile\) \|\| \(role === 'host' \? '\/host-home' : '\/client-home'\)/);
  const store = fs.readFileSync(path.join(root, 'lib', 'auth', 'profileStore.ts'), 'utf8');
  assert.match(store, /,start_page';/, 'the shared profile read carries the start page (no extra request)');
});
