'use strict';

// How long an unpaid (unpublished) listing draft keeps its media and details:
// the Terms of Service (Plans & Billing, "Failed payments") say 7 days. The
// database uses the same number (migration 20261119_000074_draft_retention_7_days.sql);
// server/test/draftRetention.test.js keeps the two equal.
const DRAFT_RETENTION_DAYS = 7;
const DRAFT_RETENTION_MS = DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

module.exports = { DRAFT_RETENTION_DAYS, DRAFT_RETENTION_MS };

const CLEARED_STATES = new Set(['discarded', 'cleanup_pending', 'expired']);
const UNPUBLISHED_STATES = new Set(['draft', 'payment_pending', 'failed']);

/**
 * Whether a saved draft still belongs on the host's profile. It does not once
 * its listing is discarded, being cleaned up or expired, or once it is past
 * the retention time (the cleanup job may not have run yet). `listing` is the
 * linked listing row ({ publication_state, created_at }) or null.
 */
function draftStillKept(draft, listing, now = Date.now()) {
  const expired = (createdAt) => {
    const time = new Date(createdAt).getTime();
    return !Number.isFinite(time) || now >= time + DRAFT_RETENTION_MS;
  };
  if (!draft.listing_id) return !expired(draft.created_at);
  if (!listing) return true; // Not readable here: keep it rather than hide a host's work.
  if (CLEARED_STATES.has(listing.publication_state)) return false;
  if (UNPUBLISHED_STATES.has(listing.publication_state)) return !expired(listing.created_at);
  return true; // A published listing's edit draft never expires.
}

module.exports.draftStillKept = draftStillKept;
module.exports.UNPUBLISHED_STATES = UNPUBLISHED_STATES;
