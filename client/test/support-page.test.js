const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const support = loadTs(path.join(root, 'lib', 'support', 'support.ts'));
const page = fs.readFileSync(path.join(root, 'pages', 'support.tsx'), 'utf8');
const dialog = fs.readFileSync(path.join(root, 'components', 'support', 'SupportDialog.tsx'), 'utf8');

test('the six legacy help articles, in order', () => {
  assert.deepEqual(support.HELP_ARTICLES.map((a) => a.title), [
    'How to become a host', 'How to turn on dark mode', 'How to view as marketplace',
    'How to add a listing', 'How to report a listing', 'How to switch or add an account',
  ]);
  assert.deepEqual(support.stepParts('Find and select **Become a Host**.'), [
    { bold: false, text: 'Find and select ' }, { bold: true, text: 'Become a Host' }, { bold: false, text: '.' },
  ]);
});

test('help search: first article containing every word, from visible text or keywords (legacy)', () => {
  assert.equal(support.findHelpArticle('dark mode').id, 'dark-mode');
  assert.equal(support.findHelpArticle('THEME').id, 'dark-mode', 'keywords count, case-insensitive');
  assert.equal(support.findHelpArticle('host').id, 'become-host', 'first match wins');
  assert.equal(support.findHelpArticle('three dot report').id, 'report-listing');
  assert.equal(support.findHelpArticle('Login & Account').id, 'switch-account');
  assert.equal(support.findHelpArticle('refund policy'), null);
  assert.equal(support.findHelpArticle('   '), null);
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
  for (const text of ['How can we help you today?', 'Create a support ticket', 'Report a bug', 'Request a feature', 'Need help with account', 'Write to VaRoom Support', 'Things people are looking for', 'No matching help article yet. More support guidance will be added here soon.']) {
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
  assert.match(panel, /\{review && authView !== 'recovery' && <ReviewQuote review=\{review\} \/>\}/);
  const landing = fs.readFileSync(path.join(root, 'pages', 'index.tsx'), 'utf8');
  assert.match(landing, /fetchFeaturedReview\(client\)\.catch\(\(\) => null\)/);
  assert.match(landing, /review=\{review\}/);
});

const reviews = loadTs(path.join(root, 'lib', 'reviews', 'varoomReviews.ts'));

test('VaRoom reviews: featured review shape, checks before saving, own review saved under the account', async () => {
  const rpc = (result) => ({ rpc: async (name) => { assert.equal(name, 'varoom_featured_review'); return result; } });
  assert.deepEqual(
    { ...(await reviews.fetchFeaturedReview(rpc({ data: [{ rating: 5, comment: 'Booked a venue in a day.', author_name: 'Susan W.', author_role: 'host' }], error: null }))) },
    { rating: 5, comment: 'Booked a venue in a day.', authorName: 'Susan W.', authorRole: 'host' },
  );
  assert.equal(await reviews.fetchFeaturedReview(rpc({ data: [], error: null })), null, 'none approved');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await reviews.fetchFeaturedReview(rpc({ data: null, error: { message: 'function does not exist' } })), null, 'before the migration');
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
  const routes = fs.readFileSync(path.join(root, '..', 'server', 'routes', 'adminRoutes.js'), 'utf8');
  assert.match(routes, /router\.patch\('\/varoom-reviews\/:id', \.\.\.adminWrite,/);
  assert.match(routes, /logActivity\(req\.admin, `varoom_review_\$\{status\}`/);
});
