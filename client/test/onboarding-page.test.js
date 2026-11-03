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

test('choices keep their saved values and wording', () => {
  assert.deepEqual(ob.CATEGORIES.map((c) => c.value), ['airbnb', 'hotel', 'property', 'office', 'venue']);
  assert.deepEqual(ob.CATEGORIES.map((c) => c.title), ['Airbnbs', 'Hotels', 'Property to let / buy', 'Shops & offices', 'Event venues']);
  assert.equal(ob.CATEGORIES[0].description, 'Unique stays that feel like home');
  assert.deepEqual(ob.TIMELINES.map((t) => [t.value, t.title, t.description]), [['soon', 'Looking soon', "I'm ready to find it"], ['browsing', 'Just browsing', "I'm exploring for now"]]);
  assert.equal(ob.CITY_SUGGESTIONS[0], 'Nairobi, Kenya');
  assert.deepEqual(ob.initialCategories(['hotel', 'bogus', 'venue']), ['hotel', 'venue']);
  assert.equal(ob.initialNiche(['property']), 'property');
  assert.equal(ob.initialNiche(['property', 'hotel']), null, 'prefilled only for a single niche');
});

test('username rules and messages, and an exact availability check (no wildcards)', async () => {
  assert.equal(ob.normalizeUsername('  @@Amazing.Stays '), 'amazing.stays');
  assert.equal(ob.usernameFormatError('ab'), 'Username must be at least 3 characters.');
  assert.equal(ob.usernameFormatError('bad-name'), 'Only lowercase letters, numbers, dot, and underscore allowed.');
  assert.equal(ob.usernameFormatError('a'.repeat(21)), 'Username must be 20 characters or fewer.');
  assert.equal(ob.usernameFormatError('palm_view.1'), null);
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

test('saves: client preferences finish onboarding; host profile, then listing finishes it', async () => {
  const client = fakeClient({ profiles: { error: null } });
  await ob.saveClientPreferences(client, 'u1', ['airbnb', 'office'], 'soon');
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

test('where people go: the safe link they came from, else their role’s home; hosts resume step 2 only after saving step 1', () => {
  assert.equal(ob.destination('client', 'soon', null), '/marketplace');
  assert.equal(ob.destination('client', 'browsing', null), '/client-home');
  assert.equal(ob.destination('host', null, null), '/host-home');
  assert.equal(ob.destination('host', null, '/booking?listing=1'), '/booking?listing=1');
  assert.equal(ob.hostStepKey('u1'), 'varoom_host_onboarding_step_u1');
  assert.equal(ob.initialHostStep('2', { username: 'a', phone: '+2547', city: 'Nairobi' }), 2);
  assert.equal(ob.initialHostStep('2', { username: 'a', phone: null, city: 'Nairobi' }), 1);
  assert.equal(ob.initialHostStep(null, { username: 'a', phone: '1', city: 'x' }), 1);
});

test('page: AuthProvider profile, safe redirect, Split layout, legacy page and preview retired', () => {
  const page = read('pages', 'onboarding.tsx');
  assert.match(page, /useAuth\(\)/);
  assert.doesNotMatch(page, /window\.supabaseClient|window\.location\.href/, 'no legacy globals or full reloads');
  assert.match(page, /getSafeRedirect\(router\.query\.redirect\)/);
  assert.match(page, /!safe\.startsWith\('\/onboarding'\)/, 'never loops back here');
  assert.match(page, /await refreshProfile\(\)/, 'the app sees onboarding as done before moving on');
  const steps = read('components', 'onboarding', 'OnboardingSteps.tsx');
  for (const text of ['A little more you.', "Let's set up your profile so people can put a face to your name.", 'What will you be listing?', 'What are you hoping to find?', 'When are you looking?', '← Back to profile setup', 'Finishing setup...', 'Uploading photo...', 'Continue without photo']) assert.ok(steps.includes(text), text);
  assert.match(steps, /disabled=\{!valid \|\| Boolean\(busy\)\}/, 'Continue waits for a valid form');
  const styles = read('components', 'onboarding', 'onboardingStyles.ts');
  assert.match(styles, /color-scheme:light/, 'the form side stays light in dark mode');
  assert.doesNotMatch(styles, /onboarding-hero|transparenttextures/);
  for (const file of ['legacy-pages/onboarding.html', 'pages/onboarding-preview.js', 'public/assets/onboarding-hero.webp']) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  assert.match(read('next.config.js'), /source: '\/onboarding\.html',\s*destination: '\/onboarding'/);
  assert.match(fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8'), /app\.get\(\['\/onboarding', '\/onboarding\.html', '\/legacy-pages\/onboarding\.html'\]/);
});

test('laptop screens: each step fits without scrolling (compact below 860 px and 700 px tall)', () => {
  const styles = read('components', 'onboarding', 'onboardingStyles.ts');
  assert.match(styles, /@media \(min-width: 901px\) and \(max-height: 860px\)\{[\s\S]*?\.onb-input\{ height:46px; \}/);
  assert.match(styles, /@media \(min-width: 901px\) and \(max-height: 700px\)\{[\s\S]*?\.onb-photo-frame\{ width:60px; height:60px; \}/);
  assert.match(styles, /align-items:safe center/, 'a step taller than the screen is never cut off at the top');
});
