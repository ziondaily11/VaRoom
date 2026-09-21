require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const supabaseAdmin = require('./lib/supabaseClient');
const { getListingLocation, getBookingLocation, getListingDistance } = require('./lib/locationAccess');
const videoRoutes = require('./routes/videoRoutes');
const listingRoutes = require('./routes/listingRoutes');
const chatAttachmentRoutes = require('./routes/chatAttachmentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { createAdminRoutes } = require('./routes/adminRoutes');
const { rejectSuspendedActivity } = require('./lib/accountAccess');
const { runFullCleanup } = require('./lib/videoCleanup');
const { MAX_JSON_BYTES, validateJsonPayload, ValidationError, uuid, text, number } = require('./lib/inputValidation');
const { ERROR_CODES, sendError } = require('./lib/apiResponse');
const { createBillingRoutes } = require('./routes/billingRoutes');
const { createPaystackWebhookRoutes } = require('./routes/paystackWebhookRoutes');
const { sendRecoveryOtp, sendConfirmationEmail } = require('./lib/authEmail');

const app = express();
const PORT = process.env.PORT || 3000;
const PROPERTY_NEWS_API_URL = (process.env.PROPERTY_NEWS_API_URL || '').replace(/\/$/, '');
const VIDEO_CLEANUP_INTERVAL_MS = Math.max(
  1,
  Number.parseInt(process.env.VIDEO_CLEANUP_INTERVAL_HOURS || '6', 10)
) * 60 * 60 * 1000;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});
// Paystack signs the exact request bytes. This must remain before JSON parsing
// and before the generic /api rate limiter so provider retries are not blocked.
app.use('/api/billing/paystack/webhook', express.raw({ type: 'application/json', limit: '1mb' }), createPaystackWebhookRoutes());

app.use(express.json({ limit: MAX_JSON_BYTES, strict: true }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body !== undefined) {
    return validateJsonPayload(req, res, next);
  }
  return next();
});
const apiRequestTracker = new Map();
app.use('/api', (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const recent = (apiRequestTracker.get(key) || []).filter((timestamp) => now - timestamp < 60000);
  if (recent.length >= 120) return sendError(res, 429, 'Too many requests', ERROR_CODES.RATE_LIMITED);
  recent.push(now);
  apiRequestTracker.set(key, recent);
  return next();
});

// Mount video upload routes
app.use('/api', videoRoutes);
app.use('/api', listingRoutes);
app.use('/api', chatAttachmentRoutes);
app.use('/api', chatRoutes);
app.use('/api', reviewRoutes);
app.use('/api', notificationRoutes);
app.use('/api', createBillingRoutes());

// Serve the Next.js public assets when this service is used as the web host.
const clientDirectory = path.join(__dirname, '..', 'client');
const legacyPagesDirectory = path.join(clientDirectory, 'legacy-pages');
app.use(express.static(path.join(clientDirectory, 'public')));

app.use('/admin', createAdminRoutes(supabaseAdmin));

// A narrow authenticated read endpoint keeps account_controls private while
// allowing the normal home experience to explain browse-only suspension.
app.get('/api/account-status', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return sendError(res, 401, 'Missing access token', ERROR_CODES.UNAUTHORIZED);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return sendError(res, 401, 'Invalid or expired session', ERROR_CODES.UNAUTHORIZED);
  const { data, error } = await supabaseAdmin.from('account_controls')
    .select('status,changed_at').eq('user_id', user.id).maybeSingle();
  if (error) return sendError(res, 502, 'Unable to load account status');
  return res.json({ status: data?.status || 'active', suspended: Boolean(data && data.status !== 'active') });
});

app.post('/api/listing-reports', async (req, res) => {
  const { listing_id: listingId, reason, details } = req.body || {};
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return sendError(res, 401, 'Missing access token', ERROR_CODES.UNAUTHORIZED);

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return sendError(res, 401, 'Invalid or expired session', ERROR_CODES.UNAUTHORIZED);
  if (await rejectSuspendedActivity(res, user.id)) return;

  try {
    const normalizedListingId = uuid(listingId, 'listing_id');
    const normalizedReason = text(reason, 'reason', { max: 100 });
    const normalizedDetails = text(details, 'details', { required: false, max: 2000 });
    const { data, error } = await supabaseAdmin.from('listing_reports').insert({
      listing_id: normalizedListingId,
      reporter_user_id: user.id,
      reason: normalizedReason,
      details: normalizedDetails || null
    }).select('id,listing_id,reason,status,created_at').single();
    if (error) return sendError(res, 502, 'Unable to submit listing report');
    return res.status(201).json({ report: data });
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message, ERROR_CODES.BAD_REQUEST);
    throw error;
  }
});

app.post(['/support/tickets', '/api/support/tickets'], async (req, res) => {
  const { name, email, subject, message, priority = 'normal' } = req.body || {};
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let authUser = null;
  if (token) {
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (!authError) authUser = user;
  }

  let profileName = null;
  if (authUser && authUser.id) {
    const { data: profileData } = await supabaseAdmin.from('profiles').select('full_name').eq('id', authUser.id).maybeSingle();
    profileName = profileData && profileData.full_name ? String(profileData.full_name).trim() : null;
  }

  const resolvedName = String(name || profileName || (authUser && (authUser.user_metadata && (authUser.user_metadata.full_name || authUser.user_metadata.name))) || (authUser && authUser.email ? authUser.email.split('@')[0] : '') || '').trim();
  const resolvedEmail = String(email || (authUser && authUser.email) || '').trim().toLowerCase();
  const safeSubject = String(subject || '').trim();
  const safeMessage = String(message || '').trim();

  if (!resolvedName || !resolvedEmail || !safeSubject || !safeMessage || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedEmail)) {
    return sendError(res, 400, 'Name, valid email, subject and message are required');
  }

  let userId = null;
  if (authUser) userId = authUser.id;

  const { data, error } = await supabaseAdmin.from('support_tickets').insert({
    user_id: userId,
    name: resolvedName,
    email: resolvedEmail,
    subject: safeSubject,
    message: safeMessage,
    priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal'
  }).select('id,status,created_at').single();
  if (error) return sendError(res, 502, 'Unable to create support ticket');
  return res.status(201).json({ ticket: data });
});

const pageTemplates = {
  '/': 'index.html',
  '/login': 'login.html',
  '/register': 'signup-client.html',
  '/signup-client': 'signup-client.html',
  '/signup-host': 'signup-host.html',
  '/bookings': 'bookings.html',
  '/properties': 'list.html',
  '/list': 'list.html',
  '/client-home': 'client-home.html',
  '/host-home': 'host-home.html',
  '/booking': 'booking.html',
  '/booking-approved': 'booking-approved.html',
  '/chats': 'chats.html',
  '/chat': 'chats.html',
  '/analytics': 'analytics.html',
  '/auth-callback': 'auth-callback.html',
  '/forgot-password': 'forgot-password.html',
  '/elie': 'elie.html',
  '/map': 'map.html',
  '/marketplace': 'marketplace.html',
  '/notifications': 'notifications.html',
  '/chat-settings': 'chat-settings.html',
  '/onboarding': 'onboarding.html',
  '/payments': 'payments.html',
  '/privacy': 'privacy.html',
  '/profile-public': 'profile-public.html',
  '/profile': 'profile.html',
  '/property-news': 'property-news.html',
  '/pricing': 'pricing.html',
  '/pricing.html': 'pricing.html',
  '/settings': 'settings.html',
  '/support': 'support.html',
  '/terms': 'terms.html',
  '/transactions': 'transactions.html',
  '/varoom-post': 'varoom-post.html',
  '/landing-page': 'landing page.html'
};

Object.entries(pageTemplates).forEach(([route, template]) => {
  app.get(route, (_req, res) => {
    if (template !== 'chats.html') return res.sendFile(path.join(legacyPagesDirectory, template));
    fs.readFile(path.join(legacyPagesDirectory, template), 'utf8', (error, html) => {
      if (error) {
        console.error('Chat page delivery failed:', error);
        return res.sendStatus(500);
      }
      res.type('html').send(html.replace(
        '</body>',
        '<script src="/js/supabase-client.js"></script><script src="/js/chat-data.js"></script></body>'
      ));
    });
  });
});

app.get('/u/:username', (_req, res) => {
  res.sendFile(path.join(legacyPagesDirectory, 'profile-public.html'));
});

const otpRequestTracker = new Map();
const confirmationRequestTracker = new Map();
const AUTH_EMAIL_COOLDOWN_MS = 60000;
const hasEmailProvider = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
function authRedirectUrl(redirect) {
  const baseUrl = `${(process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '')}/auth-callback`;
  // Preserve only a local post-auth destination; never reflect an external URL
  // into an authentication email.
  return typeof redirect === 'string' && /^\/(?!\/)/.test(redirect)
    ? `${baseUrl}?redirect=${encodeURIComponent(redirect)}`
    : baseUrl;
}

function isThrottled(tracker, key) {
  const elapsed = Date.now() - (tracker.get(key) || 0);
  return elapsed < AUTH_EMAIL_COOLDOWN_MS ? Math.ceil((AUTH_EMAIL_COOLDOWN_MS - elapsed) / 1000) : 0;
}

app.post('/api/auth/forgot-password', async (req, res) => {
  const normalizedEmail = String((req.body || {}).email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return sendError(res, 400, 'Please enter a valid email address');
  const waitSeconds = isThrottled(otpRequestTracker, normalizedEmail);
  if (waitSeconds) return sendError(res, 429, `Please wait ${waitSeconds}s before requesting another code.`, ERROR_CODES.RATE_LIMITED);
  if (!hasEmailProvider()) {
    console.error('Password-reset delivery is not configured: RESEND_API_KEY and RESEND_FROM_EMAIL are required.');
    return sendError(res, 503, 'Email delivery is temporarily unavailable. Please try again later.');
  }
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email: normalizedEmail });
    if (error) return res.json({ success: true, message: "If an account exists for this email, we've sent you a verification code." });
    await sendRecoveryOtp(normalizedEmail, data.properties && data.properties.email_otp);
    otpRequestTracker.set(normalizedEmail, Date.now());
    return res.json({ success: true, message: "If an account exists for this email, we've sent you a verification code." });
  } catch (error) {
    console.error('Forgot-password email failed:', error.message);
    return sendError(res, 502, 'Could not send the verification code. Please try again.');
  }
});

async function createSignupConfirmation({ email, password, fullName, role, redirect }) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    data: { full_name: fullName, role },
    options: { redirectTo: authRedirectUrl(redirect) }
  });
  if (error) throw error;
  try {
    await sendConfirmationEmail(email, data.properties && data.properties.action_link);
  } catch (error) {
    // generateLink creates the user. Roll it back when delivery fails so the
    // address is not stranded in an account it cannot confirm.
    if (data.user && data.user.id) await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => {});
    throw error;
  }
  return data.user;
}

app.post('/api/auth/sign-up', async (req, res) => {
  const { email, password, fullName, role, redirect } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || String(password || '').length < 8 || String(fullName || '').trim().length < 2 || !['client', 'host'].includes(role)) return sendError(res, 400, 'Please provide a name, valid email address, and password of at least 8 characters.');
  if (!hasEmailProvider()) return sendError(res, 503, 'Email delivery is temporarily unavailable. Please try again later.');
  if (isThrottled(confirmationRequestTracker, normalizedEmail)) return sendError(res, 429, 'Please wait before requesting another confirmation email.', ERROR_CODES.RATE_LIMITED);
  try {
    await createSignupConfirmation({ email: normalizedEmail, password, fullName: String(fullName).trim(), role, redirect });
    confirmationRequestTracker.set(normalizedEmail, Date.now());
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Account signup or confirmation email failed:', error.message);
    const status = /already registered|already exists/i.test(error.message || '') ? 409 : 502;
    return sendError(res, status, status === 409 ? 'An account with this email already exists.' : 'We could not send the confirmation email. Please try again.');
  }
});

app.post('/api/auth/resend-confirmation', async (req, res) => {
  const normalizedEmail = String((req.body || {}).email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return sendError(res, 400, 'Please enter a valid email address.');
  if (!hasEmailProvider()) return sendError(res, 503, 'Email delivery is temporarily unavailable. Please try again later.');
  if (isThrottled(confirmationRequestTracker, normalizedEmail)) return sendError(res, 429, 'Please wait before requesting another confirmation email.', ERROR_CODES.RATE_LIMITED);
  try {
    // Supabase refreshes the confirmation token for an existing unconfirmed
    // account without requiring its password. This gives expired links a
    // secure resend path while preserving the original account.
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup', email: normalizedEmail, options: { redirectTo: authRedirectUrl() }
    });
    if (error) throw error;
    await sendConfirmationEmail(normalizedEmail, data.properties && data.properties.action_link);
    confirmationRequestTracker.set(normalizedEmail, Date.now());
  } catch (error) {
    // Keep account existence private, but do not claim delivery succeeded when
    // the configured mail provider itself rejected the message.
    if (/already registered|already exists/i.test(error.message || '')) {
      return res.json({ success: true, message: "If that email has a pending verification, we've sent a new link." });
    }
    console.error('Confirmation resend failed:', error.message);
    return sendError(res, 502, 'Could not send the confirmation email. Please try again.');
  }
  return res.json({ success: true, message: "If that email has a pending verification, we've sent a new link." });
});

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
    return sendError(res, 503, 'Property news is not configured yet.');
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
    // Moderation can publish a story immediately; require clients to
    // revalidate so an older feed is not shown after approval.
    res.set('Cache-Control', response.ok ? 'public, max-age=0, must-revalidate' : 'no-store');
    return res.send(body);
  } catch (error) {
    console.error('Property news proxy failed:', error.message);
    res.set('Cache-Control', 'no-store');
    return sendError(res, 502, 'Property news is temporarily unavailable.');
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

// Delete an authenticated account. The selected account's access token must
// be provided, so a dashboard can delete a stored non-active account without
// granting the browser any service-role privileges.
app.post('/api/delete-account', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return sendError(res, 401, 'Missing access token');
  }

  const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
  if (verifyError || !user) {
    return sendError(res, 401, 'Invalid or expired session');
  }
  if (await rejectSuspendedActivity(res, user.id)) return;

  const reasons = [
    'I no longer use VaRoom',
    'I created another account',
    'Privacy concerns',
    "I'm unhappy with the service",
    'Technical issues',
    'Other'
  ];
  const accountId = String(req.body && req.body.account_id || '').trim();
  const reason = String(req.body && req.body.reason || '').trim();
  const reasonDetails = String(req.body && req.body.reason_details || '').trim();
  if (!accountId || accountId !== user.id || !reasons.includes(reason)) {
    return sendError(res, 400, 'A valid account and deletion reason are required');
  }
  if (reason === 'Other' && !reasonDetails) {
    return sendError(res, 400, 'Please explain your reason for deleting the account');
  }

  const { data: deletion, error: auditError } = await supabaseAdmin.from('account_deletions').insert({
    account_id: user.id,
    account_email: user.email || null,
    reason,
    reason_details: reason === 'Other' ? reasonDetails : null
  }).select('id').single();
  if (auditError) {
    console.error('Account deletion audit failed:', auditError.message);
    return sendError(res, 502, 'Unable to record account deletion');
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    await supabaseAdmin.from('account_deletions').delete().eq('id', deletion.id);
    console.error('Account deletion failed:', deleteError.message);
    return sendError(res, 500, 'Unable to delete account');
  }

  return res.json({ success: true, account_id: user.id });
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
  try { uuid(req.params.id, 'listing id'); } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, 'Invalid input');
    throw error;
  }
  const requestingUserId = await getRequestingUserId(req);
  const result = await getListingLocation(supabaseAdmin, {
    listingId: req.params.id,
    requestingUserId,
  });
  if (result.error) {
    return sendError(res, 404, result.error);
  }
  res.json(result);
});

app.get('/api/bookings/:id/location', async (req, res) => {
  try { uuid(req.params.id, 'booking id'); } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, 'Invalid input');
    throw error;
  }
  const requestingUserId = await getRequestingUserId(req);
  if (!requestingUserId) {
    return sendError(res, 401, 'Login required');
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

// Public config the frontend needs to boot the Google Maps JS SDK. Returns
// apiKey: null (not an error) when GOOGLE_MAPS_API_KEY isn't set yet, so
// every map-dependent screen can degrade gracefully instead of breaking
// while the key is being provisioned.
app.get('/api/maps-config', (req, res) => {
  res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY || null });
});

// Distance is derived server-side from the listing's private coordinates
// and the caller's own coordinates (sent in the query string, only ever
// after the browser's own geolocation permission prompt) — the listing's
// coordinates themselves are never sent back (spec section 11).
app.get('/api/listings/:id/distance', async (req, res) => {
  try { uuid(req.params.id, 'listing id'); } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, 'Invalid input');
    throw error;
  }
  let lat;
  let lng;
  try {
    if (typeof req.query.lat !== 'string' || typeof req.query.lng !== 'string') throw new ValidationError('coordinates required');
    lat = number(Number(req.query.lat), 'lat', { min: -90, max: 90 });
    lng = number(Number(req.query.lng), 'lng', { min: -180, max: 180 });
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, 'Invalid input');
    throw error;
  }
  const result = await getListingDistance(supabaseAdmin, {
    listingId: req.params.id,
    userLat: lat,
    userLng: lng,
  });
  if (result.error) {
    return sendError(res, 404, result.error);
  }
  res.json(result);
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && error.body) {
    return sendError(res, 400, 'Invalid input');
  }
  if (error.type === 'entity.too.large') return sendError(res, 413, 'Request body too large');
  console.error('Unhandled API error:', error);
  return sendError(res, 500, 'Internal server error', ERROR_CODES.INTERNAL_ERROR);
});

const videoCleanupTimer = setInterval(() => {
  runFullCleanup().catch((error) => {
    console.error('Scheduled video cleanup failed:', error);
  });
}, VIDEO_CLEANUP_INTERVAL_MS);
videoCleanupTimer.unref();

app.listen(PORT, () => {
  console.log(`VaRoom server listening on port ${PORT}`);
});
