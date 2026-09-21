'use strict';

const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { rejectSuspendedActivity } = require('../lib/accountAccess');
const { ValidationError, assertAllowedKeys, text, uuid, number, enumValue } = require('../lib/inputValidation');

const router = express.Router();
const BUSINESS_NICHES = ['hotel', 'airbnb', 'venue', 'office', 'shop', 'property'];

async function authenticatedUser(req, res, { host = false } = {}) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Missing access token' }); return null; }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) { res.status(401).json({ error: 'Invalid or expired session' }); return null; }
  if (host) {
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role,listing_categories').eq('id', user.id).maybeSingle();
    if (profileError || !profile || profile.role !== 'host') { res.status(403).json({ error: 'Host access required' }); return null; }
    user.profile = profile;
  }
  if (await rejectSuspendedActivity(res, user.id)) return null;
  return user;
}

function hasHotelNiche(profile) { return Array.isArray(profile?.listing_categories) && profile.listing_categories.includes('hotel'); }

async function managedBusiness(businessId, userId, res) {
  const { data, error } = await supabaseAdmin.from('business_members').select('business_id,role,business:businesses!inner(id,owner_id,name,status)')
    .eq('business_id', businessId).eq('user_id', userId).maybeSingle();
  if (error) { res.status(500).json({ error: 'Unable to verify business access' }); return null; }
  if (!data || data.business.status !== 'active') { res.status(403).json({ error: 'You cannot manage this business' }); return null; }
  return data.business;
}

async function managedBranch(branchId, businessId, userId, res, { requireActive = true } = {}) {
  const business = await managedBusiness(businessId, userId, res);
  if (!business) return null;
  const { data: branch, error } = await supabaseAdmin.from('business_branches').select('*').eq('id', branchId).eq('business_id', businessId).maybeSingle();
  if (error) { res.status(500).json({ error: 'Unable to verify branch access' }); return null; }
  if (!branch || (requireActive && branch.status !== 'active')) { res.status(422).json({ error: 'Choose an active branch belonging to this business' }); return null; }
  return { business, branch };
}

function locationFields(body, { required = true } = {}) {
  const address = text(body.address_text, 'address_text', { required, max: 500 });
  const latitude = body.latitude === undefined ? undefined : number(body.latitude, 'latitude', { min: -90, max: 90 });
  const longitude = body.longitude === undefined ? undefined : number(body.longitude, 'longitude', { min: -180, max: 180 });
  if ((latitude === undefined) !== (longitude === undefined)) throw new ValidationError('latitude and longitude must be supplied together');
  return {
    ...(address !== undefined ? { address_text: address } : {}),
    ...(latitude !== undefined ? { latitude, longitude } : {}),
    ...(body.place_id !== undefined ? { place_id: text(body.place_id, 'place_id', { required: false, max: 300 }) || null } : {}),
    ...(body.formatted_address !== undefined ? { formatted_address: text(body.formatted_address, 'formatted_address', { required: false, max: 500 }) || null } : {}),
    ...(body.county_city !== undefined ? { county_city: text(body.county_city, 'county_city', { required: false, max: 300 }) || null } : {}),
  };
}

// Business setup is explicit. A hotel business needs a hotel host niche; no
// browser-only affordance can create a business outside that permission.
router.post('/businesses', async (req, res) => {
  const user = await authenticatedUser(req, res, { host: true }); if (!user) return;
  try {
    assertAllowedKeys(req.body, ['name', 'description', 'niches']);
    if (!Array.isArray(req.body.niches) || !req.body.niches.length || req.body.niches.length > 2) throw new ValidationError('Provide one or two business niches');
    const niches = [...new Set(req.body.niches.map((n) => enumValue(n, 'niche', BUSINESS_NICHES)))];
    if (niches.length !== req.body.niches.length) throw new ValidationError('Business niches must be different');
    const hostNiches = user.profile.listing_categories;
    if (!Array.isArray(hostNiches) || hostNiches.length !== 2 || niches.some((n) => !hostNiches.includes(n))) return res.status(422).json({ error: 'A business niche must be one of your two permitted niches', code: 'HOST_NICHE_NOT_ALLOWED' });
    const payload = { owner_id: user.id, name: text(req.body.name, 'name', { max: 300 }), description: text(req.body.description, 'description', { required: false, max: 10000 }) || null };
    const { data: business, error } = await supabaseAdmin.from('businesses').insert(payload).select().single();
    if (error) throw error;
    const { error: nicheError } = await supabaseAdmin.from('business_niches').insert(niches.map((niche) => ({ business_id: business.id, niche })));
    const { error: memberError } = await supabaseAdmin.from('business_members').insert({ business_id: business.id, user_id: user.id, role: 'owner' });
    if (nicheError || memberError) return res.status(502).json({ error: 'Business was created but could not be configured. Contact support with the business ID.', business });
    return res.status(201).json({ business: { ...business, niches } });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Business creation failed:', error.message); return res.status(500).json({ error: 'Unable to create business' });
  }
});

router.get('/businesses/mine', async (req, res) => {
  const user = await authenticatedUser(req, res, { host: true }); if (!user) return;
  const { data, error } = await supabaseAdmin.from('business_members').select('role,business:businesses!inner(id,name,description,status,created_at,business_niches(niche))').eq('user_id', user.id).order('created_at', { foreignTable: 'businesses', ascending: false });
  if (error) return res.status(500).json({ error: 'Unable to load businesses' });
  return res.json({ businesses: (data || []).map((row) => ({ ...row.business, role: row.role, niches: (row.business.business_niches || []).map((n) => n.niche) })) });
});

router.post('/businesses/:businessId/branches', async (req, res) => {
  const user = await authenticatedUser(req, res, { host: true }); if (!user) return;
  try { uuid(req.params.businessId, 'business id'); assertAllowedKeys(req.body, ['name', 'address_text', 'county_city', 'latitude', 'longitude', 'place_id', 'formatted_address']); }
  catch (error) { return res.status(400).json({ error: error.message || 'Invalid input' }); }
  const business = await managedBusiness(req.params.businessId, user.id, res); if (!business) return;
  try {
    const payload = { business_id: business.id, name: text(req.body.name, 'name', { max: 300 }), ...locationFields(req.body) };
    const { data, error } = await supabaseAdmin.from('business_branches').insert(payload).select().single();
    if (error) throw error;
    return res.status(201).json({ branch: data });
  } catch (error) { if (error instanceof ValidationError) return res.status(400).json({ error: error.message }); return res.status(500).json({ error: 'Unable to create branch' }); }
});

router.get('/businesses/:businessId/branches', async (req, res) => {
  const user = await authenticatedUser(req, res, { host: true }); if (!user) return;
  try { uuid(req.params.businessId, 'business id'); } catch { return res.status(400).json({ error: 'Invalid business id' }); }
  if (!(await managedBusiness(req.params.businessId, user.id, res))) return;
  const { data, error } = await supabaseAdmin.from('business_branches').select('*').eq('business_id', req.params.businessId).order('created_at');
  if (error) return res.status(500).json({ error: 'Unable to load branches' }); return res.json({ branches: data || [] });
});

router.patch('/businesses/:businessId/branches/:branchId', async (req, res) => {
  const user = await authenticatedUser(req, res, { host: true }); if (!user) return;
  try { uuid(req.params.businessId, 'business id'); uuid(req.params.branchId, 'branch id'); assertAllowedKeys(req.body, ['name', 'address_text', 'county_city', 'latitude', 'longitude', 'place_id', 'formatted_address', 'status']); }
  catch (error) { return res.status(400).json({ error: error.message || 'Invalid input' }); }
  const access = await managedBranch(req.params.branchId, req.params.businessId, user.id, res, { requireActive: false }); if (!access) return;
  try {
    const update = { ...(req.body.name !== undefined ? { name: text(req.body.name, 'name', { max: 300 }) } : {}), ...(req.body.status !== undefined ? { status: enumValue(req.body.status, 'status', ['active', 'inactive']) } : {}), ...locationFields(req.body, { required: false }) };
    if (!Object.keys(update).length) throw new ValidationError('No branch fields supplied');
    const { data, error } = await supabaseAdmin.from('business_branches').update(update).eq('id', access.branch.id).select().single();
    if (error) throw error; return res.json({ branch: data });
  } catch (error) { if (error instanceof ValidationError) return res.status(400).json({ error: error.message }); return res.status(500).json({ error: 'Unable to update branch' }); }
});

router.post('/businesses/:businessId/menus', async (req, res) => {
  const user = await authenticatedUser(req, res, { host: true }); if (!user) return;
  try { uuid(req.params.businessId, 'business id'); assertAllowedKeys(req.body, ['branch_id', 'title', 'description', 'categories']); uuid(req.body.branch_id, 'branch_id'); if (req.body.categories !== undefined && !Array.isArray(req.body.categories)) throw new ValidationError('categories must be an array'); }
  catch (error) { return res.status(400).json({ error: error.message || 'Invalid input' }); }
  if (!hasHotelNiche(user.profile)) return res.status(403).json({ error: 'Hotel niche required', code: 'HOST_NICHE_NOT_ALLOWED' });
  const access = await managedBranch(req.body.branch_id, req.params.businessId, user.id, res); if (!access) return;
  try {
    const { data: menu, error } = await supabaseAdmin.from('hotel_menus').insert({ business_id: access.business.id, branch_id: access.branch.id, title: text(req.body.title, 'title', { max: 300 }), description: text(req.body.description, 'description', { required: false, max: 10000 }) || null }).select().single();
    if (error) throw error;
    const categories = req.body.categories || [];
    if (categories.length) {
      const rows = categories.map((category, index) => ({ menu_id: menu.id, name: text(category.name, 'category name', { max: 200 }), display_order: category.display_order === undefined ? index : number(category.display_order, 'display_order', { integer: true, min: 0, max: 10000 }) }));
      const { error: categoryError } = await supabaseAdmin.from('hotel_menu_categories').insert(rows); if (categoryError) throw categoryError;
    }
    return res.status(201).json({ menu });
  } catch (error) { if (error instanceof ValidationError) return res.status(400).json({ error: error.message }); return res.status(500).json({ error: 'Unable to create menu' }); }
});

router.post('/menus/:menuId/categories/:categoryId/items', async (req, res) => {
  const user = await authenticatedUser(req, res, { host: true }); if (!user) return;
  try { uuid(req.params.menuId, 'menu id'); uuid(req.params.categoryId, 'category id'); assertAllowedKeys(req.body, ['name', 'description', 'price_amount', 'photo_url', 'active']); }
  catch (error) { return res.status(400).json({ error: error.message || 'Invalid input' }); }
  const { data: category, error } = await supabaseAdmin.from('hotel_menu_categories').select('id,menu:hotel_menus!inner(id,business_id)').eq('id', req.params.categoryId).eq('menu_id', req.params.menuId).maybeSingle();
  if (error || !category) return res.status(404).json({ error: 'Menu category not found' });
  if (!(await managedBusiness(category.menu.business_id, user.id, res))) return;
  try {
    const payload = { category_id: category.id, name: text(req.body.name, 'name', { max: 300 }), description: text(req.body.description, 'description', { required: false, max: 10000 }) || null, price_amount: number(req.body.price_amount, 'price_amount', { min: 0, max: 100000000 }), ...(req.body.photo_url !== undefined ? { photo_url: text(req.body.photo_url, 'photo_url', { required: false, max: 2048 }) || null } : {}), ...(req.body.active !== undefined ? { active: Boolean(req.body.active) } : {}) };
    const { data, error: insertError } = await supabaseAdmin.from('hotel_menu_items').insert(payload).select().single(); if (insertError) throw insertError;
    return res.status(201).json({ item: data });
  } catch (error) { if (error instanceof ValidationError) return res.status(400).json({ error: error.message }); return res.status(500).json({ error: 'Unable to create menu item' }); }
});

router.post('/businesses/:businessId/tables', async (req, res) => {
  const user = await authenticatedUser(req, res, { host: true }); if (!user) return;
  try { uuid(req.params.businessId, 'business id'); assertAllowedKeys(req.body, ['branch_id', 'identifier', 'seating_capacity', 'area_description', 'setting', 'availability_status']); uuid(req.body.branch_id, 'branch_id'); }
  catch (error) { return res.status(400).json({ error: error.message || 'Invalid input' }); }
  if (!hasHotelNiche(user.profile)) return res.status(403).json({ error: 'Hotel niche required', code: 'HOST_NICHE_NOT_ALLOWED' });
  const access = await managedBranch(req.body.branch_id, req.params.businessId, user.id, res); if (!access) return;
  try {
    const payload = { business_id: access.business.id, branch_id: access.branch.id, identifier: text(req.body.identifier, 'identifier', { max: 100 }), seating_capacity: number(req.body.seating_capacity, 'seating_capacity', { integer: true, min: 1, max: 1000 }), area_description: text(req.body.area_description, 'area_description', { required: false, max: 1000 }) || null, setting: req.body.setting === undefined ? null : enumValue(req.body.setting, 'setting', ['indoor', 'outdoor', 'either']), availability_status: req.body.availability_status === undefined ? 'available' : enumValue(req.body.availability_status, 'availability_status', ['available', 'unavailable']) };
    const { data, error } = await supabaseAdmin.from('hotel_tables').insert(payload).select().single(); if (error) throw error;
    return res.status(201).json({ table: data });
  } catch (error) { if (error instanceof ValidationError) return res.status(400).json({ error: error.message }); return res.status(500).json({ error: 'Unable to create table' }); }
});

router.post('/tables/:tableId/reservations', async (req, res) => {
  const user = await authenticatedUser(req, res); if (!user) return;
  try { uuid(req.params.tableId, 'table id'); assertAllowedKeys(req.body, ['reservation_at', 'guest_count']); const reservationAt = new Date(req.body.reservation_at); if (Number.isNaN(reservationAt.getTime()) || reservationAt <= new Date()) throw new ValidationError('reservation_at must be a future date/time');
    const { data: table, error } = await supabaseAdmin.from('hotel_tables').select('id,business_id,branch_id,seating_capacity,status,availability_status').eq('id', req.params.tableId).maybeSingle();
    if (error || !table || table.status !== 'active' || table.availability_status !== 'available') return res.status(422).json({ error: 'This table is not available' });
    const guestCount = number(req.body.guest_count, 'guest_count', { integer: true, min: 1, max: table.seating_capacity });
    const { data, error: insertError } = await supabaseAdmin.from('table_reservations').insert({ business_id: table.business_id, branch_id: table.branch_id, table_id: table.id, customer_id: user.id, reservation_at: reservationAt.toISOString(), guest_count: guestCount }).select().single();
    if (insertError) throw insertError; return res.status(201).json({ reservation: data });
  } catch (error) { if (error instanceof ValidationError) return res.status(400).json({ error: error.message }); return res.status(500).json({ error: 'Unable to create reservation' }); }
});

// Public business profile data is scoped to active offerings and intentionally
// exposes no precise branch coordinates.
router.get('/businesses/:businessId/public', async (req, res) => {
  try { uuid(req.params.businessId, 'business id'); } catch { return res.status(400).json({ error: 'Invalid business id' }); }
  const { data: business, error } = await supabaseAdmin.from('businesses').select('id,name,description,status,business_niches(niche)').eq('id', req.params.businessId).eq('status', 'active').maybeSingle();
  if (error || !business) return res.status(404).json({ error: 'Business not found' });
  const [{ data: branches }, { data: rooms }, { data: menus }, { data: tables }] = await Promise.all([
    supabaseAdmin.from('business_branches').select('id,name,address_text,county_city,status').eq('business_id', business.id).eq('status', 'active'),
    supabaseAdmin.from('hotel_room_offerings').select('branch_id,listing:listings!inner(id,title,description,location_text,category,listing_booking_details(price_amount,price_unit))').eq('business_id', business.id),
    supabaseAdmin.from('hotel_menus').select('id,branch_id,title,description,hotel_menu_categories(id,name,display_order,hotel_menu_items(id,name,description,price_amount,photo_url))').eq('business_id', business.id).eq('status', 'active'),
    supabaseAdmin.from('hotel_tables').select('id,branch_id,identifier,seating_capacity,area_description,setting,availability_status').eq('business_id', business.id).eq('status', 'active').eq('availability_status', 'available'),
  ]);
  return res.json({ business: { id: business.id, name: business.name, description: business.description, niches: (business.business_niches || []).map((n) => n.niche) }, branches: branches || [], rooms: rooms || [], menus: menus || [], tables: tables || [] });
});

module.exports = router;
