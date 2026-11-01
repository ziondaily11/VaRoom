/**
 * VaRoomAccountSwitcher
 * ---------------------
 * Supabase's client holds one active session. The authenticated backend owns
 * linked-account membership; this browser caches session tokens only for
 * members of the currently authenticated account's group.
 *
 * Account-add authentication is handled by login.html and auth-callback.html;
 * this module stores sessions returned by those flows and by the main client.
 */
(function () {
  var STORAGE_KEY = 'varoom_linked_accounts';
  var MEMBERSHIP_SYNC_KEY = 'varoom_linked_accounts_membership_updated';
  var MAX_LINKED_ACCOUNTS = 3;
  var sessionWriteVersions = Object.create(null);
  var linkedAccounts = [];
  var membershipUserId = null;
  var membershipLoaded = false;
  var membershipRequestVersion = 0;

  function getLinkedAccounts() {
    return membershipLoaded ? linkedAccounts.slice() : [];
  }

  function saveLinkedAccounts(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function upsertAccount(account) {
    if (!account || !account.id) return false;
    if (!membershipLoaded || !linkedAccounts.some(function (member) { return member.id === account.id; })) return false;
    var list = getLinkedAccounts();
    var cachedList = readCachedAccounts();
    var idx = -1;
    for (var i = 0; i < cachedList.length; i++) { if (cachedList[i].id === account.id) { idx = i; break; } }
    if (idx >= 0) {
      var existing = cachedList[idx];
      if (existing.expires_at && account.expires_at
        && Number(existing.expires_at) > Number(account.expires_at)) {
        // Another tab may have completed a later refresh first. Do not replace
        // its newer rotating token pair with a stale event from this tab.
        return true;
      }
      cachedList[idx] = Object.assign({}, existing, account);
    }
    else if (cachedList.length < MAX_LINKED_ACCOUNTS) cachedList.push(account);
    else return false;
    var saved = saveLinkedAccounts(cachedList);
    if (saved) {
      linkedAccounts = linkedAccounts.map(function (member) {
        return member.id === account.id ? Object.assign({}, member, account) : member;
      });
    }
    return saved;
  }

  function readCachedAccounts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(function (item) { return item && item.id; }) : [];
    } catch (e) { return []; }
  }

  function publishAccounts() {
    try {
      window.dispatchEvent(new CustomEvent('varoom_linked_accounts_changed', {
        detail: { accounts: getLinkedAccounts() }
      }));
    } catch (e) {}
  }

  // A successful group mutation in another tab changes only a marker, never
  // credentials. Refresh from the authenticated API before changing what that
  // tab displays or can switch to.
  if (window.addEventListener) {
    window.addEventListener('storage', function (event) {
      if (!event || event.key !== MEMBERSHIP_SYNC_KEY || !membershipLoaded || !window.supabaseClient) return;
      window.supabaseClient.auth.getSession().then(function (result) {
        var session = result && result.data && result.data.session;
        if (!session || !session.user || session.user.id !== membershipUserId) return;
        return loadLinkedAccounts(window.supabaseClient, session, { force: true });
      }).catch(function () {
        // Keep the last confirmed membership visible if the refresh cannot be
        // completed. A later navigation or explicit refresh retries it.
      });
    });
  }

  function installMembership(snapshot, userId, session) {
    var members = snapshot && snapshot.members;
    if (!Array.isArray(members) || !members.length || members.length > MAX_LINKED_ACCOUNTS
      || !members.some(function (member) { return member.id === userId; })) {
      throw new Error('The linked-account group response was invalid.');
    }

    var memberIds = new Set(members.map(function (member) { return member.id; }));
    var cached = readCachedAccounts();
    var allowedCache = cached.filter(function (account) { return memberIds.has(account.id); });
    var removedLegacyEntries = cached.length - allowedCache.length;
    var nextLinkedAccounts = members.map(function (member) {
      var localSession = allowedCache.find(function (account) { return account.id === member.id; });
      return Object.assign({}, member, localSession || {});
    });
    // Old browser-wide associations are deliberately not imported. Keep only
    // local sessions whose IDs the authenticated backend confirms are members.
    // Apply the authorized membership in memory before writing storage: a
    // storage failure must never leave a removed account switchable here.
    linkedAccounts = nextLinkedAccounts;
    membershipUserId = userId;
    membershipLoaded = true;
    if (!saveLinkedAccounts(allowedCache)) {
      publishAccounts();
      throw new Error('Could not safely update saved sign-in details in this browser.');
    }

    if (removedLegacyEntries > 0 && !window.__varoomLegacyAccountNoticeShown) {
      window.__varoomLegacyAccountNoticeShown = true;
      var notice = 'Saved accounts from this browser were not linked automatically. Add each account again to enroll it safely.';
      if (window.varoomShowToast) window.varoomShowToast(notice);
    }
    publishAccounts();
    return getLinkedAccounts();
  }

  async function loadLinkedAccounts(client, session, options) {
    options = options || {};
    if (!client || !client.auth) throw new Error('Authentication client is not available.');
    if (!session) {
      var activeResult = await client.auth.getSession();
      session = activeResult && activeResult.data && activeResult.data.session;
    }
    if (!session || !session.user || !session.access_token) {
      membershipRequestVersion += 1;
      linkedAccounts = [];
      membershipUserId = null;
      membershipLoaded = false;
      publishAccounts();
      return [];
    }

    var userId = session.user.id;
    if (!options.force && membershipLoaded && membershipUserId === userId) return getLinkedAccounts();
    var requestVersion = ++membershipRequestVersion;
    if (membershipUserId !== userId) {
      linkedAccounts = [];
      membershipLoaded = false;
      membershipUserId = userId;
      publishAccounts();
    }

    var fetcher = window.fetch || fetch;
    var response = await fetcher('/api/account-groups/current', {
      headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' },
      cache: 'no-store'
    });
    var snapshot = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(snapshot.error || 'Unable to load linked accounts.');

    var activeResultAfterFetch = await client.auth.getSession();
    var activeSessionAfterFetch = activeResultAfterFetch && activeResultAfterFetch.data && activeResultAfterFetch.data.session;
    if (!activeSessionAfterFetch || !activeSessionAfterFetch.user || activeSessionAfterFetch.user.id !== userId) {
      throw new Error('The active account changed while loading linked accounts. Please retry.');
    }
    if (requestVersion !== membershipRequestVersion) return getLinkedAccounts();
    return installMembership(snapshot, userId, activeSessionAfterFetch);
  }

  async function linkAdditionalSession(client, additionalSession) {
    if (!client || !client.auth || !additionalSession || !additionalSession.user
      || !additionalSession.access_token) {
      throw new Error('Sign in to the account you want to link and try again.');
    }
    var activeResult = await client.auth.getSession();
    var currentSession = activeResult && activeResult.data && activeResult.data.session;
    if (!currentSession || !currentSession.user || !currentSession.access_token) {
      throw new Error('Sign in to your current VaRoom account before adding another account.');
    }
    if (currentSession.user.id === additionalSession.user.id) {
      throw new Error('This account is already active.');
    }

    await loadLinkedAccounts(client, currentSession, { force: true });
    if (linkedAccounts.some(function (member) { return member.id === additionalSession.user.id; })) {
      throw new Error('This account is already linked. You can switch to it from the account menu.');
    }
    if (linkedAccounts.length >= MAX_LINKED_ACCOUNTS) {
      throw new Error('Account limit reached (3/3). This group cannot include another account.');
    }

    var fetcher = window.fetch || fetch;
    var response = await fetcher('/api/account-groups/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentSession.access_token
      },
      body: JSON.stringify({ additional_access_token: additionalSession.access_token })
    });
    var snapshot = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(snapshot.error || 'Unable to link this account.');

    var activeResultAfterLink = await client.auth.getSession();
    var activeSessionAfterLink = activeResultAfterLink && activeResultAfterLink.data && activeResultAfterLink.data.session;
    if (!activeSessionAfterLink || !activeSessionAfterLink.user
      || activeSessionAfterLink.user.id !== currentSession.user.id) {
      throw new Error('The active account changed while linking. Please retry.');
    }
    installMembership(snapshot, currentSession.user.id, activeSessionAfterLink);
    var linkedMember = linkedAccounts.find(function (member) { return member.id === additionalSession.user.id; });
    if (!linkedMember) throw new Error('The account group was updated but the new member was not returned.');
    var savedSession = upsertAccount(Object.assign({}, linkedMember, {
      email: additionalSession.user.email || linkedMember.email || '',
      access_token: additionalSession.access_token,
      refresh_token: additionalSession.refresh_token,
      expires_at: additionalSession.expires_at || null
    }));
    if (!savedSession && window.varoomShowToast) {
      window.varoomShowToast('The account was linked, but this browser could not save its sign-in. You may need to sign in again before switching.');
    }
    publishAccounts();
    return Object.assign({}, linkedMember, { session_cached: savedSession });
  }

  function beginLinkedAccountRemoval(removedUserId) {
    if (!membershipLoaded || !membershipUserId) {
      throw new Error('Saved accounts are still loading. Please try again.');
    }
    if (membershipUserId === removedUserId) {
      throw new Error('Switch accounts before removing the current account.');
    }
    if (!linkedAccounts.some(function (member) { return member.id === removedUserId; })) {
      throw new Error('This account is no longer linked. Refresh and try again.');
    }

    // Record exactly what this tab knew before hiding the row. The server
    // remains authoritative; this snapshot is only used to restore the UI if
    // its deletion request cannot be completed.
    var previousState = {
      accounts: linkedAccounts.slice(),
      cachedAccounts: readCachedAccounts(),
      membershipUserId: membershipUserId,
      membershipLoaded: membershipLoaded
    };
    membershipRequestVersion += 1;
    linkedAccounts = linkedAccounts.filter(function (member) { return member.id !== removedUserId; });
    saveLinkedAccounts(previousState.cachedAccounts.filter(function (account) { return account.id !== removedUserId; }));
    publishAccounts();
    return previousState;
  }

  function restoreLinkedAccountRemoval(previousState) {
    if (!previousState) return;
    membershipRequestVersion += 1;
    linkedAccounts = previousState.accounts;
    membershipUserId = previousState.membershipUserId;
    membershipLoaded = previousState.membershipLoaded;
    saveLinkedAccounts(previousState.cachedAccounts);
    publishAccounts();
  }

  async function removeLinkedAccount(client, removedUserId) {
    if (!client || !client.auth || !removedUserId) {
      throw new Error('Choose a saved account to remove.');
    }

    // Do this before the first await so Settings can update immediately. The
    // request below is still the only operation that changes group membership.
    var previousState = beginLinkedAccountRemoval(removedUserId);
    var currentSession = null;
    try {
      var activeResult = await client.auth.getSession();
      currentSession = activeResult && activeResult.data && activeResult.data.session;
      if (!currentSession || !currentSession.user || !currentSession.access_token) {
        throw new Error('Sign in to your current VaRoom account before removing another account.');
      }
      if (currentSession.user.id !== membershipUserId) {
        throw new Error('The active account changed while removing the saved account. Please retry.');
      }

      var fetcher = window.fetch || fetch;
      var response = await fetcher('/api/account-groups/' + encodeURIComponent(removedUserId), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + currentSession.access_token }
      });
      var snapshot = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(snapshot.error || 'Unable to remove this saved account.');

      var activeResultAfterRemoval = await client.auth.getSession();
      var activeSessionAfterRemoval = activeResultAfterRemoval && activeResultAfterRemoval.data && activeResultAfterRemoval.data.session;
      if (!activeSessionAfterRemoval || !activeSessionAfterRemoval.user
        || activeSessionAfterRemoval.user.id !== currentSession.user.id) {
        throw new Error('The active account changed while removing the saved account. Please retry.');
      }
      try {
        installMembership(snapshot, currentSession.user.id, activeSessionAfterRemoval);
      } catch (error) {
        if (!linkedAccounts.some(function (member) { return member.id === removedUserId; })) {
          var cleanupError = new Error('The saved account was removed, but this browser could not clear its saved sign-in details. Refresh before switching accounts.');
          cleanupError.removalSucceeded = true;
          throw cleanupError;
        }
        throw error;
      }
      if (linkedAccounts.some(function (member) { return member.id === removedUserId; })) {
        throw new Error('The saved account was not removed from the linked group.');
      }
      try {
        localStorage.setItem(MEMBERSHIP_SYNC_KEY, String(Date.now()));
      } catch (e) {}
      return getLinkedAccounts();
    } catch (error) {
      if (!error || !error.removalSucceeded) {
        restoreLinkedAccountRemoval(previousState);
        // A response can be lost after the server completes the deletion. Ask
        // for the authoritative group in the background so that case corrects
        // itself without ever trusting the optimistic state as final.
        if (currentSession) {
          loadLinkedAccounts(client, currentSession, { force: true }).catch(function () {});
        }
      }
      throw error;
    }
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
    var previousResult = await client.auth.getSession();
    var previousSession = previousResult && previousResult.data && previousResult.data.session;
    var switchedSession = null;
    try {
      var switchResult = await client.auth.setSession({
        access_token: account.access_token,
        refresh_token: account.refresh_token
      });
      if (switchResult.error) throw switchResult.error;

      switchedSession = switchResult.data && switchResult.data.session;
      if (!switchedSession || !switchedSession.user || switchedSession.user.id !== account.id) {
        throw new Error('The selected account could not be authenticated.');
      }

      // setSession refreshes expired access tokens and returns the rotated token
      // pair. Persist that exact session before the page reloads.
      await upsertFromSession(client, switchedSession);
      var confirmedResult = await client.auth.getSession();
      var confirmedSession = confirmedResult && confirmedResult.data && confirmedResult.data.session;
      if (!confirmedSession || !confirmedSession.user || confirmedSession.user.id !== account.id) {
        throw new Error('The active session changed while switching accounts. Please try again.');
      }
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
        if (window.VaRoomAccountProfileCache) window.VaRoomAccountProfileCache.write(cached);
        else localStorage.setItem('varoom_cached_profile', JSON.stringify(cached));
      } catch (storageError) {
        throw new Error('Could not save the selected account in this browser. Please try again.');
      }
      return confirmedSession;
    } catch (error) {
      // If a later verification/storage error occurred after setSession changed
      // the active user, restore the previously authenticated session. Never
      // remove the saved account on a failed switch.
      try {
        var afterFailureResult = await client.auth.getSession();
        var afterFailure = afterFailureResult && afterFailureResult.data && afterFailureResult.data.session;
        var previousId = previousSession && previousSession.user && previousSession.user.id;
        var afterFailureId = afterFailure && afterFailure.user && afterFailure.user.id;
        var sessionStillFromThisSwitch = switchedSession
          && afterFailure
          && afterFailure.access_token === switchedSession.access_token
          && afterFailureId === switchedSession.user.id;
        if (sessionStillFromThisSwitch && afterFailureId !== previousId) {
          if (previousSession && previousSession.access_token && previousSession.refresh_token) {
            await client.auth.setSession({
              access_token: previousSession.access_token,
              refresh_token: previousSession.refresh_token
            });
            // If the prior session has expired and can no longer be restored,
            // leave the current valid session alone. Never turn a switch error
            // into an implicit logout.
          }
        }
      } catch (_restoreError) {
        // Keep the original switching error for the caller.
      }
      throw error;
    }
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
      var sup = window.supabaseClient || (window.supabase && window.supabase.createClient(window.VAROOM_SUPABASE_URL, window.VAROOM_SUPABASE_ANON_KEY));
      if (!sup) {
        showAlert('Authentication client is not available.', true);
        return;
      }
      try {
        var sess = await sup.auth.getSession();
        if (!sess.data || !sess.data.session) throw new Error('Sign in to your current account before adding another.');
        await loadLinkedAccounts(sup, sess.data.session, { force: true });
        if (!canAddAccount()) throw new Error('Account limit reached (3/3). This group cannot include another account.');
        await upsertFromSession(sup, sess.data.session);
      } catch(e) {
        showAlert(e.message || 'Unable to verify the linked-account group.', true);
        return;
      }

      var accountAuthFlow = window.VaRoomAccountAuth.createFlowId();
      var callbackUrl = window.location.origin + '/auth-callback?addAccount=true&account_auth_flow=' + encodeURIComponent(accountAuthFlow);
      var tempClient = window.VaRoomAccountAuth.createClient(window.supabase, window.VAROOM_SUPABASE_URL, window.VAROOM_SUPABASE_ANON_KEY, {
        usesRedirect: true,
        flowId: accountAuthFlow
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
              var result = await linkAdditionalSession(sup, s);
              showAlert(result.session_cached
                ? 'Account added! You can now switch to this account anytime.'
                : 'Account linked. Sign in again on this browser before switching to it.', false);
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
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="add-account-spinner"></div><span>Adding Account...</span>';

      try {
        var tempClient = window.VaRoomAccountAuth.createClient(
          window.supabase,
          window.VAROOM_SUPABASE_URL,
          window.VAROOM_SUPABASE_ANON_KEY,
          { usesRedirect: false, flowId: window.VaRoomAccountAuth.createFlowId() }
        );
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

        var sup = window.supabaseClient;
        if (!sup) throw new Error('Your current account session is unavailable. Sign in again and retry.');
        var result = await linkAdditionalSession(sup, session);
        showAlert(result.session_cached
          ? 'Account added! You can now switch to this account anytime.'
          : 'Account linked. Sign in again on this browser before switching to it.', false);
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
      // In the Next app the shared profile store serves this without a request.
      // It only knows the primary client's user, so other clients query directly.
      var store = window.VaRoomProfileStore;
      var result = store && client === window.supabaseClient
        ? await store.get(userId)
        : await client.from('profiles').select('id, full_name, avatar_url, role').eq('id', userId).maybeSingle();
      return result.data || null;
    } catch (e) { return null; }
  }

  // Saves/refreshes an account entry from a live Supabase session object.
  // Safe to call repeatedly — always upserts the latest tokens + profile info.
  async function upsertFromSession(client, session) {
    if (!session || !session.user) return null;
    var userId = session.user.id;
    if (!session.access_token || !session.refresh_token) {
      throw new Error('The account session is missing authentication tokens.');
    }
    if (!membershipLoaded || membershipUserId !== userId) {
      await loadLinkedAccounts(client, session);
    }
    if (!linkedAccounts.some(function (member) { return member.id === userId; })) {
      throw new Error('The current account is not present in its authenticated account group.');
    }
    var version = (sessionWriteVersions[userId] || 0) + 1;
    sessionWriteVersions[userId] = version;
    var profile = await fetchProfileBasics(client, session.user.id);
    // Profile lookups may finish out of order when auth events arrive close
    // together. Only the most recently observed session is written.
    if (sessionWriteVersions[userId] !== version) {
      var latest = getLinkedAccounts().find(function (item) { return item.id === userId; });
      return latest || null;
    }
    var account = {
      id: session.user.id,
      email: session.user.email,
      full_name: (profile && profile.full_name) || (session.user.user_metadata && session.user.user_metadata.full_name) || 'VaRoom member',
      avatar_url: (profile && profile.avatar_url) || null,
      role: (profile && profile.role) || 'client',
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at || null
    };
    if (!upsertAccount(account)) {
      throw new Error('Could not save the account session in this browser. Check storage availability and try again.');
    }
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
      if (window.VaRoomAccountProfileCache) window.VaRoomAccountProfileCache.write(cached);
      else localStorage.setItem('varoom_cached_profile', JSON.stringify(cached));
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
        upsertFromSession(client, session).then(function () {
          refresh(session.user.id);
        }).catch(function () {
          // Keep the current session and membership intact if browser storage
          // temporarily cannot accept the refreshed token pair. Surface a
          // generic warning without exposing either token.
          var message = 'Could not save refreshed sign-in details in this browser. Switching may require you to sign in again.';
          if (window.varoomShowToast) window.varoomShowToast(message);
          else if (window.console && window.console.warn) window.console.warn(message);
        });
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
        refresh(currentUser.id);
        var message = 'That account needs you to sign in again.';
        if (window.varoomShowToast) window.varoomShowToast(message);
        else alert(message);
      }
    });
  }

  window.VaRoomAccountSwitcher = {
    getLinkedAccounts: getLinkedAccounts,
    loadLinkedAccounts: loadLinkedAccounts,
    linkAdditionalSession: linkAdditionalSession,
    removeLinkedAccount: removeLinkedAccount,
    getActiveAccountId: getActiveAccountId,
    getActiveAccount: getActiveAccount,
    upsertAccount: upsertAccount,
    upsertFromSession: upsertFromSession,
    switchAccount: switchAccount,
    removeAccount: removeAccount,
    canAddAccount: function () { return membershipLoaded && getLinkedAccounts().length < MAX_LINKED_ACCOUNTS; },
    startAddAccount: startAddAccount,
    openAddAccountModal: openAddAccountModal,
    init: init
  };
})();
