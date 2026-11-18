const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const support = loadTs(path.join(root, 'lib', 'support', 'support.ts'));
const page = fs.readFileSync(path.join(root, 'pages', 'support.tsx'), 'utf8');
const dialog = fs.readFileSync(path.join(root, 'components', 'support', 'SupportDialog.tsx'), 'utf8');

test('help articles: six topics, each with answers that follow the app, and links to the Terms', () => {
  assert.deepEqual(support.HELP_TOPICS.map((t) => t.id), ['start', 'bookings', 'hosting', 'chats', 'account', 'safety']);
  for (const topic of support.HELP_TOPICS) assert.ok(support.HELP_ARTICLES.some((a) => a.topic === topic.id), `${topic.id} has articles`);
  const ids = support.HELP_ARTICLES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids (they are page anchors)');
  for (const article of support.HELP_ARTICLES) {
    assert.ok(article.steps.length > 0 && article.summary, article.id);
    if (article.link) assert.match(article.link.href, /^\/(terms|privacy)#[a-z-]+$/, `${article.id} links a section`);
  }
  const dark = support.HELP_ARTICLES.find((a) => a.id === 'dark-mode');
  assert.deepEqual(dark.steps, ['Open **Settings**.', 'Select **Display**.', 'Under Appearance, choose **Dark**.'], 'the real path, not the old Profile one');
  assert.match(support.HELP_ARTICLES.find((a) => a.id === 'pay-safely').note, /does not hold payments/, 'as the Terms say (no escrow)');
  assert.deepEqual(support.stepParts('Find and select **Become a Host**.'), [
    { bold: false, text: 'Find and select ' }, { bold: true, text: 'Become a Host' }, { bold: false, text: '.' },
  ]);
});

test('help search: every article with all the words, title matches first', () => {
  assert.equal(support.searchHelpArticles('dark mode')[0].id, 'dark-mode');
  assert.equal(support.searchHelpArticles('THEME')[0].id, 'dark-mode', 'keywords count, case-insensitive');
  assert.equal(support.searchHelpArticles('cancel')[0].id, 'cancel-booking', 'a title match comes first');
  assert.ok(support.searchHelpArticles('host').length > 2, 'all matches, not just the first');
  assert.equal(support.searchHelpArticles('password')[0].id, 'change-password');
  assert.deepEqual(support.searchHelpArticles('zebra crossing'), []);
  assert.deepEqual(support.searchHelpArticles('   '), []);
});

test('page: live results, topics, articles that open, contact, and footer links that go somewhere', () => {
  assert.match(page, /const results = useMemo\(\(\) => searchHelpArticles\(query\), \[query\]\);/);
  assert.match(page, /aria-expanded=\{open\} aria-controls=\{panelId\}/);
  assert.match(page, /window\.location\.hash\.replace\(\/\^#help-\/, ''\)/, 'an article can be linked');
  assert.doesNotMatch(page, /href="#"/, 'no dead links');
  assert.match(page, /href="\/terms#prohibited-conduct"/);
  assert.match(page, /href="\/privacy#cookies"/);
  for (const flow of ['ticket', 'account', 'bug', 'feature']) assert.match(page, new RegExp(`flow: '${flow}'`), flow);
  const styles = fs.readFileSync(path.join(root, 'components', 'support', 'supportStyles.ts'), 'utf8');
  assert.match(styles, /\.help-item-panel \{ display:grid; grid-template-rows:0fr;/);
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\) \{[\s\S]*\.help-item-panel/);
});

test('ticket checks, in legacy order and wording', () => {
  const base = { name: '', email: 'me@example.com', subject: 'Help', message: 'Hi' };
  assert.deepEqual(support.buildSupportTicket(base), { ticket: { name: 'VaRoom member', email: 'me@example.com', subject: 'Help', message: 'Hi' } });
  assert.deepEqual(support.buildSupportTicket({ ...base, email: 'nope' }), { error: 'Please enter a valid reply-to email.' });
  assert.deepEqual(support.buildSupportTicket({ ...base, email: '' }), { error: 'Please enter a valid reply-to email.' });
  assert.deepEqual(support.buildSupportTicket({ ...base, subject: '  ' }), { error: 'Please add a subject.' });
  assert.deepEqual(support.buildSupportTicket({ ...base, message: '' }), { error: 'Please tell us how we can help.' });
  assert.equal(support.FLOW_COPY.bug.subject, 'Bug report');
  assert.equal(support.FLOW_COPY.feature.subject, 'Feature request');
  assert.equal(support.FLOW_COPY.ticket.subject, null);
});

test('sending: same endpoint and body; token only when signed in; server errors shown', async () => {
  const calls = [];
  const json = (status, body) => ({ ok: status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });
  const ticket = { name: 'A', email: 'a@b.co', subject: 'S', message: 'M' };
  await support.sendSupportTicket(ticket, 'tok', async (url, init) => { calls.push({ url, init }); return json(201, { ticket: {} }); });
  assert.equal(calls[0].url, '/api/support/tickets');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].init.body), ticket);
  await support.sendSupportTicket(ticket, null, async (url, init) => { calls.push({ url, init }); return json(201, {}); });
  assert.equal(calls[1].init.headers.Authorization, undefined);
  await assert.rejects(support.sendSupportTicket(ticket, null, async () => json(400, { error: 'Name, valid email, subject and message are required' })), /valid email/);
  await assert.rejects(support.sendSupportTicket(ticket, null, async () => ({ ok: true, headers: { get: () => 'text/html' } })), /unexpected response/);
});

test('page: legacy markup classes, identity from AuthProvider (no profile request), no app navigation', () => {
  assert.doesNotMatch(page, /from\('profiles'\)|supabase-client\.js/);
  assert.match(page, /const homeHref = supportHomeHref\(role\);/);
  assert.match(page, /<div className="page support-page">/);
  // Nothing of the legacy page remains: its styles (including dark theme) live with the page.
  assert.doesNotMatch(page, /support-page-body/);
  const styles = fs.readFileSync(path.join(root, 'components', 'support', 'supportStyles.ts'), 'utf8');
  assert.match(styles, /\[data-theme="dark"\] \.support-page \.action,/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'public', 'js', 'varoom-dark-theme.css'), 'utf8'), /support-page/);
  // Opens in its own tab like the legal pages: no app navigation, no page links.
  assert.doesNotMatch(page, /appNavigation/);
  assert.doesNotMatch(page, /aria-label="Primary navigation"|href="\/chats"|href="\/bookings"/);
  assert.match(page, /<RateVaroom userId=\{user\?\.id \|\| null\} \/>/);
  assert.match(page, /takeSupportHandoff\(\)/);
  assert.match(page, /router\.query\.topic === 'account'\) setFlow\('account'\)/);
  for (const text of ['How can we help?', 'Contact support', 'Help with my account', 'Report a bug', 'Suggest a feature', 'Still need help?', 'Contact the VaRoom team', 'Ask our team']) {
    assert.ok(page.includes(text), text);
  }
});

test('dialog: closes on Escape, backdrop and ✕; focus moves in and returns; account help is a form with topics; known emails are masked; confirmation closes after 1.4 s', () => {
  assert.match(dialog, /if \(event\.key === 'Escape'\) onClose\(\);/);
  assert.match(dialog, /if \(event\.target === event\.currentTarget\) onClose\(\);/);
  assert.match(dialog, /opener\?\.focus\?\.\(\);/);
  assert.match(dialog, /const openerRef = useRef<HTMLElement \| null>\(typeof document === 'undefined' \? null : document\.activeElement/, 'the opener is read before focus moves into the dialog');
  assert.match(dialog, /<select id="account-topic"/);
  assert.match(dialog, /ACCOUNT_TOPICS\.map/);
  assert.match(dialog, /\{maskEmail\(replyEmail\)\}/);
  assert.match(dialog, /Use a different email/);
  assert.match(dialog, /window\.setTimeout\(onClose, 1400\)/);
  assert.match(dialog, /buildSupportTicket\(ticketRequest\(flow, user, \{ replyEmail, subject, message, topic \}\)\)/);
});

test('ticket request: the typed reply-to email for tickets, the account email and fixed subject otherwise', () => {
  const user = { name: 'Zion', email: 'zion@example.com' };
  const fields = { replyEmail: 'reply@example.com', subject: 'Payout', message: 'Hi' };
  assert.deepEqual({ ...support.ticketRequest('ticket', user, fields) }, { name: 'Zion', email: 'reply@example.com', subject: 'Payout', message: 'Hi' });
  assert.deepEqual({ ...support.ticketRequest('bug', user, fields) }, { name: 'Zion', email: 'zion@example.com', subject: 'Bug report', message: 'Hi' });
  assert.deepEqual({ ...support.ticketRequest('feature', user, fields) }, { name: 'Zion', email: 'zion@example.com', subject: 'Feature request', message: 'Hi' });
  // Account help: the reply-to email, and the chosen topic as the subject.
  assert.deepEqual(
    { ...support.ticketRequest('account', user, { ...fields, topic: 'My account is suspended' }) },
    { name: 'Zion', email: 'reply@example.com', subject: 'Account help: My account is suspended', message: 'Hi' },
  );
  assert.equal(support.ticketRequest('account', user, fields).subject, '', 'no topic chosen: no subject');
  assert.ok(support.ACCOUNT_TOPICS.includes('My account is suspended'));
  assert.deepEqual(support.buildSupportTicket(support.ticketRequest('ticket', user, { ...fields, replyEmail: 'typo' })), { error: 'Please enter a valid reply-to email.' });
  assert.equal(support.supportHomeHref('host'), '/host-home');
  assert.equal(support.supportHomeHref('client'), '/client-home');
  assert.equal(support.supportHomeHref(null), '/client-home', 'signed out');
});

test('legacy support.html is gone; old URLs reach the native page', () => {
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'support.html')), false);
  const config = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8');
  assert.match(config, /source: '\/support\.html',\s*destination: '\/support'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/support', '\/support\.html', '\/legacy-pages\/support\.html'\]/);
  assert.doesNotMatch(server, /'\/support': 'support\.html'/);
});

const handoff = loadTs(path.join(root, 'lib', 'support', 'handoff.ts'));

test('handoff: the sign-in email is masked, carried once, never in the URL, and expires', () => {
  assert.equal(handoff.maskEmail('ziondaily@gmail.com'), 'zi*****ly@gmail.com');
  assert.equal(handoff.maskEmail('susan.wangari@example.co.ke'), 'su*********ri@example.co.ke');
  assert.equal(handoff.maskEmail('abc@x.io'), 'a**@x.io');
  assert.equal(handoff.maskEmail('not-an-email'), '');
  assert.equal(handoff.ACCOUNT_HELP_HREF, '/support?topic=account');

  const data = new Map();
  const store = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  handoff.saveSupportHandoff(' zion@example.com ', store, 1000);
  assert.equal(handoff.takeSupportHandoff(store, 2000), 'zion@example.com');
  assert.equal(handoff.takeSupportHandoff(store, 2000), null, 'read once');
  handoff.saveSupportHandoff('zion@example.com', store, 0);
  assert.equal(handoff.takeSupportHandoff(store, 11 * 60 * 1000), null, 'too old');
  handoff.saveSupportHandoff('zion@example.com', store, 0);
  handoff.saveSupportHandoff('typo', store, 0);
  assert.equal(handoff.takeSupportHandoff(store, 1), null, 'an invalid email clears it');
  assert.equal(handoff.takeSupportHandoff(null), null);
});

test('support opens in a new tab everywhere, like the legal pages', () => {
  const newTab = loadTs(path.join(root, 'lib', 'navigation', 'newTab.ts'));
  for (const href of ['/support', '/support?topic=account', '/terms', '/privacy#cookies']) assert.equal(newTab.opensInNewTab(href), true, href);
  for (const href of ['/chats', '/supporters', '/settings']) assert.equal(newTab.opensInNewTab(href), false, href);
  assert.deepEqual({ ...newTab.newTabProps('/support') }, { target: '_blank', rel: 'noopener noreferrer' });
  assert.deepEqual({ ...newTab.newTabProps('/chats') }, {});

  const links = loadTs(path.join(root, 'lib', 'navigation', 'appLinks.ts'));
  assert.equal(links.isInternalHref('/support', links.HOST_INTERNAL_ROUTES), false);
  assert.equal(links.isInternalHref('/support', links.CLIENT_INTERNAL_ROUTES), false);
  for (const file of [['components', 'shell', 'ClientSidebar.tsx'], ['components', 'shell', 'HostSidebar.tsx']]) {
    const source = fs.readFileSync(path.join(root, ...file), 'utf8');
    assert.match(source, /opensInNewTab\(path\)/, file.join('/'));
    assert.match(source, /\{\.\.\.newTabProps\(item\.href\)\}/, file.join('/'));
  }
  assert.match(fs.readFileSync(path.join(root, 'components', 'settings', 'SettingsSections.tsx'), 'utf8'), /<LinkRow href="\/support" icon=\{INFO_ICONS\.help\} label="Help Centre" external \/>/);
  for (const file of [['pages', 'client-home.tsx'], ['pages', 'host-home.tsx']]) {
    assert.match(fs.readFileSync(path.join(root, ...file), 'utf8'), /href="\/support" target="_blank" rel="noopener noreferrer"/, file.join('/'));
  }
});

test('sign-in panel: "Get help" carries the typed email to account help in a new tab; the approved review shows on the left', () => {
  const panel = fs.readFileSync(path.join(root, 'components', 'landing', 'AuthPanel.tsx'), 'utf8');
  assert.match(panel, /href=\{ACCOUNT_HELP_HREF\}\s+target="_blank"\s+rel="noopener noreferrer"\s+onClick=\{\(\) => saveSupportHandoff\(email\)\}/);
  assert.match(panel, /\{reviews\.length > 0 && authView !== 'recovery' && <ReviewQuotes reviews=\{reviews\} active=\{isOpen\} \/>\}/);
  // Picture and @username, no outline around them.
  assert.match(panel, /<ReviewAvatar review=\{review\} \/>/);
  assert.match(panel, /\{reviewAuthorHandle\(review\)\}/);
  const author = fs.readFileSync(path.join(root, 'components', 'landing', 'ReviewAuthor.tsx'), 'utf8');
  assert.match(author, /className="h-9 w-9 shrink-0 rounded-full object-cover"/);
  assert.match(panel, /import \{ ReviewAvatar \} from '\.\/ReviewAuthor';/);
  assert.doesNotMatch(panel, /<figcaption[^>]*border/);
  const landing = fs.readFileSync(path.join(root, 'pages', 'index.tsx'), 'utf8');
  assert.match(landing, /fetchFeaturedReviews\(client\)\.catch\(\(\) => \[\]\)/);
  assert.match(landing, /reviews=\{reviews\}/);
});

const reviews = loadTs(path.join(root, 'lib', 'reviews', 'varoomReviews.ts'));

test('VaRoom reviews: featured review shape, checks before saving, own review saved under the account', async () => {
  // varoom_featured_reviews (migration 000076) returns several, newest first.
  const calls = [];
  const rpc = (answers) => ({ rpc: async (name, args) => { calls.push([name, args]); return answers[name]; } });
  const listed = await reviews.fetchFeaturedReviews(rpc({ varoom_featured_reviews: { data: [
    { rating: 5, comment: 'Booked a venue in a day.', author_name: 'Susan W.', author_role: 'host' },
    { rating: 0, comment: 'Out of range', author_name: 'X', author_role: 'client' },
    { rating: 4, comment: '', author_name: 'Empty', author_role: 'client' },
    { rating: 4, comment: 'Second', author_name: 'Ann K.', author_role: 'client' },
  ], error: null } }));
  assert.deepEqual(calls[0], ['varoom_featured_reviews', { p_limit: 10 }]);
  assert.deepEqual(listed.map((r) => ({ ...r })), [
    { rating: 5, comment: 'Booked a venue in a day.', authorName: 'Susan W.', authorRole: 'host', authorUsername: null, authorAvatarUrl: null },
    { rating: 4, comment: 'Second', authorName: 'Ann K.', authorRole: 'client', authorUsername: null, authorAvatarUrl: null },
  ], 'invalid rows are left out; before migration 000072 no username or picture');
  assert.equal(reviews.FEATURED_REVIEWS_MAX, 10);
  // Before migration 000076: the single newest review from varoom_featured_review.
  calls.length = 0;
  const fallback = await reviews.fetchFeaturedReviews(rpc({
    varoom_featured_reviews: { data: null, error: { message: 'function does not exist' } },
    varoom_featured_review: { data: [{ rating: 5, comment: 'Only one', author_name: 'Susan W.', author_role: 'host' }], error: null },
  }));
  assert.deepEqual(calls.map(([name]) => name), ['varoom_featured_reviews', 'varoom_featured_review']);
  assert.deepEqual(fallback.map((r) => r.comment), ['Only one']);
  const [withProfile] = await reviews.fetchFeaturedReviews({
    rpc: async () => ({ data: [{ rating: 4, comment: 'Great', author_name: 'Susan W.', author_role: 'client', author_username: '@susan', author_avatar_url: 'avatars/production/u1/face.jpg' }], error: null }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'unused' } }) }) },
  });
  assert.equal(withProfile.authorUsername, 'susan', 'stored without the @');
  assert.equal(withProfile.authorAvatarUrl, '/api/photos/avatars/avatars/production/u1/face.jpg?w=192', 'small copy through /api/photos');
  assert.equal(reviews.reviewAuthorHandle(withProfile), '@susan');
  assert.equal(reviews.reviewAuthorHandle({ authorName: 'Susan W.', authorUsername: null }), 'Susan W.', 'private profile: short name');
  assert.deepEqual(await reviews.fetchFeaturedReviews(rpc({ varoom_featured_reviews: { data: [], error: null } })), [], 'none approved');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const failing = { data: null, error: { message: 'function does not exist' } };
    assert.deepEqual(await reviews.fetchFeaturedReviews(rpc({ varoom_featured_reviews: failing, varoom_featured_review: failing })), [], 'before both migrations');
  } finally {
    console.warn = warn;
  }
  assert.equal(reviews.authorRoleLabel('client'), 'Guest on VaRoom');

  assert.equal(reviews.reviewProblem(0, ''), 'Choose a rating from 1 to 5 stars.');
  assert.match(reviews.reviewProblem(4, 'x'.repeat(601)), /under 600/);
  assert.equal(reviews.reviewProblem(4, 'Great'), null);

  let sent = null;
  const client = {
    from: (table) => {
      assert.equal(table, 'varoom_reviews');
      const chain = {
        upsert: (row, options) => { sent = { row, options }; return chain; },
        select: () => chain,
        single: async () => ({ data: { rating: 4, comment: 'Great', status: 'pending' }, error: null }),
      };
      return chain;
    },
  };
  assert.deepEqual({ ...(await reviews.saveMyReview(client, 'user-1', 4, '  Great  ')) }, { rating: 4, comment: 'Great', status: 'pending' });
  assert.deepEqual({ ...sent.row }, { user_id: 'user-1', rating: 4, comment: 'Great' });
  assert.equal(sent.options.onConflict, 'user_id');
  await assert.rejects(reviews.saveMyReview(client, 'user-1', 0, ''), /Choose a rating/);
});

test('VaRoom reviews migration: own rows only, back to pending on change, one public featured review without account ids', () => {
  const sql = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261117_000071_varoom_reviews.sql'), 'utf8');
  assert.match(sql, /user_id uuid not null unique references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for select to authenticated using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /new\.status := 'pending';/);
  assert.match(sql, /revoke all on public\.varoom_reviews from anon;/);
  assert.match(sql, /returns table \(rating smallint, comment text, author_name text, author_role text\)/);
  assert.match(sql, /where r\.status = 'approved' and r\.comment <> ''/);
  const profileSql = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261118_000072_varoom_review_author_profile.sql'), 'utf8');
  assert.match(profileSql, /drop function if exists public\.varoom_featured_review\(\);/);
  assert.match(profileSql, /author_username text,\s*author_avatar_url text/);
  assert.equal((profileSql.match(/p\.profile_visibility = 'private' or p\.deactivated_at is not null then null/g) || []).length, 2, 'private or deactivated: no username, no picture');
  assert.doesNotMatch(profileSql, /select[^;]*r\.user_id,/, 'still no account ids');
  assert.match(profileSql, /grant execute on function public\.varoom_featured_review\(\) to anon, authenticated, service_role;/);
  const routes = fs.readFileSync(path.join(root, '..', 'server', 'routes', 'adminRoutes.js'), 'utf8');
  assert.match(routes, /router\.patch\('\/varoom-reviews\/:id', \.\.\.adminWrite,/);
  assert.match(routes, /logActivity\(req\.admin, `varoom_review_\$\{status\}`/);
});
