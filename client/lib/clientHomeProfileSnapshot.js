const STORAGE_PREFIX = 'varoom:client-home:profile:v1:';
const MAX_AGE_MS = 5 * 60 * 1000;

function storageKey(accountId) {
  return `${STORAGE_PREFIX}${encodeURIComponent(accountId)}`;
}

function normaliseProfile(accountId, profile) {
  if (!profile || profile.accountId !== accountId || profile.role !== 'client' ||
      profile.onboarding_completed !== true || typeof profile.looking_timeline !== 'string' ||
      !Array.isArray(profile.interested_categories) || typeof profile.cachedAt !== 'number') return null;
  const age = Date.now() - profile.cachedAt;
  if (age < 0 || age > MAX_AGE_MS) return null;
  return {
    role: 'client',
    onboarding_completed: true,
    looking_timeline: profile.looking_timeline,
    interested_categories: profile.interested_categories.filter((value) => typeof value === 'string'),
  };
}

function readClientHomeProfileSnapshot(storage, accountId) {
  if (!storage || !accountId) return null;
  try {
    const raw = storage.getItem(storageKey(accountId));
    if (!raw) return null;
    return normaliseProfile(accountId, JSON.parse(raw));
  } catch (error) {
    return null;
  }
}

function writeClientHomeProfileSnapshot(storage, accountId, profile) {
  if (!storage || !accountId || !profile || profile.role !== 'client' || profile.onboarding_completed !== true ||
      typeof profile.looking_timeline !== 'string' || !Array.isArray(profile.interested_categories)) return false;
  try {
    storage.setItem(storageKey(accountId), JSON.stringify({
      accountId,
      role: profile.role,
      onboarding_completed: profile.onboarding_completed,
      looking_timeline: profile.looking_timeline,
      interested_categories: profile.interested_categories.filter((value) => typeof value === 'string'),
      cachedAt: Date.now(),
    }));
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  readClientHomeProfileSnapshot,
  writeClientHomeProfileSnapshot,
};
