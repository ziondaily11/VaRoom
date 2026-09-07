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
    if (!account || !account.id) return;
    var list = getLinkedAccounts();
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === account.id) { idx = i; break; } }
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], account);
    else list.push(account);
    saveLinkedAccounts(list);
  }

  function removeAccount(userId) {
    var list = getLinkedAccounts().filter(function (a) { return a.id !== userId; });
    saveLinkedAccounts(list);
  }

  function initial(name) {
    var trimmed = (name || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
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
    return account;
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
          '<span class="account-row-name">' + (account.full_name || 'VaRoom member') + '</span>' +
          '<span class="account-row-meta">' + (account.email || '') + '</span>' +
        '</span>' +
        (isActive ? '<span class="account-row-check">✓</span>' : '') +
        '</button>';
    }).join('');

    dropdownEl.innerHTML = rowsHtml +
      '<div class="account-dropdown-divider"></div>' +
      '<button type="button" class="account-add-btn" id="account-add-btn">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>' +
      'Add existing account</button>';
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
      if (addBtn) {
        window.location.href = 'login.html?mode=add&redirect=' + encodeURIComponent(redirectPath);
        return;
      }
      var row = event.target.closest('.account-row');
      if (!row || row.classList.contains('active')) return;
      var accountId = row.getAttribute('data-account-id');
      var accounts = getLinkedAccounts();
      var account = null;
      for (var i = 0; i < accounts.length; i++) { if (accounts[i].id === accountId) { account = accounts[i]; break; } }
      if (!account) return;

      row.style.opacity = '0.6';
      try {
        var switchResult = await client.auth.setSession({ access_token: account.access_token, refresh_token: account.refresh_token });
        if (switchResult.error) throw switchResult.error;
        window.location.reload();
      } catch (err) {
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
    upsertAccount: upsertAccount,
    upsertFromSession: upsertFromSession,
    removeAccount: removeAccount,
    init: init
  };
})();
