'use strict';

const PRIVATE_STATES = new Set(['draft', 'payment_pending', 'failed']);
const TERMINAL_STATES = new Set(['discarded', 'cleanup_pending', 'expired']);

function decideListingMediaAccess(listing, userId, now = Date.now()) {
  if (!listing) return { allowed: false, reason: 'unavailable' };
  const state = listing.publication_state
    || (listing.availability_status === 'draft' ? 'draft' : 'published');

  if (TERMINAL_STATES.has(state)) return { allowed: false, reason: 'unavailable' };
  if (PRIVATE_STATES.has(state)) {
    const createdAt = new Date(listing.created_at).getTime();
    if (!Number.isFinite(createdAt) || now >= createdAt + 5 * 24 * 60 * 60 * 1000) {
      return { allowed: false, reason: 'unavailable' };
    }
    if (!userId) return { allowed: false, reason: 'authentication_required' };
    if (listing.host_id !== userId) return { allowed: false, reason: 'forbidden' };
    return { allowed: true, owner: true, published: false };
  }

  if (state !== 'published') return { allowed: false, reason: 'unavailable' };
  return { allowed: true, owner: Boolean(userId && listing.host_id === userId), published: true };
}

module.exports = { decideListingMediaAccess };
