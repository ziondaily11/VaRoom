const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const clientModulePath = path.join(root, 'lib', 'supabase', 'client.ts');
const safeRedirectPath = path.join(root, 'lib', 'safeRedirect.ts');

function createFakeClient(options) {
  const authListeners = [];
  const buckets = [];
  return {
    options,
    authListeners,
    buckets,
    auth: {
      onAuthStateChange(listener) {
        authListeners.push(listener);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async getSession() {
        return { data: { session: { access_token: 'token-1', user: { id: 'user-1' } } } };
      },
    },
    storage: {
      from(bucket) {
        buckets.push(bucket);
        return {
          getPublicUrl: (p) => ({ data: { publicUrl: 'supabase://' + bucket + '/' + p } }),
          upload: async () => ({ data: { path: 'supabase-upload' }, error: null }),
        };
      },
    },
  };
}

function createEnvironment({ search = '', existingClient = null, accountAuth = null } = {}) {
  const created = [];
  const events = [];
  const window = {
    location: { search, origin: 'https://varoom.co.ke' },
    supabaseClient: existingClient || undefined,
    VaRoomAccountAuth: accountAuth || undefined,
    dispatchEvent: (event) => events.push(event.type),
  };
  const supabaseMock = {
    createClient(url, key, options) {
      const client = createFakeClient(options);
      created.push({ url, key, options, client });
      return client;
    },
  };
  const mod = loadTs(clientModulePath, {
    mocks: { '@supabase/supabase-js': supabaseMock },
    globals: {
      window,
      process: { env: {} },
      Event: class { constructor(type) { this.type = type; } },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
    },
  });
  return { mod, window, created, events };
}

test('getSupabaseClient creates exactly one client and exposes legacy globals', () => {
  const { mod, window, created, events } = createEnvironment();
  const first = mod.getSupabaseClient();
  const second = mod.getSupabaseClient();

  assert.equal(created.length, 1);
  assert.equal(first, second);
  assert.equal(window.supabaseClient, first);
  assert.equal(created[0].options, undefined, 'primary client keeps default auth options and storage key');
  assert.ok(window.VAROOM_SUPABASE_URL);
  assert.ok(window.VAROOM_SUPABASE_ANON_KEY);
  assert.equal(typeof window.supabase.createClient, 'function');
  assert.equal(typeof window.VaRoomNotificationAPI.create, 'function');
  assert.deepEqual(events, ['varoom_supabase_ready']);
});

test('getSupabaseClient adopts an existing window.supabaseClient instead of creating another', () => {
  const existing = createFakeClient();
  const { mod, created, events } = createEnvironment({ existingClient: existing });

  assert.equal(mod.getSupabaseClient(), existing);
  assert.equal(created.length, 0);
  assert.deepEqual(events, []);
  assert.equal(existing.__varoomR2PhotoStoragePatched, true);
});

test('add-account callbacks get an isolated temporary client, never the primary session', () => {
  const accountAuth = {
    clientOptions: (options) => ({ auth: { storageKey: 'varoom-add-account-auth-' + options.flowId, flowOptions: options } }),
  };
  const withFlow = createEnvironment({ search: '?add_account_callback=1&account_auth_flow=abc', accountAuth });
  withFlow.mod.getSupabaseClient();
  assert.equal(withFlow.created[0].options.auth.storageKey, 'varoom-add-account-auth-abc');
  assert.deepEqual(withFlow.created[0].options.auth.flowOptions, { usesRedirect: true, isCallback: true, flowId: 'abc' });

  const withoutFlow = createEnvironment({ search: '?addAccount=true' });
  withoutFlow.mod.getSupabaseClient();
  assert.equal(withoutFlow.created[0].options.auth.persistSession, false);
  assert.equal(withoutFlow.created[0].options.auth.storageKey, 'varoom-invalid-add-account-callback');
});

test('photo buckets resolve through the R2 proxy and the patch is applied once', () => {
  const { mod } = createEnvironment();
  const client = mod.getSupabaseClient();
  mod.getSupabaseClient();

  assert.equal(client.storage.from('listing-photos').getPublicUrl('a/b c.jpg').data.publicUrl, '/api/photos/listing-photos/a/b%20c.jpg');
  assert.equal(client.storage.from('avatars').getPublicUrl('avatars/u.png').data.publicUrl, '/api/photos/avatars/avatars/u.png');
  assert.equal(client.storage.from('avatars').getPublicUrl('legacy/u.png').data.publicUrl, 'supabase://avatars/legacy/u.png');
  assert.equal(client.storage.from('documents').getPublicUrl('x.pdf').data.publicUrl, 'supabase://documents/x.pdf');
});

test('legacy data cache is invalidated when the signed-in user changes or signs out', () => {
  const { mod, window } = createEnvironment();
  const invalidated = [];
  window.VaRoomDataCache = { invalidate: (prefix) => invalidated.push(prefix) };
  const client = mod.getSupabaseClient();
  mod.getSupabaseClient();
  assert.equal(client.authListeners.length, 1, 'hook installed once');

  const [listener] = client.authListeners;
  listener('INITIAL_SESSION', { user: { id: 'a' } });
  listener('SIGNED_IN', { user: { id: 'b' } });
  listener('SIGNED_OUT', null);
  assert.deepEqual(invalidated, ['account:a:', 'account:b:', 'account:']);
});

test('getSafeRedirect keeps same-origin paths and rejects everything else', () => {
  const { getSafeRedirect } = loadTs(safeRedirectPath, { globals: { window: undefined } });
  const origin = 'https://varoom.co.ke';

  assert.equal(getSafeRedirect('/bookings?id=1#top', origin), '/bookings?id=1#top');
  assert.equal(getSafeRedirect('https://varoom.co.ke/chats', origin), '/chats');
  for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'data:text/html,x', '', null, 42]) {
    assert.equal(getSafeRedirect(unsafe, origin), '', String(unsafe));
  }
});

test('native pages use the shared client instead of creating their own', () => {
  for (const page of ['client-home.tsx', 'chats.tsx', 'notifications.tsx', 'index.tsx', 'analytics.tsx']) {
    const source = fs.readFileSync(path.join(root, 'pages', page), 'utf8');
    assert.match(source, /getSupabaseClient/, page);
    assert.doesNotMatch(source, /eyJhbGciOi/, page + ' must not hard-code the anon key');
    assert.doesNotMatch(source, /cdn\.jsdelivr\.net\/npm\/@supabase/, page + ' must not load the CDN SDK');
  }
  assert.match(fs.readFileSync(path.join(root, 'pages', '_app.js'), 'utf8'), /^getSupabaseClient\(\);$/m);
});

test('AuthPanel only follows same-origin redirects', () => {
  const source = fs.readFileSync(path.join(root, 'components', 'landing', 'AuthPanel.tsx'), 'utf8');
  assert.match(source, /getSafeRedirect\(router\.query\.redirect\)/);
});
