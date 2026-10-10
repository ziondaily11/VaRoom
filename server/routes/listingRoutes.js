const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const {
  ValidationError, assertAllowedKeys, text, uuid, number, enumValue,
} = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');

const router = express.Router();
const STATUSES = new Set(['available', 'booked', 'unavailable', 'paused']);
const CATEGORIES = ['airbnb', 'hotel', 'venue', 'office', 'shop', 'property'];

// Discover asks for this only for cards entering the viewport.  Returning the
// first ready video id in one bounded query avoids one `/media` lookup per
// listing; playback URLs remain protected by the existing playback route.
router.get('/discover/video-media', async (req, res) => {
  const rawIds = String(req.query.listingIds || '').split(',').filter(Boolean);
  if (!rawIds.length || rawIds.length > 24) return res.status(400).json({ error: 'Invalid listing ids' });
  try {
    rawIds.forEach((id) => uuid(id, 'listing id'));
  } catch (error) {
    return res.status(400).json({ error: 'Invalid listing ids' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('property_media')
      .select('id,property_id,sort_order')
      .in('property_id', rawIds)
      .eq('media_type', 'video')
      .eq('visibility', 'public')
      .eq('status', 'ready')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;

    const videoMedia = {};
    (data || []).forEach((media) => {
      if (!videoMedia[media.property_id]) videoMedia[media.property_id] = media.id;
    });
    return res.json({ videoMedia });
  } catch (error) {
    console.error('Discover video media lookup failed:', error);
    return res.status(500).json({ error: 'Unable to load video media' });
  }
});

function normalizeNiches(niches) {
  if (!Array.isArray(niches) || niches.length !== 1) {
    throw new ValidationError('Hosts must choose exactly one posting niche');
  }
  const normalized = niches.map((niche) => enumValue(niche, 'niche', CATEGORIES));
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
    .from('listings').select('id,host_id,title,description,property_description,category,location_text,supports_stay,supports_table_reservation,listing_purpose,availability_status,paid_listing_until')
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
  const listing = await ownedListing(req.params.id, user.id, res);
  if (!listing) return;
  if (req.body.status === 'available' && ['property', 'shop', 'office'].includes(listing.category)) {
    const feeIsCurrent = listing.paid_listing_until && new Date(listing.paid_listing_until).getTime() > Date.now();
    const planIds = listing.category === 'property'
      ? ['property_basic', 'property_pro', 'property_premium']
      : ['shops_basic', 'shops_pro', 'shops_premium'];
    const { data: subscription } = await supabaseAdmin.from('host_subscriptions').select('id')
      .eq('host_id', user.id).eq('status', 'active').in('plan_id', planIds).limit(1).maybeSingle();
    if (!feeIsCurrent && !subscription) return res.status(402).json({ error: 'A verified listing payment or active niche subscription is required before activation', code: 'LISTING_PAYMENT_REQUIRED' });
  }
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

// This is intentionally separate from profile edits so the posting scope can
// be updated without changing unrelated profile fields.
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
  // New subscription quotas apply only to the opted-in Property and combined
  // Shops & Offices plans. Legacy hospitality plans retain their old behavior.
  const { data: activeSubscription } = await supabaseAdmin.from('host_subscriptions')
    .select('plan_id,status,current_period_end,billing_plans(features)')
    .eq('host_id', user.id).eq('status', 'active').in('plan_id', [
      'property_basic', 'property_pro', 'property_premium', 'shops_basic', 'shops_pro', 'shops_premium'
    ]).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const subscriptionIsCurrent = activeSubscription && (!activeSubscription.current_period_end || new Date(activeSubscription.current_period_end).getTime() > Date.now());
  if (subscriptionIsCurrent) {
    const featureValue = activeSubscription.billing_plans && activeSubscription.billing_plans.features;
    const limit = Number(featureValue && featureValue.max_active_listings);
    if (Number.isInteger(limit) && limit > 0) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('listing_categories').eq('id', user.id).maybeSingle();
      const chosen = Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] : null;
      const query = supabaseAdmin.from('listings').select('id', { count: 'exact', head: true })
        .eq('host_id', user.id).eq('availability_status', 'available')
        .or('paid_listing_until.is.null,paid_listing_until.gt.' + new Date().toISOString());
      if (chosen === 'property') query.eq('category', 'property');
      else query.in('category', ['shop', 'office']);
      const { count, error } = await query;
      if (error) return res.status(503).json({ error: 'Unable to validate your active listing allowance' });
      if ((count || 0) >= limit) return res.status(409).json({ error: `Your plan allows up to ${limit} active listings. Upgrade your plan or deactivate a listing first.`, code: 'LISTING_LIMIT_REACHED' });
    }
  }
  let category;
  let payload;
  try {
    assertAllowedKeys(req.body, ['title', 'description', 'property_description', 'category', 'location_text', 'supports_stay', 'supports_table_reservation', 'latitude', 'longitude', 'place_id', 'formatted_address', 'neighborhood', 'city', 'country', 'listing_purpose']);
    const niches = normalizeNiches(await hostNiches(user.id));
    category = niches[0];
    payload = {
      host_id: user.id,
      title: text(req.body.title, 'title', { max: 300 }),
      // `description` remains the short Discover caption for compatibility
      // with existing listings and card queries.
      description: text(req.body.description, 'description', { max: 10000 }),
      // A dining-only hotel does not have accommodation details. Keep the
      // column optional for that capability while stay and all other listing
      // modes retain the existing required description contract.
      property_description: text(req.body.property_description, 'property_description', {
        required: !(category === 'hotel' && req.body.supports_stay === false),
        max: 10000,
      }) || null,
      category,
      location_text: text(req.body.location_text, 'location_text', { max: 300 }),
      verified: false,
    };
    if (['property', 'shop', 'office'].includes(category)) payload.availability_status = subscriptionIsCurrent ? 'available' : 'paused';
    if (category === 'hotel') {
      const supportsStay = req.body.supports_stay === undefined ? true : req.body.supports_stay;
      const supportsTableReservation = req.body.supports_table_reservation === undefined ? false : req.body.supports_table_reservation;
      if (typeof supportsStay !== 'boolean' || typeof supportsTableReservation !== 'boolean' || (!supportsStay && !supportsTableReservation)) {
        throw new ValidationError('Hotel listings must offer a stay, table reservations, or both');
      }
      payload.supports_stay = supportsStay;
      payload.supports_table_reservation = supportsTableReservation;
    }
    // PROPERTY-ONLY: persist whether this is a rent, sale, or dual-purpose listing.
    // Guarded by category so Hotels, Airbnbs, Offices, Shops, and Event Venues
    // are completely unaffected.
    if (category === 'property' && req.body.listing_purpose !== undefined) {
      const PURPOSES = ['rent', 'sale', 'both'];
      try {
        payload.listing_purpose = enumValue(req.body.listing_purpose, 'listing_purpose', PURPOSES);
      } catch (purposeError) {
        if (purposeError instanceof ValidationError) throw purposeError;
        payload.listing_purpose = null;
      }
    }

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
      return res.status(422).json({ error: 'Listing category must match the host niche', code: 'HOST_NICHE_NOT_ALLOWED' });
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
    assertAllowedKeys(req.body, ['title', 'description', 'property_description', 'category', 'location_text', 'price_amount', 'price_unit', 'supports_stay', 'supports_table_reservation', 'listing_purpose', 'booking_details']);
    if (req.body.booking_details !== undefined) {
      assertAllowedKeys(req.body.booking_details, [
        'price_amount', 'price_unit', 'size_or_type', 'amenities', 'max_guests', 'min_stay_nights',
        'checkin_time', 'checkout_time', 'cleaning_fee', 'cancellation_policy', 'available_from',
        'min_lease_months', 'deposit_amount', 'utilities_included', 'sale_price_amount',
        'sale_price_mode', 'units_available', 'policy_storage_path',
      ]);
    }
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
    throw error;
  }
  const listing = await ownedListing(req.params.id, user.id, res);
  if (!listing) return;
  const allowed = ['title', 'description', 'property_description', 'category', 'location_text'];
  const update = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      try {
        const tableOnlyHotel = listing.category === 'hotel'
          && req.body.supports_stay === false
          && req.body.supports_table_reservation === true;
        update[key] = text(req.body[key], key, {
          required: key !== 'property_description' || !tableOnlyHotel,
          max: ['description', 'property_description'].includes(key) ? 10000 : 300,
        });
        if (key === 'category') {
          update[key] = enumValue(update[key], key, CATEGORIES);
          const niches = normalizeNiches(await hostNiches(user.id));
          if (!niches.includes(update[key])) {
            return res.status(422).json({ error: 'Listing category must match the host niche', code: 'HOST_NICHE_NOT_ALLOWED' });
          }
        }
      } catch (error) {
        if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
        throw error;
      }
    }
  }
  if (req.body.supports_stay !== undefined || req.body.supports_table_reservation !== undefined) {
    const supportsStay = req.body.supports_stay === undefined ? listing.supports_stay : req.body.supports_stay;
    const supportsDining = req.body.supports_table_reservation === undefined
      ? listing.supports_table_reservation : req.body.supports_table_reservation;
    if (listing.category !== 'hotel' || typeof supportsStay !== 'boolean' || typeof supportsDining !== 'boolean' || (!supportsStay && !supportsDining)) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    update.supports_stay = supportsStay;
    update.supports_table_reservation = supportsDining;
  }
  if (req.body.listing_purpose !== undefined) {
    if (listing.category !== 'property') return res.status(400).json({ error: 'Invalid input' });
    try {
      update.listing_purpose = enumValue(req.body.listing_purpose, 'listing_purpose', ['rent', 'sale', 'both']);
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
      throw error;
    }
  }
  const detailUpdate = {};
  try {
    if (req.body.price_amount !== undefined) detailUpdate.price_amount = number(req.body.price_amount, 'price_amount', { min: 0, max: 100000000 });
    if (req.body.price_unit !== undefined) detailUpdate.price_unit = enumValue(req.body.price_unit, 'price_unit', ['hour', 'day', 'night', 'month']);
    const details = req.body.booking_details || {};
    Object.keys(details).forEach((key) => {
      const value = details[key];
      if (['price_amount', 'cleaning_fee', 'deposit_amount', 'sale_price_amount'].includes(key)) {
        detailUpdate[key] = value === null && key !== 'price_amount'
          ? null : number(value, key, { min: 0, max: 100000000 });
      } else if (['max_guests', 'min_stay_nights', 'min_lease_months', 'units_available'].includes(key)) {
        detailUpdate[key] = value === null ? null : number(value, key, { integer: true, min: 1, max: 100000 });
      } else if (key === 'price_unit') {
        detailUpdate[key] = enumValue(value, key, ['hour', 'day', 'night', 'month']);
      } else if (key === 'cancellation_policy') {
        detailUpdate[key] = enumValue(value, key, ['flexible', 'moderate', 'strict']);
      } else if (key === 'sale_price_mode') {
        detailUpdate[key] = value === null ? null : enumValue(value, key, ['starting', 'exact']);
      } else if (key === 'amenities') {
        if (!Array.isArray(value) || value.length > 100) throw new ValidationError('amenities is invalid');
        detailUpdate[key] = value.map((amenity) => text(amenity, 'amenity', { max: 80 }));
      } else if (key === 'utilities_included') {
        if (typeof value !== 'boolean') throw new ValidationError('utilities_included is invalid');
        detailUpdate[key] = value;
      } else if (key === 'checkin_time' || key === 'checkout_time') {
        if (value !== null && !/^\d{2}:\d{2}$/.test(text(value, key, { max: 5 }))) {
          throw new ValidationError(`${key} is invalid`);
        }
        detailUpdate[key] = value;
      } else if (key === 'available_from') {
        if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(text(value, key, { max: 10 }))) {
          throw new ValidationError('available_from is invalid');
        }
        detailUpdate[key] = value;
      } else if (key === 'size_or_type') {
        detailUpdate[key] = value === null ? null : (text(value, key, { required: false, max: 300 }) || null);
      } else if (key === 'policy_storage_path') {
        const path = text(value, key, { max: 500 });
        if (listing.category !== 'property' || !path.startsWith(`${user.id}/${req.params.id}/policy_`)) {
          throw new ValidationError('policy_storage_path is invalid');
        }
        detailUpdate[key] = path;
      }
    });
    if (listing.category !== 'property' && ['sale_price_amount', 'sale_price_mode', 'units_available'].some((key) => Object.prototype.hasOwnProperty.call(detailUpdate, key))) {
      throw new ValidationError('Property details are only valid for property listings');
    }
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
    throw error;
  }
  if (!Object.keys(update).length && !Object.keys(detailUpdate).length) {
    return res.status(400).json({ error: 'No listing fields supplied' });
  }
  let data = listing;
  if (Object.keys(update).length) {
    const { data: updatedListing, error } = await supabaseAdmin.from('listings').update(update)
      .eq('id', req.params.id).select('id,title,description,property_description,category,location_text').single();
    if (error) return res.status(500).json({ error: 'Unable to update listing' });
    data = updatedListing;
  }
  if (Object.keys(detailUpdate).length) {
    const { data: existingDetails, error: lookupError } = await supabaseAdmin.from('listing_booking_details')
      .select('listing_id').eq('listing_id', req.params.id).maybeSingle();
    if (lookupError) return res.status(500).json({ error: 'Unable to load listing details' });
    const detailResult = existingDetails
      ? await supabaseAdmin.from('listing_booking_details').update(detailUpdate).eq('listing_id', req.params.id)
      : await supabaseAdmin.from('listing_booking_details').insert(Object.assign({ listing_id: req.params.id }, detailUpdate));
    if (detailResult.error) return res.status(500).json({ error: 'Unable to update listing details' });
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
      return res.status(422).json({ error: 'Listing category must match the host niche', code: 'HOST_NICHE_NOT_ALLOWED' });
    }
  } catch (error) {
    return res.status(422).json({ error: error.message || 'Choose your posting niche first', code: 'HOST_NICHES_INVALID' });
  }
  const { data: copy, error } = await supabaseAdmin.from('listings').insert({
    host_id: user.id,
    title: `${listing.title} (Copy)`,
    description: listing.description,
    property_description: listing.property_description,
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

  const [{ data: photos }, { data: propertyMedia }] = await Promise.all([
    supabaseAdmin.from('listing_photos').select('storage_path').eq('listing_id', req.params.id),
    supabaseAdmin.from('property_media')
      .select('storage_provider,storage_bucket,storage_key,thumbnail_key')
      .eq('property_id', req.params.id),
  ]);

  await supabaseAdmin.from('availability').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('bookmarks').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('reviews').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('listing_photos').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('property_media').delete().eq('property_id', req.params.id);
  await supabaseAdmin.from('listing_booking_details').delete().eq('listing_id', req.params.id);

  const { data: deletedListing, error } = await supabaseAdmin.from('listings')
    .delete().eq('id', req.params.id).eq('host_id', user.id).select('id').maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to delete listing' });
  if (!deletedListing) {
    console.error(`Listing delete did not remove listing ${req.params.id}`);
    return res.status(500).json({ error: 'Listing was not deleted' });
  }

  const r2Keys = [];
  const legacyPaths = [];
  const mediaBuckets = new Map();

  for (const photo of photos || []) {
    if (!photo.storage_path) continue;
    if (mediaStorageService.isR2PhotoObjectKey('listing-photos', photo.storage_path)) {
      r2Keys.push(photo.storage_path);
    } else {
      legacyPaths.push(photo.storage_path);
    }
  }

  for (const media of propertyMedia || []) {
    if (!media.storage_key) continue;
    if (media.storage_provider === 'r2') {
      r2Keys.push(media.storage_key);
      if (media.thumbnail_key) r2Keys.push(media.thumbnail_key);
      continue;
    }

    const bucket = media.storage_bucket || 'property-media';
    const keyList = mediaBuckets.get(bucket) || [];
    keyList.push(media.storage_key);
    if (media.thumbnail_key) keyList.push(media.thumbnail_key);
    mediaBuckets.set(bucket, keyList);
  }

  await Promise.all(r2Keys.map((key) => mediaStorageService.deleteR2Object(key)));
  if (legacyPaths.length) await supabaseAdmin.storage.from('listing-photos').remove(legacyPaths);
  for (const [bucket, keys] of mediaBuckets.entries()) {
    if (!keys.length) continue;
    await supabaseAdmin.storage.from(bucket).remove([...new Set(keys)]);
  }

  return res.json({ success: true });
});

module.exports = router;
