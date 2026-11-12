// Booking requests the host never answered expire after 48 hours (the guest is
// told so when they book). Guests can't change their requests' status, so the
// server does it; hourly, and a missed run is caught up by the next one.

const { createNotification } = require('./notifications');

const PENDING_EXPIRY_MS = 48 * 60 * 60 * 1000;
const REMINDER_BEFORE_MS = 6 * 60 * 60 * 1000;

async function expireStaleRequests(supabase, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'expired', responded_at: nowIso })
    .eq('status', 'pending')
    .lt('created_at', new Date(now - PENDING_EXPIRY_MS).toISOString())
    .select('id');
  if (error) throw error;
  return (data || []).map((row) => row.id);
}

/** Hosts hear about a request about 6 hours before it expires (once per request). */
async function remindExpiringRequests(supabase, now = Date.now(), create = createNotification) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id,host_id,listing:listings(title)')
    .eq('status', 'pending')
    .lt('created_at', new Date(now - PENDING_EXPIRY_MS + REMINDER_BEFORE_MS).toISOString())
    .gte('created_at', new Date(now - PENDING_EXPIRY_MS).toISOString());
  if (error) throw error;
  for (const booking of data || []) {
    const title = (booking.listing && booking.listing.title) || 'this listing';
    await create({
      supabase,
      recipientUserId: booking.host_id,
      type: 'booking_expiring',
      title: 'Booking request expiring soon',
      message: `A booking request for "${title}" expires in about 6 hours. Approve or decline it in Bookings.`,
      relatedEntityType: 'booking',
      relatedEntityId: booking.id,
      bookingId: booking.id,
      eventKey: `booking-expiring:${booking.id}`,
    });
  }
  return (data || []).length;
}

module.exports = { PENDING_EXPIRY_MS, expireStaleRequests, remindExpiringRequests };
