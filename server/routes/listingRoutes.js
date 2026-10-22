const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const {
  ValidationError, assertAllowedKeys, text, uuid, number, enumValue,
} = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');
const { decideListingMediaAccess } = require('../lib/listingMediaAccess');
const { promoteListingMedia } = require('../lib/listingMediaPromotion');

const router = express.Router();
const STATUSES = new Set(['available', 'booked', 'unavailable', 'paused', 'draft']);
const CATEGORIES = ['airbnb', 'hotel', 'venue', 'office', 'shop', 'property'];
const OFFICE_SHOP_CATEGORIES = new Set(['office', 'shop']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canUseListingCategory(hostNiche, category) {
  return hostNiche === category || (OFFICE_SHOP_CATEGORIES.has(hostNiche) && OFFICE_SHOP_CATEGORIES.has(category));
}

function officeShopDetails(value, category) {
  if (!OFFICE_SHOP_CATEGORIES.has(category) || !isPlainObject(value)) {
    throw new ValidationError('office_shop_details is invalid');
  }
  const allowed = new Set(['subtype', 'role', 'amenities', 'location', 'space', 'parking', 'rules', 'pricing', 'costs', 'lease', 'documents']);
  Object.keys(value).forEach((key) => { if (!allowed.has(key)) throw new ValidationError('office_shop_details is invalid'); });
  const subtype = category === 'office'
    ? ['private_office', 'shared_office', 'serviced_office', 'coworking_desk', 'meeting_room']
    : ['street_front_shop', 'mall_unit', 'showroom', 'studio'];
  enumValue(value.subtype, 'subtype', subtype);
  enumValue(value.role, 'role', ['owner', 'authorized_manager', 'agent']);
  if (!isPlainObject(value.amenities) || !isPlainObject(value.space) || !isPlainObject(value.pricing)
    || !isPlainObject(value.costs) || !isPlainObject(value.lease) || !isPlainObject(value.rules)) {
    throw new ValidationError('office_shop_details is invalid');
  }
  number(value.space.area, 'area', { min: 0, max: 100000000 });
  enumValue(value.space.area_unit, 'area_unit', ['sq_ft', 'm2']);
  enumValue(value.space.fitout_status, 'fitout_status', ['shell_core', 'partly_fitted', 'fitted', 'furnished']);
  number(value.pricing.amount, 'price_amount', { min: 0, max: 100000000 });
  enumValue(value.pricing.basis, 'pricing_basis', ['whole_month', 'whole_year', 'per_area', 'per_desk', 'daily_weekly_hourly', 'turnover']);
  if (category !== 'shop' && value.pricing.basis === 'turnover') throw new ValidationError('turnover pricing is Shop-only');
  if (value.pricing.basis === 'per_area') enumValue(value.space.area_measure, 'area_measure', ['usable', 'rentable', 'estimate']);
  if (value.pricing.basis === 'per_desk') number(value.space.desks, 'desks', { integer: true, min: 1, max: 100000 });
  if (category === 'office') number(value.space.capacity, 'capacity', { integer: true, min: 1, max: 100000 });
  if (category === 'office' && ['shared_office', 'serviced_office', 'coworking_desk'].includes(value.subtype)) {
    number(value.space.desks, 'desks', { integer: true, min: 1, max: 100000 });
  }
  enumValue(value.costs.service_charge, 'service_charge', ['included', 'not_included', 'not_confirmed']);
  enumValue(value.costs.utilities, 'utilities', ['included', 'metered', 'fixed_fee', 'tenant_arranges', 'not_confirmed']);
  enumValue(value.costs.tax, 'tax', ['included', 'added', 'not_applicable', 'needs_confirmation']);
  if (value.costs.service_charge === 'not_included') {
    number(value.costs.service_amount, 'service_amount', { min: 0, max: 100000000 });
    enumValue(value.costs.service_frequency, 'service_frequency', ['monthly', 'quarterly', 'annual', 'one_off']);
  }
  if (value.costs.utilities === 'fixed_fee') number(value.costs.utilities_amount, 'utilities_amount', { min: 0, max: 100000000 });
  if (value.parking && value.parking.cost === 'paid') number(value.parking.paid_amount, 'parking_paid_amount', { min: 0, max: 100000000 });
  if (!Array.isArray(value.costs.compulsory_charges) || value.costs.compulsory_charges.length > 20) throw new ValidationError('compulsory_charges is invalid');
  value.costs.compulsory_charges.forEach((charge) => {
    if (!isPlainObject(charge)) throw new ValidationError('compulsory_charges is invalid');
    enumValue(charge.type, 'charge type', ['parking', 'access_cards', 'cleaning', 'internet', 'agent_fee', 'legal_registration', 'signage', 'building_fee']);
    number(charge.amount, 'charge amount', { min: 0, max: 100000000 });
    enumValue(charge.frequency, 'charge frequency', ['monthly', 'quarterly', 'annual', 'one_off']);
  });
  text(value.costs.security_deposit, 'security_deposit', { max: 200 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value.lease.available_from, 'available_from', { max: 10 }))) {
    throw new ValidationError('available_from is invalid');
  }
  number(value.lease.minimum_term, 'minimum_term', { integer: true, min: 1, max: 100000 });
  enumValue(value.lease.payment_frequency, 'payment_frequency', ['monthly', 'quarterly', 'annually', 'custom']);
  enumValue(value.lease.viewing_required, 'viewing_required', ['yes', 'no']);
  const serialized = JSON.stringify(value);
  if (serialized.length > 60000) throw new ValidationError('office_shop_details is too large');
  return value;
}

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
    const { data: listings, error: listingError } = await supabaseAdmin.from('listings')
      .select('id,publication_state,availability_status,created_at')
      .in('id', rawIds);
    if (listingError) throw listingError;
    const publishedIds = (listings || [])
      .filter((listing) => decideListingMediaAccess(listing, null).published)
      .map((listing) => listing.id);
    if (!publishedIds.length) return res.json({ videoMedia: {} });
    const { data, error } = await supabaseAdmin
      .from('property_media')
      .select('id,property_id,sort_order,width,height')
      .in('property_id', publishedIds)
      .eq('media_type', 'video')
      .eq('visibility', 'public')
      .eq('status', 'ready')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;

    const videoMedia = {};
    const videoDimensions = {};
    (data || []).forEach((media) => {
      if (videoMedia[media.property_id]) return;
      videoMedia[media.property_id] = media.id;
      videoDimensions[media.property_id] = {
        width: Number.isInteger(media.width) && media.width > 0 ? media.width : null,
        height: Number.isInteger(media.height) && media.height > 0 ? media.height : null,
      };
    });
    return res.json({ videoMedia, videoDimensions });
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

function isValidDraftFormData(value) {
  return isPlainObject(value) && Buffer.byteLength(JSON.stringify(value), 'utf8') <= 100000;
}

function normalizeDraftMediaMetadata(value) {
  if (!Array.isArray(value) || value.length > 32) throw new ValidationError('Draft media metadata is invalid');
  return value.map((item) => {
    if (!isPlainObject(item)) throw new ValidationError('Draft media metadata is invalid');
    const size = item.size === undefined || item.size === null ? 0 : number(item.size, 'media size', { min: 0, max: 52428800 });
    const lastModified = item.lastModified === undefined || item.lastModified === null
      ? 0 : number(item.lastModified, 'media last modified', { min: 0, max: 8640000000000000 });
    return {
      name: text(item.name, 'media name', { required: false, max: 255 }) || '',
      type: text(item.type, 'media type', { required: false, max: 100 }) || '',
      kind: text(item.kind, 'media kind', { required: false, max: 40 }) || '',
      size,
      lastModified,
    };
  });
}

// Draft form data is owner-scoped and intentionally separate from public
// listing rows until checkout or publication creates/updates the listing.
router.get('/listing-drafts', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  const { data, error } = await supabaseAdmin.from('host_listing_drafts')
    .select('id,listing_id,category,form_data,media_metadata,created_at,updated_at,revision')
    .eq('host_id', user.id).order('updated_at', { ascending: false });
  if (error) {
    console.error('Host listing draft lookup failed:', error.message);
    return res.status(500).json({ error: 'Unable to load your saved listing drafts' });
  }
  return res.json({ drafts: data || [] });
});

router.get('/listing-drafts/:id', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  let id;
  try { id = uuid(req.params.id, 'draft id'); }
  catch (_) { return res.status(400).json({ error: 'Invalid listing draft id' }); }
  const { data, error } = await supabaseAdmin.from('host_listing_drafts')
    .select('id,listing_id,category,form_data,media_metadata,created_at,updated_at,revision')
    .eq('id', id).eq('host_id', user.id).maybeSingle();
  if (error) {
    console.error('Host listing draft lookup failed:', error.message);
    return res.status(500).json({ error: 'Unable to load this listing draft' });
  }
  if (!data) return res.status(404).json({ error: 'Listing draft not found' });
  return res.json({ draft: data });
});

router.put('/listing-drafts/:id', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  let id;
  let category;
  let mediaMetadata;
  let clientRevision;
  try {
    id = uuid(req.params.id, 'draft id');
    assertAllowedKeys(req.body, ['category', 'form_data', 'media_metadata', 'listing_id', 'revision']);
    category = enumValue(req.body.category, 'category', CATEGORIES);
    if (!isValidDraftFormData(req.body.form_data)) throw new ValidationError('Listing draft is too large or invalid');
    mediaMetadata = normalizeDraftMediaMetadata(req.body.media_metadata || []);
    if (req.body.revision !== undefined) clientRevision = number(req.body.revision, 'revision', { integer: true, min: 0, max: 2147483646 });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message, code: 'INVALID_LISTING_DRAFT' });
    return res.status(400).json({ error: 'Invalid listing draft' });
  }

  let niches;
  try { niches = normalizeNiches(await hostNiches(user.id)); }
  catch (_) { return res.status(403).json({ error: 'Choose a valid listing niche before saving a draft' }); }
  if (!canUseListingCategory(niches[0], category)) {
    return res.status(403).json({ error: 'Listing category must match the host niche' });
  }

  const { data: existing, error: existingError } = await supabaseAdmin.from('host_listing_drafts')
    .select('id,host_id,created_at,revision,listing_id,category,form_data,media_metadata,updated_at').eq('id', id).maybeSingle();
  if (existingError) return res.status(500).json({ error: 'Unable to save this listing draft' });
  if (existing && existing.host_id !== user.id) return res.status(404).json({ error: 'Listing draft not found' });
  if (existing && clientRevision !== undefined && clientRevision !== existing.revision) {
    const isRetryOfLatest = clientRevision + 1 === existing.revision
      && existing.category === category
      && (existing.listing_id || null) === (req.body.listing_id || null)
      && JSON.stringify(existing.form_data) === JSON.stringify(req.body.form_data)
      && JSON.stringify(existing.media_metadata) === JSON.stringify(mediaMetadata);
    if (isRetryOfLatest) {
      return res.json({ draft: {
        id: existing.id, listing_id: existing.listing_id, category: existing.category,
        form_data: existing.form_data, media_metadata: existing.media_metadata,
        created_at: existing.created_at, updated_at: existing.updated_at, revision: existing.revision,
      } });
    }
    return res.status(409).json({ error: 'A newer copy of this listing draft is already saved. Reload the draft before continuing.', code: 'LISTING_DRAFT_REVISION_CONFLICT' });
  }
  if (!existing && clientRevision !== undefined && clientRevision !== 0) {
    return res.status(409).json({ error: 'This listing draft has already changed. Reload it before saving.', code: 'LISTING_DRAFT_REVISION_CONFLICT' });
  }

  let listingId = null;
  if (req.body.listing_id) {
    try { listingId = uuid(req.body.listing_id, 'listing id'); }
    catch (_) { return res.status(400).json({ error: 'Invalid linked listing id' }); }
    const listing = await ownedListing(listingId, user.id, res);
    if (!listing) return;
    if (listing.category !== category) return res.status(409).json({ error: 'Draft category does not match its saved listing' });
  }

  const now = new Date().toISOString();
  const payload = {
    id,
    host_id: user.id,
    listing_id: listingId,
    category,
    form_data: req.body.form_data,
    media_metadata: mediaMetadata,
    updated_at: now,
    revision: existing ? existing.revision + 1 : 1,
  };
  if (!existing) payload.created_at = now;
  const draftQuery = supabaseAdmin.from('host_listing_drafts');
  const saveQuery = existing
    ? draftQuery.update(payload).eq('id', id).eq('host_id', user.id).eq('revision', existing.revision)
    : draftQuery.insert(payload);
  const { data, error } = await saveQuery
    .select('id,listing_id,category,form_data,media_metadata,created_at,updated_at,revision').maybeSingle();
  if (!error && !data) {
    return res.status(409).json({ error: 'A newer copy of this listing draft is already saved. Reload the draft before continuing.', code: 'LISTING_DRAFT_REVISION_CONFLICT' });
  }
  if (error) {
    // Two tabs can create the same initially generated draft ID before either
    // sees a server row. Treat an identical winning insert as an idempotent
    // retry, while refusing to expose another host's colliding row.
    if (!existing && error.code === '23505') {
      const { data: raced, error: racedError } = await supabaseAdmin.from('host_listing_drafts')
        .select('id,host_id,listing_id,category,form_data,media_metadata,created_at,updated_at,revision')
        .eq('id', id).maybeSingle();
      if (racedError) return res.status(500).json({ error: 'Unable to save your listing draft' });
      if (!raced || raced.host_id !== user.id) {
        return res.status(409).json({ error: 'This listing draft changed in another session. Reload it before saving.', code: 'LISTING_DRAFT_REVISION_CONFLICT' });
      }
      const sameDraft = raced.category === category
        && (raced.listing_id || null) === (req.body.listing_id || null)
        && JSON.stringify(raced.form_data) === JSON.stringify(req.body.form_data)
        && JSON.stringify(raced.media_metadata) === JSON.stringify(mediaMetadata);
      if (sameDraft) return res.json({ draft: raced });
      return res.status(409).json({ error: 'This listing draft changed in another session. Reload it before saving.', code: 'LISTING_DRAFT_REVISION_CONFLICT' });
    }
    console.error('Host listing draft save failed:', error.message);
    return res.status(500).json({ error: 'Unable to save your listing draft' });
  }
  return res.json({ draft: data });
});

router.delete('/listing-drafts/:id', async (req, res) => {
  const user = await authenticatedHost(req, res);
  if (!user) return;
  let id;
  try { id = uuid(req.params.id, 'draft id'); }
  catch (_) { return res.status(400).json({ error: 'Invalid listing draft id' }); }
  const { error } = await supabaseAdmin.from('host_listing_drafts').delete()
    .eq('id', id).eq('host_id', user.id);
  if (error) return res.status(500).json({ error: 'Unable to remove the saved listing draft' });
  return res.status(204).end();
});

async function ownedListing(id, userId, res) {
  const { data, error } = await supabaseAdmin
    .from('listings').select('id,host_id,title,description,property_description,category,location_text,city,neighborhood,address_visibility,supports_stay,supports_table_reservation,listing_purpose,availability_status,publication_state,created_at,paid_listing_until')
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

async function deleteListingStorageObjects(photos, propertyMedia) {
  const r2Keys = new Set();
  const legacyPaths = new Set();
  const mediaBuckets = new Map();

  for (const photo of photos || []) {
    if (!photo.storage_path) continue;
    if (mediaStorageService.isR2PhotoObjectKey('listing-photos', photo.storage_path)) {
      r2Keys.add(photo.storage_path);
    } else {
      legacyPaths.add(photo.storage_path);
    }
  }

  for (const media of propertyMedia || []) {
    if (!media.storage_key) continue;
    if (media.storage_provider === 'r2') {
      r2Keys.add(media.storage_key);
      if (media.thumbnail_key) r2Keys.add(media.thumbnail_key);
      continue;
    }

    const bucket = media.storage_bucket || 'property-media';
    const keys = mediaBuckets.get(bucket) || new Set();
    keys.add(media.storage_key);
    if (media.thumbnail_key) keys.add(media.thumbnail_key);
    mediaBuckets.set(bucket, keys);
  }

  await Promise.all([...r2Keys].map((key) => mediaStorageService.deleteR2Object(key)));
  if (legacyPaths.size) {
    const { error } = await supabaseAdmin.storage.from('listing-photos').remove([...legacyPaths]);
    if (error) throw error;
  }
  for (const [bucket, keys] of mediaBuckets.entries()) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove([...keys]);
    if (error) throw error;
  }
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
  if (req.body.status === 'available' && OFFICE_SHOP_CATEGORIES.has(listing.category)) {
    const { data: details, error: detailsError } = await supabaseAdmin.from('listing_booking_details')
      .select('office_shop_details,office_shop_last_confirmed_at').eq('listing_id', req.params.id).maybeSingle();
    const { count: photoCount, error: photoError } = await supabaseAdmin.from('listing_photos')
      .select('id', { count: 'exact', head: true }).eq('listing_id', req.params.id);
    const { count: videoCount, error: videoError } = await supabaseAdmin.from('property_media')
      .select('id', { count: 'exact', head: true }).eq('property_id', req.params.id)
      .eq('media_type', 'video').eq('status', 'ready').is('deleted_at', null);
    if (detailsError || photoError || videoError) return res.status(500).json({ error: 'Unable to validate the commercial listing before publication' });
    if (!listing.city || !listing.neighborhood || !listing.address_visibility
      || !details?.office_shop_last_confirmed_at || !details?.office_shop_details?.subtype) {
      return res.status(422).json({ error: 'Complete the required Office or Shop details and confirm they are accurate before publishing' });
    }
    if ((photoCount || 0) + (videoCount || 0) < 1) {
      return res.status(422).json({ error: 'Add at least one photo or video of the actual Office or Shop space before publishing' });
    }
  }
  if (req.body.status === 'available' && ['property', 'shop', 'office'].includes(listing.category)) {
    if (['discarded', 'cleanup_pending', 'expired'].includes(listing.publication_state)) {
      return res.status(409).json({ error: 'This listing can no longer be published', code: 'LISTING_NOT_PUBLISHABLE' });
    }
    try {
      await promoteListingMedia(req.params.id, { hostId: user.id });
    } catch (promotionError) {
      console.error('Listing media promotion failed:', promotionError.message);
      return res.status(409).json({ error: 'Listing media is not ready to publish', code: 'MEDIA_PROMOTION_FAILED' });
    }
    const { data: result, error: activationError } = await supabaseAdmin.rpc('activate_listing_with_entitlement', {
      p_listing_id: req.params.id,
      p_host_id: user.id,
    });
    if (activationError) return res.status(500).json({ error: 'Unable to verify listing entitlement' });
    if (result && result.code === 'LISTING_PAYMENT_REQUIRED') return res.status(402).json({ error: result.error, code: result.code });
    if (result && result.code === 'LISTING_LIMIT_REACHED') return res.status(409).json({ error: result.error, code: result.code });
    if (result && result.code === 'LISTING_MEDIA_NOT_READY') return res.status(409).json({ error: result.error, code: result.code });
    if (result && result.code === 'LISTING_INVALID') return res.status(422).json({ error: result.error, code: result.code });
    if (!result || !result.listing) return res.status(404).json({ error: 'Listing not found or could not be activated' });
    return res.json({ listing: result.listing });
  }
  const changes = { availability_status: req.body.status };
  if (req.body.status === 'available') {
    if (['discarded', 'cleanup_pending', 'expired'].includes(listing.publication_state)) {
      return res.status(409).json({ error: 'This listing can no longer be published', code: 'LISTING_NOT_PUBLISHABLE' });
    }
    const { data: unfinished, error: readinessError } = await supabaseAdmin.from('property_media')
      .select('id').eq('property_id', req.params.id).is('deleted_at', null)
      .not('status', 'in', '("ready","deleted")');
    if (readinessError) return res.status(500).json({ error: 'Unable to verify listing media readiness' });
    if (unfinished && unfinished.length) {
      return res.status(409).json({ error: 'Listing media is still processing', code: 'LISTING_MEDIA_NOT_READY' });
    }
    try {
      await promoteListingMedia(req.params.id, { hostId: user.id });
    } catch (promotionError) {
      console.error('Listing media promotion failed:', promotionError.message);
      return res.status(409).json({ error: 'Listing media is not ready to publish', code: 'MEDIA_PROMOTION_FAILED' });
    }
    const { error: visibilityError } = await supabaseAdmin.from('property_media')
      .update({ visibility: 'public' }).eq('property_id', req.params.id)
      .eq('status', 'ready').is('deleted_at', null);
    if (visibilityError) return res.status(500).json({ error: 'Unable to prepare listing media for publication' });
    changes.publication_state = 'published';
  } else if (req.body.status === 'draft') {
    changes.publication_state = 'draft';
  }
  const { data, error } = await supabaseAdmin.from('listings')
    .update(changes).eq('id', req.params.id).eq('host_id', user.id)
    .not('publication_state', 'in', '("discarded","cleanup_pending","expired")')
    .select('id,availability_status,publication_state').maybeSingle();
  if (error) {
    if (error.message && error.message.includes('availability_status')) {
      return res.status(503).json({ error: 'Listing status controls are not enabled yet. Apply the listing-controls migration.' });
    }
    return res.status(500).json({ error: 'Unable to update listing status' });
  }
  if (!data) return res.status(409).json({ error: 'This listing can no longer be changed' });
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
  const paymentDraft = req.body && req.body.payment_draft === true;
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'payment_draft') && typeof req.body.payment_draft !== 'boolean') {
    return res.status(400).json({ error: 'Invalid listing draft request', code: 'INVALID_LISTING' });
  }
  // New subscription quotas apply only to the opted-in Property and combined
  // Shops & Offices plans. Legacy hospitality plans retain their old behavior.
  const { data: activeSubscription } = await supabaseAdmin.from('host_subscriptions')
    .select('plan_id,status,current_period_end,listing_allowance_limit,billing_plans(features)')
    .eq('host_id', user.id).eq('status', 'active').in('plan_id', [
      'property_basic', 'property_pro', 'property_premium', 'shops_basic', 'shops_pro', 'shops_premium'
    ]).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const subscriptionIsCurrent = activeSubscription && (!activeSubscription.current_period_end || new Date(activeSubscription.current_period_end).getTime() > Date.now());
  if (subscriptionIsCurrent && !paymentDraft) {
    const featureValue = activeSubscription.billing_plans && activeSubscription.billing_plans.features;
    const limit = Number(activeSubscription.listing_allowance_limit ?? (featureValue && featureValue.max_active_listings));
    if (Number.isInteger(limit) && limit > 0) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('listing_categories').eq('id', user.id).maybeSingle();
      const chosen = Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] : null;
      const query = supabaseAdmin.from('listings').select('id', { count: 'exact', head: true })
        .eq('host_id', user.id).eq('availability_status', 'available')
        .is('paid_listing_until', null);
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
    assertAllowedKeys(req.body, ['title', 'description', 'property_description', 'category', 'location_text', 'supports_stay', 'supports_table_reservation', 'latitude', 'longitude', 'place_id', 'formatted_address', 'neighborhood', 'city', 'country', 'address_visibility', 'listing_purpose', 'payment_draft']);
    const niches = normalizeNiches(await hostNiches(user.id));
    const hostNiche = niches[0];
    category = req.body.category === undefined ? hostNiche : enumValue(req.body.category, 'category', CATEGORIES);
    if (!canUseListingCategory(hostNiche, category)) throw new ValidationError('Listing category must match the host niche');
    if (paymentDraft && !['property', 'shop', 'office'].includes(category)) {
      return res.status(400).json({ error: 'Payment drafts are only available for Property and Shops & Offices', code: 'INVALID_LISTING' });
    }
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
    if (['property', 'shop', 'office'].includes(category)) payload.availability_status = 'paused';
    else payload.availability_status = 'draft';
    payload.publication_state = paymentDraft ? 'payment_pending' : 'draft';
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
    if (!payload.country) payload.country = 'Kenya';
    if (req.body.address_visibility !== undefined) {
      payload.address_visibility = enumValue(req.body.address_visibility, 'address_visibility', ['full', 'after_inquiry']);
    }
    if (req.body.latitude !== undefined) payload.latitude = number(req.body.latitude, 'latitude', { min: -90, max: 90 });
    if (req.body.longitude !== undefined) payload.longitude = number(req.body.longitude, 'longitude', { min: -180, max: 180 });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message, code: 'INVALID_LISTING' });
    console.error('Host niche lookup failed:', error.message);
    return res.status(500).json({ error: 'Unable to verify posting niches' });
  }
  const { data, error } = await supabaseAdmin.from('listings').insert(payload).select().single();
  if (error) {
    // Keep the client response generic, but retain the database error code and
    // message server-side so schema drift and constraint failures are diagnosable.
    console.error('Listing insert failed:', { code: error.code || null, message: error.message || 'Unknown database error' });
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
    assertAllowedKeys(req.body, ['title', 'description', 'property_description', 'category', 'location_text', 'city', 'neighborhood', 'country', 'address_visibility', 'price_amount', 'price_unit', 'supports_stay', 'supports_table_reservation', 'listing_purpose', 'booking_details']);
    if (req.body.booking_details !== undefined) {
      assertAllowedKeys(req.body.booking_details, [
        'price_amount', 'price_unit', 'size_or_type', 'amenities', 'max_guests', 'min_stay_nights',
        'checkin_time', 'checkout_time', 'cleaning_fee', 'cancellation_policy', 'available_from',
        'min_lease_months', 'deposit_amount', 'utilities_included', 'sale_price_amount',
        'sale_price_mode', 'units_available', 'bathrooms', 'policy_storage_path', 'office_shop_details', 'office_shop_accuracy_confirmed',
      ]);
    }
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
    throw error;
  }
  const listing = await ownedListing(req.params.id, user.id, res);
  if (!listing) return;
  const allowed = ['title', 'description', 'property_description', 'category', 'location_text', 'city', 'neighborhood', 'country'];
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
          if (!canUseListingCategory(niches[0], update[key])) {
            return res.status(422).json({ error: 'Listing category must match the host niche', code: 'HOST_NICHE_NOT_ALLOWED' });
          }
        }
      } catch (error) {
        if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
        throw error;
      }
    }
  }
  if (req.body.address_visibility !== undefined) {
    try {
      update.address_visibility = enumValue(req.body.address_visibility, 'address_visibility', ['full', 'after_inquiry']);
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid input' });
      throw error;
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
    if (req.body.price_unit !== undefined) detailUpdate.price_unit = enumValue(req.body.price_unit, 'price_unit', ['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover']);
    const details = req.body.booking_details || {};
    Object.keys(details).forEach((key) => {
      const value = details[key];
      if (['price_amount', 'cleaning_fee', 'deposit_amount', 'sale_price_amount'].includes(key)) {
        detailUpdate[key] = value === null && key !== 'price_amount'
          ? null : number(value, key, { min: 0, max: 100000000 });
      } else if (['max_guests', 'min_stay_nights', 'min_lease_months', 'units_available'].includes(key)) {
        detailUpdate[key] = value === null ? null : number(value, key, { integer: true, min: 1, max: 100000 });
      } else if (key === 'bathrooms') {
        detailUpdate[key] = value === null ? null : number(value, key, { integer: true, min: 1, max: 1000 });
      } else if (key === 'price_unit') {
        detailUpdate[key] = enumValue(value, key, ['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover']);
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
      } else if (key === 'office_shop_details') {
        detailUpdate[key] = officeShopDetails(value, listing.category);
      } else if (key === 'office_shop_accuracy_confirmed') {
        if (!OFFICE_SHOP_CATEGORIES.has(listing.category) || value !== true) {
          throw new ValidationError('office_shop_accuracy_confirmed is invalid');
        }
        detailUpdate.office_shop_last_confirmed_at = new Date().toISOString();
      }
    });
    if (listing.category !== 'property' && ['sale_price_amount', 'sale_price_mode', 'units_available', 'bathrooms'].some((key) => Object.prototype.hasOwnProperty.call(detailUpdate, key))) {
      throw new ValidationError('Property details are only valid for property listings');
    }
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message || 'Invalid listing details', code: 'INVALID_LISTING_DETAILS' });
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
    if (lookupError) {
      console.error('Listing detail lookup failed:', {
        listingId: req.params.id, category: listing.category,
        code: lookupError.code || null, message: lookupError.message || 'Unknown database error',
      });
      return res.status(500).json({ error: 'Unable to load saved listing details', code: 'LISTING_DETAILS_LOOKUP_FAILED' });
    }
    let detailResult = existingDetails
      ? await supabaseAdmin.from('listing_booking_details').update(detailUpdate).eq('listing_id', req.params.id)
      : await supabaseAdmin.from('listing_booking_details').insert(Object.assign({ listing_id: req.params.id }, detailUpdate));
    // A concurrent retry can create the one-to-one details row after the
    // lookup. Retry only that unique-row race as an update, preserving fields
    // that are not present in this section's patch.
    if (!existingDetails && detailResult.error && detailResult.error.code === '23505') {
      detailResult = await supabaseAdmin.from('listing_booking_details').update(detailUpdate).eq('listing_id', req.params.id);
    }
    if (detailResult.error) {
      console.error('Listing detail persistence failed:', {
        listingId: req.params.id,
        category: listing.category,
        operation: existingDetails ? 'update' : 'insert',
        code: detailResult.error.code || null,
        constraint: detailResult.error.constraint || null,
        table: detailResult.error.table || 'listing_booking_details',
        message: detailResult.error.message || 'Unknown database error',
      });
      return res.status(500).json({
        error: 'Your listing details could not be saved. Your listing and payment are preserved; please retry. If this continues, contact support with reference LISTING_DETAILS_WRITE_FAILED.',
        code: 'LISTING_DETAILS_WRITE_FAILED',
      });
    }
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
  try {
    uuid(req.params.id, 'listing id');
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: 'Invalid listing id' });
    throw error;
  }
  const listing = await ownedListing(req.params.id, user.id, res);
  if (!listing) return;

  if (['draft', 'payment_pending', 'failed', 'discarded', 'cleanup_pending', 'expired'].includes(listing.publication_state)
    || listing.availability_status === 'draft') {
    const { error: deleteError } = await supabaseAdmin.rpc('varoom_discard_draft_listing', {
      p_listing_id: req.params.id,
      p_host_id: user.id,
    });
    if (deleteError) {
      if (deleteError.code === 'P0002') return res.status(404).json({ error: 'Draft listing not found' });
      if (deleteError.code === '22023') return res.status(409).json({ error: 'This listing is no longer an unpublished draft', code: 'LISTING_NOT_DRAFT' });
      if (deleteError.code === 'PGRST202' || deleteError.code === '42883') {
        return res.status(503).json({ error: 'Draft cleanup is not enabled yet. Apply the draft media lifecycle migration.' });
      }
      console.error('Draft listing deletion failed:', deleteError);
      return res.status(500).json({ error: 'Unable to discard draft listing' });
    }
    return res.json({ success: true, discarded: true, cleanup: 'queued' });
  }

  const [photosResult, mediaResult, documentsResult] = await Promise.all([
    supabaseAdmin.from('listing_photos').select('storage_path').eq('listing_id', req.params.id),
    supabaseAdmin.from('property_media')
      .select('storage_provider,storage_bucket,storage_key,thumbnail_key')
      .eq('property_id', req.params.id),
    supabaseAdmin.from('listing_documents')
      .select('storage_provider,storage_bucket,storage_key').eq('listing_id', req.params.id),
  ]);
  if (photosResult.error || mediaResult.error || documentsResult.error) {
    console.error('Listing media/document lookup failed:', photosResult.error || mediaResult.error || documentsResult.error);
    return res.status(500).json({ error: 'Unable to load listing media and documents for deletion' });
  }
  const photos = photosResult.data;
  const propertyMedia = mediaResult.data;
  const documents = documentsResult.data || [];

  const { error: mediaDeleteError } = await supabaseAdmin.from('property_media')
    .delete().eq('property_id', req.params.id);
  if (mediaDeleteError) {
    if (mediaDeleteError.code === '55000') {
      return res.status(409).json({
        error: 'A video is being finalized. Please try deleting this listing again shortly.',
        code: 'MEDIA_FINALIZATION_IN_PROGRESS',
      });
    }
    console.error('Listing media deletion failed:', mediaDeleteError);
    return res.status(500).json({ error: 'Unable to delete listing media' });
  }

  await supabaseAdmin.from('availability').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('bookmarks').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('reviews').delete().eq('listing_id', req.params.id);
  await supabaseAdmin.from('listing_photos').delete().eq('listing_id', req.params.id);
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

  for (const document of documents) {
    if (!document.storage_key) continue;
    if (document.storage_provider === 'r2') r2Keys.push(document.storage_key);
    else {
      const bucket = document.storage_bucket || 'listing-photos';
      const keyList = mediaBuckets.get(bucket) || [];
      keyList.push(document.storage_key);
      mediaBuckets.set(bucket, keyList);
    }
  }

  await mediaStorageService.deleteR2Objects([...new Set(r2Keys)]);
  if (legacyPaths.length) await supabaseAdmin.storage.from('listing-photos').remove(legacyPaths);
  for (const [bucket, keys] of mediaBuckets.entries()) {
    if (!keys.length) continue;
    await supabaseAdmin.storage.from(bucket).remove([...new Set(keys)]);
  }

  return res.json({ success: true });
});

module.exports = router;
