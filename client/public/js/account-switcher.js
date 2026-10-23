/**
 * VaRoomAccountSwitcher
 * ---------------------
 * Supabase's client only ever holds ONE active session at a time, so "being
 * signed into two VaRoom accounts at once" is implemented here rather than
 * in Supabase itself: every account the person has ever added on this
 * browser gets its access/refresh tokens cached in localStorage under
 * STORAGE_KEY. "Switching" means calling supabase.auth.setSession() with a
 * cached account's tokens and reloading the page. Tokens are kept fresh by
 * re-saving the active account's session on every load and on Supabase's
 * TOKEN_REFRESHED event.
 *
 * This intentionally only supports email/password add-account flows today
 * (see login.html mode=add) — Google OAuth add-account is not wired up yet.
 */
(function () {
  var STORAGE_KEY = 'varoom_linked_accounts';
  var MAX_LINKED_ACCOUNTS = 3;

  function getLinkedAccounts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveLinkedAccounts(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function upsertAccount(account) {
    if (!account || !account.id) return false;
    var list = getLinkedAccounts();
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === account.id) { idx = i; break; } }
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], account);
    else if (list.length < MAX_LINKED_ACCOUNTS) list.push(account);
    else return false;
    saveLinkedAccounts(list);
    return true;
  }

  function removeAccount(userId) {
    var list = getLinkedAccounts().filter(function (a) { return a.id !== userId; });
    saveLinkedAccounts(list);
    try {
      if (localStorage.getItem('varoom_active_account_id') === userId) {
        localStorage.removeItem('varoom_active_account_id');
      }
    } catch (e) {}
  }

  async function switchAccount(client, account) {
    if (!client || !account || !account.access_token || !account.refresh_token) {
      throw new Error('This account needs you to sign in again.');
    }
    var switchResult = await client.auth.setSession({
      access_token: account.access_token,
      refresh_token: account.refresh_token
    });
    if (switchResult.error) throw switchResult.error;
    try {
      localStorage.setItem('varoom_active_account_id', account.id);
      var cached = {
        id: account.id,
        full_name: account.full_name || 'VaRoom Member',
        username: account.username || (account.email ? account.email.split('@')[0] : 'member'),
        avatar_url: account.avatar_url || null,
        email: account.email || '',
        role: account.role || 'client'
      };
      localStorage.setItem('varoom_cached_profile', JSON.stringify(cached));
    } catch (e) {}
  }

  function initial(name) {
    var trimmed = (name || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  }

  function ensureAddAccountModalStyles() {
    if (document.getElementById('varoom-add-account-styles')) return;
    var style = document.createElement('style');
    style.id = 'varoom-add-account-styles';
    style.textContent = [
      '.add-account-overlay{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:addAcctFadeIn 0.2s cubic-bezier(0.16,1,0.3,1);box-sizing:border-box;}',
      '@keyframes addAcctFadeIn{from{opacity:0;}to{opacity:1;}}',
      '.add-account-card{position:relative;width:100%;max-width:480px;border-radius:20px;padding:32px 36px 36px;background:rgba(255,255,255,0.94);backdrop-filter:blur(24px) saturate(160%);-webkit-backdrop-filter:blur(24px) saturate(160%);border:1px solid rgba(0,0,0,0.08);box-shadow:0 24px 64px -12px rgba(0,0,0,0.2),0 0 0 1px rgba(0,0,0,0.04);color:#0F1419;box-sizing:border-box;font-family:inherit;animation:addAcctCardPop 0.22s cubic-bezier(0.16,1,0.3,1);}',
      'html[data-theme="dark"] .add-account-card{background:rgba(18,18,20,0.88);border:1px solid rgba(255,255,255,0.12);box-shadow:0 24px 64px -12px rgba(0,0,0,0.75),0 0 0 1px rgba(255,255,255,0.06);color:#FFFFFF;}',
      '@keyframes addAcctCardPop{from{opacity:0;transform:scale(0.96) translateY(6px);}to{opacity:1;transform:scale(1) translateY(0);}}',
      '.add-account-header{position:relative;display:flex;align-items:center;justify-content:center;margin-bottom:22px;}',
      '.add-account-close-btn{position:absolute;left:-12px;top:-12px;width:38px;height:38px;border-radius:50%;background:transparent;border:none;color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color 0.15s;padding:0;}',
      '.add-account-close-btn:hover{background:rgba(0,0,0,0.06);}',
      'html[data-theme="dark"] .add-account-close-btn:hover{background:rgba(255,255,255,0.1);}',
      '.add-account-brand{font-weight:800;font-size:26px;letter-spacing:-0.6px;user-select:none;line-height:1;}',
      '.add-account-brand-va{color:#bd2337;}',
      '.add-account-brand-room{color:currentColor;}',
      '.add-account-title-wrap{text-align:center;margin-bottom:24px;}',
      '.add-account-title{font-size:24px;font-weight:800;letter-spacing:-0.4px;margin:0 0 6px 0;line-height:1.2;color:inherit;}',
      '.add-account-sub{font-size:14px;margin:0;line-height:1.4;color:rgba(15,20,25,0.65);}',
      'html[data-theme="dark"] .add-account-sub{color:rgba(255,255,255,0.65);}',
      '.add-account-alert{border-radius:10px;padding:10px 14px;font-size:13.5px;line-height:1.4;margin-bottom:18px;display:flex;align-items:center;gap:10px;}',
      '.add-account-alert.error{background:rgba(189,35,55,0.08);border:1px solid rgba(189,35,55,0.25);color:#bd2337;}',
      'html[data-theme="dark"] .add-account-alert.error{background:rgba(224,36,36,0.14);border:1px solid rgba(224,36,36,0.35);color:#ff6b6b;}',
      '.add-account-alert.success{background:rgba(26,122,89,0.1);border:1px solid rgba(26,122,89,0.3);color:#1a7a59;}',
      'html[data-theme="dark"] .add-account-alert.success{background:rgba(26,122,89,0.18);border:1px solid rgba(26,122,89,0.4);color:#48bb78;}',
      '.add-account-google-btn{width:100%;height:48px;border-radius:9999px;display:flex;align-items:center;justify-content:center;gap:12px;background:#FFFFFF;color:#0F1419;border:1px solid rgba(0,0,0,0.15);font-size:14.5px;font-weight:600;cursor:pointer;transition:background-color 0.15s,border-color 0.15s,box-shadow 0.15s;box-sizing:border-box;outline:none;}',
      '.add-account-google-btn:hover:not(:disabled){background:#F8F9FA;border-color:rgba(0,0,0,0.25);box-shadow:0 2px 6px rgba(0,0,0,0.06);}',
      'html[data-theme="dark"] .add-account-google-btn{background:#FFFFFF;color:#0F1419;border:none;}',
      'html[data-theme="dark"] .add-account-google-btn:hover:not(:disabled){background:#EAEAEA;}',
      '.add-account-google-btn:disabled{opacity:0.65;cursor:not-allowed;}',
      '.add-account-divider{display:flex;align-items:center;margin:20px 0;color:rgba(15,20,25,0.45);font-size:13px;}',
      'html[data-theme="dark"] .add-account-divider{color:rgba(255,255,255,0.45);}',
      '.add-account-divider::before,.add-account-divider::after{content:"";flex:1;border-bottom:1px solid rgba(0,0,0,0.1);}',
      'html[data-theme="dark"] .add-account-divider::before,html[data-theme="dark"] .add-account-divider::after{border-bottom:1px solid rgba(255,255,255,0.12);}',
      '.add-account-divider span{padding:0 14px;text-transform:lowercase;}',
      '.add-account-form{display:flex;flex-direction:column;gap:14px;}',
      '.add-account-input-group{position:relative;width:100%;}',
      '.add-account-input{width:100%;height:48px;padding:0 16px;border-radius:10px;border:1px solid rgba(0,0,0,0.14);background:rgba(0,0,0,0.02);font-size:14.5px;color:#0F1419;outline:none;transition:border-color 0.15s,box-shadow 0.15s,background-color 0.15s;box-sizing:border-box;font-family:inherit;}',
      '.add-account-input::placeholder{color:rgba(15,20,25,0.45);}',
      '.add-account-input:focus{border-color:#0F1419;box-shadow:0 0 0 2px rgba(15,20,25,0.08);background:#FFFFFF;}',
      'html[data-theme="dark"] .add-account-input{border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.04);color:#FFFFFF;}',
      'html[data-theme="dark"] .add-account-input::placeholder{color:rgba(255,255,255,0.45);}',
      'html[data-theme="dark"] .add-account-input:focus{border-color:#FFFFFF;box-shadow:0 0 0 2px rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);}',
      '.add-account-input.has-toggle{padding-right:46px;}',
      '.add-account-pw-toggle{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:8px;background:transparent;border:none;color:rgba(15,20,25,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color 0.15s,background-color 0.15s;padding:0;}',
      '.add-account-pw-toggle:hover{color:#0F1419;background:rgba(0,0,0,0.04);}',
      'html[data-theme="dark"] .add-account-pw-toggle{color:rgba(255,255,255,0.5);}',
      'html[data-theme="dark"] .add-account-pw-toggle:hover{color:#FFFFFF;background:rgba(255,255,255,0.08);}',
      '.add-account-submit-btn{width:100%;height:48px;border-radius:9999px;background:#0F1419;color:#FFFFFF;border:none;font-size:15px;font-weight:700;cursor:pointer;margin-top:6px;transition:background-color 0.15s,opacity 0.15s;display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;outline:none;}',
      '.add-account-submit-btn:hover:not(:disabled){background:#272C30;}',
      'html[data-theme="dark"] .add-account-submit-btn{background:#EFF3F4;color:#0F1419;}',
      'html[data-theme="dark"] .add-account-submit-btn:hover:not(:disabled){background:#D7DBDC;}',
      '.add-account-submit-btn:disabled{opacity:0.6;cursor:not-allowed;}',
      '.add-account-spinner{width:18px;height:18px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:addAcctSpin 0.75s linear infinite;}',
      '@keyframes addAcctSpin{to{transform:rotate(360deg);}}',
      '@media(max-width:480px){.add-account-card{padding:24px 20px 24px;border-radius:16px;}.add-account-title{font-size:21px;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function showVanillaAddAccountModal() {
    if (document.getElementById('varoom-vanilla-add-account-modal')) return;
    ensureAddAccountModalStyles();

    var overlay = document.createElement('div');
    overlay.id = 'varoom-vanilla-add-account-modal';
    overlay.className = 'add-account-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = [
      '<div class="add-account-card">',
      '  <div class="add-account-header">',
      '    <button type="button" class="add-account-close-btn" id="vanilla-acct-close" aria-label="Back">',
      '      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">',
      '        <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',
      '      </svg>',
      '    </button>',
      '    <div class="add-account-brand"><span class="add-account-brand-va">Va</span><span class="add-account-brand-room">Room</span></div>',
      '  </div>',
      '  <div class="add-account-title-wrap">',
      '    <h2 class="add-account-title">Add another account</h2>',
      '    <p class="add-account-sub">Sign in to add an existing account to VaRoom.</p>',
      '  </div>',
      '  <div id="vanilla-acct-alert" class="add-account-alert" style="display:none;"></div>',
      '  <button type="button" class="add-account-google-btn" id="vanilla-acct-google-btn">',
      '    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">',
      '      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>',
      '      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>',
      '      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>',
      '      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>',
      '    </svg>',
      '    <span>Continue with Google</span>',
      '  </button>',
      '  <div class="add-account-divider"><span>or</span></div>',
      '  <form class="add-account-form" id="vanilla-acct-form">',
      '    <div class="add-account-input-group">',
      '      <input type="email" id="vanilla-acct-email" class="add-account-input" placeholder="Email address" autocomplete="email" required>',
      '    </div>',
      '    <div class="add-account-input-group">',
      '      <input type="password" id="vanilla-acct-pass" class="add-account-input has-toggle" placeholder="Password" autocomplete="current-password" required>',
      '      <button type="button" class="add-account-pw-toggle" id="vanilla-acct-pw-toggle" aria-label="Toggle password visibility">',
      '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
      '        </svg>',
      '      </button>',
      '    </div>',
      '    <button type="submit" class="add-account-submit-btn" id="vanilla-acct-submit-btn"><span>Add Account</span></button>',
      '  </form>',
      '</div>'
    ].join('\n');

    document.body.appendChild(overlay);

    var alertEl = overlay.querySelector('#vanilla-acct-alert');
    var emailInput = overlay.querySelector('#vanilla-acct-email');
    var passInput = overlay.querySelector('#vanilla-acct-pass');
    var pwToggle = overlay.querySelector('#vanilla-acct-pw-toggle');
    var submitBtn = overlay.querySelector('#vanilla-acct-submit-btn');
    var googleBtn = overlay.querySelector('#vanilla-acct-google-btn');
    var closeBtn = overlay.querySelector('#vanilla-acct-close');

    function showAlert(msg, isError) {
      alertEl.textContent = msg;
      alertEl.className = 'add-account-alert ' + (isError ? 'error' : 'success');
      alertEl.style.display = 'flex';
    }
    function hideAlert() {
      alertEl.style.display = 'none';
    }

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      window.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
      if (e.key === 'Escape') closeModal();
    }
    window.addEventListener('keydown', onKey);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeModal();
    });
    closeBtn.addEventListener('click', closeModal);

    pwToggle.addEventListener('click', function() {
      var isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
    });

    setTimeout(function() { emailInput.focus(); }, 60);

    // Google button
    googleBtn.addEventListener('click', async function() {
      hideAlert();
      if (!window.VaRoomAccountSwitcher.canAddAccount()) {
        showAlert('Account limit reached (3/3). Remove an account before adding another.', true);
        return;
      }
      var sup = window.supabaseClient || (window.supabase && window.supabase.createClient(window.VAROOM_SUPABASE_URL, window.VAROOM_SUPABASE_ANON_KEY));
      if (!sup) {
        showAlert('Authentication client is not available.', true);
        return;
      }
      try {
        var sess = await sup.auth.getSession();
        if (sess.data && sess.data.session) {
          await upsertFromSession(sup, sess.data.session);
          sessionStorage.setItem('varoom_oauth_active_account_id', sess.data.session.user.id);
        }
      } catch(e) {}

      var callbackUrl = window.location.origin + '/auth-callback?addAccount=true';
      var tempClient = window.supabase.createClient(window.VAROOM_SUPABASE_URL, window.VAROOM_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });

      var res = await tempClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl, skipBrowserRedirect: true }
      });
      if (res.error) {
        showAlert(res.error.message || 'Could not connect to Google.', true);
        return;
      }
      if (res.data && res.data.url) {
        var width = 520, height = 640;
        var left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
        var top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
        var popup = window.open(res.data.url, 'varoom_add_account_popup', 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top);
        if (!popup || popup.closed) {
          sessionStorage.setItem('varoom_add_account_redirect', window.location.pathname + window.location.search);
          window.location.href = res.data.url;
          return;
        }
        var onMsg = async function(evt) {
          if (evt.origin !== window.location.origin) return;
          if (evt.data && evt.data.type === 'VAROOM_ADD_ACCOUNT_SUCCESS') {
            window.removeEventListener('message', onMsg);
            try {
              var s = evt.data.session;
              var prof = await fetchProfileBasics(sup, s.user.id);
              var newAcct = {
                id: s.user.id,
                email: s.user.email,
                full_name: (prof && prof.full_name) || (s.user.user_metadata && s.user.user_metadata.full_name) || 'VaRoom Member',
                username: (prof && prof.username) || (s.user.email ? s.user.email.split('@')[0] : 'member'),
                avatar_url: (prof && prof.avatar_url) || null,
                role: (prof && prof.role) || 'client',
                access_token: s.access_token,
                refresh_token: s.refresh_token
              };
              upsertAccount(newAcct);
              window.dispatchEvent(new CustomEvent('varoom_linked_accounts_changed', { detail: { accounts: getLinkedAccounts() } }));
              showAlert('Account added! You can now switch to this account anytime.', false);
              setTimeout(closeModal, 1200);
            } catch(err) {
              showAlert(err.message || 'Error saving account.', true);
            }
          }
        };
        window.addEventListener('message', onMsg);
      }
    });

    // Form submit
    var form = overlay.querySelector('#vanilla-acct-form');
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      hideAlert();
      var emailVal = emailInput.value.trim();
      var passVal = passInput.value;
      if (!emailVal) { showAlert('Please enter your email address.', true); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) { showAlert('Please enter a valid email address.', true); return; }
      if (!passVal) { showAlert('Please enter your password.', true); return; }
      if (!canAddAccount()) { showAlert('Account limit reached (3/3). Remove an account before adding another.', true); return; }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="add-account-spinner"></div><span>Adding Account...</span>';

      try {
        var tempClient = window.supabase.createClient(window.VAROOM_SUPABASE_URL, window.VAROOM_SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        var authRes = await tempClient.auth.signInWithPassword({ email: emailVal, password: passVal });
        if (authRes.error) {
          var msg = authRes.error.message || 'Authentication failed.';
          if (msg.toLowerCase().indexOf('invalid') !== -1) msg = 'Incorrect email or password.';
          if (msg.toLowerCase().indexOf('not confirmed') !== -1) msg = 'Please confirm your email before adding this account.';
          throw new Error(msg);
        }
        var session = authRes.data && authRes.data.session;
        var user = authRes.data && authRes.data.user;
        if (!session || !user) throw new Error('Authentication failed.');

        var activeId = getActiveAccountId();
        if (activeId === user.id) throw new Error('This account is already signed in.');
        var linked = getLinkedAccounts();
        for (var i = 0; i < linked.length; i++) {
          if (linked[i].id === user.id) throw new Error('This account is already linked. You can switch to it from the account menu.');
        }

        var sup = window.supabaseClient || tempClient;
        var prof = await fetchProfileBasics(tempClient, user.id);
        var newAcct = {
          id: user.id,
          email: user.email,
          full_name: (prof && prof.full_name) || (user.user_metadata && user.user_metadata.full_name) || 'VaRoom Member',
          username: (prof && prof.username) || (user.email ? user.email.split('@')[0] : 'member'),
          avatar_url: (prof && prof.avatar_url) || null,
          role: (prof && prof.role) || (user.user_metadata && user.user_metadata.role) || 'client',
          access_token: session.access_token,
          refresh_token: session.refresh_token
        };

        upsertAccount(newAcct);
        window.dispatchEvent(new CustomEvent('varoom_linked_accounts_changed', { detail: { accounts: getLinkedAccounts() } }));
        showAlert('Account added! You can now switch to this account anytime.', false);
        setTimeout(closeModal, 1200);
      } catch(err) {
        showAlert(err.message || 'Failed to add account.', true);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Add Account</span>';
      }
    });
  }

  function openAddAccountModal() {
    window.dispatchEvent(new CustomEvent('varoom:open-add-account'));
    if (window.__varoomAddAccountModalMounted) return;
    showVanillaAddAccountModal();
  }

  function startAddAccount(redirectPath) {
    openAddAccountModal();
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function avatarPublicUrl(client, avatarPath) {
    if (!avatarPath) return null;
    if (avatarPath.indexOf('http') === 0) return avatarPath;
    try { return client.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl; }
    catch (e) { return null; }
  }

  async function fetchProfileBasics(client, userId) {
    try {
      var result = await client.from('profiles').select('id, full_name, avatar_url, role').eq('id', userId).maybeSingle();
      return result.data || null;
    } catch (e) { return null; }
  }

  // Saves/refreshes an account entry from a live Supabase session object.
  // Safe to call repeatedly — always upserts the latest tokens + profile info.
  async function upsertFromSession(client, session) {
    if (!session || !session.user) return null;
    var profile = await fetchProfileBasics(client, session.user.id);
    var account = {
      id: session.user.id,
      email: session.user.email,
      full_name: (profile && profile.full_name) || (session.user.user_metadata && session.user.user_metadata.full_name) || 'VaRoom member',
      avatar_url: (profile && profile.avatar_url) || null,
      role: (profile && profile.role) || 'client',
      access_token: session.access_token,
      refresh_token: session.refresh_token
    };
    upsertAccount(account);
    try {
      localStorage.setItem('varoom_active_account_id', session.user.id);
      var cached = {
        id: account.id,
        full_name: account.full_name,
        username: (profile && profile.username) || (session.user.email ? session.user.email.split('@')[0] : 'member'),
        avatar_url: account.avatar_url,
        email: account.email,
        role: account.role
      };
      localStorage.setItem('varoom_cached_profile', JSON.stringify(cached));
    } catch (e) {}
    return account;
  }

  function getActiveAccountId() {
    try {
      var id = localStorage.getItem('varoom_active_account_id');
      if (id) return id;
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && (key.indexOf('sb-') === 0 || key.indexOf('-auth-token') !== -1) && key.indexOf('-auth-token') === key.length - 11) {
          var raw = localStorage.getItem(key);
          if (raw) {
            var parsed = JSON.parse(raw);
            var uid = (parsed && parsed.user && parsed.user.id) || (parsed && parsed.currentSession && parsed.currentSession.user && parsed.currentSession.user.id);
            if (uid) return uid;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function getActiveAccount() {
    var activeId = getActiveAccountId();
    if (!activeId) return null;
    var list = getLinkedAccounts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === activeId) return list[i];
    }
    return null;
  }

  function renderDropdown(dropdownEl, client, activeUserId, accounts) {
    var rowsHtml = accounts.map(function (account) {
      var isActive = account.id === activeUserId;
      var avatarUrl = avatarPublicUrl(client, account.avatar_url);
      var avatarInner = avatarUrl
        ? '<img src="' + avatarUrl + '" alt="">'
        : initial(account.full_name);
      return '<button type="button" class="account-row' + (isActive ? ' active' : '') + '" data-account-id="' + account.id + '">' +
        '<span class="account-row-avatar">' + avatarInner + '</span>' +
        '<span class="account-row-info">' +
          '<span class="account-row-name">' + escapeHtml(account.full_name || 'VaRoom member') + '</span>' +
          '<span class="account-row-meta">' + escapeHtml(account.email || '') + '</span>' +
        '</span>' +
        (isActive ? '<span class="account-row-check">✓</span>' : '') +
        '</button>';
    }).join('');

    var atLimit = accounts.length >= MAX_LINKED_ACCOUNTS;
    dropdownEl.innerHTML = rowsHtml +
      '<div class="account-dropdown-divider"></div>' +
      '<button type="button" class="account-add-btn' + (atLimit ? ' disabled' : '') + '" id="account-add-btn"' +
      (atLimit ? ' disabled aria-disabled="true"' : '') + '>' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>' +
      (atLimit ? 'Account limit reached (3/3)' : 'Add existing account') + '</button>';
  }

  /**
   * options: {
   *   client: the supabaseClient instance,
   *   toggleButton: the account button element (e.g. #topbar-user-btn),
   *   dropdownElement: an empty container to render the dropdown into,
   *   currentUser: the currently signed-in user (session.user),
   *   redirectPath: where "Add existing account" should return to after sign-in
   * }
   */
  function init(options) {
    var client = options.client;
    var toggleBtn = options.toggleButton;
    var dropdownEl = options.dropdownElement;
    var currentUser = options.currentUser;
    var redirectPath = options.redirectPath || window.location.pathname;

    if (!toggleBtn || !dropdownEl || !client || !currentUser) return;

    function refresh(activeUserId) {
      renderDropdown(dropdownEl, client, activeUserId, getLinkedAccounts());
    }

    // Always make sure the currently active account is saved/fresh in the list.
    (async function syncSelf() {
      var result = await client.auth.getSession();
      var session = result && result.data && result.data.session;
      if (session) await upsertFromSession(client, session);
      refresh(currentUser.id);
    })();

    // Keep cached tokens fresh so switching back to this account later still works.
    client.auth.onAuthStateChange(function (event, session) {
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session) {
        upsertFromSession(client, session).then(function () { refresh(session.user.id); });
      }
    });

    toggleBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      dropdownEl.classList.toggle('open');
    });
    document.addEventListener('click', function (event) {
      if (dropdownEl.classList.contains('open') && !dropdownEl.contains(event.target) && !toggleBtn.contains(event.target)) {
        dropdownEl.classList.remove('open');
      }
    });

    dropdownEl.addEventListener('click', async function (event) {
      var addBtn = event.target.closest('#account-add-btn');
      if (addBtn && !addBtn.disabled) {
        startAddAccount(redirectPath);
        return;
      }
      var row = event.target.closest('.account-row');
      if (!row || row.classList.contains('active')) return;
      var accountId = row.getAttribute('data-account-id');
      var accounts = getLinkedAccounts();
      var account = null;
      for (var i = 0; i < accounts.length; i++) { if (accounts[i].id === accountId) { account = accounts[i]; break; } }
      if (!account) return;

      row.classList.add('switching');
      try {
        await switchAccount(client, account);
        window.location.reload();
      } catch (err) {
        row.classList.remove('switching');
        removeAccount(accountId);
        refresh(currentUser.id);
        var message = 'That account needs you to sign in again.';
        if (window.varoomShowToast) window.varoomShowToast(message);
        else alert(message);
      }
    });
  }

  window.VaRoomAccountSwitcher = {
    getLinkedAccounts: getLinkedAccounts,
    getActiveAccountId: getActiveAccountId,
    getActiveAccount: getActiveAccount,
    upsertAccount: upsertAccount,
    upsertFromSession: upsertFromSession,
    switchAccount: switchAccount,
    removeAccount: removeAccount,
    canAddAccount: function () { return getLinkedAccounts().length < MAX_LINKED_ACCOUNTS; },
    startAddAccount: startAddAccount,
    openAddAccountModal: openAddAccountModal,
    init: init
  };
})();
