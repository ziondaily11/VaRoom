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

function loadHelper(auth, { popupBlocked = false } = {}) {
  let googleConfiguration;
  let renderedButton;
  let popupMessageHandler;
  const openedPopups = [];
  const broadcastChannels = [];
  const assignedUrls = [];
  const savedValues = new Map();
  const popup = {
    location: { href: '' },
    closed: false,
    close() { this.closed = true; }
  };
  class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.handler = null;
      this.closed = false;
      broadcastChannels.push(this);
    }
    addEventListener(name, handler) {
      if (name === 'message') this.handler = handler;
    }
    close() {
      this.closed = true;
    }
    dispatch(data) {
      if (this.handler) this.handler({ data });
    }
  }
  const window = {
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    crypto: crypto.webcrypto,
    innerWidth: 400,
    location: {
      origin: 'https://varoom.example',
      assign: (url) => assignedUrls.push(url)
    },
    open: (...args) => {
      openedPopups.push(args);
      return popupBlocked ? null : popup;
    },
    addEventListener: (name, handler) => {
      if (name === 'message') popupMessageHandler = handler;
    },
    removeEventListener: (name, handler) => {
      if (name === 'message' && popupMessageHandler === handler) popupMessageHandler = null;
    },
    BroadcastChannel: MockBroadcastChannel,
    sessionStorage: {
      setItem: (key, value) => savedValues.set(key, value),
      removeItem: (key) => savedValues.delete(key)
    },
    google: {
      accounts: {
        id: {
          initialize: (configuration) => { googleConfiguration = configuration; },
          renderButton: (_container, options) => { renderedButton = options; }
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
    URL,
    Uint8Array,
    TextEncoder,
    Error
  });

  return {
    api: window.VaRoomGoogleSignIn,
    getGoogleConfiguration: () => googleConfiguration,
    getRenderedButton: () => renderedButton,
    popup,
    openedPopups,
    dispatchPopupMessage: (event) => popupMessageHandler && popupMessageHandler(event),
    broadcastChannels,
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

test('React Google sign-in uses Supabase OAuth and preserves the selected signup role', async () => {
  let oauthRequest;
  const testContext = loadHelper({
    signInWithOAuth: async (request) => {
      oauthRequest = request;
      return { data: { url: 'https://accounts.google.com/oauth' }, error: null };
    }
  });
  const loadingStates = [];
  const popupStates = [];
  const errors = [];

  await testContext.api.oauth({
    client: testContext.client,
    redirectTo: 'https://varoom.example/auth-callback?redirect=%2Fbookings',
    intendedRole: 'host',
    onLoading: (loading) => loadingStates.push(loading),
    onPopupChange: (open) => popupStates.push(open),
    onError: (message) => errors.push(message)
  });

  assert.equal(oauthRequest.provider, 'google');
  const popupCallback = new URL(oauthRequest.options.redirectTo);
  assert.equal(popupCallback.origin, 'https://varoom.example');
  assert.equal(popupCallback.pathname, '/auth-callback');
  assert.equal(popupCallback.searchParams.get('redirect'), '/bookings');
  assert.equal(popupCallback.searchParams.get('auth_popup'), '1');
  assert.match(popupCallback.searchParams.get('auth_popup_id'), /^[a-f0-9]{32}$/);
  assert.equal(oauthRequest.options.skipBrowserRedirect, true);
  assert.equal(testContext.savedValues.get('varoom_intended_role'), 'host');
  assert.equal(testContext.openedPopups.length, 1);
  assert.equal(testContext.popup.location.href, 'https://accounts.google.com/oauth');
  assert.equal(testContext.broadcastChannels[0].name, 'varoom-google-auth');
  assert.deepEqual(loadingStates, [true]);
  assert.deepEqual(popupStates, [true]);
  assert.deepEqual(errors, []);

  testContext.dispatchPopupMessage({
    origin: 'https://varoom.example',
    source: testContext.popup,
    data: {
      type: 'varoom:google-auth-complete',
      requestId: popupCallback.searchParams.get('auth_popup_id'),
      destination: '/host-home'
    }
  });

  assert.deepEqual(testContext.assignedUrls, ['https://varoom.example/host-home']);
  assert.deepEqual(loadingStates, [true, false]);
  assert.deepEqual(popupStates, [true, false]);
});

test('users can cancel a pending Google popup without redirecting or leaving sign-in busy', async () => {
  const testContext = loadHelper({
    signInWithOAuth: async () => ({
      data: { url: 'https://accounts.google.com/oauth' },
      error: null
    })
  });
  const loadingStates = [];
  const popupStates = [];
  const errors = [];

  await testContext.api.oauth({
    client: testContext.client,
    redirectTo: 'https://varoom.example/auth-callback',
    onLoading: (loading) => loadingStates.push(loading),
    onPopupChange: (open) => popupStates.push(open),
    onError: (message) => errors.push(message)
  });

  testContext.api.cancel();

  assert.equal(testContext.popup.closed, true);
  assert.deepEqual(testContext.assignedUrls, []);
  assert.deepEqual(loadingStates, [true, false]);
  assert.deepEqual(popupStates, [true, false]);
  assert.deepEqual(errors, []);
});

test('popup callback returns its destination over BroadcastChannel without relying on window.opener', async () => {
  let oauthRequest;
  const testContext = loadHelper({
    signInWithOAuth: async (request) => {
      oauthRequest = request;
      return { data: { url: 'https://accounts.google.com/oauth' }, error: null };
    }
  });
  const loadingStates = [];
  const errors = [];

  await testContext.api.oauth({
    client: testContext.client,
    redirectTo: 'https://varoom.example/auth-callback',
    onLoading: (loading) => loadingStates.push(loading),
    onError: (message) => errors.push(message)
  });

  const callbackUrl = new URL(oauthRequest.options.redirectTo);
  testContext.broadcastChannels[0].dispatch({
    type: 'varoom:google-auth-complete',
    requestId: callbackUrl.searchParams.get('auth_popup_id'),
    destination: '/client-home'
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(loadingStates, [true, false]);
  assert.deepEqual(testContext.assignedUrls, ['https://varoom.example/client-home']);
});

test('React Google sign-in clears stale role and reports OAuth errors', async () => {
  const testContext = loadHelper({
    signInWithOAuth: async () => ({ error: new Error('Google OAuth failed') })
  });
  const loadingStates = [];
  const errors = [];
  testContext.savedValues.set('varoom_intended_role', 'host');

  await testContext.api.oauth({
    client: testContext.client,
    redirectTo: 'https://varoom.example/auth-callback',
    clearIntendedRole: true,
    onLoading: (loading) => loadingStates.push(loading),
    onError: (message) => errors.push(message)
  });

  assert.equal(testContext.savedValues.has('varoom_intended_role'), false);
  assert.deepEqual(loadingStates, [true, false]);
  assert.deepEqual(errors, ['Google OAuth failed']);
  assert.equal(testContext.popup.closed, true);
});

test('React Google sign-in falls back to full-page OAuth when the popup is blocked', async () => {
  let oauthRequest;
  const testContext = loadHelper({
    signInWithOAuth: async (request) => {
      oauthRequest = request;
      return { error: null };
    }
  }, { popupBlocked: true });
  const loadingStates = [];
  const errors = [];

  await testContext.api.oauth({
    client: testContext.client,
    redirectTo: 'https://varoom.example/auth-callback',
    clearIntendedRole: true,
    onLoading: (loading) => loadingStates.push(loading),
    onError: (message) => errors.push(message)
  });

  assert.equal(oauthRequest.provider, 'google');
  assert.equal(oauthRequest.options.redirectTo, 'https://varoom.example/auth-callback');
  assert.equal(oauthRequest.options.skipBrowserRedirect, undefined);
  assert.deepEqual(loadingStates, [true]);
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
