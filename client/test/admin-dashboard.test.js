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
  const { calls, api } = withFetch([{ status: 200, body: { data: [{ id: 'u1' }] } }, { status: 403, body: { error: 'Your admin role is not allowed to perform this action' } }, { status: 500 }]);
  assert.deepEqual(await api.loadUsers(), [{ id: 'u1' }]);
  assert.equal(calls[0].url, '/admin/users');
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
    'POST /admin/admins', 'GET /admin/signins?range=14', 'GET /admin/revenue?range=7', 'GET /admin/growth?range=14',
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
  assert.match(shell, /overview: \["overview", "signins", "revenue"\]/);
  assert.match(shell, /for \(const key of \["overview", \.\.\.SECTION_RESOURCES\[active\]\]/);
  assert.match(shell, /if \(!requested\.current\.has\(key\)\) void reload\(key\);/);
  assert.match(shell, /role="alert"/);
  assert.match(read('components', 'admin', 'LoginScreen.tsx'), /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); onLogin\(email, password\); \}\}/);
  // styles/admin.css paints dark mode by these class strings.
  const ui = read('components', 'admin', 'AdminUi.tsx');
  for (const cls of ['border rounded-sm p-4 bg-white', 'border-[#E4E1DA]']) assert.ok(ui.includes(cls), cls);
});
