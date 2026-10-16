const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const helperSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'google-sign-in.js'),
  'utf8'
);

function createContainer() {
  return {
    clientWidth: 360,
    style: {},
    attributes: {},
    children: [],
    replaceChildren() {
      this.children = [];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    insertAdjacentElement(_position, element) {
      this.children.push(element);
    }
  };
}

function loadHelper(auth) {
  let googleConfiguration;
  let renderedButton;
  let promptNotification;
  let promptCount = 0;
  const assignedUrls = [];
  const savedValues = new Map();
  const window = {
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    crypto: crypto.webcrypto,
    innerWidth: 400,
    location: { assign: (url) => assignedUrls.push(url) },
    sessionStorage: {
      setItem: (key, value) => savedValues.set(key, value),
      removeItem: (key) => savedValues.delete(key)
    },
    google: {
      accounts: {
        id: {
          initialize: (configuration) => { googleConfiguration = configuration; },
          renderButton: (_container, options) => { renderedButton = options; },
          prompt: (callback) => {
            promptCount += 1;
            promptNotification = callback;
          }
        }
      }
    },
    document: {
      createElement: () => ({ style: {}, setAttribute() {} }),
      head: { appendChild() {} }
    }
  };
  vm.runInNewContext(helperSource, {
    window,
    Promise,
    Set,
    Array,
    Uint8Array,
    TextEncoder,
    Error
  });

  return {
    api: window.VaRoomGoogleSignIn,
    getGoogleConfiguration: () => googleConfiguration,
    getRenderedButton: () => renderedButton,
    getPromptCount: () => promptCount,
    notifyPrompt: (notification) => promptNotification(notification),
    assignedUrls,
    savedValues,
    client: { auth }
  };
}

test('Google GIS popup credential is exchanged through Supabase and returns to the auth callback', async () => {
  let credentials;
  const testContext = loadHelper({
    signInWithIdToken: async (input) => {
      credentials = input;
      return { data: { session: { access_token: 'supabase-session' } }, error: null };
    }
  });
  const container = createContainer();
  const loadingStates = [];
  const errors = [];
  const ready = new Promise((resolve) => {
    testContext.api.mount(container, {
      client: testContext.client,
      redirectTo: 'https://varoom.example/auth-callback?redirect=%2Fbookings',
      intendedRole: 'host',
      theme: 'filled_black',
      text: 'signup_with',
      onReady: resolve,
      onLoading: (loading) => loadingStates.push(loading),
      onError: (message) => errors.push(message)
    });
  });

  await ready;
  const configuration = testContext.getGoogleConfiguration();
  assert.equal(configuration.client_id, 'test-google-client-id');
  assert.equal(configuration.ux_mode, 'popup');
  assert.equal(configuration.auto_select, false);
  assert.equal(configuration.use_fedcm_for_button, true);
  assert.equal(configuration.use_fedcm_for_prompt, true);
  assert.equal(testContext.getRenderedButton().text, 'signup_with');
  assert.equal(testContext.getRenderedButton().shape, 'rectangular');
  assert.equal(testContext.getRenderedButton().width, 360);
  assert.equal(testContext.savedValues.get('varoom_intended_role'), 'host');

  await configuration.callback({ credential: 'google-id-token' });

  assert.equal(credentials.provider, 'google');
  assert.equal(credentials.token, 'google-id-token');
  assert.match(credentials.nonce, /^[a-f0-9]{64}$/);
  assert.equal(
    crypto.createHash('sha256').update(credentials.nonce).digest('hex'),
    configuration.nonce
  );
  assert.deepEqual(
    testContext.assignedUrls,
    ['https://varoom.example/auth-callback?redirect=%2Fbookings']
  );
  assert.deepEqual(loadingStates, [true]);
  assert.deepEqual(errors, []);
});

test('custom VaRoom button opens the GIS prompt and preserves Supabase token exchange', async () => {
  let credentials;
  const testContext = loadHelper({
    signInWithIdToken: async (input) => {
      credentials = input;
      return { data: { session: { access_token: 'supabase-session' } }, error: null };
    }
  });
  const container = createContainer();
  const readyStates = [];
  const loadingStates = [];
  const errors = [];
  let ready;
  const isReady = new Promise((resolve) => { ready = resolve; });

  testContext.api.mount(container, {
    client: testContext.client,
    redirectTo: 'https://varoom.example/auth-callback',
    customButton: true,
    onReady: () => {
      readyStates.push(true);
      ready();
    },
    onLoading: (loading) => loadingStates.push(loading),
    onError: (message) => errors.push(message)
  });

  await isReady;
  assert.deepEqual(readyStates, [true]);
  assert.equal(testContext.getRenderedButton(), undefined);

  testContext.api.prompt(container);
  assert.equal(testContext.getPromptCount(), 1);
  assert.deepEqual(loadingStates, [true]);
  await testContext.getGoogleConfiguration().callback({ credential: 'google-id-token' });

  assert.equal(credentials.provider, 'google');
  assert.equal(credentials.token, 'google-id-token');
  assert.deepEqual(testContext.assignedUrls, ['https://varoom.example/auth-callback']);
  assert.deepEqual(errors, []);
});

test('dismissing the GIS prompt clears its loading state without reporting an error', async () => {
  const testContext = loadHelper({
    signInWithIdToken: async () => ({
      data: { session: { access_token: 'supabase-session' } },
      error: null
    })
  });
  const container = createContainer();
  const loadingStates = [];
  const errors = [];
  const ready = new Promise((resolve) => {
    testContext.api.mount(container, {
      client: testContext.client,
      redirectTo: 'https://varoom.example/auth-callback',
      customButton: true,
      onReady: resolve,
      onLoading: (loading) => loadingStates.push(loading),
      onError: (message) => errors.push(message)
    });
  });

  await ready;
  testContext.api.prompt(container);
  testContext.notifyPrompt({
    isNotDisplayed: () => false,
    isSkippedMoment: () => false,
    isDismissedMoment: () => true
  });

  assert.deepEqual(loadingStates, [true, false]);
  assert.deepEqual(errors, []);
});

test('Google credential exchange errors do not redirect or leave sign-in busy', async () => {
  const testContext = loadHelper({
    signInWithIdToken: async () => ({
      data: { session: null },
      error: new Error('Google token rejected')
    })
  });
  const container = createContainer();
  const loadingStates = [];
  const errors = [];
  const ready = new Promise((resolve) => {
    testContext.api.mount(container, {
      client: testContext.client,
      redirectTo: 'https://varoom.example/auth-callback',
      onReady: resolve,
      onLoading: (loading) => loadingStates.push(loading),
      onError: (message) => errors.push(message)
    });
  });

  await ready;
  await testContext.getGoogleConfiguration().callback({ credential: 'invalid-token' });

  assert.deepEqual(testContext.assignedUrls, []);
  assert.deepEqual(loadingStates, [true, false]);
  assert.deepEqual(errors, ['Google token rejected']);
});
