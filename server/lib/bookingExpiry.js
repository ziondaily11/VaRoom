// Booking requests the host never answered expire after 48 hours (the guest is
// told so when they book). Guests can't change their requests' status, so the
// server does it; hourly, and a missed run is caught up by the next one.

const PENDING_EXPIRY_MS = 48 * 60 * 60 * 1000;

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

module.exports = { PENDING_EXPIRY_MS, expireStaleRequests };
