const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const addAccountModalCode = read('components', 'AddAccountModal.tsx');
const accountSwitcherCode = read('public', 'js', 'account-switcher.js');
const addAccount = loadTs(path.join(root, 'lib', 'account', 'addAccount.ts'));

const session = (id) => ({ user: { id, email: `${id}@example.test`, user_metadata: {} }, access_token: `access-${id}`, refresh_token: `refresh-${id}`, expires_at: 2_000_000_000 });

test('AddAccountModal has the required UI structure, branding, and ordering', () => {
  // Brand logo
  assert.match(addAccountModalCode, /add-account-brand-va.*Va/, 'Displays VaRoom logo Va');
  assert.match(addAccountModalCode, /add-account-brand-room.*Room/, 'Displays VaRoom logo Room');
  assert.match(addAccountModalCode, /#bd2337/, 'Uses VaRoom signature red accent');

  // Title and subtitle
  assert.match(addAccountModalCode, /Add another account/, 'Contains heading "Add another account"');
  assert.match(addAccountModalCode, /Sign in to add an existing account to VaRoom\./, 'Contains the explanation');

  // Back / close button
  assert.match(addAccountModalCode, /aria-label="Back"/, 'Contains back button control');

  // Order of authentication options in the card markup: Google, "or", email, password, submit.
  const cardMarkupStart = addAccountModalCode.indexOf('<div className="add-account-card"');
  assert.ok(cardMarkupStart > -1, 'Contains add-account-card markup');
  const cardMarkup = addAccountModalCode.slice(cardMarkupStart);
  const order = ['Continue with Google', 'add-account-divider', 'type="email"', 'add-account-pw-toggle', 'add-account-submit-btn'].map((marker) => {
    const index = cardMarkup.indexOf(marker);
    assert.ok(index > -1, marker);
    return index;
  });
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'Google, divider, email, password, submit');
});

test('AddAccountModal does not contain forbidden bright blue or purple styling', () => {
  assert.doesNotMatch(addAccountModalCode, /#[0-9a-fA-F]{6}.*blue/i, 'No blue hex definitions');
  assert.doesNotMatch(addAccountModalCode, /#[0-9a-fA-F]{6}.*purple/i, 'No purple hex definitions');
  assert.doesNotMatch(addAccountModalCode, /border-color:\s*(#00f|#1d9bf0|blue|purple)/i, 'No blue or purple borders');
});

test('add-account form: checks in order, with the dialog wording', () => {
  assert.equal(addAccount.addAccountFormError('', 'pw'), 'Please enter your email address.');
  assert.equal(addAccount.addAccountFormError('not-an-email', 'pw'), 'Please enter a valid email address.');
  assert.equal(addAccount.addAccountFormError('a@b.co', ''), 'Please enter your password.');
  assert.equal(addAccount.addAccountFormError('a@b.co', 'pw'), null);
  assert.equal(addAccount.passwordSignInMessage('Invalid login credentials'), 'Incorrect email or password.');
  assert.equal(addAccount.passwordSignInMessage('Email not confirmed'), 'Please confirm your email before adding this account.');
  assert.equal(addAccount.passwordSignInMessage('Rate limited'), 'Rate limited');
  assert.equal(addAccount.passwordSignInMessage(undefined), 'Authentication failed.');
  assert.equal(addAccount.addAccountCallbackUrl('https://varoom.example', 'flow 1'), 'https://varoom.example/auth-callback?addAccount=true&account_auth_flow=flow%201');
});

// A fake accountAuth: every flow gets its own temporary client.
function isolatedAuth(signInResult) {
  const created = [];
  let flows = 0;
  return {
    created,
    accountAuth: {
      createFlowId: () => `flow-${++flows}`,
      createClient(supabase, url, anonKey, options) {
        const signIns = [];
        const client = { auth: { async signInWithPassword(credentials) { signIns.push(credentials); return signInResult; } } };
        created.push({ supabase, url, anonKey, options, signIns });
        return client;
      },
    },
  };
}

test('email sign-in uses a per-flow isolated client, never the active session', async () => {
  const supabase = { name: 'supabase-js' };
  const ok = { data: { session: session('added'), user: session('added').user }, error: null };
  const { created, accountAuth } = isolatedAuth(ok);
  const env = { supabase, accountAuth, url: 'https://db.example', anonKey: 'anon' };
  const result = await addAccount.signInIsolatedWithPassword(env, 'added@example.test', 'pw');
  assert.equal(result.user.id, 'added');
  await addAccount.signInIsolatedWithPassword(env, 'added@example.test', 'pw');
  assert.deepEqual(created.map((c) => c.options), [{ usesRedirect: false, flowId: 'flow-1' }, { usesRedirect: false, flowId: 'flow-2' }], 'a new flow (storage key) each time');
  assert.equal(created[0].supabase, supabase);
  assert.equal(created[0].url, 'https://db.example');
  assert.deepEqual(created[0].signIns, [{ email: 'added@example.test', password: 'pw' }]);

  const bad = isolatedAuth({ data: null, error: { message: 'Invalid login credentials' } });
  await assert.rejects(addAccount.signInIsolatedWithPassword({ ...env, accountAuth: bad.accountAuth }, 'a@b.co', 'x'), /Incorrect email or password/);
  const empty = isolatedAuth({ data: { session: null, user: null }, error: null });
  await assert.rejects(addAccount.signInIsolatedWithPassword({ ...env, accountAuth: empty.accountAuth }, 'a@b.co', 'x'), /Failed to retrieve authentication tokens/);
  await assert.rejects(addAccount.signInIsolatedWithPassword({ ...env, supabase: undefined }, 'a@b.co', 'x'), /initializing/);
  await assert.rejects(addAccount.signInIsolatedWithPassword({ ...env, accountAuth: undefined }, 'a@b.co', 'x'), /initializing/);
});

test('linking goes through the authenticated account-group service and fails closed', async () => {
  const calls = [];
  const primary = { primary: true };
  const switcher = { async linkAdditionalSession(client, s) { calls.push([client, s.user.id]); return { id: s.user.id, session_cached: true }; } };
  assert.deepEqual(await addAccount.linkAddedSession(switcher, primary, session('added')), { id: 'added', session_cached: true });
  assert.deepEqual(calls, [[primary, 'added']], 'validated against the primary (active) client');
  await assert.rejects(addAccount.linkAddedSession({}, primary, session('added')), /Secure account linking is not available/);
  await assert.rejects(addAccount.linkAddedSession(switcher, undefined, session('added')), /Secure account linking is not available/);
});

test('popup messages: same origin only; success carries the session, failure its message', () => {
  const own = 'https://varoom.example';
  const s = session('added');
  assert.deepEqual(addAccount.readAddAccountMessage(own, own, { type: 'VAROOM_ADD_ACCOUNT_SUCCESS', session: s }), { kind: 'success', session: s });
  assert.equal(addAccount.readAddAccountMessage('https://evil.example', own, { type: 'VAROOM_ADD_ACCOUNT_SUCCESS', session: s }), null);
  assert.equal(addAccount.readAddAccountMessage(own, own, { type: 'VAROOM_ADD_ACCOUNT_SUCCESS' }), null, 'no session, no success');
  assert.deepEqual(addAccount.readAddAccountMessage(own, own, { type: 'VAROOM_ADD_ACCOUNT_ERROR', message: 'Nope' }), { kind: 'error', message: 'Nope' });
  assert.deepEqual(addAccount.readAddAccountMessage(own, own, { type: 'VAROOM_ADD_ACCOUNT_ERROR' }), { kind: 'error', message: 'Could not add that Google account. Please try again.' });
  assert.equal(addAccount.readAddAccountMessage(own, own, { type: 'other' }), null);
  assert.equal(addAccount.readAddAccountMessage(own, own, null), null);
});

test('once added: switch when the sign-in was saved here, else say how to switch later', () => {
  assert.equal(addAccount.switchesToAdded({ session_cached: true }, 'added'), true);
  assert.equal(addAccount.switchesToAdded({ session_cached: false }, 'added'), false);
  assert.equal(addAccount.switchesToAdded({ session_cached: true }, undefined), false);
  assert.equal(addAccount.addedAccountMessage({ session_cached: true }), 'Account added! You can now switch to this account anytime.');
  assert.equal(addAccount.addedAccountMessage({ session_cached: false }), 'Account linked. Sign in again on this browser before switching to it.');
  assert.equal(addAccount.switchFailedMessage(new Error('expired')), 'Account added, but switching failed: expired');
  assert.equal(addAccount.switchFailedMessage(null), 'Account added, but switching failed: please try again from the account menu.');
});

test('AddAccountModal wiring: the shared steps, both flows finish the same way, its open hook is restored', () => {
  for (const name of ['addAccountFormError', 'signInIsolatedWithPassword', 'linkAddedSession', 'readAddAccountMessage', 'switchesToAdded']) {
    assert.ok(addAccountModalCode.includes(`${name}(`), name);
  }
  assert.equal((addAccountModalCode.match(/await finishAdded\(/g) || []).length, 2, 'Google popup and email');
  assert.match(addAccountModalCode, /switcher\.openAddAccountModal = previousOpen;/, 'legacy callers get the vanilla modal back on unmount');
  assert.doesNotMatch(addAccountModalCode, /eyJhbGciOi/, 'no hard-coded anon key');
});

test('both sidebars open the in-app modal instead of redirecting to a login page', () => {
  for (const file of ['ClientSidebar.tsx', 'HostSidebar.tsx']) {
    const source = read('components', 'shell', file);
    assert.match(source, /openAddAccountModal\(\)/, file);
    assert.doesNotMatch(source, /login\.html\?mode=add/, file);
  }
});

test('_app renders AddAccountModal globally across the application', () => {
  const appCode = read('pages', '_app.tsx');
  assert.match(appCode, /import AddAccountModal from '\.\.\/components\/AddAccountModal';/);
  assert.match(appCode, /<AddAccountModal \/>/);
});

// ---------- The legacy vanilla dialog (public/js/account-switcher.js) ----------

// Just enough DOM for the vanilla dialog: elements found by id.
function fakeDom() {
  const byId = new Map();
  const attached = new Set();
  function element(tag) {
    return {
      tagName: tag, id: '', style: {}, value: '', type: '', className: '', textContent: '', innerHTML: '', disabled: false, parentNode: null, listeners: {},
      setAttribute() {}, focus() {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      querySelector(selector) {
        const id = selector.slice(1);
        if (!byId.has(id)) byId.set(id, Object.assign(element('child'), { id }));
        return byId.get(id);
      },
      removeChild(child) { attached.delete(child); child.parentNode = null; },
    };
  }
  const body = element('body');
  body.appendChild = (node) => { attached.add(node); node.parentNode = body; };
  const head = element('head');
  head.appendChild = (node) => attached.add(node);
  const document = { body, head, createElement: element, getElementById: (id) => [...attached].find((node) => node.id === id) || null, addEventListener() {} };
  return { document, byId, attached };
}

// The account-group API: the active account's group, and linking adds to it.
function groupApi(activeId) {
  const members = [activeId];
  const json = (status, body) => ({ ok: status < 400, status, async json() { return body; } });
  const snapshot = () => ({ group_id: 'g1', current_user_id: activeId, members: members.map((id) => ({ id, full_name: id, username: id, role: 'client', email: '' })) });
  return async (url, options = {}) => {
    if (url === '/api/account-groups/current') return json(200, snapshot());
    if (url === '/api/account-groups/link' && options.method === 'POST') {
      members.push(JSON.parse(options.body).additional_access_token.replace('access-', ''));
      return json(200, snapshot());
    }
    return json(404, {});
  };
}

function loadVanilla({ reactMounted = false, signIn } = {}) {
  const dom = fakeDom();
  const log = { events: [], created: [], switched: [], signIns: [], primarySignIns: 0 };
  const listeners = {};
  const storage = new Map();
  const localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  const primary = {
    auth: {
      async getSession() { return { data: { session: session('primary') }, error: null }; },
      async signInWithPassword() { log.primarySignIns += 1; },
    },
    from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } }; },
  };
  let flows = 0;
  const window = {
    localStorage,
    location: { origin: 'https://varoom.example', pathname: '/settings', search: '' },
    fetch: groupApi('primary'),
    supabase: { name: 'supabase-js' },
    supabaseClient: primary,
    VAROOM_SUPABASE_URL: 'https://db.example',
    VAROOM_SUPABASE_ANON_KEY: 'anon',
    __varoomAddAccountModalMounted: reactMounted,
    VaRoomAccount: { async switchAccount(id) { log.switched.push(id); } },
    VaRoomAccountAuth: {
      createFlowId: () => `flow-${++flows}`,
      createClient(supabase, url, key, options) {
        log.created.push({ ...options });
        return { auth: {
          async signInWithPassword(credentials) { log.signIns.push({ ...credentials }); return signIn(credentials); },
        } };
      },
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    dispatchEvent(event) { log.events.push(event.type); (listeners[event.type] || []).forEach((fn) => fn(event)); },
    screenX: 0, screenY: 0, outerWidth: 1200, outerHeight: 800,
  };
  vm.runInNewContext(accountSwitcherCode, {
    window, localStorage, sessionStorage: localStorage, document: dom.document, alert() {}, setTimeout: () => 0,
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
  });
  const modalOpen = () => Boolean(dom.document.getElementById('varoom-vanilla-add-account-modal'));
  const alert = () => dom.byId.get('vanilla-acct-alert');
  async function submit(email, password) {
    dom.byId.get('vanilla-acct-email').value = email;
    dom.byId.get('vanilla-acct-pass').value = password;
    for (const fn of dom.byId.get('vanilla-acct-form').listeners.submit) await fn({ preventDefault() {} });
  }
  return { api: window.VaRoomAccountSwitcher, dom, log, modalOpen, alert, submit };
}

test('legacy switcher: adding an account opens the React modal when it is mounted, else the vanilla one', () => {
  const withReact = loadVanilla({ reactMounted: true });
  withReact.api.startAddAccount('/settings');
  assert.deepEqual(withReact.log.events, ['varoom:open-add-account']);
  assert.equal(withReact.modalOpen(), false, 'no second dialog');

  const legacyOnly = loadVanilla();
  legacyOnly.api.openAddAccountModal();
  assert.deepEqual(legacyOnly.log.events, ['varoom:open-add-account']);
  assert.equal(legacyOnly.modalOpen(), true);
  legacyOnly.api.openAddAccountModal();
  assert.equal(legacyOnly.dom.attached.size, 2, 'one dialog (and one stylesheet), however often it is opened');
});

test('legacy vanilla dialog: per-flow isolated sign-in, then links and switches to the added account', async () => {
  const added = session('added');
  const v = loadVanilla({ signIn: async () => ({ data: { session: added, user: added.user }, error: null }) });
  v.api.openAddAccountModal();
  await v.submit('nope', 'pw');
  assert.equal(v.alert().textContent, 'Please enter a valid email address.');
  assert.deepEqual(v.log.created, [], 'no sign-in for an invalid form');

  await v.submit(' added@example.test ', 'pw');
  assert.deepEqual(v.log.created, [{ usesRedirect: false, flowId: 'flow-1' }]);
  assert.deepEqual(v.log.signIns, [{ email: 'added@example.test', password: 'pw' }]);
  assert.equal(v.log.primarySignIns, 0, 'the active session is never used to sign in');
  assert.deepEqual(v.api.getLinkedAccounts().map((a) => a.id).sort(), ['added', 'primary']);
  assert.deepEqual(v.log.switched, ['added'], 'switches to the added account once its sign-in is saved');
});

test('legacy vanilla dialog: a wrong password is shown and nothing is switched', async () => {
  const v = loadVanilla({ signIn: async () => ({ data: null, error: { message: 'Invalid login credentials' } }) });
  v.api.openAddAccountModal();
  await v.submit('a@b.co', 'bad');
  assert.equal(v.alert().textContent, 'Incorrect email or password.');
  assert.deepEqual(v.log.switched, []);


  // The vanilla Google button stops at an undefined canAddAccount() (known
  // legacy bug; the React modal, mounted on every page, is used instead), so
  // its popup handling is guarded by source checks.
  for (const fn of v.dom.byId.get('vanilla-acct-google-btn').listeners.click) await fn();
  assert.equal(v.alert().textContent, 'canAddAccount is not defined');
  assert.match(accountSwitcherCode, /usesRedirect: true,\s*flowId: accountAuthFlow/, 'Google also uses its own flow');
  assert.match(accountSwitcherCode, /evt\.data\.type === 'VAROOM_ADD_ACCOUNT_ERROR'/);
});

test('Settings keeps saved-account removal separate from permanent account deletion and sidebar menus', () => {
  // Native Settings (outside this group): wording and which button shows for which row.
  const settingsCode = read('components', 'settings', 'SettingsSections.tsx');
  const settingsLib = read('lib', 'settings', 'settings.ts');
  assert.match(settingsCode, /Remove saved account\?/);
  assert.match(settingsCode, /Remove account/);
  assert.match(settingsCode, /The VaRoom account and its listings, bookings, chats, profile, and other data will remain available/);
  assert.match(settingsCode, /removeLinkedAccount\(getSupabaseClient\(\), account\.id\)/);
  const accountRow = settingsCode.slice(settingsCode.indexOf('const row = (account: LinkedAccount, isActive: boolean)'), settingsCode.indexOf('const name = removing'));
  assert.match(accountRow, /\{!isActive && \([\s\S]*?Remove account/);
  assert.match(accountRow, /\{isActive && <button[^>]*>Delete account/);
  assert.match(settingsLib, /fetchFn\('\/api\/delete-account'/);
  assert.doesNotMatch(accountSwitcherCode, /Remove account/);
});

test('varoom-dark-theme.css contains dark mode glassmorphism rules for the modal', () => {
  const darkThemeCss = read('public', 'js', 'varoom-dark-theme.css');
  assert.match(darkThemeCss, /\[data-theme="dark"\]\s+\.add-account-card/, 'Defines dark mode glass card');
  assert.match(darkThemeCss, /\[data-theme="dark"\]\s+\.add-account-input/, 'Defines dark mode inputs');
  assert.match(darkThemeCss, /\[data-theme="dark"\]\s+\.add-account-google-btn/, 'Defines dark mode Google button');
});
