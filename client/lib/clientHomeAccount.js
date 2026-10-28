// Keep the native Client Home's authenticated profile decisions explicit and
// testable.  A failed profile request is not evidence that an authenticated
// user has not completed onboarding.
function resolveClientHomeProfile(session, profileResult) {
  const user = session && session.user;
  if (!user || !user.id) return { kind: 'unauthenticated' };

  if (!profileResult || profileResult.error || !profileResult.data) {
    return { kind: 'profile-error', user };
  }

  const profile = profileResult.data;
  if (profile.role === 'host') return { kind: 'host', user, profile };
  if (profile.onboarding_completed !== true) return { kind: 'onboarding', user, profile };
  return { kind: 'ready', user, profile };
}

module.exports = { resolveClientHomeProfile };
