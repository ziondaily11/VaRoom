// VaRoom Google Maps Integration, Phase 1: backend access levels.
//
// Per the Google Maps Flow spec (section 14 / 16): the backend — not the
// frontend — decides whether a requesting user receives general or exact
// location data. Nothing in client/ should ever query listings.latitude /
// listings.longitude / bookings.location_snapshot directly from Supabase;
// all location reads for a listing or booking must go through here.
//
// Access levels:
//   1  Public            — neighborhood, city, approximate status only
//   2  Interested client — same as Level 1 for now. Nothing in the app
//                          today defines a distinct "interested" state
//                          (e.g. a saved/favourited listing), so this is
//                          intentionally not implemented as anything more
//                          than Level 1 until that concept exists.
//   3  Approved booking  — exact coordinates + address, taken from the
//                          booking's location_snapshot (not the live
//                          listing), so a later host edit never moves an
//                          already-approved booking's destination.
//   4  Host              — full listing location record. (There is no
//                          admin-role concept in profiles yet, so Level 4
//                          currently means "is this listing's host".)

const APPROVED_BOOKING_STATUS = 'approved';

const LISTING_LOCATION_COLUMNS =
  'id, host_id, latitude, longitude, place_id, formatted_address, neighborhood, city, country, location_status';

/**
 * Returns the location data a given user is authorized to see for a listing.
 * requestingUserId may be null (anonymous / not logged in) — treated as
 * Level 1 Public.
 */
async function getListingLocation(supabaseAdmin, { listingId, requestingUserId }) {
  const { data: listing, error } = await supabaseAdmin
    .from('listings')
    .select(LISTING_LOCATION_COLUMNS)
    .eq('id', listingId)
    .single();

  if (error || !listing) {
    return { error: 'Listing not found' };
  }

  // Level 4: the listing's own host.
  if (requestingUserId && requestingUserId === listing.host_id) {
    return { level: 4, location: fullListingLocation(listing) };
  }

  // Level 3: requesting user has an approved booking on this listing.
  if (requestingUserId) {
    const { data: approvedBooking } = await supabaseAdmin
      .from('bookings')
      .select('id, location_snapshot')
      .eq('listing_id', listingId)
      .eq('client_id', requestingUserId)
      .eq('status', APPROVED_BOOKING_STATUS)
      .not('location_snapshot', 'is', null)
      .limit(1)
      .maybeSingle();

    if (approvedBooking && approvedBooking.location_snapshot) {
      return { level: 3, location: approvedBooking.location_snapshot };
    }
  }

  // Level 1 / 2 (currently identical): general area only, never coordinates.
  return { level: 1, location: publicListingLocation(listing) };
}

/**
 * Returns the location data a given user is authorized to see for a
 * specific booking. Only the booking's client or the listing's host may
 * call this — anyone else gets an authorization error, not a downgraded
 * response, since a booking (unlike a public listing) isn't meant to be
 * viewable by arbitrary users at all.
 */
async function getBookingLocation(supabaseAdmin, { bookingId, requestingUserId }) {
  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .select('id, client_id, listing_id, status, location_snapshot, listing:listings(host_id, neighborhood, city, country, location_status)')
    .eq('id', bookingId)
    .single();

  if (error || !booking) {
    return { error: 'Booking not found' };
  }

  const isClient = requestingUserId === booking.client_id;
  const isHost = requestingUserId === booking.listing?.host_id;

  if (!isClient && !isHost) {
    return { error: 'Not authorized to view this booking' };
  }

  if (isHost) {
    // Host always gets full listing location regardless of booking status.
    const { data: listing } = await supabaseAdmin
      .from('listings')
      .select(LISTING_LOCATION_COLUMNS)
      .eq('id', booking.listing_id)
      .single();
    return { level: 4, location: fullListingLocation(listing) };
  }

  // Client: exact location only once approved and snapshotted (spec
  // section 9/10 — pending keeps exact location protected).
  if (booking.status === APPROVED_BOOKING_STATUS && booking.location_snapshot) {
    return { level: 3, location: booking.location_snapshot };
  }

  return {
    level: 1,
    location: publicListingLocation(booking.listing || {}),
    pendingApproval: booking.status === 'pending',
  };
}

/**
 * NOTE: normal snapshotting happens automatically via the
 * varoom_snapshot_booking_location_trigger database trigger (see
 * server/migrations/20260825_000001_location.sql), since booking approval
 * currently happens as a direct client-side write with no server endpoint
 * to hook into. This function is a manual backfill/repair utility — e.g.
 * to snapshot a booking that was approved before its listing's location
 * was confirmed, once the host finishes setting the location later. It is
 * not currently called from anywhere automatically.
 */
async function snapshotBookingLocationOnApproval(supabaseAdmin, bookingId) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('id, listing_id, location_snapshot')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return { error: 'Booking not found' };
  }
  if (booking.location_snapshot) {
    return { alreadySnapshotted: true };
  }

  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select(LISTING_LOCATION_COLUMNS)
    .eq('id', booking.listing_id)
    .single();

  if (listingError || !listing || listing.location_status !== 'confirmed') {
    return { error: 'Listing has no confirmed location to snapshot' };
  }

  const snapshot = {
    ...fullListingLocation(listing),
    snapshotted_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin
    .from('bookings')
    .update({ location_snapshot: snapshot })
    .eq('id', bookingId);

  if (updateError) {
    return { error: updateError.message };
  }
  return { snapshot };
}

function publicListingLocation(listing) {
  return {
    neighborhood: listing.neighborhood || null,
    city: listing.city || null,
    country: listing.country || null,
    location_status: listing.location_status || 'unset',
  };
}

function fullListingLocation(listing) {
  return {
    latitude: listing.latitude,
    longitude: listing.longitude,
    place_id: listing.place_id,
    formatted_address: listing.formatted_address,
    neighborhood: listing.neighborhood,
    city: listing.city,
    country: listing.country,
    location_status: listing.location_status,
  };
}

module.exports = {
  getListingLocation,
  getBookingLocation,
  snapshotBookingLocationOnApproval,
};
