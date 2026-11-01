const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  readClientHomeProfileSnapshot,
  writeClientHomeProfileSnapshot,
} = require('../lib/clientHomeProfileSnapshot');

const pageSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) { return entries.get(key) || null; },
    setItem(key, value) { entries.set(key, String(value)); },
  };
}

test('a fresh authenticated account-matched client profile snapshot provides exact feed filters', () => {
  const storage = createStorage();
  assert.equal(writeClientHomeProfileSnapshot(storage, 'account-a', {
    role: 'client',
    onboarding_completed: true,
    looking_timeline: 'soon',
    interested_categories: ['Hotel', 'venue'],
  }), true);
  assert.deepEqual(readClientHomeProfileSnapshot(storage, 'account-a'), {
    role: 'client',
    onboarding_completed: true,
    looking_timeline: 'soon',
    interested_categories: ['Hotel', 'venue'],
  });
  assert.equal(readClientHomeProfileSnapshot(storage, 'account-b'), null);
});

test('profile snapshots reject expired, malformed, host, and incomplete account state', () => {
  const storage = createStorage();
  const key = 'varoom:client-home:profile:v1:account-a';
  storage.setItem(key, JSON.stringify({
    accountId: 'account-a',
    role: 'host',
    onboarding_completed: true,
    looking_timeline: 'soon',
    interested_categories: ['hotel'],
    cachedAt: Date.now(),
  }));
  assert.equal(readClientHomeProfileSnapshot(storage, 'account-a'), null);

  storage.setItem(key, JSON.stringify({
    accountId: 'account-a',
    role: 'client',
    onboarding_completed: false,
    looking_timeline: 'soon',
    interested_categories: ['hotel'],
    cachedAt: Date.now(),
  }));
  assert.equal(readClientHomeProfileSnapshot(storage, 'account-a'), null);

  storage.setItem(key, JSON.stringify({
    accountId: 'account-a',
    role: 'client',
    onboarding_completed: true,
    looking_timeline: 'soon',
    interested_categories: ['hotel'],
    cachedAt: Date.now() - 6 * 60 * 1000,
  }));
  assert.equal(readClientHomeProfileSnapshot(storage, 'account-a'), null);
});

test('cached filters enable exact-key feed lookup before waiting for authoritative profile refresh', () => {
  const cachedRead = pageSource.indexOf('readClientHomeProfileSnapshot(window.sessionStorage, sessionUser.id)');
  const profileRequest = pageSource.indexOf('const profileRequest = profileStore().get(sessionUser.id)', cachedRead);
  const profileAwait = pageSource.indexOf('const profileResult = await profileRequest', profileRequest);
  const feedReady = pageSource.indexOf('setFeedReady(true)', cachedRead);
  const bookmarkRequest = pageSource.indexOf("from('bookmarks')", profileAwait);
  assert.ok(cachedRead >= 0);
  assert.ok(feedReady > cachedRead && feedReady < profileRequest);
  assert.ok(profileAwait > profileRequest);
  assert.ok(bookmarkRequest > profileAwait);
  assert.match(pageSource, /writeClientHomeProfileSnapshot\(window\.sessionStorage, account\.user\.id, account\.profile\)/);
});

test('profile refresh errors disable the provisional cached feed and remain visible', () => {
  const errorStart = pageSource.indexOf("if (account.kind === 'profile-error')");
  const errorEnd = pageSource.indexOf("\n      }", errorStart);
  const errorBranch = pageSource.slice(errorStart, errorEnd);
  assert.match(errorBranch, /setFeedReady\(false\)/);
  assert.match(errorBranch, /setItems\(\[\]\)/);
  assert.match(errorBranch, /setError\('Your account information could not be loaded/);
});
