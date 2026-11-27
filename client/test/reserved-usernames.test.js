const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

// Public host profiles live at varoom.co.ke/<username>, beside the site's own
// pages. These tests keep every name the site uses out of usernames, in the
// app and in the database, so adding a page later cannot hide a profile (or a
// profile hide a page).

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const names = loadTs(path.join(root, 'lib', 'profile', 'usernames.ts'));
const RESERVED = new Set(names.RESERVED_USERNAMES);
const usable = (name) => names.USERNAME_PATTERN.test(name);

test('the database refuses exactly the names the app refuses, with the same format', () => {
  const sql = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261118_000072_reserved_usernames.sql'), 'utf8');
  // The latest list: 000090 added "calendar".
  const latest = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261127_000090_host_calendar.sql'), 'utf8');
  const array = latest.split('= any (array[')[1].split(']::text[]')[0];
  const sqlNames = [...array.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...sqlNames].sort(), [...names.RESERVED_USERNAMES].sort());
  assert.equal(new Set(sqlNames).size, sqlNames.length, 'no duplicates');
  assert.ok(sql.includes(`username ~ '^[a-z0-9_]{3,20}$'`));
  assert.equal(String(names.USERNAME_PATTERN), '/^[a-z0-9_]{3,20}$/');
  assert.match(sql, /add constraint profiles_username_allowed/);
  for (const name of names.RESERVED_USERNAMES) assert.ok(usable(name), `${name}: only names a user could type are listed`);
});

test('every page, redirect, server path and public folder is reserved', () => {
  const segments = new Set();
  // Pages: client/pages/<name>.tsx and client/pages/<folder>/.
  for (const entry of fs.readdirSync(path.join(root, 'pages'), { withFileTypes: true })) {
    if (entry.name.startsWith('[')) continue;
    if (entry.isDirectory()) segments.add(entry.name);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) segments.add(entry.name.replace(/\.(tsx?|jsx?)$/, ''));
  }
  // Redirects in next.config.js.
  for (const match of read('next.config.js').matchAll(/source: '\/([^/':]*)/g)) segments.add(match[1]);
  // Express paths in server/server.js.
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  for (const match of server.matchAll(/app\.(?:get|post|put|patch|delete|all|use)\(\s*(\[[^\]]*\]|'[^']*')/g)) {
    for (const route of match[1].matchAll(/'\/([^/'?:]*)/g)) segments.add(route[1]);
  }
  // Public folders and files.
  for (const entry of fs.readdirSync(path.join(root, 'public'))) segments.add(entry);

  const missing = [...segments].map((segment) => segment.toLowerCase()).filter((segment) => usable(segment) && !RESERVED.has(segment));
  assert.deepEqual(missing, [], 'add these to lib/profile/usernames.ts and a new migration');
  assert.ok(segments.has('settings') && segments.has('elie') && segments.has('api') && segments.has('assets'), 'all four sources were read');
});

test('profile addresses: a usable username only; pages, files and sub-paths are not profiles', () => {
  assert.equal(names.profileUsernameFromPath('/amazingstays'), 'amazingstays');
  assert.equal(names.profileUsernameFromPath('/AmazingStays?ref=share#top'), 'amazingstays');
  assert.equal(names.profileUsernameFromPath('/@amazingstays'), 'amazingstays');
  for (const pathName of ['/', '/settings', '/Settings', '/profile', '/elie', '/amazing-stays', '/elie-logo.png', '/favicon.ico', '/host/abc', '/amazingstays/x', '/ab', '/%E0%A4%A']) {
    assert.equal(names.profileUsernameFromPath(pathName), null, pathName);
  }
  assert.equal(names.hostProfilePath('H1', 'AmazingStays'), '/amazingstays');
  assert.equal(names.hostProfilePath('H1', 'pricing'), '/host/H1');
  assert.equal(names.isReservedUsername('@Marketplace'), true);
});

test('Settings and onboarding refuse a reserved name with a clear message', () => {
  const details = loadTs(path.join(root, 'lib', 'settings', 'accountDetails.ts'));
  assert.deepEqual(details.accountDetailUpdate('username', 'Settings'), { value: null, error: 'This username is not available. Please choose another.' });
  assert.deepEqual(details.accountDetailUpdate('username', '@palm_view'), { value: 'palm_view', error: null });
  assert.deepEqual(details.usernameLocalState('marketplace', 'old_name'), { state: 'reserved', value: 'marketplace' });
  assert.equal(details.accountDetailError({ code: '23514', message: 'new row violates check constraint "profiles_username_allowed"' }), 'This username is not available. Please choose another.');
  assert.match(read('components', 'settings', 'AccountSection.tsx'), /state === 'reserved' \? DETAIL_MESSAGES\.usernameReserved/);
  const onboarding = loadTs(path.join(root, 'lib', 'onboarding', 'onboarding.ts'));
  assert.equal(onboarding.usernameFormatError('profile'), 'This username is not available. Please choose another.');
});
