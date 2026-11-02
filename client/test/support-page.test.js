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

test('page: legacy markup classes, identity from AuthProvider (no profile request), role-based home, mobile navigation', () => {
  assert.doesNotMatch(page, /from\('profiles'\)|supabase-client\.js/);
  assert.match(page, /const homeHref = role === 'host' \? '\/host-home' : '\/client-home';/);
  assert.match(page, /<div className="page support-page">/);
  // Nothing of the legacy page remains: its styles (including dark theme) live with the page.
  assert.doesNotMatch(page, /support-page-body/);
  const styles = fs.readFileSync(path.join(root, 'components', 'support', 'supportStyles.ts'), 'utf8');
  assert.match(styles, /\[data-theme="dark"\] \.support-page \.action,/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'public', 'js', 'varoom-dark-theme.css'), 'utf8'), /support-page/);
  assert.match(page, /\.appNavigation = true;/);
  for (const text of ['How can we help you today?', 'Create a support ticket', 'Report a bug', 'Request a feature', 'Need help with account', 'Write to VaRoom Support', 'Things people are looking for', 'No matching help article yet. More support guidance will be added here soon.']) {
    assert.ok(page.includes(text), text);
  }
});

test('dialog: closes on Escape, backdrop and ✕; focus moves in and returns; account help leads to a ticket; confirmation closes after 1.4 s', () => {
  assert.match(dialog, /if \(event\.key === 'Escape'\) onClose\(\);/);
  assert.match(dialog, /if \(event\.target === event\.currentTarget\) onClose\(\);/);
  assert.match(dialog, /opener\?\.focus\?\.\(\);/);
  assert.match(dialog, /const openerRef = useRef<HTMLElement \| null>\(typeof document === 'undefined' \? null : document\.activeElement/, 'the opener is read before focus moves into the dialog');
  assert.match(dialog, /onClick=\{\(\) => onFlowChange\('ticket'\)\}/);
  assert.match(dialog, /window\.setTimeout\(onClose, 1400\)/);
  assert.match(dialog, /email: flow === 'ticket' \? replyEmail : user\.email/, 'the reply-to email the user typed is used');
});

test('legacy support.html is gone; old URLs reach the native page', () => {
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'support.html')), false);
  const config = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8');
  assert.match(config, /source: '\/support\.html',\s*destination: '\/support'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/support', '\/support\.html', '\/legacy-pages\/support\.html'\]/);
  assert.doesNotMatch(server, /'\/support': 'support\.html'/);
});
