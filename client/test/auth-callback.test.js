const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const cb = loadTs(path.join(root, 'lib', 'auth', 'authCallback.ts'));
const ORIGIN = 'https://varoom.example';

const user = (over = {}) => ({ id: 'u1', email: 'zion@example.com', user_metadata: { full_name: 'Zion Daily' }, ...over });
const session = (over = {}) => ({ access_token: 'access', refresh_token: 'refresh', expires_at: 99, user: user(), ...over });

// A recording client: getSession answers `sessionResult`; profile reads and
// writes answer `profile` / `upsertError`.
function fakeClient({ sessionResult = { data: { session: session() }, error: null }, profile = null, profileError = null, upsertError = null } = {}) {
  const calls = { signOut: [], upsert: [], select: 0 };
  return {
    calls,
    auth: {
      getSession: async () => sessionResult,
      signOut: async (options) => { calls.signOut.push(options); return { error: null }; },
    },
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select() { calls.select += 1; return { eq() { return { maybeSingle: async () => ({ data: profile, error: profileError }) }; } }; },
        upsert: async (row, options) => { calls.upsert.push({ row, options }); return { error: upsertError }; },
      };
    },
  };
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

async function run(search, options = {}) {
  const log = { replaced: [], closed: 0, broadcast: [], posted: [], linked: [], cleared: [], refreshed: 0 };
  const opener = options.opener === undefined ? null : {
    closed: false,
    postMessage: (message, origin) => { if (options.openerThrows) throw new Error('blocked'); log.posted.push({ message, origin }); },
  };
  const client = options.client || fakeClient();
  const env = {
    search,
    hash: options.hash || '',
    origin: ORIGIN,
    client,
    createPrimaryClient: () => ({ primary: true }),
    accountAuth: options.accountAuth === null ? null : {
      refreshAccountAddSession: async (c, s) => {
        log.refreshed += 1;
        if (options.refreshFails) throw new Error('signed in again');
        return session({ access_token: 'added-access', user: user({ id: 'added' }) });
      },
      clearTemporarySession: (flowId) => log.cleared.push(flowId),
    },
    accountSwitcher: {
      linkAdditionalSession: async (primary, s) => {
        if (options.linkFails) throw new Error('This account is already linked.');
        log.linked.push({ primary, s });
        return { session_cached: options.cached !== false };
      },
    },
    storage: options.storage || memoryStorage(),
    opener: options.opener === undefined ? null : opener,
    broadcast: (message) => { log.broadcast.push(message); return options.broadcast !== false; },
    replace: (url) => log.replaced.push(url),
    close: () => { log.closed += 1; },
    now: () => 1000,
  };
  await cb.runAuthCallback(env);
  return { log, client, storage: env.storage };
}

test('a signed-in user with a profile goes to onboarding until done, then to the safe redirect or their home', async () => {
  let r = await run('?redirect=%2Fbookings', { client: fakeClient({ profile: { role: 'client', onboarding_completed: false } }) });
  assert.deepEqual(r.log.replaced, ['/onboarding?redirect=%2Fbookings']);
  r = await run('?redirect=%2Fbookings', { client: fakeClient({ profile: { role: 'client', onboarding_completed: true } }) });
  assert.deepEqual(r.log.replaced, ['/bookings']);
  r = await run('', { client: fakeClient({ profile: { role: 'host', onboarding_completed: true } }) });
  assert.deepEqual(r.log.replaced, ['/host-home']);
  r = await run('', { client: fakeClient({ profile: { role: 'client', onboarding_completed: true } }) });
  assert.deepEqual(r.log.replaced, ['/client-home']);
});

test('redirects to another origin are never followed', async () => {
  for (const evil of ['https://evil.example/x', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)']) {
    const r = await run(`?redirect=${encodeURIComponent(evil)}`, { client: fakeClient({ profile: { role: 'host', onboarding_completed: true } }) });
    assert.deepEqual(r.log.replaced, ['/host-home'], evil);
  }
});

test('password recovery goes to the new-password step; there is no special account any more', async () => {
  let r = await run('', { hash: '#type=recovery&access_token=x' });
  assert.deepEqual(r.log.replaced, ['/?auth=recovery&step=password']);
  r = await run('?type=recovery');
  assert.deepEqual(r.log.replaced, ['/?auth=recovery&step=password']);
  const admin = fakeClient({ sessionResult: { data: { session: session({ user: user({ email: 'varoonhq@gmail.com' }) }) }, error: null }, profile: { role: 'host', onboarding_completed: true } });
  r = await run('', { client: admin });
  assert.deepEqual(r.log.replaced, ['/host-home'], 'varoonhq@gmail.com is treated as a normal user');
});

test('first Google sign-in creates the profile with the role chosen at sign-up', async () => {
  const storage = memoryStorage({ varoom_intended_role: 'host' });
  const client = fakeClient();
  const r = await run('', { client, storage });
  assert.deepEqual(client.calls.upsert, [{ row: { id: 'u1', role: 'host', full_name: 'Zion Daily' }, options: { onConflict: 'id' } }]);
  assert.equal(storage.map.has('varoom_intended_role'), false);
  assert.deepEqual(r.log.replaced, ['/onboarding']);
  const noRole = await run('', { client: fakeClient() });
  assert.deepEqual(noRole.log.replaced, ['/?auth=signup']);
  assert.equal(noRole.client.calls.upsert.length, 0);
  const metaRole = await run('', { client: fakeClient({ sessionResult: { data: { session: session({ user: user({ user_metadata: { role: 'client', name: 'Z' } }) }) }, error: null } }) });
  assert.equal(metaRole.client.calls.upsert[0].row.role, 'client');
  assert.equal(metaRole.client.calls.upsert[0].row.full_name, 'Z');
  const injected = await run('', { client: fakeClient(), storage: memoryStorage({ varoom_intended_role: 'admin' }) });
  assert.deepEqual(injected.log.replaced, ['/?auth=signup'], 'only host or client');
});

test('failures go to sign-in (keeping a safe redirect); no session, profile or setup errors', async () => {
  let r = await run('?redirect=%2Fpricing', { client: fakeClient({ sessionResult: { data: { session: null }, error: null } }) });
  assert.deepEqual(r.log.replaced, ['/?auth=login&redirect=%2Fpricing']);
  r = await run('', { client: fakeClient({ profileError: { message: 'down' } }) });
  assert.deepEqual(r.log.replaced, ['/?auth=login']);
  r = await run('', { client: fakeClient(), storage: memoryStorage({ varoom_intended_role: 'client' }), });
  assert.deepEqual(r.log.replaced, ['/onboarding']);
  r = await run('', { client: fakeClient({ upsertError: { message: 'denied' } }), storage: memoryStorage({ varoom_intended_role: 'client' }) });
  assert.deepEqual(r.log.replaced, ['/?auth=login']);
});

test('popup sign-in returns the destination (or the error) to the opener with the request id, then closes', async () => {
  let r = await run('?auth_popup=1&auth_popup_id=req1', { opener: {}, client: fakeClient({ profile: { role: 'client', onboarding_completed: true } }) });
  assert.deepEqual(r.log.broadcast, [{ requestId: 'req1', type: 'varoom:google-auth-complete', destination: '/client-home' }]);
  assert.deepEqual(r.log.posted, [{ message: { requestId: 'req1', type: 'varoom:google-auth-complete', destination: '/client-home' }, origin: ORIGIN }], 'only to this origin');
  assert.equal(r.log.closed, 1);
  assert.deepEqual(r.log.replaced, []);
  r = await run('?auth_popup=1&auth_popup_id=req2', { broadcast: true, client: fakeClient({ sessionResult: { data: { session: null }, error: null } }) });
  assert.equal(r.log.broadcast[0].type, 'varoom:google-auth-error');
  assert.equal(r.log.broadcast[0].message, 'Google sign-in did not finish. Please try again.');
  assert.equal(r.log.closed, 1);
  r = await run('?auth_popup=1', { client: fakeClient({ profile: { role: 'host', onboarding_completed: true } }) });
  assert.deepEqual(r.log.replaced, ['/host-home'], 'no request id: an ordinary redirect');
  r = await run('?auth_popup=1&auth_popup_id=req3', { broadcast: false, client: fakeClient({ profile: { role: 'host', onboarding_completed: true } }) });
  assert.deepEqual(r.log.replaced, ['/host-home'], 'nobody to tell: an ordinary redirect');
});

test('adding an account in a popup hands the refreshed session to the opener; nothing is signed out', async () => {
  const r = await run('?addAccount=true&account_auth_flow=flow1', { opener: {} });
  assert.equal(r.log.refreshed, 1);
  assert.equal(r.log.posted.length, 1);
  assert.equal(r.log.posted[0].message.type, 'VAROOM_ADD_ACCOUNT_SUCCESS');
  assert.equal(r.log.posted[0].message.session.access_token, 'added-access');
  assert.equal(r.log.posted[0].origin, ORIGIN);
  assert.deepEqual(r.log.cleared, ['flow1']);
  assert.equal(r.log.closed, 1);
  assert.deepEqual(r.client.calls.signOut, [], 'the added session stays valid for switching');
  assert.equal(r.client.calls.select, 0, 'no profile lookup for the added account');
});

test('adding an account by redirect links it to the primary session and returns to the starting page', async () => {
  const storage = memoryStorage({ varoom_add_account_redirect: '/settings?tab=accounts' });
  const r = await run('?addAccount=true&account_auth_flow=flow1', { storage });
  assert.equal(r.log.linked.length, 1);
  assert.deepEqual(r.log.linked[0].primary, { primary: true }, 'linked on the primary client, not the temporary one');
  assert.equal(r.log.linked[0].s.access_token, 'added-access');
  assert.deepEqual(r.log.cleared, ['flow1']);
  assert.deepEqual(r.log.replaced, ['/settings?tab=accounts']);
  assert.equal(storage.map.has('varoom_add_account_redirect'), false);
  assert.deepEqual(r.client.calls.signOut, []);
  const fallback = await run('?addAccount=true&account_auth_flow=flow1');
  assert.deepEqual(fallback.log.replaced, ['/profile']);
  const unsafe = await run('?addAccount=true&account_auth_flow=flow1', { storage: memoryStorage({ varoom_add_account_redirect: 'https://evil.example' }) });
  assert.deepEqual(unsafe.log.replaced, ['/profile']);
});

test('a failed account add clears only the temporary session and returns to the starting page with a notice', async () => {
  const storage = memoryStorage({ varoom_add_account_redirect: '/settings' });
  const r = await run('?addAccount=true&account_auth_flow=flow1', { storage, linkFails: true });
  assert.deepEqual(r.client.calls.signOut, [{ scope: 'local' }], 'local sign-out of the temporary client only');
  assert.deepEqual(r.log.cleared, ['flow1']);
  assert.deepEqual(r.log.replaced, ['/settings'], 'back where they started, not the sign-in page');
  assert.equal(cb.takeAddAccountNotice(storage, 2000), cb.ADD_ACCOUNT_FAILED_MESSAGE);
  assert.equal(cb.takeAddAccountNotice(storage, 2000), null, 'shown once');

  const noSession = await run('?addAccount=true&account_auth_flow=flow1', { client: fakeClient({ sessionResult: { data: { session: null }, error: null } }) });
  assert.deepEqual(noSession.client.calls.signOut, []);
  assert.deepEqual(noSession.log.replaced, ['/profile']);

  const popup = await run('?addAccount=true&account_auth_flow=flow1', { opener: {}, refreshFails: true });
  assert.deepEqual(popup.log.posted, [{ message: { type: 'VAROOM_ADD_ACCOUNT_ERROR', message: cb.ADD_ACCOUNT_FAILED_MESSAGE }, origin: ORIGIN }]);
  assert.equal(popup.log.closed, 1);
  assert.deepEqual(popup.log.replaced, []);

  const stale = memoryStorage({ varoom_add_account_notice: JSON.stringify({ message: 'old', at: 0 }) });
  assert.equal(cb.takeAddAccountNotice(stale, 10 * 60 * 1000), null, 'an old notice is dropped');
});

test('page: native, no shell, same loading orb; legacy file retired with redirects', () => {
  const page = fs.readFileSync(path.join(root, 'pages', 'auth-callback.tsx'), 'utf8');
  assert.match(page, /<ThinkingOrb state="searching" size=\{20\} theme="dark"/);
  assert.match(page, /#090a0f/);
  assert.match(page, /Signing you in — VaRoom/);
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'auth-callback.html')), false);
  assert.match(fs.readFileSync(path.join(root, 'next.config.js'), 'utf8'), /source: '\/auth-callback\.html',\s*destination: '\/auth-callback'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/auth-callback', '\/auth-callback\.html', '\/legacy-pages\/auth-callback\.html'\]/);
  assert.doesNotMatch(server, /'\/auth-callback': 'auth-callback\.html'/);
  const shell = fs.readFileSync(path.join(root, 'components', 'shell', 'AppShell.tsx'), 'utf8');
  assert.match(shell, /<AddAccountNotice \/>/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'lib', 'auth', 'authCallback.ts'), 'utf8'), /add_account_callback|varoonhq|varoom-post/);
});

test('after a full-page account add the returned page switches to the added account, once', async () => {
  const storage = memoryStorage({ varoom_add_account_redirect: '/settings' });
  await run('?addAccount=true&account_auth_flow=flow1', { storage });
  assert.equal(cb.takePendingAccountSwitch(storage, 2000), 'added');
  assert.equal(cb.takePendingAccountSwitch(storage, 2000), null, 'only once');
  const notSaved = memoryStorage();
  await run('?addAccount=true&account_auth_flow=flow1', { storage: notSaved, cached: false });
  assert.equal(cb.takePendingAccountSwitch(notSaved, 2000), null, 'no switch without a saved sign-in');
  const stale = memoryStorage({ varoom_add_account_switch: JSON.stringify({ id: 'added', at: 0 }) });
  assert.equal(cb.takePendingAccountSwitch(stale, 10 * 60 * 1000), null);
  const notice = fs.readFileSync(path.join(root, 'components', 'shell', 'AddAccountNotice.tsx'), 'utf8');
  assert.match(notice, /switchAccount\(pendingSwitch\)/);
});

test('both add-account dialogs switch to the added account when its sign-in was saved', () => {
  const modal = fs.readFileSync(path.join(root, 'components', 'AddAccountModal.tsx'), 'utf8');
  assert.match(modal, /if \(linked\.session_cached && addedUserId\) \{[\s\S]*?await switchAccount\(addedUserId\)/);
  assert.equal((modal.match(/await finishAdded\(/g) || []).length, 2, 'Google popup and email');
  const legacy = fs.readFileSync(path.join(root, 'public', 'js', 'account-switcher.js'), 'utf8');
  assert.match(legacy, /account\.switchAccount\(addedUserId\)/);
  assert.equal((legacy.match(/[^n] finishAdded\(result, /g) || []).length, 2, 'Google popup and email calls');
});
