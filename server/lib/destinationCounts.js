'use strict';

// "Popular destinations" on Client Home: how many listings each city has.
//
// Every client sees the same numbers (counts of public listings only), so
// they are worked out here once and shared, instead of each browser running
// five `count: exact` text-match scans of the listings table through the
// row-level policy. The counts follow that policy's rule for what anyone may
// see: published, active (moderation) and the host not deactivated
// (listings_published_public_select, migration 20261105_000060). Like the
// old per-browser query, availability is not filtered (booked places count).
//
// The answer is kept in memory for `ttlMs`; after that it is still served
// while one background refresh runs. Simultaneous requests share a refresh,
// and a failed refresh keeps the last good counts.

// Client Home's destination cards (client/pages/client-home.tsx). Fixed here
// so the endpoint cannot be used to run arbitrary text searches.
const DESTINATION_CITIES = Object.freeze(['Nairobi', 'Mombasa', 'Diani', 'Kisumu', 'Nakuru']);
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * Hosts whose listings are hidden: deactivated accounts. The policy's
 * varoom_account_active() is "no deactivated profile", so a listing whose
 * host has no profile row still counts; excluding these ids (rather than
 * joining profiles) keeps exactly that rule. Read once per refresh.
 */
async function deactivatedHostIds(supabase) {
  const { data, error } = await supabase.from('profiles').select('id').not('deactivated_at', 'is', null);
  if (error) throw error;
  return (data || []).map((profile) => profile.id).filter((id) => typeof id === 'string' && id);
}

/** The number of public listings whose location mentions `city`. */
async function countCity(supabase, city, hiddenHostIds = []) {
  let query = supabase.from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('publication_state', 'published')
    .eq('moderation_status', 'active')
    .ilike('location_text', `%${city}%`);
  if (hiddenHostIds.length) query = query.not('host_id', 'in', `(${hiddenHostIds.join(',')})`);
  const { count, error } = await query;
  if (error) throw error;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid listing count for ${city}`);
  return count;
}

function createDestinationCounts({ supabase, ttlMs = DEFAULT_TTL_MS, now = () => Date.now(), cities = DESTINATION_CITIES }) {
  let value = null; // { counts, updatedAt }
  let pending = null;

  function refresh() {
    if (!pending) {
      pending = deactivatedHostIds(supabase)
        .then((hidden) => Promise.all(cities.map(async (city) => [city, await countCity(supabase, city, hidden)])))
        .then((entries) => {
          value = { counts: Object.fromEntries(entries), updatedAt: now() };
          return value;
        })
        .finally(() => { pending = null; });
    }
    return pending;
  }

  /** The counts: from memory when fresh; stale ones are served while a refresh runs. */
  async function get() {
    if (value && now() - value.updatedAt < ttlMs) return value;
    if (value) {
      refresh().catch((error) => console.warn('Destination counts refresh failed; serving the previous counts:', error.message || error));
      return value;
    }
    return refresh();
  }

  return { get };
}

module.exports = { DESTINATION_CITIES, DEFAULT_TTL_MS, countCity, deactivatedHostIds, createDestinationCounts };
