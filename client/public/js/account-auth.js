/* Shared Supabase auth options for isolated add-account OAuth flows. */
(function (root) {
  var STORAGE_PREFIX = 'varoom-add-account-auth-';

  function createFlowId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function storageKey(flowId) {
    var safeId = String(flowId || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!safeId || safeId.length > 80) throw new Error('A valid temporary sign-in flow is required.');
    return STORAGE_PREFIX + safeId;
  }

  function clientOptions(options) {
    options = options || {};
    var usesRedirect = options.usesRedirect === true;
    var key = storageKey(options.flowId || (usesRedirect ? options.storageKey : 'ephemeral'));
    var auth = {
      persistSession: usesRedirect,
      autoRefreshToken: false,
      detectSessionInUrl: options.isCallback === true,
      storageKey: key
    };

    // OAuth callbacks can run in a popup (with distinct sessionStorage), so
    // keep each short-lived flow in its own localStorage namespace. The key is
    // unique per flow and the callback clears it after returning the session.
    if (usesRedirect) {
      try {
        auth.storage = root.localStorage;
        if (!auth.storage) throw new Error('Session storage is unavailable.');
      } catch (_error) {
        throw new Error('This browser cannot keep the temporary sign-in state. Please use another sign-in method.');
      }
    }
    return { auth: auth };
  }

  function createClient(supabase, url, anonKey, options) {
    if (!supabase || typeof supabase.createClient !== 'function') {
      throw new Error('Authentication service is not available.');
    }
    return supabase.createClient(url, anonKey, clientOptions(options));
  }

  function clearTemporarySession(flowId) {
    var key;
    try { key = storageKey(flowId); } catch (_error) { return; }
    try {
      root.localStorage.removeItem(key);
      root.localStorage.removeItem(key + '-code-verifier');
    } catch (_error) {}
  }

  root.VaRoomAccountAuth = {
    storagePrefix: STORAGE_PREFIX,
    createFlowId: createFlowId,
    storageKey: storageKey,
    clientOptions: clientOptions,
    createClient: createClient,
    clearTemporarySession: clearTemporarySession
  };
})(window);
