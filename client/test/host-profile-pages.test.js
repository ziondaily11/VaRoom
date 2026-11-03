const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const chat = loadTs(path.join(root, 'lib', 'profile', 'hostChat.ts'));

test('Message opens (or creates) the visitor’s chat about one of the host’s listings', async () => {
  let upserted;
  const client = {
    from: (table) => ({
      upsert(row, options) { upserted = { table, row, options }; return this; },
      select() { return this; },
      single: async () => ({ data: { id: 'conv 1' }, error: null }),
    }),
  };
  assert.equal(await chat.hostChatPath(client, 'H1', 'C1', 'L1'), '/chats?c=conv%201');
  assert.deepEqual(upserted, { table: 'conversations', row: { listing_id: 'L1', host_id: 'H1', client_id: 'C1' }, options: { onConflict: 'listing_id,client_id' } });
  assert.equal(await chat.hostChatPath(client, 'H1', 'C1', null), '/chats?host=H1', 'no listing: Chats');
  const failing = { from: () => ({ upsert() { return this; }, select() { return this; }, single: async () => ({ data: null, error: { message: 'denied' } }) }) };
  assert.equal(await chat.hostChatPath(failing, 'H1', 'C1', 'L1'), '/chats?host=H1');
});

test('/host/[hostId]: viewer from AuthProvider, shared cached data, owner banner in place, reviews channel cleaned up', () => {
  const view = read('components', 'hostProfile', 'HostProfileView.tsx');
  assert.match(view, /useAuth\(\)/);
  assert.doesNotMatch(view, /window\.supabaseClient|\.select\("role"\)|select\('role'\)/, 'no second session or role lookup');
  assert.match(view, /const by = keyIsId \? \{ id: hostKey \} : \{ username: hostKey \};/);
  assert.match(view, /loadHostProfile\(client, viewerId, by\)/);
  assert.match(view, /loadHostReviews\(viewerId, hostId, force\)/);
  assert.match(view, /return \(\) => \{ cancelled = true; void client\.removeChannel\(channel\); \};/, 'the realtime channel is always removed');
  assert.doesNotMatch(view + read('components', 'hostProfile', 'ProfileBanner.tsx'), /coverHeader/, 'the owner sees the same banner and identity as visitors');
  assert.match(view, /useNearVideo<HTMLDivElement>\(listing\.id, token, Boolean\(token\)\)/, 'videos near the screen, signed in only (as before)');
  assert.match(view, /router\.push\(loginUrl\(router\.asPath\)\)/);
});

test('/u/[username]: recognises signed-in visitors; signed-out sign-in returns to this page', () => {
  const page = read('components', 'hostProfile', 'PublicHostProfile.tsx');
  assert.match(page, /loginUrl\(`\/u\/\$\{encodeURIComponent\(username \|\| ''\)\}`\)/);
  assert.match(page, /This is your public profile/);
  assert.match(page, /<Link href="\/profile" style=\{railButton\}>Edit profile<\/Link>/);
  assert.match(page, /if \(signedIn\) void startChat\(\); else setIsSignInPromptOpen\(true\);/);
  for (const text of ['Sign in to message', 'Continue with Google', 'Continue with Email', 'No ratings', 'Loading host profile', 'This host profile could not be found.']) assert.ok(page.includes(text), text);
  assert.match(page, /loadHostReviews\(viewerId, hostId\)/, 'reviews through the API (published only), not two table reads');
});

test('legacy profile components are retired; routes are TypeScript', () => {
  for (const file of ['legacy-pages/public-profile.jsx', 'legacy-pages/host-profile-view.jsx', 'legacy-pages/ProfileBanner.jsx', 'legacy-pages/ProfileCategoryNav.jsx', 'legacy-pages/host-profile.jsx', 'components/VideoMedia.js', 'pages/host/[hostId].js', 'pages/u/[username].js']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  assert.ok(fs.existsSync(path.join(root, 'pages', 'host', '[hostId].tsx')));
  assert.ok(fs.existsSync(path.join(root, 'pages', 'u', '[username].tsx')));
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.doesNotMatch(server, /profile-public\.html/);
  assert.match(server, /destinationPath: `\/u\/\$\{encodeURIComponent\(req\.params\.username\)\}`/);
});

test('host page addresses use the username (unique, any case); id addresses keep working', async () => {
  const hp = loadTs(path.join(root, 'lib', 'profile', 'hostProfile.ts'));
  assert.equal(hp.hostProfilePath('53f971b0-8489-4886-834f-bcc37a2469cd', 'amazingstays'), '/host/amazingstays');
  assert.equal(hp.hostProfilePath('53f971b0-8489-4886-834f-bcc37a2469cd', '@Amazing Stays'), '/host/Amazing%20Stays');
  assert.equal(hp.hostProfilePath('53f971b0-8489-4886-834f-bcc37a2469cd', null), '/host/53f971b0-8489-4886-834f-bcc37a2469cd');
  assert.equal(hp.literalIlike('a_b%c'), 'a\\_b\\%c', 'no wildcards from the address');

  const calls = [];
  const row = { id: 'H1', role: 'host', username: 'amazingstays' };
  const client = { from: () => { const entry = []; calls.push(entry); const chain = new Proxy({}, { get: (_t, prop) => (prop === 'maybeSingle' ? async () => ({ data: row, error: null }) : (...args) => { entry.push([prop, ...args]); return chain; }) }); return chain; } };
  await hp.loadHostProfile(client, 'V1', { username: 'AmazingStays' });
  assert.deepEqual(calls[0].filter((op) => op[0] === 'ilike'), [['ilike', 'username', 'AmazingStays']], 'matched ignoring case');
  assert.equal(hp.peekHostProfile('V1', { id: 'H1' }), row, 'cached under the id too');
  await hp.loadHostProfile(client, 'V2', { id: 'H1' });
  assert.equal(hp.peekHostProfile('V2', { username: 'AMAZINGSTAYS' }), row, 'an id load is reused by the username address');
  assert.equal(calls.length, 2);

  const view = read('components', 'hostProfile', 'HostProfileView.tsx');
  assert.match(view, /router\.replace\(hostProfilePath\(profile\.id, profile\.username\), undefined, \{ shallow: true, scroll: false \}\)/);
  assert.match(read('pages', 'client-home.tsx'), /href=\{hostProfilePath\(listing\.host_id, host\.username\)\}/);
  assert.match(read('components', 'booking', 'ListingDetails.tsx'), /href=\{`\/host\/\$\{encodeURIComponent\(\(listing\.host && listing\.host\.username\) \|\| listing\.host_id\)\}`\}/);
  assert.match(read('legacy-pages', 'host-home.html'), /'\/host\/' \+ encodeURIComponent\(host\.username \|\| listing\.host_id\)/);
});
