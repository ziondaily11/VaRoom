(function (root) {
  if (!root || root.VaRoomGoogleSignIn) return;

  var CLIENT_ID = root.GOOGLE_CLIENT_ID
    || root.VAROOM_GOOGLE_CLIENT_ID
    || '369292685051-ibng5c6hcuqs20fkfuk5ljip74fka3if.apps.googleusercontent.com';
  var scriptPromise;
  var initializationPromise;
  var rawNonce;
  var mountedButtons = new Set();
  var isAuthenticating = false;

  function loadGoogleIdentityServices() {
    if (root.google && root.google.accounts && root.google.accounts.id) {
      return Promise.resolve();
    }
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise(function (resolve, reject) {
      var script = root.document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (root.google && root.google.accounts && root.google.accounts.id) resolve();
        else {
          scriptPromise = null;
          reject(new Error('Google sign-in did not finish loading.'));
        }
      };
      script.onerror = function () {
        scriptPromise = null;
        reject(new Error('Google sign-in could not load. Check your connection and try again.'));
      };
      root.document.head.appendChild(script);
    });

    return scriptPromise;
  }

  async function createNonce() {
    if (!root.crypto || !root.crypto.getRandomValues || !root.crypto.subtle) {
      throw new Error('Secure Google sign-in is not available in this browser.');
    }

    var bytes = new Uint8Array(32);
    root.crypto.getRandomValues(bytes);
    rawNonce = Array.from(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
    var digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
    var hashedNonce = Array.from(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');

    return hashedNonce;
  }

  function setButtonsBusy(isBusy) {
    mountedButtons.forEach(function (button) {
      button.container.setAttribute('aria-busy', String(isBusy));
      button.container.style.pointerEvents = isBusy ? 'none' : '';
      if (button.fallbackButton) button.fallbackButton.disabled = isBusy;
      if (button.statusElement) button.statusElement.hidden = !isBusy;
      if (button.onLoading) button.onLoading(isBusy);
    });
  }

  function reportError(error) {
    var message = error && error.message
      ? error.message
      : 'Could not connect to Google. Please try again.';
    mountedButtons.forEach(function (button) {
      if (button.onError) button.onError(message);
    });
  }

  function startRedirectFallback(button) {
    if (isAuthenticating) return;
    isAuthenticating = true;
    setButtonsBusy(true);
    button.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: button.redirectTo }
    }).then(function (result) {
      if (result.error) throw result.error;
    }).catch(function (error) {
      isAuthenticating = false;
      setButtonsBusy(false);
      reportError(error);
    });
  }

  function startOAuth(options) {
    options = options || {};
    var client = options.client;
    if (!client || !client.auth || typeof client.auth.signInWithOAuth !== 'function') {
      if (options.onError) options.onError('Google sign-in is unavailable right now. Please try again.');
      return Promise.resolve();
    }
    if (isAuthenticating) return Promise.resolve();

    try {
      if (options.intendedRole === 'host' || options.intendedRole === 'client') {
        root.sessionStorage.setItem('varoom_intended_role', options.intendedRole);
      } else if (options.clearIntendedRole) {
        root.sessionStorage.removeItem('varoom_intended_role');
      }
    } catch (error) {
      if (options.onError) {
        options.onError('Your browser prevented saving sign-in preferences. Please enable site storage and try again.');
      }
      return Promise.resolve();
    }

    isAuthenticating = true;
    if (options.onLoading) options.onLoading(true);
    return Promise.resolve().then(function () {
      return client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: options.redirectTo }
      });
    }).then(function (result) {
      if (result.error) throw result.error;
    }).catch(function (error) {
      isAuthenticating = false;
      if (options.onLoading) options.onLoading(false);
      if (options.onError) {
        options.onError(error && error.message ? error.message : 'Could not connect to Google. Please try again.');
      }
    });
  }

  async function handleCredential(response) {
    if (isAuthenticating) return;
    if (!response || !response.credential || !rawNonce) {
      reportError(new Error('Google did not return a valid sign-in credential.'));
      return;
    }

    isAuthenticating = true;
    setButtonsBusy(true);
    try {
      var activeButton = Array.from(mountedButtons).find(function (button) {
        return button.client;
      });
      if (!activeButton) throw new Error('Authentication is unavailable right now. Please try again.');

      var result = await activeButton.client.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
        nonce: rawNonce
      });
      if (result.error) throw result.error;
      if (!result.data || !result.data.session) {
        throw new Error('Google sign-in did not create a valid session. Please try again.');
      }

      var redirectTo = activeButton.redirectTo;
      root.location.assign(redirectTo);
    } catch (error) {
      setButtonsBusy(false);
      reportError(error);
    } finally {
      isAuthenticating = false;
    }
  }

  async function initialize(client) {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async function () {
      await loadGoogleIdentityServices();
      var hashedNonce = await createNonce();
      root.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
        nonce: hashedNonce,
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_button: true,
        use_fedcm_for_prompt: true
      });
      return client;
    })();

    try {
      return await initializationPromise;
    } catch (error) {
      initializationPromise = null;
      throw error;
    }
  }

  function mount(container, options) {
    options = options || {};
    if (!container) throw new Error('A Google sign-in button container is required.');
    if (!options.client || !options.client.auth) {
      throw new Error('Supabase authentication is unavailable right now.');
    }

    container.replaceChildren();
    var button = {
      client: options.client,
      redirectTo: options.redirectTo,
      container: container,
      fallbackButton: options.fallbackButton || null,
      ready: false,
      statusElement: null,
      onError: options.onError,
      onReady: options.onReady,
      onLoading: options.onLoading
    };
    mountedButtons.add(button);
    button.onFallback = function () {
      startRedirectFallback(button);
    };

    if (options.intendedRole === 'host' || options.intendedRole === 'client') {
      try {
        root.sessionStorage.setItem('varoom_intended_role', options.intendedRole);
      } catch (error) {
        reportError(new Error('Your browser prevented saving the selected account type. Please enable site storage and try again.'));
      }
    } else if (options.clearIntendedRole) {
      try {
        root.sessionStorage.removeItem('varoom_intended_role');
      } catch (error) {
        reportError(new Error('Your browser prevented updating sign-in preferences. Please enable site storage and try again.'));
      }
    }
    if (button.fallbackButton) {
      button.fallbackButton.addEventListener('click', button.onFallback);
    }
    if (!button.onLoading) {
      button.statusElement = root.document.createElement('div');
      button.statusElement.className = 'varoom-google-signin-status';
      button.statusElement.setAttribute('role', 'status');
      button.statusElement.textContent = 'Connecting to Google...';
      button.statusElement.hidden = true;
      button.statusElement.style.margin = '8px 0';
      button.statusElement.style.textAlign = 'center';
      button.statusElement.style.fontSize = '12px';
      button.statusElement.style.opacity = '0.75';
      container.insertAdjacentElement('afterend', button.statusElement);
    }

    initialize(button.client).then(function () {
      if (!mountedButtons.has(button)) return;
      button.ready = true;
      if (button.onReady) button.onReady();

      var availableWidth = container.clientWidth || Math.max(200, root.innerWidth - 48);
      root.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: options.theme || 'outline',
        size: 'large',
        text: options.text || 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(400, availableWidth)
      });
      container.style.visibility = 'visible';
    }).catch(function (error) {
      if (mountedButtons.has(button)) reportError(error);
    });

    return function unmount() {
      mountedButtons.delete(button);
      if (button.fallbackButton) {
        button.fallbackButton.removeEventListener('click', button.onFallback);
      }
      if (button.statusElement) button.statusElement.remove();
      container.replaceChildren();
      container.removeAttribute('aria-busy');
      container.style.pointerEvents = '';
      container.style.visibility = '';
    };
  }

  root.VaRoomGoogleSignIn = { mount: mount, oauth: startOAuth };
})(typeof window !== 'undefined' ? window : null);
