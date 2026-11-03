const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const pp = loadTs(path.join(root, 'lib', 'profile', 'profilePage.ts'));
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });

function fakeClient(answers) {
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
          return (...args) => { entry.ops.push([prop, ...args]); return chain; };
        },
      });
      return chain;
    },
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return answers.rpc ? answers.rpc(name, args) : { data: null, error: null }; },
    storage: { from: (bucket) => ({ upload: async (p, file, opts) => { calls.push({ upload: bucket, path: p, opts }); return answers.upload || { data: { path: p }, error: null }; } }) },
  };
}

test('header labels keep the legacy wording', () => {
  assert.equal(pp.displayName(null), 'VaRoom member');
  assert.equal(pp.handleOf(null), '@user');
  assert.equal(pp.memberSince('2026-02-01T00:00:00Z'), 'Member since 2026');
  assert.equal(pp.memberSince(null), 'Member since 2024');
  assert.equal(pp.specialisation('host', ['airbnb']), 'Specializes in Airbnb');
  assert.equal(pp.specialisation('host', ['airbnb', 'hotel']), null);
  assert.equal(pp.specialisation('client', ['airbnb']), null);
  assert.equal(pp.bannerUrl('photos/production/profile-banners/a b.jpg'), '/api/photos/profile-banners/photos/production/profile-banners/a%20b.jpg');
  assert.equal(pp.profileShareUrl('https://varoom.co.ke', 'amazingstays'), 'https://varoom.co.ke/u/amazingstays');
  assert.equal(pp.profileShareUrl('https://varoom.co.ke', null), 'https://varoom.co.ke/profile');
  assert.equal(pp.listingPrice(4000, 'night'), 'KSh 4,000 / night');
  assert.equal(pp.listingPrice(70000, 'month'), 'KSh 70,000 / month');
  assert.equal(pp.listingPrice(null, 'night'), '');
  assert.deepEqual(pp.listingStatus('draft'), { label: 'Draft', className: 'paused' });
  assert.equal(pp.listingStatus(null).label, 'Available');
  assert.equal(pp.draftTitle(null, 'airbnb'), 'Airbnb draft');
});

test('client bookings: only the rows shown (2 upcoming, 3 most recent past); KES, nights from the dates', async () => {
  const row = (id, extra) => ({ id, status: 'approved', start_date: '2026-11-10', end_date: '2026-11-13', guests: 3, total_price: 12000, listing: { title: 'Loft', location_text: 'Nairobi', listing_photos: [{ storage_path: 'p.jpg' }] }, ...extra });
  const client = fakeClient({ bookings: (entry) => ({ data: entry.ops.some((op) => op[0] === 'not') ? [row('u1')] : [row('p1', { status: 'cancelled' })], error: null }) });
  const result = await pp.loadClientBookings(client, 'C1', new Date('2026-11-03T12:00:00Z'));
  const [upcoming, past] = client.calls;
  assert.deepEqual(upcoming.ops.filter((op) => ['eq', 'not', 'or', 'limit'].includes(op[0])), [['eq', 'client_id', 'C1'], ['not', 'status', 'in', '(completed,cancelled)'], ['or', 'end_date.gte.2026-11-03,end_date.is.null'], ['limit', 2]]);
  assert.deepEqual(past.ops.filter((op) => ['eq', 'or', 'order', 'limit'].includes(op[0])), [['eq', 'client_id', 'C1'], ['or', 'status.in.(completed,cancelled),end_date.lt.2026-11-03'], ['order', 'end_date', { ascending: false }], ['limit', 3]]);
  const booking = result.upcoming[0];
  assert.equal(booking.photo, 'p.jpg');
  assert.equal(pp.bookingNights(booking), 3);
  assert.equal(pp.bookingTotal(booking.total_price), 'KES 12,000');
  assert.equal(pp.pastStatus(result.past[0]), 'Cancelled');
  assert.equal(pp.bookingDates({ start_date: null, end_date: null }), 'Flexible dates');
});

test('edit profile: full name required; bio only for hosts; empty fields saved as null', async () => {
  assert.deepEqual({ ...pp.profileEdit({ fullName: ' ', username: '', bio: '', city: '' }, true) }, { update: null, error: 'Full name is required.' });
  assert.deepEqual({ ...pp.profileEdit({ fullName: 'Ann ', username: '', bio: 'Hi', city: '' }, true).update }, { full_name: 'Ann', username: null, city: null, bio: 'Hi' });
  assert.equal('bio' in pp.profileEdit({ fullName: 'Ann', username: 'ann', bio: 'x', city: 'Nairobi' }, false).update, false);
  const client = fakeClient({ profiles: { error: { message: 'duplicate key value violates unique constraint' } } });
  assert.match(await pp.saveProfileEdit(client, 'U1', { full_name: 'Ann' }), /duplicate key/);
});

test('avatar: stored under the account, saved on the profile, and a failed save is reported', async () => {
  const client = fakeClient({ profiles: { error: null } });
  const saved = await pp.uploadAvatar(client, 'U1', { name: 'Me.PNG', size: 10 }, 42);
  assert.equal(saved, 'U1/avatar_42.png');
  assert.deepEqual(client.calls[0], { upload: 'avatars', path: 'U1/avatar_42.png', opts: { upsert: false } });
  assert.deepEqual(client.calls[1].ops.find((op) => op[0] === 'update'), ['update', { avatar_url: 'U1/avatar_42.png' }]);
  await assert.rejects(pp.uploadAvatar(fakeClient({ profiles: { error: { message: 'denied' } } }), 'U1', { name: 'a.jpg' }), /denied/, 'legacy ignored this error');
});

test('banner: init, upload, verify, save, then discard the old one; a failure discards the new one', async () => {
  assert.equal(pp.bannerFileOk({ type: 'image/png', size: 100 }), true);
  assert.equal(pp.bannerFileOk({ type: 'image/svg+xml', size: 100 }), false);
  assert.equal(pp.bannerFileOk({ type: 'image/png', size: 16 * 1024 * 1024 }), false);
  const steps = [];
  const fetchFn = async (url, init) => {
    steps.push([init.method, url, init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null]);
    if (url === '/api/photos/upload-init') return json(200, { key: 'new-key', uploadUrl: 'https://r2.example/put' });
    if (url === '/api/profile/banner') return json(200, { previousKey: 'old-key' });
    return json(200, {});
  };
  assert.equal(await pp.uploadBanner('tok', { name: 'b.jpg', type: 'image/jpeg', size: 5 }, 'old-key', fetchFn), 'new-key');
  assert.deepEqual(steps.map((s) => `${s[0]} ${s[1]}`), ['POST /api/photos/upload-init', 'PUT https://r2.example/put', 'POST /api/photos/upload-complete', 'PUT /api/profile/banner', 'POST /api/photos/upload-discard']);
  assert.deepEqual(steps[4][2], { category: 'profile-banners', key: 'old-key' });

  steps.length = 0;
  const failing = async (url, init) => { steps.push([init.method, url, init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null]); if (url === '/api/photos/upload-init') return json(200, { key: 'new-key', uploadUrl: 'https://r2.example/put' }); if (url === '/api/photos/upload-complete') return json(422, { error: 'Unable to verify banner upload.' }); return json(200, {}); };
  await assert.rejects(pp.uploadBanner('tok', { name: 'b.jpg', type: 'image/jpeg', size: 5 }, null, failing), /Unable to verify/);
  assert.deepEqual(steps.at(-1)[2], { category: 'profile-banners', key: 'new-key' }, 'the new upload is discarded');
});

test('categories: plan limits, save with listings, duplicate names', async () => {
  assert.equal(pp.categoryLimitMessage(5), 'You have reached the maximum of 5 categories for Premium hosts.');
  assert.equal(pp.categoryLimitMessage(1), 'Your plan allows 1 category.');
  assert.equal(pp.cleanCategoryName('  '), null);
  assert.equal(pp.cleanCategoryName('x'.repeat(61)), null);
  const client = fakeClient({ rpc: (name) => (name === 'profile_category_limit' ? { data: 5, error: null } : { data: [{ id: 'C9' }], error: null }) });
  assert.equal(await pp.categoryLimit(client), 5);
  assert.equal(await pp.saveCategory(client, null, 'Beach', ['L1']), 'C9');
  assert.deepEqual(client.calls.at(-1), { rpc: 'save_profile_category_with_listings', args: { p_category_id: null, p_name: 'Beach', p_listing_ids: ['L1'] } });
  const dup = fakeClient({ rpc: () => ({ data: null, error: { code: '23505', message: 'duplicate' } }) });
  await assert.rejects(pp.saveCategory(dup, null, 'Beach', ['L1']), /That category name already exists\./);
  await assert.rejects(pp.renameCategory(dup, 'C1', 'Beach'), /That category name already exists\./);
  await assert.rejects(pp.deleteCategory(dup, 'C1'), /Could not delete category\./);
});

test('page: own profile only (?u= opens the host page), one profile read, retired legacy page', () => {
  const page = read('pages', 'profile.tsx');
  assert.match(page, /void router\.replace\(hostProfilePath\(host\.id, host\.username\)\)/);
  assert.match(page, /loadOwnProfile\(client, userId\)/);
  assert.doesNotMatch(page, /notifications'\)\.select|channel\(/, 'no notification count or live subscription');
  const listings = read('components', 'profile', 'HostListings.tsx');
  assert.match(listings, /tab\.kind === 'all' && looseDrafts\.map/, 'drafts only under All listings');
  assert.match(listings, /rootMargin: '400px 0px'/, 'videos load as cards near the screen');
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'profile.html')), false);
  assert.match(read('next.config.js'), /source: '\/profile\.html',\s*destination: '\/profile'/);
  assert.match(fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8'), /app\.get\(\['\/profile', '\/profile\.html', '\/legacy-pages\/profile\.html'\]/);
  for (const text of ['Upcoming Bookings', 'Past Trips', 'You have no upcoming trips.', 'View Details', 'Share this profile', 'Edit profile', 'Save changes']) {
    assert.ok(read('components', 'profile', 'ProfileSections.tsx').includes(text) || read('components', 'profile', 'ProfileHeader.tsx').includes(text), text);
  }
});
