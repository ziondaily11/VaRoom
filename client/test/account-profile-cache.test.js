const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'varoom-account-profile-cache.js'), 'utf8');

function createCache() {
  const values = new Map();
  const window = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
    },
  };
  vm.runInNewContext(source, { window, Date, JSON, Object, Array, String });
  return { api: window.VaRoomAccountProfileCache, values };
}

function profile(id, role = 'client') {
  return { id, role, full_name: `${id} name`, username: id, avatar_url: null };
}

test('account profile cache accepts only the matching account and valid profile shape', () => {
  const { api } = createCache();
  api.write(profile('account-a'));

  assert.equal(api.readForAccount('account-a').id, 'account-a');
  assert.equal(api.readForAccount('account-b'), null);

  api.write({ id: 'bad', role: 'client' });
  assert.equal(api.readForAccount('bad'), null);
});

test('Home filter snapshot is account- and role-scoped and has a bounded age', () => {
  const { api, values } = createCache();
  api.write(profile('account-a'));
  assert.equal(api.writeHomeState('account-a', {
    accountId: 'account-a', role: 'client', onboarding_completed: true,
    interested_categories: ['hotel'], looking_timeline: 'soon',
  }), true);

  const cached = api.readHomeState('account-a', 'client');
  assert.deepEqual(Array.from(cached.interested_categories), ['hotel']);
  assert.equal(api.readHomeState('account-a', 'host'), null);
  assert.equal(api.readHomeState('account-b', 'client'), null);

  const stored = JSON.parse(values.get('varoom_cached_profile'));
  stored.homeState.cachedAt = Date.now() - api.maxHomeStateAge - 1;
  values.set('varoom_cached_profile', JSON.stringify(stored));
  assert.equal(api.readHomeState('account-a', 'client'), null);
});

test('account-switcher profile refresh preserves the Home snapshot', () => {
  const { api } = createCache();
  api.write(profile('account-a'));
  api.writeHomeState('account-a', {
    accountId: 'account-a', role: 'client', onboarding_completed: true,
    interested_categories: ['hotel'], looking_timeline: 'soon',
  });
  api.write({ ...profile('account-a'), full_name: 'Updated name' });

  const profileAfterRefresh = api.readForAccount('account-a');
  assert.equal(profileAfterRefresh.full_name, 'Updated name');
  assert.deepEqual(Array.from(profileAfterRefresh.homeState.interested_categories), ['hotel']);
});
