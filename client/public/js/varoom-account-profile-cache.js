(function (window) {
  'use strict';

  var STORAGE_KEY = 'varoom_cached_profile';
  var HOME_STATE_MAX_AGE = 15 * 60 * 1000;

  function readRaw() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      var profile = value ? JSON.parse(value) : null;
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
      if (typeof profile.id !== 'string' || !profile.id) return null;
      if (typeof profile.full_name !== 'string' || typeof profile.role !== 'string') return null;
      return profile;
    } catch (error) {
      return null;
    }
  }

  function readForAccount(accountId) {
    if (!accountId) return null;
    var profile = readRaw();
    return profile && profile.id === accountId ? profile : null;
  }

  function write(profile) {
    if (!profile || !profile.id) return false;
    var previous = readForAccount(profile.id) || {};
    var next = Object.assign({}, previous, profile);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return true;
    } catch (error) {
      return false;
    }
  }

  function writeHomeState(accountId, state, baseProfile) {
    if (!accountId || !state || state.accountId !== accountId) return false;
    if (baseProfile && baseProfile.id === accountId) write(baseProfile);
    var profile = readForAccount(accountId);
    if (!profile) return false;
    profile.homeState = Object.assign({}, state, { cachedAt: Date.now() });
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      return true;
    } catch (error) {
      return false;
    }
  }

  function readHomeState(accountId, role) {
    var profile = readForAccount(accountId);
    var state = profile && profile.homeState;
    if (!state || state.accountId !== accountId || state.role !== role) return null;
    var age = typeof state.cachedAt === 'number' ? Date.now() - state.cachedAt : -1;
    if (age < 0 || age > HOME_STATE_MAX_AGE) return null;
    if (state.onboarding_completed !== true) return null;
    if (role === 'client') {
      if (!Array.isArray(state.interested_categories) || typeof state.looking_timeline !== 'string') return null;
    } else if (!Array.isArray(state.listing_categories) || typeof state.verified !== 'boolean') {
      return null;
    }
    return Object.assign({}, profile, state);
  }

  window.VaRoomAccountProfileCache = {
    readForAccount: readForAccount,
    write: write,
    readHomeState: readHomeState,
    writeHomeState: writeHomeState,
    maxHomeStateAge: HOME_STATE_MAX_AGE,
  };
})(window);
