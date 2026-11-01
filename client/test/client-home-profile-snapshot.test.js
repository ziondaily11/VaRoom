const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const { completedClientProfile } = loadTs(path.join(__dirname, '..', 'lib', 'types', 'profile.ts'));
const pageSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');

// Client Home's provisional first paint now comes from the shared profile
// store (A2); the separate profile snapshot cache was removed in A3.
const completeClient = {
  id: 'account-a',
  role: 'client',
  onboarding_completed: true,
  looking_timeline: 'soon',
  interested_categories: ['hotel'],
};

test('a completed client profile provides the provisional feed filters', () => {
  assert.equal(completedClientProfile(completeClient), completeClient);
});

test('host, incomplete and malformed profiles never drive the provisional feed', () => {
  assert.equal(completedClientProfile(null), null);
  assert.equal(completedClientProfile({ ...completeClient, role: 'host' }), null);
  assert.equal(completedClientProfile({ ...completeClient, onboarding_completed: false }), null);
  assert.equal(completedClientProfile({ ...completeClient, looking_timeline: null }), null);
  assert.equal(completedClientProfile({ ...completeClient, interested_categories: 'hotel' }), null);
});

test('cached filters enable exact-key feed lookup before waiting for authoritative profile refresh', () => {
  const cachedRead = pageSource.indexOf('completedClientProfile(profileStore().peek(sessionUser.id))');
  const profileRequest = pageSource.indexOf('const profileRequest = profileStore().get(sessionUser.id)', cachedRead);
  const profileAwait = pageSource.indexOf('const profileResult = await profileRequest', profileRequest);
  const feedReady = pageSource.indexOf('setFeedReady(true)', cachedRead);
  const bookmarkRequest = pageSource.indexOf("from('bookmarks')", profileAwait);
  assert.ok(cachedRead >= 0);
  assert.ok(feedReady > cachedRead && feedReady < profileRequest);
  assert.ok(profileAwait > profileRequest);
  assert.ok(bookmarkRequest > profileAwait);
  assert.doesNotMatch(pageSource, /ClientHomeProfileSnapshot/);
});

test('profile refresh errors disable the provisional cached feed and remain visible', () => {
  const errorStart = pageSource.indexOf("if (account.kind === 'profile-error')");
  const errorEnd = pageSource.indexOf("\n      }", errorStart);
  const errorBranch = pageSource.slice(errorStart, errorEnd);
  assert.match(errorBranch, /setFeedReady\(false\)/);
  assert.match(errorBranch, /setItems\(\[\]\)/);
  assert.match(errorBranch, /setError\('Your account information could not be loaded/);
});
