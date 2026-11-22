const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const becomeHost = loadTs(path.join(root, 'lib', 'becomeHost', 'becomeHost.ts'));

test('Become a Host opens the setup over Client Home instead of signing up again', () => {
  assert.equal(becomeHost.BECOME_HOST_HREF, '/client-home?setup=host');
  const sidebar = read('components', 'shell', 'ClientSidebar.tsx');
  assert.match(sidebar, /\{ key: 'become-host', href: BECOME_HOST_HREF, label: 'Become a Host',/);
  assert.doesNotMatch(sidebar, /signup-host/);
  assert.doesNotMatch(read('lib', 'navigation', 'appLinks.ts'), /signup-host/);
  assert.doesNotMatch(read('lib', 'navigation', 'activeNav.ts'), /signup-host/);
  // The overlay lives in _app and loads on first use; it stays open while converting.
  assert.match(read('pages', '_app.tsx'), /<LazyBecomeHost \/>/);
  const lazy = read('components', 'becomeHost', 'LazyBecomeHost.tsx');
  assert.match(lazy, /dynamic\(\(\) => import\('\.\/BecomeHostOverlay'\), \{ ssr: false \}\)/);
  assert.match(lazy, /converting \|\| \(router\.pathname === '\/client-home' && isHostSetupQuery\(router\.query\.setup\)\)/);
  assert.match(lazy, /<BecomeHostOverlay key=\{user\.id\} \/>/, 'another account starts over');
});

test('converting: one server call; its errors say which card fixes them', async () => {
  const calls = [];
  const reply = (status, body) => async (url, init) => { calls.push({ url, init }); return { ok: status < 300, status, json: async () => body }; };
  const setup = { username: 'palm_view', phone: '712345678', city: 'Nairobi', niche: 'airbnb', discoverName: 'Palm View' };
  assert.deepEqual(await becomeHost.convertToHost('tok', setup, reply(200, { success: true })), { ok: true });
  assert.equal(calls[0].url, '/api/account/become-host');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].init.body), setup);
  assert.deepEqual(await becomeHost.convertToHost('tok', setup, reply(409, { error: 'Taken', code: 'username_taken' })), { ok: false, error: 'Taken', code: 'username_taken' });
  assert.deepEqual(await becomeHost.convertToHost('tok', setup, reply(403, { error: 'Verify', code: 'step_up_required' })), { ok: false, error: 'Verify', code: 'step_up_required' });
  assert.equal((await becomeHost.convertToHost('tok', setup, reply(502, {}))).code, null);
  assert.match((await becomeHost.convertToHost('tok', setup, async () => { throw new Error('offline'); })).error, /Network error/);
});

test('each message stays up over its real work, at least a moment', async () => {
  assert.deepEqual([...becomeHost.PHASES], ['Warming up your host tools', 'Preparing your account', 'Adjusting your pages', 'Setting up analytics']);
  const started = Date.now();
  assert.equal(await becomeHost.atLeast(60, Promise.resolve('done')), 'done');
  assert.ok(Date.now() - started >= 55, 'waits for the minimum');
  await assert.rejects(becomeHost.atLeast(10, Promise.reject(new Error('failed'))), /failed/);

  const overlay = read('components', 'becomeHost', 'BecomeHostOverlay.tsx');
  assert.match(overlay, /await atLeast\(PHASE_MIN_MS, steps\[index\]\(\)\);/);
  // Nothing is saved before the last card: the steps check but do not save, and the photo is only uploaded.
  assert.equal((overlay.match(/deferSave/g) || []).length, 2);
  assert.doesNotMatch(overlay, /saveHostProfile|saveHostListing|saveAvatar|\.from\('profiles'\)/);
  assert.match(overlay, /avatarPath\.current = await uploadAvatar\(client, userId, setup\.photo\.blob\)/);
  // Then the app reads the host profile before Host Home opens.
  assert.match(overlay, /\(\) => refreshProfile\(\),\s+\/\/ Setting up analytics: Host Home opens under this screen\.\s+async \(\) => \{ void router\.prefetch\('\/analytics'\); await router\.replace\('\/host-home'\); \},/);
  assert.match(overlay, /if \(code === 'username_taken' \|\| code === 'step_up_required'\)/);
  assert.match(overlay, /\{failure\.phase <= 1 && <button type="button" className="bh-secondary" onClick=\{cancel\}>Cancel<\/button>\}/, 'no cancel once the account is a host');
  assert.match(overlay, /Your own bookings stay under Bookings → My trips\./);
  assert.match(overlay, /await beginGoogleVerification\(client, BECOME_HOST_HREF\)/);

  const steps = read('components', 'onboarding', 'OnboardingSteps.tsx');
  assert.match(steps, /if \(!deferSave\) \{\s+setBusy\('Saving details\.\.\.'\);\s+await saveHostProfile/);
  assert.match(steps, /if \(!deferSave\) await saveHostListing\(client, userId, niche, name\);/);
});

test('only ?setup=host opens the setup', () => {
  assert.equal(becomeHost.isHostSetupQuery('host'), true);
  assert.equal(becomeHost.isHostSetupQuery(['host']), false);
  assert.equal(becomeHost.isHostSetupQuery(undefined), false);
});

test('the role change reaches every cached copy, and Home no longer reloads on a query change', () => {
  // The saved account in the switcher is written again when the role changes.
  assert.match(read('components', 'shell', 'AppShell.tsx'), /\}, \[userId, role\]\);/);
  const home = read('pages', 'client-home.tsx');
  assert.match(home, /\}, \[authRetry\]\);/);
  assert.match(home, /routerRef\.current\.replace\('\/host-home'\);/);
  // Settings and the overlay share the Google re-check.
  assert.match(read('pages', 'settings.tsx'), /finishGoogleVerification\(client, token\)/);
  assert.match(read('components', 'settings', 'AccountSection.tsx'), /await beginGoogleVerification\(client, '\/settings'\);/);
  assert.match(read('lib', 'support', 'support.ts'), /Your client account becomes a host account: same email, same sign-in\./);
});

test('React component packages are bundled with the page, so prerendering never sees two Reacts', () => {
  const config = require(path.join(root, 'next.config.js'));
  assert.deepEqual(config.transpilePackages, ['thinking-orbs', 'bot-avatars', 'border-beam', 'liquid-gooey']);
});
