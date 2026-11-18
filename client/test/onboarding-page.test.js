const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const ob = loadTs(path.join(root, 'lib', 'onboarding', 'onboarding.ts'));

function fakeClient(answers = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const entry = { table, ops: [] };
      calls.push(entry);
      const answer = () => (typeof answers[table] === 'function' ? answers[table](entry) : answers[table] || { data: [], error: null });
      const chain = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (resolve, reject) => Promise.resolve(answer()).then(resolve, reject);
          if (prop === 'maybeSingle') return async () => answer();
          return (...args) => { entry.ops.push([prop, ...args]); return chain; };
        },
      });
      return chain;
    },
    storage: { from: (bucket) => ({ upload: async (p, blob, opts) => { calls.push({ upload: bucket, path: p, opts }); return answers.upload || { data: { path: 'photos/production/avatars/u1/new.jpg' }, error: null }; } }) },
  };
}

test('hosts get five photo tiles, clients six (buy and rent apart); every photo exists', () => {
  assert.deepEqual(ob.CATEGORIES.map((c) => c.value), ['airbnb', 'hotel', 'property', 'office', 'venue']);
  assert.deepEqual(ob.CATEGORIES.map((c) => c.title), ['Airbnbs', 'Hotels', 'Property', 'Shops & offices', 'Event venues']);
  assert.deepEqual(ob.INTERESTS.map((c) => c.value), ['airbnb', 'hotel', 'buy', 'rent', 'office', 'venue']);
  assert.deepEqual(ob.INTERESTS.map((c) => c.title), ['Airbnbs', 'Hotels', 'Buy a property', 'Rent a property', 'Shops & offices', 'Event venues']);
  for (const tile of [...ob.CATEGORIES, ...ob.INTERESTS]) assert.ok(fs.existsSync(path.join(root, 'public', tile.image)), tile.image);
  assert.equal(ob.TIMELINES, undefined, 'clients are no longer asked when they are looking');
  assert.equal(ob.CITY_SUGGESTIONS[0], 'Nairobi, Kenya');
  assert.deepEqual(ob.initialInterests(['venue', 'bogus', ' Hotel ']), ['hotel', 'venue'], 'tile order, unknown values dropped');
  assert.deepEqual(ob.initialInterests(['property', 'airbnb']), ['airbnb', 'buy', 'rent'], 'an older property pick becomes buy and rent');
  assert.deepEqual(ob.orderedInterests(['venue', 'rent', 'airbnb']), ['airbnb', 'rent', 'venue']);
  assert.equal(ob.initialNiche(['property']), 'property');
  assert.equal(ob.initialNiche(['property', 'hotel']), null, 'prefilled only for a single niche');
});

test('username rules and messages, and an exact availability check (no wildcards)', async () => {
  assert.equal(ob.normalizeUsername('  @@Amazing.Stays '), 'amazing.stays');
  assert.equal(ob.usernameFormatError('ab'), 'Username must be at least 3 characters.');
  assert.equal(ob.usernameFormatError('bad-name'), 'Only lowercase letters, numbers and underscore allowed.');
  // One format everywhere (Settings, the server, the database): no dots.
  assert.equal(ob.usernameFormatError('palm.view'), 'Only lowercase letters, numbers and underscore allowed.');
  assert.equal(ob.usernameFormatError('a'.repeat(21)), 'Username must be 20 characters or fewer.');
  assert.equal(ob.usernameFormatError('palm_view_1'), null);
  // Profiles live at varoom.co.ke/<username>: the site's page names are refused.
  assert.equal(ob.usernameFormatError('settings'), 'This username is not available. Please choose another.');
  assert.equal(ob.takenMessage('zion'), 'Username "zion" is already taken. Try another.');
  const client = fakeClient({ profiles: { data: [{ id: 'other' }], error: null } });
  assert.equal(await ob.usernameTaken(client, 'a_b', 'u1'), true);
  assert.deepEqual(client.calls[0].ops.filter((op) => ['ilike', 'neq'].includes(op[0])), [['ilike', 'username', 'a\\_b'], ['neq', 'id', 'u1']], '_ matched literally, others only');
  assert.equal(await ob.usernameTaken(fakeClient({ profiles: { data: [], error: null } }), 'free', 'u1'), false);
  await assert.rejects(ob.usernameTaken(fakeClient({ profiles: { data: null, error: { message: 'down' } } }), 'x_y', 'u1'), /down/);
});

test('phone shown without +254 and saved as +254…; location and Discover name rules', () => {
  assert.equal(ob.cleanPhoneInput('+254712345678'), '712345678');
  assert.equal(ob.cleanPhoneInput('254712345678'), '712345678');
  assert.equal(ob.cleanPhoneInput('0712345678'), '712345678');
  assert.equal(ob.normalisePhone('712345678'), '+254712345678');
  assert.equal(ob.normalisePhone('0712345678'), '+254712345678');
  assert.equal(ob.normalisePhone('254712345678'), '+254712345678');
  assert.equal(ob.normalisePhone('44 20 7946 0958'), '+442079460958');
  assert.equal(ob.phoneValid('71234567'), false);
  assert.equal(ob.phoneValid('712345678'), true);
  assert.equal(ob.phoneForInput('+254712345678'), '712345678');
  assert.equal(ob.locationValid(' N '), false);
  assert.equal(ob.discoverNameValid(' A '), false);
  assert.equal(ob.discoverNameValid('Palm View Apartments'), true);
  assert.equal(ob.discoverNameValid('x'.repeat(41)), false);
});

test('saves: client interests finish onboarding as looking soon; host profile, then listing finishes it', async () => {
  const client = fakeClient({ profiles: { error: null } });
  await ob.saveClientPreferences(client, 'u1', ['airbnb', 'office']);
  await ob.saveHostProfile(client, 'u1', { username: 'amazingstays', phone: '712345678', city: ' Mombasa, Kenya ' });
  await ob.saveHostListing(client, 'u1', 'airbnb', ' Amazing Stays ');
  const updates = client.calls.map((c) => c.ops.find((op) => op[0] === 'update')[1]);
  assert.deepEqual(updates, [
    { interested_categories: ['airbnb', 'office'], looking_timeline: 'soon', onboarding_completed: true },
    { username: 'amazingstays', phone: '+254712345678', city: 'Mombasa, Kenya' },
    { listing_categories: ['airbnb'], full_name: 'Amazing Stays', onboarding_completed: true },
  ]);
  await assert.rejects(ob.saveHostProfile(fakeClient({ profiles: { error: { message: 'duplicate key' } } }), 'u1', { username: 'x', phone: '712345678', city: 'Nairobi' }), /duplicate key/);
});

test('photo: uploaded as JPEG, its key saved on the profile; a failed upload is an error', async () => {
  const client = fakeClient({ profiles: { error: null } });
  const key = await ob.saveAvatar(client, 'u1', { size: 10 }, 42);
  assert.equal(key, 'photos/production/avatars/u1/new.jpg');
  assert.deepEqual(client.calls[0], { upload: 'avatars', path: 'u1/avatar_42.jpg', opts: { upsert: false, contentType: 'image/jpeg' } });
  assert.deepEqual(client.calls[1].ops.find((op) => op[0] === 'update'), ['update', { avatar_url: 'photos/production/avatars/u1/new.jpg' }]);
  await assert.rejects(ob.saveAvatar(fakeClient({ upload: { data: null, error: { message: 'too big' } } }), 'u1', {}), /too big/);
});

test('crop: covers the frame, zoom 1–4, drawn onto 1024 px', () => {
  const crop = ob.startCrop(100, 400, 200);
  assert.deepEqual({ ...crop }, { frameSize: 100, baseWidth: 200, baseHeight: 100, zoom: 1, offsetX: 0, offsetY: 0 });
  assert.equal(ob.constrainCrop({ ...crop, zoom: 9 }).zoom, 4);
  assert.equal(ob.constrainCrop({ ...crop, zoom: 0.2 }).zoom, 1);
  assert.equal(ob.constrainCrop({ ...crop, offsetX: 999 }).offsetX, 50, 'the image never leaves a gap');
  assert.equal(ob.constrainCrop({ ...crop, offsetY: 30 }).offsetY, 0);
  assert.deepEqual({ ...ob.cropDraw(crop) }, { left: -512, top: 0, width: 2048, height: 1024 });
});

test('where people go: the safe link they came from, else Host Home or Marketplace; hosts resume step 2 only after saving step 1', () => {
  assert.equal(ob.destination('client', null), '/marketplace');
  assert.equal(ob.destination('host', null), '/host-home');
  assert.equal(ob.destination('host', '/booking?listing=1'), '/booking?listing=1');
  assert.equal(ob.destination('client', '/booking?listing=1'), '/booking?listing=1');
  assert.equal(ob.hostStepKey('u1'), 'varoom_host_onboarding_step_u1');
  assert.equal(ob.initialHostStep('2', { username: 'a', phone: '+2547', city: 'Nairobi' }), 2);
  assert.equal(ob.initialHostStep('2', { username: 'a', phone: null, city: 'Nairobi' }), 1);
  assert.equal(ob.initialHostStep(null, { username: 'a', phone: '1', city: 'x' }), 1);
});

test('page: AuthProvider profile, safe redirect, centred layout, legacy page and preview retired', () => {
  const page = read('pages', 'onboarding.tsx');
  // Page wiring (no DOM renderer here); the redirect rule itself is tested below.
  assert.match(page, /useAuth\(\)/);
  assert.doesNotMatch(page, /window\.supabaseClient|window\.location\.href/, 'no legacy globals or full reloads');
  assert.match(page, /onboardingRedirect\(router\.query\.redirect\)/);
  assert.match(page, /await refreshProfile\(\)/, 'the app sees onboarding as done before moving on');
  const steps = read('components', 'onboarding', 'OnboardingSteps.tsx');
  for (const text of ['A little more you.', "Let's set up your profile so people can put a face to your name.", 'What will you be listing?', 'What are you looking for?', 'Pick 1 or more to continue', 'Pick one to continue', 'Choose a username to continue', 'Finishing setup...', 'Uploading your photo. You can keep going.', 'Try again', 'Continue without photo']) assert.ok(steps.includes(text), text);
  for (const text of ['When are you looking?', 'Looking soon', 'Just browsing']) assert.ok(!steps.includes(text), `${text} is gone`);
  assert.match(steps, /disabled=\{!valid \|\| Boolean\(busy\)\}/, 'Continue waits for a valid form');
  assert.match(steps, /<TileGrid tiles=\{CATEGORIES\}[^>]*multiple=\{false\}/, 'hosts pick one tile');
  assert.match(steps, /<TileGrid tiles=\{INTERESTS\}[^>]*multiple /, 'clients pick several');
  assert.match(page, /onBack=\{step === 2 \? \(\) => goToStep\(1\) : undefined\}/, 'the back arrow returns to the profile');
  const styles = read('components', 'onboarding', 'onboardingStyles.ts');
  assert.match(styles, /color-scheme:light/, 'the form side stays light in dark mode');
  assert.doesNotMatch(styles, /onboarding-hero|transparenttextures/);
  for (const file of ['legacy-pages/onboarding.html', 'pages/onboarding-preview.js', 'public/assets/onboarding-hero.webp']) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  assert.match(read('next.config.js'), /source: '\/onboarding\.html',\s*destination: '\/onboarding'/);
  assert.match(fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8'), /app\.get\(\['\/onboarding', '\/onboarding\.html', '\/legacy-pages\/onboarding\.html'\]/);
});

test('laptop screens: each step fits without scrolling (compact below 860 px and 700 px tall)', () => {
  const styles = read('components', 'onboarding', 'onboardingStyles.ts');
  assert.match(styles, /@media \(min-width: 901px\) and \(max-height: 860px\)\{[\s\S]*?\.onb-input\{ height:46px; \}[\s\S]*?\.onb-tile-media\{ aspect-ratio:5 \/ 4; \}/);
  assert.match(styles, /@media \(min-width: 901px\) and \(max-height: 700px\)\{[\s\S]*?\.onb-photo-ring\{ --photo-size:96px; --cam-size:36px; \}/);
  assert.match(styles, /align-items:safe center/, 'a step taller than the screen is never cut off at the top');
});

test('photo uploads behind the scenes; step 2 is kept when going back', () => {
  const steps = read('components', 'onboarding', 'OnboardingSteps.tsx');
  const page = read('pages', 'onboarding.tsx');
  assert.doesNotMatch(steps, /saveAvatar/, 'step 1 no longer waits for the upload');
  assert.match(page, /startUpload\(newPhoto\.blob\)/);
  assert.match(page, /photoAllowsFinish\(\(\) => uploadRun\.current\)/, 'finishing waits for a photo still uploading');
  assert.match(page, /initialPhoto=\{chosenPhoto\}/, 'the chosen photo is still there on going back');
  assert.match(page, /initialNiche=\{listingDraft \? listingDraft\.niche/);
  const store = new Map();
  const fake = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(ob.listingDraftKey('u1'), 'varoom_host_onboarding_listing_u1');
  assert.equal(ob.readListingDraft(fake, 'u1'), null);
  ob.writeListingDraft(fake, 'u1', { niche: 'hotel', name: 'Palm View' });
  assert.deepEqual({ ...ob.readListingDraft(fake, 'u1') }, { niche: 'hotel', name: 'Palm View' });
  assert.equal(ob.readListingDraft(fake, 'u2'), null, 'kept per account');
  store.set('varoom_host_onboarding_listing_u1', '{"niche":"bogus","name":5}');
  assert.deepEqual({ ...ob.readListingDraft(fake, 'u1') }, { niche: null, name: '' });
  ob.writeListingDraft(fake, 'u1', null);
  assert.equal(store.size, 0);
});

test('the redirect kept for afterwards: same origin only, never back to onboarding', () => {
  const withWindow = loadTs(path.join(root, 'lib', 'onboarding', 'onboarding.ts'), { globals: { window: { location: { origin: 'https://varoom.example' } } } });
  assert.equal(withWindow.onboardingRedirect('/booking?listing=1'), '/booking?listing=1');
  assert.equal(withWindow.onboardingRedirect('https://varoom.example/bookings#top'), '/bookings#top');
  assert.equal(withWindow.onboardingRedirect('/onboarding?step=2'), null, 'never loops back here');
  assert.equal(withWindow.onboardingRedirect('https://evil.example/x'), null);
  assert.equal(withWindow.onboardingRedirect('//evil.example/x'), null);
  assert.equal(withWindow.onboardingRedirect('javascript:alert(1)'), null);
  assert.equal(withWindow.onboardingRedirect(['/a', '/b']), null, 'a repeated query value is ignored');
  assert.equal(withWindow.onboardingRedirect(undefined), null);
});

test('finishing waits for the photo upload; a failed current upload keeps the host here', async () => {
  assert.equal(await ob.photoAllowsFinish(() => null), true, 'no photo');
  assert.equal(await ob.photoAllowsFinish(() => ({ done: Promise.resolve('done') })), true);
  const failed = { done: Promise.resolve('failed') };
  assert.equal(await ob.photoAllowsFinish(() => failed), false, 'retry or skip first');
  let current = { done: new Promise((resolve) => setImmediate(() => resolve('failed'))) };
  const pending = ob.photoAllowsFinish(() => current);
  current = null; // skipped (or replaced) while uploading
  assert.equal(await pending, true, 'a failure of a photo no longer chosen does not block');
  const order = [];
  const slow = { done: new Promise((resolve) => setImmediate(() => { order.push('uploaded'); resolve('done'); })) };
  await ob.photoAllowsFinish(() => slow).then(() => order.push('finished'));
  assert.deepEqual(order, ['uploaded', 'finished']);
});

test('motion: step slides, progress bar, tile press and check, all near-instant under reduced motion', () => {
  const styles = read('components', 'onboarding', 'onboardingStyles.ts');
  const parts = read('components', 'onboarding', 'OnboardingParts.tsx');
  assert.match(parts, /key=\{stageKey\} className=\{`onb-stage/, 'a new step mounts and slides in');
  assert.match(parts, /role="progressbar"/);
  assert.match(styles, /\.onb-stage\.is-forward\{ animation:onb-in-right/);
  assert.match(styles, /\.onb-stage\.is-back\{ animation:onb-in-left/);
  assert.match(styles, /\.onb-progress-fill\{[^}]*transform-origin:left center; transition:transform var\(--motion-standard,250ms\) var\(--ease-in-out/);
  assert.match(styles, /\.onb-tile:active\{ transform:scale\(var\(--press-scale,\.97\)\); \}/);
  assert.match(styles, /animation-delay:calc\(var\(--onb-i, 0\) \* 30ms\)/, 'tiles stagger 30 ms');
  const reduced = styles.slice(styles.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of ['.onb-stage.is-forward', '.onb-progress-fill', '.onb-tile-check svg', '.onb-tile:active']) assert.ok(reduced.includes(selector), selector);
});

test('no side panel on any step: one centred column for hosts and clients', () => {
  const page = read('pages', 'onboarding.tsx');
  const parts = read('components', 'onboarding', 'OnboardingParts.tsx');
  const steps = read('components', 'onboarding', 'OnboardingSteps.tsx');
  const styles = read('components', 'onboarding', 'onboardingStyles.ts');
  assert.doesNotMatch(page, /panel=|HostPreview|ClientPreview|StepInfo/);
  assert.doesNotMatch(parts, /onb-panel|PanelInfo|StepInfo|is-placeholder/);
  assert.doesNotMatch(steps, /HostPreview|ClientPreview/);
  assert.doesNotMatch(styles, /onb-panel|onb-card-|onb-mobile-title|onb-steps|is-solo/);
  assert.match(styles, /\.onb-main\{ flex:1; min-width:0; min-height:100vh; min-height:100dvh; display:flex; justify-content:center; align-items:center;/);
});

test('profile photo: a large circle, the camera on its edge; Change or Remove once there is a photo', async () => {
  const parts = read('components', 'onboarding', 'OnboardingParts.tsx');
  const styles = read('components', 'onboarding', 'onboardingStyles.ts');
  assert.match(styles, /\.onb-photo-ring\{ --photo-size:144px; --cam-size:44px;/, 'larger on wide screens');
  assert.match(styles, /right:calc\(var\(--photo-size\) \* \.1464 - var\(--cam-size\) \/ 2\)/, 'the camera sits on the circle at 45°');
  assert.match(parts, /const onCamera = \(\) => \{ if \(showing === 'none'\) choose\(\); else setMenuOpen\(\(open\) => !open\); \};/, 'no photo: open the library; a photo: the menu');
  for (const text of ['Change photo', 'Remove photo', 'Cancel']) assert.ok(parts.includes(`>${text}</button>`), text);
  for (const text of ['Add a profile photo · Optional', 'Helps people put a face to your name.', 'Choose a photo</button>', 'onb-link-btn" onClick={choose}']) assert.ok(!parts.includes(text), `${text} is gone`);
  assert.match(styles, /@media \(max-width: 640px\)\{[\s\S]*?\.onb-photo-menu\{ position:fixed;[^}]*bottom:0;/, 'a bottom sheet on phones');
  assert.ok(styles.slice(styles.indexOf('@media (prefers-reduced-motion: reduce)')).includes('.onb-photo-menu, .onb-photo-menu.is-closing'), 'the menu is near-instant under reduced motion');
  // Removing the saved photo clears it with step 1's save.
  const client = fakeClient({ profiles: { error: null } });
  await ob.saveHostProfile(client, 'u1', { username: 'amazingstays', phone: '712345678', city: 'Nairobi', removeAvatar: true });
  assert.deepEqual(client.calls[0].ops.find((op) => op[0] === 'update')[1], { username: 'amazingstays', phone: '+254712345678', city: 'Nairobi', avatar_url: null });
  const steps = read('components', 'onboarding', 'OnboardingSteps.tsx');
  assert.match(steps, /const removedAvatar = Boolean\(existingAvatar\) && !savedPhoto && !photo;/);
});
