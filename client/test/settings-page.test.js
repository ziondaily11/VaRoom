const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const st = loadTs(path.join(root, 'lib', 'settings', 'settings.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });

test('preferences: one read of only the columns the app profile lacks; saves report errors', async () => {
  const calls = [];
  const client = {
    from(table) {
      const chain = {
        select(cols) { calls.push(['select', table, cols]); return chain; },
        update(patch) { calls.push(['update', table, patch]); return chain; },
        eq(col, val) { calls.push(['eq', col, val]); return chain; },
        maybeSingle: async () => ({ data: { notify_messages: true }, error: null }),
        then(resolve) { resolve({ error: calls.some((c) => c[0] === 'update' && c[2].fail) ? { message: 'denied' } : null }); },
      };
      return chain;
    },
  };
  const prefs = await st.loadPreferences(client, 'u1');
  assert.equal(prefs.notify_messages, true);
  assert.equal(calls[0][2], st.PREFERENCE_COLUMNS);
  assert.doesNotMatch(st.PREFERENCE_COLUMNS, /\brole\b|full_name|username/, 'those come from the app profile');
  assert.equal(await st.savePreferences(client, 'u1', { notify_marketing: false }), null);
  assert.equal(await st.savePreferences(client, 'u1', { fail: true }), 'denied');
});

test('display: saved theme and font size, applied app-wide', () => {
  const storage = (values) => ({ getItem: (k) => (k in values ? values[k] : null) });
  assert.equal(st.savedTheme(storage({ varoom_theme: 'dark' })), 'dark');
  assert.equal(st.savedTheme(storage({ varoom_theme: 'nonsense' })), 'system');
  assert.equal(st.fontSizeIndex(storage({ varoom_font_size: 'xlarge' })), 3);
  assert.equal(st.fontSizeIndex(storage({})), 1);
  const attrs = {}; const props = {};
  const doc = { documentElement: { style: { setProperty: (k, v) => { props[k] = v; } }, setAttribute: (k, v) => { attrs[k] = v; } } };
  assert.equal(st.applyFontSize(doc, 2).label, 'Large');
  assert.deepEqual({ props, attrs }, { props: { '--varoom-font-scale': '1.1' }, attrs: { 'data-font-size': 'large' } });
});

test('your account unlocks only for the same user, on a client that keeps no session', async () => {
  const signIn = (user, error = null) => () => ({ auth: { signInWithPassword: async () => ({ data: { user }, error }) } });
  assert.equal(await st.verifyPassword(signIn({ id: 'u1' }), { email: 'a@b.c', password: 'x', userId: 'u1' }), true);
  assert.equal(await st.verifyPassword(signIn({ id: 'other' }), { email: 'a@b.c', password: 'x', userId: 'u1' }), false);
  assert.equal(await st.verifyPassword(signIn(null, { message: 'Invalid login' }), { email: 'a@b.c', password: 'x', userId: 'u1' }), false);
  assert.equal(await st.verifyPassword(() => { throw new Error('offline'); }, { email: 'a@b.c', password: 'x', userId: 'u1' }), false);
  const section = read('components', 'settings', 'AccountSection.tsx');
  assert.match(section, /persistSession: false, autoRefreshToken: false/);
});

test('google re-verification: offered by the server; unlocked only when the server confirms', async () => {
  assert.equal(await st.googleVerificationEligible('t', async () => json(200, { eligible: true })), true);
  assert.equal(await st.googleVerificationEligible('t', async () => json(200, { eligible: false })), false);
  assert.equal(await st.googleVerificationEligible('t', async () => { throw new Error('x'); }), false);
  await assert.rejects(st.startGoogleVerification('t', async () => json(403, { error: 'Google verification is not available for this account' })), /not available/);
  assert.deepEqual({ ...(await st.completeGoogleVerification('t', async () => json(200, { verified: true }))) }, { verified: true, error: null });
  assert.equal((await st.completeGoogleVerification('t', async () => json(403, { error: 'The Google account does not match this VaRoom account' }))).verified, false);
  const page = read('pages', 'settings.tsx');
  assert.match(page, /client\.auth\.setSession\(\{ access_token: saved\.access_token, refresh_token: saved\.refresh_token \}\)/, 'the account that started is restored');
});

test('delete account: a reason (and details for Other), then the server; the server message is shown', async () => {
  assert.equal(st.canDelete('', ''), false);
  assert.equal(st.canDelete('Other', '  '), false);
  assert.equal(st.canDelete('Other', 'moving'), true);
  assert.equal(st.canDelete("I'm unhappy with the service", ''), true);
  assert.ok(st.DELETE_REASONS.includes("I'm unhappy with the service"), 'the server lists this exact text');
  let body;
  await st.deleteAccount('tok', 'Other', ' moving abroad ', async (url, init) => { body = { url, init }; return json(200, { success: true }); });
  assert.equal(body.url, '/api/delete-account');
  assert.deepEqual(JSON.parse(body.init.body), { reason: 'Other', reason_details: 'moving abroad' });
  assert.equal(body.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(st.deleteAccount('t', 'Other', 'x', async () => json(500, { error: 'Unable to delete the account' })), /Unable to delete/);
});

test('deactivate / delete: 30 days then deletion as the Privacy Policy says; signing in restores; the sign-in panel explains', async () => {
  let call;
  await st.deactivateAccount('tok', async (url, init) => { call = { url, init }; return json(200, { success: true }); });
  assert.equal(call.url, '/api/account/deactivate');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(st.deactivateAccount('t', async () => json(500, { error: 'Unable to deactivate the account' })), /Unable to deactivate/);

  const account = read('components', 'settings', 'AccountSection.tsx');
  assert.doesNotMatch(account, /isn&apos;t available yet/, 'Deactivate is no longer a placeholder');
  assert.match(account, /Deactivate my account/);
  assert.match(account, /permanently deleted after 30 days/);
  const sections = read('components', 'settings', 'SettingsSections.tsx');
  assert.match(sections, /If you don&apos;t sign in within 30 days/);
  assert.doesNotMatch(sections, /This action cannot be undone/, 'deletion is not immediate any more');
  const page = read('pages', 'settings.tsx');
  assert.match(page, /await leave\('\/\?auth=login&deleted=1'\)/);
  assert.match(page, /await leave\('\/\?auth=login&deactivated=1'\)/);

  const re = loadTs(path.join(root, 'lib', 'auth', 'reactivation.ts'));
  assert.equal(re.profileIsDeactivated({ deactivated_at: '2026-11-05T10:00:00Z' }), true);
  assert.equal(re.profileIsDeactivated({ deactivated_at: null }), false);
  assert.equal(re.profileIsDeactivated(null), false);
  let asked;
  assert.deepEqual({ ...(await re.reactivateAccount('tok', async (url, init) => { asked = { url, init }; return json(200, { reactivated: true, wasScheduledForDeletion: true }); })) }, { status: 'reactivated', wasScheduledForDeletion: true });
  assert.equal(asked.url, '/api/account/reactivate');
  assert.equal(asked.init.headers.Authorization, 'Bearer tok');
  assert.equal((await re.reactivateAccount('t', async () => json(200, { reactivated: false }))).status, 'active');
  assert.equal((await re.reactivateAccount('t', async () => json(403, { code: 'sign_in_required' }))).status, 'sign-in-required');
  assert.equal((await re.reactivateAccount('t', async () => json(500, { error: 'x' }))).status, 'failed');
  assert.equal((await re.reactivateAccount('t', async () => { throw new Error('offline'); })).status, 'failed');
  assert.match(re.deactivationNotice({ deleted: '1' }), /permanently deleted in 30 days/);
  assert.match(re.deactivationNotice({ deactivated: '1' }), /Sign in at any time/);
  assert.match(re.deactivationNotice({ account: 'deactivated' }), /Sign in again/);
  assert.equal(re.deactivationNotice({ auth: 'login' }), null);

  const provider = read('lib', 'auth', 'AuthProvider.tsx');
  assert.match(provider, /restoreIfDeactivated\(user\.id, result\.data\)/, 'checked when the profile loads');
  assert.match(provider, /restoreIfDeactivated\(userId, profile\)/, 'and when a fresh profile arrives');
  assert.match(read('lib', 'auth', 'profileStore.ts'), /verified,deactivated_at'/, 'the shared profile read carries the flag (no extra request)');
  assert.match(read('components', 'landing', 'AuthPanel.tsx'), /deactivationNotice\(router\.query\)/);
  const chats = read('pages', 'chats.tsx');
  assert.match(chats, /const participantDeactivated = Boolean\(!isElie && activeConversation\?\.participant\?\.deactivated\);/);
  assert.match(chats, /hidden=\{participantDeactivated\}/, 'the composer stays mounted (its refs), only hidden');
});

test('page: in the shell, legacy wording, phone menu opens the app drawer, legacy page retired', () => {
  const page = read('pages', 'settings.tsx');
  assert.match(page, /window\.dispatchEvent\(new Event\(role === 'host' \? 'open-host-sidebar' : 'open-client-sidebar'\)\)/);
  assert.match(page, /wanted === 'notifications'/);
  const sections = read('components', 'settings', 'SettingsSections.tsx');
  for (const text of ['Search Settings', 'Your Account', 'Login & Accounts', 'Payments &amp; Payouts', 'No other accounts are stored on this dashboard.', 'Account limit reached (3/3).', 'Are you sure you want to log out?', 'Delete my account','Save privacy settings', 'Choose what VaRoom is allowed to send you.']) {
    assert.ok(sections.includes(text), text);
  }
  assert.doesNotMatch(read('components', 'settings', 'settingsStyles.ts'), /#sidebar|\.nav-item|verify-box|account-menu/);
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'settings.html')), false);
  assert.match(read('next.config.js'), /source: '\/settings\.html',\s*destination: '\/settings'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/settings', '\/settings\.html', '\/legacy-pages\/settings\.html'\]/);
});
