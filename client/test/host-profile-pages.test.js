const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const chat = loadTs(path.join(root, 'lib', 'profile', 'hostChat.ts'));

test('Message opens the visitor’s chat with the host, ready to ask about one of the host’s listings', async () => {
  const asked = [];
  const start = async (listingId) => { asked.push(listingId); return `/chats?c=conv%201&listing=${listingId}`; };
  assert.equal(await chat.hostChatPath('H1', 'L1', start), '/chats?c=conv%201&listing=L1');
  assert.deepEqual(asked, ['L1']);
  assert.equal(await chat.hostChatPath('H1', null, start), '/chats?host=H1', 'no listing: Chats');
  assert.equal(await chat.hostChatPath('H1', 'L1', async () => { throw new Error('denied'); }), '/chats?host=H1');
  // The host chose "Who can message you: No one": the visitor is told, not sent to an empty Chats.
  const off = Object.assign(new Error('This host isn’t accepting new messages.'), { status: 403, body: { code: 'messages_off' } });
  await assert.rejects(chat.hostChatPath('H1', 'L1', async () => { throw off; }), /accepting new messages/);
  for (const file of ['HostProfileView.tsx', 'PublicHostProfile.tsx']) {
    assert.match(read('components', 'hostProfile', file), /catch \(error\) \{\n\s+window\.alert\(/, `${file} shows why the chat did not open`);
  }
});

test('/host/[hostId]: viewer from AuthProvider, shared cached data, owner banner in place, reviews channel cleaned up', () => {
  const view = read('components', 'hostProfile', 'HostProfileView.tsx');
  assert.match(view, /useAuth\(\)/);
  assert.doesNotMatch(view, /window\.supabaseClient|\.select\("role"\)|select\('role'\)/, 'no second session or role lookup');
  assert.match(view, /const by = keyIsId \? \{ id: hostKey \} : \{ username: hostKey \};/);
  assert.match(view, /loadHostProfile\(token, viewerId, by\)/);
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
  // Read through the server (which applies Profile visibility), with the viewer's session when there is one.
  const calls = [];
  const row = { id: 'H1', role: 'host', username: 'amazingstays' };
  const fetchFn = async (url, init) => { calls.push([url, init && init.headers ? init.headers.Authorization : null]); return { ok: true, status: 200, json: async () => ({ profile: row }) }; };
  await hp.loadHostProfile('tok', 'V1', { username: '@AmazingStays' }, false, fetchFn);
  assert.deepEqual(calls[0], ['/api/host-profiles/AmazingStays', 'Bearer tok']);
  assert.equal(hp.peekHostProfile('V1', { id: 'H1' }), row, 'cached under the id too');
  await hp.loadHostProfile(null, 'V2', { id: 'H1' }, false, fetchFn);
  assert.deepEqual(calls[1], ['/api/host-profiles/H1', null], 'signed out: no session sent');
  assert.equal(hp.peekHostProfile('V2', { username: 'AMAZINGSTAYS' }), row, 'an id load is reused by the username address');
  assert.equal(calls.length, 2);

  const answer = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });
  assert.equal(await hp.fetchHostProfile({ username: 'nobody' }, null, answer(404, { error: 'Host not found' })), null);
  await assert.rejects(hp.fetchHostProfile({ id: 'H2' }, null, answer(403, { code: 'profile_private' })), (error) => hp.isPrivateProfileError(error));
  await assert.rejects(hp.fetchHostProfile({ id: 'H2' }, null, answer(502, { error: 'Could not load this host profile.' })), /Could not load/);
  assert.equal(hp.isPrivateProfileError(new Error('x')), false);
  for (const file of ['HostProfileView.tsx', 'PublicHostProfile.tsx']) {
    assert.match(read('components', 'hostProfile', file), /isPrivateProfileError\(error\)\) \{ setProfile\(null\); setLoadError\('This profile is private\.'\);/, `${file}: a private profile replaces the cached one`);
  }

  const view = read('components', 'hostProfile', 'HostProfileView.tsx');
  assert.match(view, /router\.replace\(hostProfilePath\(profile\.id, profile\.username\), undefined, \{ shallow: true, scroll: false \}\)/);
  assert.match(read('pages', 'client-home.tsx'), /href=\{hostProfilePath\(listing\.host_id, host\.username\)\}/);
  assert.match(read('components', 'booking', 'ListingDetails.tsx'), /href=\{`\/host\/\$\{encodeURIComponent\(\(listing\.host && listing\.host\.username\) \|\| listing\.host_id\)\}`\}/);
  assert.match(read('components', 'hostHome', 'FeedCard.tsx'), /`\/host\/\$\{encodeURIComponent\(host\.username \|\| listing\.host_id\)\}`/);
});
