require('dotenv').config();

const express = require('express');
const path = require('path');
const supabaseAdmin = require('./lib/supabaseClient');
const { getListingLocation, getBookingLocation } = require('./lib/locationAccess');

const app = express();
const PORT = process.env.PORT || 3000;
const PROPERTY_NEWS_API_URL = (process.env.PROPERTY_NEWS_API_URL || '').replace(/\/$/, '');

app.use(express.json());

// Serve the frontend (client/) as static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Placeholder API route — real listing/provider/client routes will live in ./routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'varoom-server' });
});

// Public Property News is served by the isolated Phase 1 FastAPI service.
// The browser stays on the VaRoom origin and never receives database or
// service-role credentials. Only public /api/news routes are proxied here;
// review and pipeline routes remain private to the property-news service.
async function proxyPropertyNews(req, res) {
  if (!PROPERTY_NEWS_API_URL) {
    return res.status(503).json({ error: 'Property news is not configured yet.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = new URL(req.originalUrl, `${PROPERTY_NEWS_API_URL}/`);
    const response = await fetch(upstream, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await response.text();
    res.status(response.status);
    res.set('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.set('Cache-Control', response.ok ? 'public, max-age=60' : 'no-store');
    return res.send(body);
  } catch (error) {
    console.error('Property news proxy failed:', error.message);
    res.set('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Property news is temporarily unavailable.' });
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/news', proxyPropertyNews);
app.get('/api/news/*', proxyPropertyNews);

// Quick way to confirm the Supabase connection actually works once you've
// filled in server/.env and run the schema SQL.
app.get('/api/db-check', async (req, res) => {
  const { error } = await supabaseAdmin.from('listings').select('id').limit(1);
  if (error) {
    return res.status(500).json({ connected: false, error: error.message });
  }
  res.json({ connected: true });
});

// Delete the calling user's own account. Requires the service-role key
// (only available server-side) since a regular client can't delete its
// own auth.users row. The caller must send their Supabase access token
// in the Authorization header — we verify it belongs to a real session
// before deleting, so nobody can delete an account that isn't theirs.
app.post('/api/delete-account', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing access token' });
  }

  const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
  if (verifyError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  // profiles row is deleted automatically via the ON DELETE CASCADE
  // foreign key back to auth.users, set up in the original schema.
  res.json({ success: true });
});

// Resolves the calling user from an optional Bearer token. Returns null
// (not an error) when there is no token — location endpoints allow
// anonymous callers and just fall back to Level 1 Public data for them.
async function getRequestingUserId(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// Google Maps Integration, Phase 1: the only routes allowed to read
// listings.latitude/longitude or bookings.location_snapshot. See
// server/lib/locationAccess.js for the access-level rules this enforces.
app.get('/api/listings/:id/location', async (req, res) => {
  const requestingUserId = await getRequestingUserId(req);
  const result = await getListingLocation(supabaseAdmin, {
    listingId: req.params.id,
    requestingUserId,
  });
  if (result.error) {
    return res.status(404).json({ error: result.error });
  }
  res.json(result);
});

app.get('/api/bookings/:id/location', async (req, res) => {
  const requestingUserId = await getRequestingUserId(req);
  if (!requestingUserId) {
    return res.status(401).json({ error: 'Login required' });
  }
  const result = await getBookingLocation(supabaseAdmin, {
    bookingId: req.params.id,
    requestingUserId,
  });
  if (result.error) {
    const status = result.error === 'Not authorized to view this booking' ? 403 : 404;
    return res.status(status).json({ error: result.error });
  }
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`VaRoom server running at http://localhost:${PORT}`);
});
