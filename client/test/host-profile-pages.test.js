const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
// Line endings normalised: Windows checkouts (core.autocrlf) have CRLF.
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
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
  assert.match(read('components', 'hostProfile', 'HostProfile.tsx'), /catch \(error\) \{\n\s+window\.alert\(/, 'shows why the chat did not open');
});

test('one public profile page: viewer from AuthProvider, shared cached data, owner tools, reviews channel cleaned up', () => {
  const notice = read('components', 'hostProfile', 'PrivateProfileNotice.tsx');
  assert.match(notice, /This profile is private/);
  assert.match(notice, /href="\/marketplace"/);
  assert.match(notice, /href=\{loginUrl\(router\.asPath\)\}/, 'signed out: sign in and come back');
  const view = read('components', 'hostProfile', 'HostProfile.tsx');
  assert.match(view, /useAuth\(\)/);
  assert.doesNotMatch(view, /window\.supabaseClient|\.select\("role"\)|select\('role'\)/, 'no second session or role lookup');
  assert.match(view, /const by = byId \? \{ id: byId \} : \{ username: byUsername as string \};/);
  assert.match(view, /loadHostProfile\(token, viewerId, by\)/);
  assert.match(view, /loadHostCardListings\(client, viewerId, hostId, isOwner\)/);
  assert.match(view, /loadHostReviews\(viewerId, hostId, force\)/);
  assert.match(view, /return \(\) => \{ cancelled = true; void client\.removeChannel\(channel\); \};/, 'the realtime channel is always removed');
  assert.doesNotMatch(view + read('components', 'hostProfile', 'ProfileBanner.tsx'), /coverHeader/, 'the owner sees the same banner and identity as visitors');
  // The host: Edit profile, the banner editor and the category manager.
  assert.match(view, /<Link href="\/profile" className="host-profile-message" aria-label="Edit profile">/);
  assert.match(view, /This is your public profile/);
  assert.match(view, /isOwner=\{isOwner\}\n\s+token=\{token\}/);
  // A private profile replaces anything shown from the cache and gets its own screen.
  assert.match(view, /isPrivateProfileError\(error\)\) \{ setProfile\(null\); setLoadError\('This profile is private\.'\); setIsPrivate\(true\); return; \}/);
  assert.match(view, /<PrivateProfileNotice handle=\{handle\}/);
  for (const text of ['Loading host profile', 'This host profile could not be found.', 'No ratings', 'No listings available.', 'No listings in this category yet.']) assert.ok(view.includes(text), text);
  // One address per host: an id address or another letter case becomes /<username>.
  assert.match(view, /const target = hostProfilePath\(profile\.id, profile\.username\);/);
  assert.match(view, /router\.replace\(target, undefined, \{ shallow: router\.pathname === '\/\[username\]', scroll: false \}\)/);
});

test('signed out: no app sidebar, the profile full screen, a sign-in sheet that returns to this profile; signed in: the account shell', () => {
  const view = read('components', 'hostProfile', 'HostProfile.tsx');
  assert.match(view, /const signedOut = status === 'signed-out';/);
  assert.doesNotMatch(view, /SignInRail|host-profile-sign-in-rail|is-public/, 'no sign-in rail: the profile uses the whole screen');
  assert.match(view, /const signIn = \(\) => \{ void router\.push\(loginUrl\(here\(\)\)\); \};/);
  assert.match(view, /onClick=\{\(\) => \{ if \(signedOut\) onSignIn\(\); else setMenu\(!open\); \}\}/, 'Get in touch asks a signed-out visitor to sign in');
  assert.match(view, /\{signedOut && <SignInDialog open=\{signInOpen\}/, 'the sheet stays mounted for its exit');
  for (const text of ['Sign in to contact', 'Continue with Google', 'Continue with Email']) assert.ok(view.includes(text), text);
  // Hosts don't message other hosts from here (as before).
  assert.match(view, /const canMessageHost = Boolean\(host\) && !isOwner && \(signedOut \|\| viewerRole !== 'host'\);/);

  const layout = loadTs(path.join(root, 'lib', 'accountRoleLayout.ts'));
  assert.equal(layout.getAccountLayout('/[username]', '/amazingstays', 'host'), 'host');
  assert.equal(layout.getAccountLayout('/[username]', '/amazingstays', 'client'), 'client');
  assert.equal(layout.getAccountLayout('/[username]', '/amazingstays', null), 'none', 'signed out: no sidebar');
  assert.equal(layout.getAccountLayout('/[username]', '/no-such-page', 'host'), 'none', 'the not-found page has no shell');
  assert.equal(layout.getAccountLayout('/host/[hostId]', '/host/53f971b0-8489-4886-834f-bcc37a2469cd', 'client'), 'client');
  const nav = loadTs(path.join(root, 'lib', 'navigation', 'activeNav.ts'));
  assert.equal(nav.hostActiveNav('/[username]', '/amazingstays', ''), 'profile');
});

test('listings use the Marketplace card: about 280px wide, one full-width card per row on phones', () => {
  const view = read('components', 'hostProfile', 'HostProfile.tsx');
  assert.match(view, /<MarketplaceCard key=\{listing\.id\} listing=\{listing\} saved=\{saved\.has\(listing\.id\)\} token=\{token\} onOpen=\{onOpen\} onSave=\{onSave\} \/>/);
  assert.match(view, /useCardGrid\(gridRef, \{ minColumns: 1, singleColumnQuery: MOBILE_QUERY \}\)/);
  assert.match(view, /const MOBILE_QUERY = '\(max-width: 760px\)';/);
  assert.match(view, /\$\{listingCardStyles\('\.host-profile-cards'\)\}/);
  // A plain style element: styled-jsx drops interpolated CSS (and every rule after it).
  assert.match(view, /<style dangerouslySetInnerHTML=\{\{ __html: CARD_STYLES \}\} \/>/);
  const jsx = view.slice(view.indexOf('<style jsx global>'));
  assert.doesNotMatch(jsx.slice(0, jsx.indexOf('`}</style>')), /\$\{/, 'no interpolation inside styled-jsx');
  assert.match(view, /const saved = useSavedListingIds\(viewerId\);/, 'saved listings shared with Marketplace');
  assert.doesNotMatch(view, /addEventListener\('resize'/, 'no window resize listener: one ResizeObserver per grid');

  const grid = loadTs(path.join(root, 'components', 'marketplace', 'useCardGrid.ts'), { mocks: { react: { useEffect() {}, useLayoutEffect() {} } } });
  assert.equal(grid.gridColumns(1200, 16), 4, 'about 280px cards');
  assert.equal(grid.gridColumns(500, 16), 2, 'Marketplace keeps two columns on phones');
  assert.equal(grid.gridColumns(250, 16, 280, 1), 1, 'a profile may show one');

  // Marketplace still gets the same card rules, from the shared file.
  const styles = read('components', 'marketplace', 'marketplaceStyles.ts');
  assert.match(styles, /\$\{listingCardStyles\('\.marketplace-page'\)\}/);
  assert.doesNotMatch(styles, /\.marketplace-page \.card-body\{/, 'card rules live in components/listings/listingCardStyles.ts');
  const shared = loadTs(path.join(root, 'components', 'listings', 'listingCardStyles.ts')).listingCardStyles('.x');
  for (const selector of ['.x .card{', '.x .card-body{', '.x .card-save{', '.x .card-slides{', '.x .grid[data-cols]{']) assert.ok(shared.includes(selector), selector);
  assert.match(read('pages', 'marketplace.tsx'), /const saved = useSavedListingIds\(userId\);/);
});

test('routes: /<username> is the profile, /host/<id> shows it too, /u/<username> redirects; old components are gone', () => {
  for (const file of ['legacy-pages/public-profile.jsx', 'legacy-pages/host-profile-view.jsx', 'legacy-pages/ProfileBanner.jsx', 'legacy-pages/ProfileCategoryNav.jsx', 'legacy-pages/host-profile.jsx', 'components/VideoMedia.js', 'pages/host/[hostId].js', 'pages/u/[username].js', 'pages/u/[username].tsx', 'components/hostProfile/HostProfileView.tsx', 'components/hostProfile/PublicHostProfile.tsx']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  const page = read('pages', '[username].tsx');
  assert.match(page, /profileUsernameFromPath\(/);
  assert.match(page, /if \(router\.isReady && !username\) return <NotFound \/>;/, 'not a usable username: the not-found page');
  assert.match(page, /<HostProfile hostKey=\{username \? \{ username \} : null\} \/>/);
  const byId = read('pages', 'host', '[hostId].tsx');
  assert.match(byId, /<HostProfile hostKey=\{id \? \{ id \} : null\} \/>/);
  assert.match(byId, /router\.replace\(profileAddress\(username\), undefined, \{ scroll: false \}\)/, '/host/<username> moves to /<username>');
  assert.match(read('next.config.js'), /source: '\/u\/:username',\n\s+destination: '\/:username',\n\s+permanent: true,/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.doesNotMatch(server, /profile-public\.html/);
  assert.match(server, /destinationPath: `\/\$\{encodeURIComponent\(req\.params\.username\)\}`/);
});

test('host page addresses use the username (unique, any case); id addresses keep working', async () => {
  const hp = loadTs(path.join(root, 'lib', 'profile', 'hostProfile.ts'));
  assert.equal(hp.hostProfilePath('53f971b0-8489-4886-834f-bcc37a2469cd', 'amazingstays'), '/amazingstays');
  assert.equal(hp.hostProfilePath('53f971b0-8489-4886-834f-bcc37a2469cd', '@AmazingStays'), '/amazingstays', 'one address, lowercase');
  assert.equal(hp.hostProfilePath('53f971b0-8489-4886-834f-bcc37a2469cd', null), '/host/53f971b0-8489-4886-834f-bcc37a2469cd');
  assert.equal(hp.hostProfilePath('53f971b0-8489-4886-834f-bcc37a2469cd', 'Amazing Stays'), '/host/53f971b0-8489-4886-834f-bcc37a2469cd', 'not a usable username: the id address');
  assert.equal(hp.hostProfilePath('53f971b0-8489-4886-834f-bcc37a2469cd', 'settings'), '/host/53f971b0-8489-4886-834f-bcc37a2469cd', 'never a page name');
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
  // Every profile link is built in one place.
  assert.match(read('pages', 'client-home.tsx'), /href=\{hostProfilePath\(listing\.host_id, host\.username\)\}/);
  assert.match(read('components', 'booking', 'ListingDetails.tsx'), /const hostProfile = hostProfilePath\(listing\.host_id, listing\.host && listing\.host\.username\);/);
  assert.match(read('components', 'hostHome', 'FeedCard.tsx'), /hostProfilePath\(listing\.host_id, host\.username\)/);
});

test('one Get in touch button opens Message, WhatsApp and email (Reach Out), as available to this visitor', async () => {
  const view = read('components', 'hostProfile', 'HostProfile.tsx');
  assert.match(view, /<GetInTouch\s+canMessage=\{canMessageHost\}\s+contact=\{contact\}/);
  assert.match(view, /<MessagesSquare size=\{16\} aria-hidden="true" \/>\s+Get in touch/);
  assert.match(view, /if \(canMessage\) \{\s+options\.push\(/, 'Message only where it was offered before (not for other hosts)');
  assert.match(view, /if \(contact\.whatsapp\) \{\s+options\.push\(<a key="whatsapp" role="menuitem" className="host-profile-touch-option" href=\{profileWhatsappHref\(contact\.whatsapp, enquiry\)\}/);
  assert.match(view, /if \(contact\.email\) \{\s+options\.push\(<a key="email" role="menuitem" className="host-profile-touch-option" href=\{profileMailtoHref\(contact\.email, enquiry\)\}/);
  assert.match(view, /if \(!options\.length\) return null;/, 'nothing to offer: no button');
  assert.doesNotMatch(view, /ContactButtons|host-profile-contact/, 'the separate icon buttons are gone');
  assert.match(view, /if \(event\.key === 'Escape'\) \{ setMenu\(false\); buttonRef\.current\?\.focus\(\); \}/);
  assert.match(view, /loadHostContact\(viewerId, hostId, token\)/, 'signed-in visitors only, cached with the profile');
  const reach = loadTs(path.join(root, 'lib', 'reachOut', 'reachOut.ts'));
  const wa = reach.profileWhatsappHref('0712 345 678', { name: 'Amina', url: 'https://varoom.co.ke/amina' });
  assert.ok(wa.startsWith('https://wa.me/254712345678?text='));
  assert.match(decodeURIComponent(wa.split('text=')[1]), /Hello Amina[\s\S]*https:\/\/varoom\.co\.ke\/amina/);
  const mail = reach.profileMailtoHref('host@example.com', { name: 'Amina', url: 'https://varoom.co.ke/amina' });
  assert.ok(mail.startsWith('mailto:host@example.com?subject='));
  assert.deepEqual({ ...(await reach.fetchProfileContact('H1', null)) }, { whatsapp: null, email: null, phone: null }, 'no session, no request');
  let asked = null;
  const contact = await reach.fetchProfileContact('H1', 'tok', async (url, init) => {
    asked = [url, init.headers.Authorization];
    return { ok: true, json: async () => ({ contact: { whatsapp: '+254712345678', email: null } }) };
  });
  assert.deepEqual(asked, ['/api/host-profiles/H1/contact', 'Bearer tok']);
  assert.deepEqual({ ...contact }, { whatsapp: '+254712345678', email: null, phone: null });
});

test('one category manager for /profile and the public profile', () => {
  const nav = read('components', 'hostProfile', 'ProfileCategoryNav.tsx');
  assert.match(nav, /import \{ CategoryManager, CategoryManagerStyles, CategoryNameEditor, type ManagerState \} from '\.\.\/profile\/CategoryManager';/);
  assert.doesNotMatch(nav, /Organise your listings|saveCategory|renameCategory/, 'no second manager');
  const manager = read('components', 'profile', 'CategoryManager.tsx');
  assert.match(manager, /usePresence\(open, DIALOG_EXIT_MS\)/, 'the dialog plays its exit');
  assert.match(manager, /@media \(prefers-reduced-motion:reduce\)/);
});
