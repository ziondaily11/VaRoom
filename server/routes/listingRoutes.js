const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const {
  ValidationError, assertAllowedKeys, text, uuid, number, enumValue,
} = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

const router = express.Router();
const STATUSES = new Set(['available', 'booked', 'unavailable', 'paused']);
const CATEGORIES = ['airbnb', 'hotel', 'venue', 'office', 'shop', 'property'];

function normalizeNiches(niches) {
  if (!Array.isArray(niches) || niches.length !== 2) {
    throw new ValidationError('Hosts must choose exactly two posting niches');
  }
  const normalized = niches.map((niche) => enumValue(niche, 'niche', CATEGORIES));
  if (new Set(normalized).size !== 2) {
    throw new ValidationError('Choose two different posting niches');
  }
  return normalized;
}

async function hostNiches(userId) {
  const { data, error } = await supabaseAdmin.from('profiles')
    .select('listing_categories').eq('id', userId).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.listing_categories) ? data.listing_categories : [];
}

async function authenticatedHost(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return null;
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError || !profile || profile.role !== 'host') {
    res.status(403).json({ error: 'Host access required' });
    return null;
  }
  if (await rejectSuspendedActivity(res, user.id)) return null;
  return user;
}

async function ownedListing(id, userId, res) {
  const { data, error } = await supabaseAdmin
    .from('listings').select('id,host_id,title,description,category,location_text')
    .eq('id', id).maybeSingle();
  if (error) {
    console.error('Listing ownership lookup failed:', error.message);
    res.status(500).json({ error: 'Unable to verify listing ownership' });
    return null;
  }
  if (!data) {
    res.status(404).json({ error: 'Listing not found' });
    return null;
  }
  if (data.host_id !== userId) {
    res.status(403).json({ error: 'You can only manage your own listings' });
    return null;
  }
  return data;
}

router.patch('/listings/:id/status', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  try {
    assertAllowedKeys(req.body, ['status']);
    uuid(req.params.id, 'listing id');
    enumValue(req.body.status, 'status', [...STATUSES]);
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
    throw error;
  }
  if (!(await ownedListing(req.params.id, user.id, res))) return;
  const { data, error } = await supabaseAdmin.from('listings')
    .update({ availability_status: req.body.status }).eq('id', req.params.id)
    .select('id,availability_status').single();
  if (error) {
    if (error.message && error.message.includes('availability_status')) {
      return res.status(503).json({ error: 'Listing status controls are not enabled yet. Apply the listing-controls migration.' });
    }
    return res.status(500).json({ error: 'Unable to update listing status' });
  }
  return res.json({ listing: data });
});

// This is intentionally separate from profile edits: it gives existing hosts
// with legacy multi-category profiles a deliberate, reversible choice before
// the new posting scope becomes active.
router.put('/host/niches', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  let niches;
  try {
    assertAllowedKeys(req.body, ['niches']);
    niches = normalizeNiches(req.body.niches);
  } catch (error) {
    if (error instanceof ValidationError) return res.status(422).json({ error: error.message, code: 'HOST_NICHES_INVALID' });
    throw error;
  }
  const { data, error } = await supabaseAdmin.from('profiles').update({ listing_categories: niches })
    .eq('id', user.id).select('listing_categories').single();
  if (error) return res.status(500).json({ error: 'Unable to save posting niches' });
  return res.json({ niches: data.listing_categories });
});

router.post('/listings', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  let category;
  let payload;
  try {
    assertAllowedKeys(req.body, ['title', 'description', 'category', 'location_text', 'latitude', 'longitude', 'place_id', 'formatted_address', 'neighborhood', 'city', 'country']);
    category = enumValue(req.body.category, 'category', CATEGORIES);
    const niches = normalizeNiches(await hostNiches(user.id));
    if (!niches.includes(category)) {
      return res.status(422).json({ error: 'This category is outside your two approved posting niches', code: 'HOST_NICHE_NOT_ALLOWED' });
    }
    payload = {
      host_id: user.id,
      title: text(req.body.title, 'title', { max: 300 }),
      description: text(req.body.description, 'description', { max: 10000 }),
      category,
      location_text: text(req.body.location_text, 'location_text', { max: 300 }),
      verified: false,
    };
    ['place_id', 'formatted_address', 'neighborhood', 'city', 'country'].forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = text(req.body[field], field, { required: false, max: 300 }) || null;
    });
    if (req.body.latitude !== undefined) payload.latitude = number(req.body.latitude, 'latitude', { min: -90, max: 90 });
    if (req.body.longitude !== undefined) payload.longitude = number(req.body.longitude, 'longitude', { min: -180, max: 180 });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message, code: 'INVALID_LISTING' });
    console.error('Host niche lookup failed:', error.message);
    return res.status(500).json({ error: 'Unable to verify posting niches' });
  }
  const { data, error } = await supabaseAdmin.from('listings').insert(payload).select().single();
  if (error) {
    if (error.code === 'P0001' || /niche/i.test(error.message || '')) {
      return res.status(422).json({ error: 'This category is outside your two approved posting niches', code: 'HOST_NICHE_NOT_ALLOWED' });
    }
    return res.status(500).json({ error: 'Unable to create listing' });
  }
  return res.status(201).json({ listing: data });
});

router.patch('/listings/:id', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  try {
    uuid(req.params.id, 'listing id');
    assertAllowedKeys(req.body, ['title', 'description', 'category', 'location_text', 'price_amount', 'price_unit']);
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
    throw error;
  }
  if (!(await ownedListing(req.params.id, user.id, res))) return;
  const allowed = ['title', 'description', 'category', 'location_text'];
  const update = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      try {
        update[key] = text(req.body[key], key, { max: key === 'description' ? 10000 : 300 });
        if (key === 'category') {
          update[key] = enumValue(update[key], key, CATEGORIES);
          const niches = normalizeNiches(await hostNiches(user.id));
          if (!niches.includes(update[key])) {
            return res.status(422).json({ error: 'This category is outside your two approved posting niches', code: 'HOST_NICHE_NOT_ALLOWED' });
          }
        }
      } catch (error) {
        if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
        throw error;
      }
    }
  }
  if (!Object.keys(update).length) return res.status(400).json({ error: 'No listing fields supplied' });
  const { data, error } = await supabaseAdmin.from('listings').update(update)
    .eq('id', req.params.id).select('id,title,description,category,location_text').single();
  if (error) return res.status(500).json({ error: 'Unable to update listing' });
  if (req.body.price_amount !== undefined || req.body.price_unit !== undefined) {
    const detailUpdate = {};
    try {
      if (req.body.price_amount !== undefined) detailUpdate.price_amount = number(req.body.price_amount, 'price_amount', { min: 0, max: 100000000 });
      if (req.body.price_unit !== undefined) detailUpdate.price_unit = enumValue(req.body.price_unit, 'price_unit', ['hour', 'day', 'night', 'month']);
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
      throw error;
    }
    const { error: detailError } = await supabaseAdmin.from('listing_booking_details')
      .update(detailUpdate).eq('listing_id', req.params.id);
    if (detailError) return res.status(500).json({ error: 'Unable to update listing details' });
  }
  return res.json({ listing: data });
});

router.get('/listings/:id/bookings', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  if (!(await ownedListing(req.params.id, user.id, res))) return;
  const { data, error } = await supabaseAdmin.from('bookings')
    .select('id,status,start_date,end_date,total_price,client_id,client:profiles!bookings_client_id_fkey(full_name)')
    .eq('listing_id', req.params.id).order('start_date', { ascending: false });
  if (error) return res.status(500).json({ error: 'Unable to load bookings' });
  return res.json({ bookings: data || [] });
});

router.get('/listings/:id/analytics', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  if (!(await ownedListing(req.params.id, user.id, res))) return;
  const { count, error } = await supabaseAdmin.from('bookings')
    .select('id', { count: 'exact', head: true }).eq('listing_id', req.params.id);
  if (error) return res.status(500).json({ error: 'Unable to load analytics' });
  return res.json({ bookings: count || 0 });
});

router.post('/listings/:id/duplicate', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  const listing = await ownedListing(req.params.id, user.id, res);
  if (!listing) return;
  try {
    if (!normalizeNiches(await hostNiches(user.id)).includes(listing.category)) {
      return res.status(422).json({ error: 'This category is outside your two approved posting niches', code: 'HOST_NICHE_NOT_ALLOWED' });
    }
  } catch (error) {
    return res.status(422).json({ error: error.message || 'Choose your two posting niches first', code: 'HOST_NICHES_INVALID' });
  }
  const { data: copy, error } = await supabaseAdmin.from('listings').insert({
    host_id: user.id,
    title: `${listing.title} (Copy)`,
    description: listing.description,
    category: listing.category,
    location_text: listing.location_text,
  }).select('id').single();
  if (error) return res.status(500).json({ error: 'Unable to duplicate listing' });
  const { data: details } = await supabaseAdmin.from('listing_booking_details')
    .select('*').eq('listing_id', listing.id).maybeSingle();
  if (details) {
    delete details.id;
    details.listing_id = copy.id;
    await supabaseAdmin.from('listing_booking_details').insert(details);
  }
  return res.status(201).json({ listing: copy });
});

router.delete('/listings/:id', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  const listing = await ownedListing(req.params.id, user.id, res);
  if (!listing) return;
  const { data: photos } = await supabaseAdmin.from('listing_photos')
    .select('storage_path').eq('listing_id', req.params.id);
  await supabaseAdmin.from('availability').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('bookmarks').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('listing_photos').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('listing_booking_details').delete().eq('listing_id', req.params.id);
  const { error } = await supabaseAdmin.from('listings').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Unable to delete listing' });
  const paths = (photos || []).map((photo) => photo.storage_path).filter(Boolean);
  if (paths.length) await supabaseAdmin.storage.from('listing-photos').remove(paths);
  return res.json({ success: true });
});

module.exports = router;
