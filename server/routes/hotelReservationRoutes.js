const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { createNotification } = require('../lib/notifications');
const { ValidationError, assertAllowedKeys, text, uuid, number } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

const router = express.Router();

async function authenticatedUser(req, res, requiredRole) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Missing access token' }); return null; }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) { res.status(401).json({ error: 'Invalid or expired session' }); return null; }
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles').select('id,role,full_name,phone').eq('id', user.id).maybeSingle();
  if (profileError || !profile || (requiredRole && profile.role !== requiredRole)) {
    res.status(403).json({ error: requiredRole === 'host' ? 'Host access required' : 'Client access required' });
    return null;
  }
  if (await rejectSuspendedActivity(res, user.id)) return null;
  return { user, profile };
}

function openingWindow(value) {
  const match = String(value || '').match(/^\s*(\d{1,2}):(\d{2})\s*(am|pm)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(am|pm)\s*$/i);
  if (!match) return null;
  const minutes = (hour, minute, period) => {
    const h = Number(hour); const m = Number(minute);
    if (h < 1 || h > 12 || m > 59) return null;
    return ((h % 12) + (/pm/i.test(period) ? 12 : 0)) * 60 + m;
  };
  const start = minutes(match[1], match[2], match[3]);
  const end = minutes(match[4], match[5], match[6]);
  return start === null || end === null || start === end ? null : { start, end };
}

function timeMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function withinOpeningHours(time, window) {
  if (window.start < window.end) return time >= window.start && time <= window.end;
  return time >= window.start || time <= window.end; // overnight dining service
}

router.put('/listings/:id/dining-config', async (req, res) => {
  const auth = await authenticatedUser(req, res, 'host');
  if (!auth) return;
  try {
    uuid(req.params.id, 'listing id');
    assertAllowedKeys(req.body, ['restaurant_name', 'caption', 'location_text', 'opening_hours', 'tables_available']);
    const openingHours = text(req.body.opening_hours, 'opening_hours', { max: 100 });
    if (!openingWindow(openingHours)) throw new ValidationError('opening_hours must look like 9:00 AM – 8:00 PM');
    const config = {
      listing_id: req.params.id,
      restaurant_name: text(req.body.restaurant_name, 'restaurant_name', { max: 300 }),
      caption: text(req.body.caption, 'caption', { max: 500 }),
      location_text: text(req.body.location_text, 'location_text', { max: 300 }),
      opening_hours: openingHours,
      tables_available: number(req.body.tables_available, 'tables_available', { integer: true, min: 1, max: 1000 }),
      updated_at: new Date().toISOString(),
    };
    const { data: listing, error: listingError } = await supabaseAdmin.from('listings')
      .select('id,host_id,category,supports_table_reservation').eq('id', req.params.id).maybeSingle();
    if (listingError || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.host_id !== auth.user.id || listing.category !== 'hotel' || !listing.supports_table_reservation) {
      return res.status(403).json({ error: 'This listing does not support table reservations' });
    }
    const { data, error } = await supabaseAdmin.from('hotel_dining_configs').upsert(config, { onConflict: 'listing_id' }).select().single();
    if (error) throw error;
    return res.json({ diningConfig: data });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Dining configuration save failed:', error);
    return res.status(500).json({ error: 'Unable to save dining configuration' });
  }
});

router.get('/listings/:id/dining-config', async (req, res) => {
  try { uuid(req.params.id, 'listing id'); } catch { return res.status(400).json({ error: 'Invalid listing id' }); }
  const { data, error } = await supabaseAdmin.from('hotel_dining_configs').select('*').eq('listing_id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to load dining configuration' });
  return res.json({ diningConfig: data || null });
});

router.post('/table-reservations', async (req, res) => {
  const auth = await authenticatedUser(req, res, 'client');
  if (!auth) return;
  try {
    assertAllowedKeys(req.body, ['listing_id', 'phone', 'guest_count', 'table_count', 'requested_date', 'requested_time', 'special_occasion', 'occasion_details']);
    const listingId = uuid(req.body.listing_id, 'listing_id');
    const guestCount = number(req.body.guest_count, 'guest_count', { integer: true, min: 1, max: 1000 });
    const tableCount = number(req.body.table_count, 'table_count', { integer: true, min: 1, max: 1000 });
    const requestedDate = text(req.body.requested_date, 'requested_date', { max: 10 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || Number.isNaN(new Date(`${requestedDate}T12:00:00`).getTime())) throw new ValidationError('requested_date is invalid');
    if (requestedDate < new Date().toISOString().slice(0, 10)) throw new ValidationError('requested_date cannot be in the past');
    const requestedTime = text(req.body.requested_time, 'requested_time', { max: 5 });
    const minutes = timeMinutes(requestedTime);
    if (minutes === null) throw new ValidationError('requested_time is invalid');
    const suppliedPhone = text(req.body.phone, 'phone', { required: false, max: 50 });
    const phone = String(auth.profile.phone || suppliedPhone || '').trim();
    if (!phone) throw new ValidationError('A phone number is required for a table reservation');
    const specialOccasion = req.body.special_occasion === true;
    if (req.body.special_occasion !== true && req.body.special_occasion !== false) throw new ValidationError('special_occasion is invalid');
    const occasionDetails = specialOccasion ? text(req.body.occasion_details, 'occasion_details', { max: 500 }) : null;

    const { data: listing, error: listingError } = await supabaseAdmin.from('listings')
      .select('id,title,host_id,category,supports_table_reservation').eq('id', listingId).maybeSingle();
    if (listingError || !listing) return res.status(404).json({ error: 'Hotel listing not found' });
    if (listing.category !== 'hotel' || !listing.supports_table_reservation) return res.status(409).json({ error: 'This hotel does not accept table reservations' });
    const { data: config, error: configError } = await supabaseAdmin.from('hotel_dining_configs').select('*').eq('listing_id', listingId).maybeSingle();
    if (configError || !config) return res.status(409).json({ error: 'This hotel has not configured table reservations yet' });
    if (tableCount > config.tables_available) return res.status(400).json({ error: `This hotel accepts up to ${config.tables_available} tables per request` });
    if (!withinOpeningHours(minutes, openingWindow(config.opening_hours))) return res.status(400).json({ error: `Please choose a time within ${config.opening_hours}` });

    if (!auth.profile.phone && suppliedPhone) await supabaseAdmin.from('profiles').update({ phone }).eq('id', auth.user.id);
    const payload = {
      listing_id: listing.id, host_id: listing.host_id, client_id: auth.user.id,
      client_name: auth.profile.full_name || 'VaRoom guest', client_phone: phone,
      guest_count: guestCount, table_count: tableCount, requested_date: requestedDate,
      requested_time: requestedTime, special_occasion: specialOccasion, occasion_details: occasionDetails,
      restaurant_name: config.restaurant_name, listing_title: listing.title,
    };
    const { data: reservation, error } = await supabaseAdmin.from('table_reservations').insert(payload).select().single();
    if (error) throw error;
    try {
      await createNotification({
        recipientUserId: listing.host_id, actorUserId: auth.user.id, type: 'table_reservation',
        title: 'New Table Reservation',
        message: `${payload.client_name} requested ${tableCount} table${tableCount === 1 ? '' : 's'} for ${guestCount} guest${guestCount === 1 ? '' : 's'} on ${requestedDate} at ${requestedTime}. Phone: ${phone}.`,
        relatedEntityType: 'table_reservation', relatedEntityId: reservation.id,
        metadata: { table_reservation_id: reservation.id, listing_id: listing.id, listing_name: listing.title, restaurant_name: config.restaurant_name, client_name: payload.client_name, client_phone: phone, guest_count: guestCount, table_count: tableCount, requested_date: requestedDate, requested_time: requestedTime, special_occasion: specialOccasion, occasion_details: occasionDetails },
        eventKey: `table-reservation:${reservation.id}`,
      });
    } catch (notificationError) {
      // A persisted request remains actionable in the host reservations area;
      // never mislead a client into resubmitting it because notification
      // delivery had a transient failure.
      console.error('Table reservation notification failed:', notificationError);
    }
    return res.status(201).json({ reservation });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Table reservation creation failed:', error);
    return res.status(500).json({ error: 'Unable to submit table reservation' });
  }
});

router.get('/host/table-reservations', async (req, res) => {
  const auth = await authenticatedUser(req, res, 'host');
  if (!auth) return;
  const { data, error } = await supabaseAdmin.from('table_reservations').select('*').eq('host_id', auth.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Unable to load table reservations' });
  return res.json({ reservations: data || [] });
});

module.exports = router;
