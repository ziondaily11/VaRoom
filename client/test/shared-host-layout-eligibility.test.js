const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { getAccountLayout } = require('../lib/accountRoleLayout');

const appCode = fs.readFileSync(path.join(__dirname, '..', 'pages', '_app.js'), 'utf8');

test('Chats, Support, Marketplace, and Analytics retain their page layouts outside HostLayout', () => {
  for (const route of ['/chats', '/support', '/marketplace', '/analytics']) {
    assert.equal(getAccountLayout('/[...slug]', route, 'host'), 'none', `${route} remains outside HostLayout`);
  }
  assert.match(appCode, /getAccountLayout\(path, asPath, role\)/);
});

test('Home and intended shared routes select the authenticated account layout', () => {
  for (const route of ['/bookings', '/notifications', '/profile', '/settings']) {
    assert.equal(getAccountLayout('/[...slug]', route, 'host'), 'host', `${route} remains available to hosts`);
    assert.equal(getAccountLayout('/[...slug]', route, 'client'), 'client', `${route} selects client shell for clients`);
    assert.equal(getAccountLayout('/[...slug]', route, null), 'none', `${route} does not add a layout before role resolves`);
  }
  assert.equal(getAccountLayout('/[...slug]', '/host-home', 'host'), 'host');
  assert.equal(getAccountLayout('/[...slug]', '/host-home', 'client'), 'client');
  assert.equal(getAccountLayout('/[...slug]', '/client-home', 'client'), 'client');
  assert.equal(getAccountLayout('/[...slug]', '/client-home', 'host'), 'host');
});
