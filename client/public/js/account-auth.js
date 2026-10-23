/* Shared Supabase auth options for isolated add-account OAuth flows. */
(function (root) {
  var STORAGE_KEY = 'varoom-add-account-auth';

  function clientOptions(options) {
    options = options || {};
    var usesRedirect = options.usesRedirect === true;
    var auth = {
      persistSession: usesRedirect,
      autoRefreshToken: false,
      detectSessionInUrl: options.isCallback === true,
      storageKey: STORAGE_KEY
    };

    // PKCE verifier and the temporary OAuth session survive the same-tab
    // redirect, but remain separate from the primary client's localStorage.
    if (usesRedirect) {
      try {
        auth.storage = root.sessionStorage;
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

  function clearTemporarySession() {
    try {
      root.sessionStorage.removeItem(STORAGE_KEY);
      root.sessionStorage.removeItem(STORAGE_KEY + '-code-verifier');
    } catch (_error) {}
  }

  root.VaRoomAccountAuth = {
    storageKey: STORAGE_KEY,
    clientOptions: clientOptions,
    createClient: createClient,
    clearTemporarySession: clearTemporarySession
  };
})(window);
