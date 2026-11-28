const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function withFetch(responses) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    const next = responses.shift() || { status: 200, body: {} };
    return { ok: next.status < 400, status: next.status, json: async () => (next.body === undefined ? Promise.reject(new Error('no body')) : next.body) };
  };
  return { calls, api: loadTs(path.join(root, 'lib', 'admin', 'adminApi.ts'), { globals: { fetch } }) };
}

test('admin requests: same-origin with the session cookie; failures throw the server message', async () => {
  const { calls, api } = withFetch([{ status: 200, body: { data: [{ id: 'u1' }], total: 1234 } }, { status: 403, body: { error: 'Your admin role is not allowed to perform this action' } }, { status: 500 }]);
  assert.deepEqual(await api.loadUsers(), { users: [{ id: 'u1' }], total: 1234 });
  assert.equal(calls[0].url, '/admin/users?q=&offset=0');
  assert.equal(calls[0].credentials, 'same-origin');
  await assert.rejects(api.setUserStatus('u1', 'suspended', 'spam'), /not allowed/);
  assert.deepEqual({ method: calls[1].method, body: JSON.parse(calls[1].body) }, { method: 'POST', body: { status: 'suspended', reason: 'spam' } });
  await assert.rejects(api.loadOverview(), /Request failed/);
});

test('admin requests: unchanged paths, payloads and the reply idempotency key', async () => {
  const { calls, api } = withFetch([]);
  await api.replyToTicket('t1', 'Hi', 'key-1');
  await api.setTicketStatus('t1', 'resolved');
  await api.moderateListing('l1', 'hidden', 'why');
  await api.setUpdateStatus('up1', 'removed', 'why');
  await api.setReportStatus('r1', 'dismissed');
  await api.setUserReportStatus('ur1', 'resolved');
  await api.actOnNews('n1', 'approve');
  await api.addAdmin({ name: 'A', email: 'a@x.io', role: 'support' });
  await api.loadSignins();
  await api.loadRevenue();
  await api.loadGrowth();
  assert.deepEqual(calls.map((c) => `${c.method || 'GET'} ${c.url}`), [
    'POST /admin/support/tickets/t1/replies', 'PATCH /admin/support/tickets/t1', 'POST /admin/listings/l1/moderation',
    'POST /admin/updates/up1/status', 'PATCH /admin/reports/r1', 'PATCH /admin/user-reports/ur1', 'POST /admin/news/n1/approve',
    'POST /admin/admins', 'GET /admin/signins?range=14', 'GET /admin/revenue?range=30', 'GET /admin/growth?range=14',
  ]);
  assert.equal(calls[0].headers['Idempotency-Key'], 'key-1');
  assert.deepEqual(JSON.parse(calls[0].body), { message: 'Hi' });
  assert.deepEqual(JSON.parse(calls[6].body), {});
});

test('dashboard: native TSX; Overview at sign-in, other sections when first opened; failed actions are shown', () => {
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'varoom-admin-dashboard.jsx')), false);
  assert.equal(fs.existsSync(path.join(root, 'pages', 'admin.js')), false);
  assert.match(read('pages', 'admin.tsx'), /import AdminDashboard from '\.\.\/components\/admin\/AdminDashboard'/);
  const shell = read('components', 'admin', 'AdminDashboard.tsx');
  assert.match(shell, /overview: \["overview", "revenue", "activity"\]/);
  assert.match(shell, /for \(const key of \["overview", \.\.\.SECTION_RESOURCES\[active\]\]/);
  assert.match(shell, /if \(!requested\.current\.has\(key\)\) void reload\(key\);/);
  assert.match(shell, /role="alert"/);
  assert.match(read('components', 'admin', 'LoginScreen.tsx'), /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); onLogin\(email, password, codeRequired \? code : undefined\); \}\}/);
  // Every colour is a token in styles/admin.css (light, and dark under the site's theme); components name none.
  const css = read('styles', 'admin.css');
  assert.match(css, /\.admin-dashboard,\s*\.admin-login \{[^}]*--adm-accent: #C41E3A;/);
  assert.match(css, /\[data-theme="dark"\] \.admin-dashboard,\s*\[data-theme="dark"\] \.admin-login \{[^}]*--adm-bg: #000000;/);
  for (const file of fs.readdirSync(path.join(root, 'components', 'admin'))) {
    const source = read('components', 'admin', file);
    assert.doesNotMatch(source, /#[0-9A-Fa-f]{6}\b/, `${file} names a colour`);
    assert.doesNotMatch(source, /from "recharts"/, `${file} uses the theme's own bars`);
  }
});

test('account actions and rules: timed suspensions send days; rules are read and changed', async () => {
  const { calls, api } = withFetch([
    { status: 200, body: { status: 'suspended', reason: 'Spam', suspended_until: '2026-12-05T00:00:00Z' } },
    { status: 200, body: { status: null, reason: 'Note' } },
    { status: 200, body: { rules: [{ key: 'account_reports', mode: 'shadow' }], hits: [] } },
    { status: 200, body: { rule: { key: 'account_reports', mode: 'enforce' } } },
  ]);
  assert.equal((await api.setUserStatus('u1', 'suspended', 'Spam', 7)).suspended_until, '2026-12-05T00:00:00Z');
  await api.setUserStatus('u1', 'warning', 'Note');
  assert.deepEqual((await api.loadRules()).rules.map((r) => r.key), ['account_reports']);
  await api.updateRule('account_reports', { mode: 'enforce', threshold: 3 });
  assert.deepEqual(calls.map((c) => `${c.method || 'GET'} ${c.url}`), ['POST /admin/users/u1/status', 'POST /admin/users/u1/status', 'GET /admin/rules', 'PATCH /admin/rules/account_reports']);
  assert.deepEqual(JSON.parse(calls[0].body), { status: 'suspended', reason: 'Spam', days: 7 });
  assert.deepEqual(JSON.parse(calls[1].body), { status: 'warning', reason: 'Note' });
  assert.deepEqual(JSON.parse(calls[3].body), { mode: 'enforce', threshold: 3 });
  assert.match(read('components', 'admin', 'AdminDashboard.tsx'), /rules: \["rules"\]/);
});

test('investigation: account page, search, notes, report actions and the reported conversation', async () => {
  const { calls, api } = withFetch([]);
  await api.loadAccount('u1');
  await api.searchAdmin('50% & co');
  await api.addNote('u1', 'Called them');
  await api.actOnListingReport('r1', 'hide_listing', 'Fake photos');
  await api.actOnUserReport('ur1', 'suspend_7_days', 'Deposit scam');
  await api.loadReportedConversation('ur1');
  assert.deepEqual(calls.map((c) => `${c.method || 'GET'} ${c.url}`), [
    'GET /admin/users/u1', 'GET /admin/search?q=50%25%20%26%20co', 'POST /admin/users/u1/notes',
    'PATCH /admin/reports/r1', 'PATCH /admin/user-reports/ur1', 'GET /admin/user-reports/ur1/conversation',
  ]);
  assert.deepEqual(JSON.parse(calls[3].body), { action: 'hide_listing', reason: 'Fake photos' });
  assert.deepEqual(JSON.parse(calls[4].body), { action: 'suspend_7_days', reason: 'Deposit scam' });
  const shell = read('components', 'admin', 'AdminDashboard.tsx');
  assert.match(shell, /<SearchBox openAccount=\{openAccount\} openTicket=\{openTicket\} \/>/);
  assert.match(read('lib', 'legal', 'privacyContent.ts'), /Varoom staff do not read your conversations/);
});

test('money: revenue report defaults, free plans and V-Coin grants', async () => {
  const { calls, api } = withFetch([{ status: 200, body: { total: 1200, mrr: 2500 } }]);
  const report = await api.loadRevenue();
  assert.deepEqual([report.total, report.mrr, report.failed, report.byKind.vcoins], [1200, 2500, [], 0]);
  await api.loadGivablePlans('h1');
  await api.giveFreePlan('h1', 'airbnb_pro', 30, 'Launch partner');
  await api.endFreePlan('h1', 'Paying now');
  await api.grantVcoins('h1', 250, 'Outage');
  assert.deepEqual(calls.map((c) => `${c.method || 'GET'} ${c.url}`), [
    'GET /admin/revenue?range=30', 'GET /admin/users/h1/plans', 'POST /admin/users/h1/free-plan', 'POST /admin/users/h1/free-plan/end', 'POST /admin/users/h1/vcoins',
  ]);
  assert.deepEqual(JSON.parse(calls[2].body), { plan_id: 'airbnb_pro', days: 30, reason: 'Launch partner' });
  assert.deepEqual(JSON.parse(calls[4].body), { amount: 250, reason: 'Outage' });
  assert.doesNotMatch(read('components', 'admin', 'ChartSections.tsx'), /\$\$\{/, 'amounts are in KES, not dollars');
});

test('hardening: two-step sign-in, admin management, paged users, reviews, verification and health', async () => {
  const { calls, api } = withFetch([{ status: 401, body: { error: 'Enter the 6-digit code from your authenticator app', code_required: true } }]);
  await assert.rejects(api.login('ada@varoom.co.ke', 'pw'), (error) => error.codeRequired === true && error.status === 401);
  await api.login('ada@varoom.co.ke', 'pw', '123456');
  await api.loadUsersPage('jane doe', 50);
  await api.setupTwoStep();
  await api.enableTwoStep('123456');
  await api.disableTwoStep('654321');
  await api.setAdminRole('a2', 'read_only');
  await api.resetAdminTwoStep('a2');
  await api.removeAdmin('a2');
  await api.setListingReviewStatus('r1', 'removed', 'Spam');
  await api.setHostVerified('h1', true, 'Deed checked');
  await api.loadHealth();
  assert.deepEqual(calls.map((c) => `${c.method || 'GET'} ${c.url}`), [
    'POST /admin/login', 'POST /admin/login', 'GET /admin/users?q=jane%20doe&offset=50', 'POST /admin/me/totp/setup', 'POST /admin/me/totp/enable',
    'POST /admin/me/totp/disable', 'PATCH /admin/admins/a2', 'POST /admin/admins/a2/totp/reset', 'DELETE /admin/admins/a2',
    'PATCH /admin/listing-reviews/r1', 'POST /admin/users/h1/verified', 'GET /admin/health',
  ]);
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'ada@varoom.co.ke', password: 'pw' });
  assert.deepEqual(JSON.parse(calls[1].body), { email: 'ada@varoom.co.ke', password: 'pw', code: '123456' });
  assert.deepEqual(JSON.parse(calls[10].body), { verified: true, reason: 'Deed checked' });
  assert.doesNotMatch(read('components', 'admin', 'ChartSections.tsx'), /"Device"/, 'no made-up device column');
});

test('redesign: dates, money, names and actions read the same everywhere', () => {
  const f = loadTs(path.join(root, 'lib', 'admin', 'format.ts'));
  const now = new Date(2026, 10, 28, 18, 0);
  assert.equal(f.formatWhen(new Date(2026, 10, 28, 14, 44).toISOString(), now), '28 Nov, 14:44');
  assert.equal(f.formatWhen(new Date(2025, 0, 3, 9, 5).toISOString(), now), '3 Jan 2025, 09:05');
  assert.equal(f.formatWhen(null, now), '—');
  assert.equal(f.formatDate(new Date(2026, 9, 1).toISOString()), '1 Oct 2026');
  assert.equal(f.timeAgo(new Date(2026, 10, 28, 16, 0).toISOString(), now), '2 hours ago');
  assert.equal(f.timeAgo(new Date(2026, 10, 27, 17, 0).toISOString(), now), 'Yesterday');
  assert.equal(f.timeAgo(new Date(2026, 10, 28, 17, 59, 40).toISOString(), now), 'Just now');
  assert.equal(f.timeAgo(null, now), 'Never');
  assert.equal(f.kes(16600), 'KES 16,600');
  assert.equal(f.humanize('listing_report_dismissed'), 'Listing report dismissed');
  assert.equal(f.initials('Achieng Otieno'), 'AO');
  assert.equal(f.initials('jane.doe@example.com'), 'JD');
  assert.equal(f.ticketRef('fe35ce78-e482'), '#FE35CE78');
  assert.equal(f.actionLabel('account_suspended'), 'suspended an account');
  assert.equal(f.actionLabel('something_new'), 'something new');
  assert.equal(f.toneFor('abc'), f.toneFor('abc'));
});

test('redesign: Send again, the Restricted list, the font on the admin page only, and the shell', async () => {
  const { calls, api } = withFetch([{ status: 200, body: { reply: { id: 'r1', delivery_status: 'sent' } } }, { status: 200, body: { data: [{ id: 'u1' }], total: 1 } }]);
  assert.equal((await api.resendReply('t1', 'r1')).reply.delivery_status, 'sent');
  assert.deepEqual(await api.loadRestrictedUsers(), { users: [{ id: 'u1' }], total: 1 });
  assert.deepEqual(calls.map((c) => `${c.method || 'GET'} ${c.url}`), ['POST /admin/support/tickets/t1/replies/r1/resend', 'GET /admin/users?status=restricted']);
  assert.match(read('pages', 'admin.tsx'), /family=Plus\+Jakarta\+Sans/);
  assert.doesNotMatch(read('styles', 'admin.css'), /@import/, 'no font fetched on every page');
  const shell = read('components', 'admin', 'AdminDashboard.tsx');
  for (const group of ['Today', 'People', 'Content', 'Money', 'Safety']) assert.match(shell, new RegExp(`title: "${group}"`));
  assert.match(shell, /localStorage\.setItem\("varoom_theme", next\)/);
  assert.match(shell, /aria-current=\{current === key \? "page" : undefined\}/);
});

test('scrollbars: 4px and shown only while the pointer is over what scrolls', () => {
  const css = read('styles', 'admin.css');
  assert.match(css, /\.admin-dashboard ::-webkit-scrollbar \{ width: 4px; height: 4px; \}/);
  assert.match(css, /\.admin-dashboard ::-webkit-scrollbar-thumb \{ background: transparent; border-radius: 999px; \}/);
  assert.match(css, /\.admin-dashboard :hover::-webkit-scrollbar-thumb \{ background: var\(--adm-line-strong\); \}/);
  // Chrome ignores the ::-webkit-scrollbar rules wherever scrollbar-color/width is set, so those stay Firefox-only.
  assert.match(css, /@supports \(-moz-appearance: none\) \{[^}]*scrollbar-width: thin;/);
  assert.doesNotMatch(css.replace(/@supports \(-moz-appearance: none\) \{[\s\S]*?\n\}/, ''), /scrollbar-(?:width|color):/);
});
