'use strict';

// Settings → Your Account is locked only when there is a risk; otherwise it
// opens without asking. Phase 1 risk signal: the session was not signed into
// recently. A session older than FRESH_SIGN_IN_MS (one restored months later,
// or opened from another person's dashboard through the account switcher)
// must verify once (password or Google), and that verification lasts for the
// rest of the session, at most STEP_UP_TTL_MS.
//
// The same rule is enforced in the database for contact details
// (public.varoom_session_unlocked, migration 20261105_000061); keep the two
// windows in step.

const FRESH_SIGN_IN_MS = 12 * 60 * 60 * 1000;
const STEP_UP_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The claims of an access token the caller has already validated
 * (auth.getUser). Never use this to authenticate a token by itself.
 */
function verifiedTokenClaims(token) {
  try {
    const payload = String(token).split('.')[1];
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** When this session was signed into (ms), from its `amr` entries; null when unknown. */
function sessionSignedInAt(claims) {
  const entries = claims && Array.isArray(claims.amr) ? claims.amr : [];
  const times = entries.map((entry) => Number(entry && entry.timestamp)).filter(Number.isFinite);
  return times.length ? Math.max(...times) * 1000 : null;
}

/**
 * Whether this session may see and change protected account details, and
 * until when (so the page can stay open without asking again).
 */
async function securityStatus(admin, { userId, claims, now = Date.now() }) {
  const signedInAt = sessionSignedInAt(claims);
  if (signedInAt !== null && now - signedInAt < FRESH_SIGN_IN_MS) {
    return { unlocked: true, reason: 'fresh_sign_in', unlockedUntil: new Date(signedInAt + FRESH_SIGN_IN_MS).toISOString() };
  }
  const sessionId = claims && claims.session_id;
  if (sessionId) {
    const { data, error } = await admin.from('account_step_ups')
      .select('verified_at').eq('session_id', sessionId).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    const verifiedAt = data && data.verified_at ? new Date(data.verified_at).getTime() : NaN;
    if (Number.isFinite(verifiedAt) && now - verifiedAt < STEP_UP_TTL_MS) {
      return { unlocked: true, reason: 'verified', unlockedUntil: new Date(verifiedAt + STEP_UP_TTL_MS).toISOString() };
    }
  }
  return { unlocked: false, reason: 'stale_session', unlockedUntil: null };
}

/** Records that this session verified; it stays unlocked for STEP_UP_TTL_MS or until it ends. */
async function recordStepUp(admin, { userId, claims, method, now = Date.now() }) {
  const sessionId = claims && claims.session_id;
  if (!sessionId) throw new Error('The session has no id');
  const verifiedAt = new Date(now).toISOString();
  const { error } = await admin.from('account_step_ups')
    .upsert({ session_id: sessionId, user_id: userId, method, verified_at: verifiedAt }, { onConflict: 'session_id' });
  if (error) throw error;
  return { unlocked: true, reason: 'verified', unlockedUntil: new Date(now + STEP_UP_TTL_MS).toISOString() };
}

/**
 * Checks the account password on a client that keeps no session, then ends
 * the session that check created, so it leaves nothing behind.
 */
async function passwordMatches(createAnonClient, admin, { email, password, userId }) {
  let client;
  try { client = createAnonClient(); } catch { return { ok: false, unavailable: true }; }
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data || !data.user || data.user.id !== userId) return { ok: false };
  if (data.session && data.session.access_token) {
    const { error: signOutError } = await admin.auth.admin.signOut(data.session.access_token, 'local');
    if (signOutError) console.error('Could not end the password-check session:', signOutError.message);
  }
  return { ok: true };
}

/** Wrong passwords: at most MAX_ATTEMPTS per account per WINDOW_MS (in memory, per server). */
function createAttemptLimiter({ maxAttempts = 5, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const failures = new Map();
  const recent = (userId) => (failures.get(userId) || []).filter((at) => now() - at < windowMs);
  return {
    blocked: (userId) => recent(userId).length >= maxAttempts,
    fail(userId) { failures.set(userId, [...recent(userId), now()]); },
    reset(userId) { failures.delete(userId); },
    prune() { for (const userId of failures.keys()) if (!recent(userId).length) failures.delete(userId); },
  };
}

module.exports = {
  FRESH_SIGN_IN_MS,
  STEP_UP_TTL_MS,
  verifiedTokenClaims,
  sessionSignedInAt,
  securityStatus,
  recordStepUp,
  passwordMatches,
  createAttemptLimiter,
};
