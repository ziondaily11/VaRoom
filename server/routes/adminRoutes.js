const crypto = require('crypto');
const express = require('express');
const { sendEmail, SECURITY_EMAIL_FROM } = require('../lib/email');
const { createNotification } = require('../lib/notifications');
const { resolveFrontendRouteRedirect } = require('../lib/frontendRoute');
const enforcement = require('../lib/enforcement');
const { ticketRef } = require('../lib/supportInbox');
const investigation = require('../lib/adminInvestigation');
const money = require('../lib/adminMoney');
const security = require('../lib/adminSecurity');
const { healthReport, attentionCounts, accountCounts } = require('../lib/adminHealth');
const { signedDocumentUrl } = require('../lib/listingDocumentAccess');

const SESSION_COOKIE = 'varoom_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SUPPORT_FROM = process.env.RESEND_FROM_EMAIL || 'VaRoom Support <support@varoom.co.ke>';

// Escapes all five HTML-special characters to prevent XSS in generated email HTML.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      const actual = derivedKey.toString('hex');
      resolve(actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected)));
    });
  });
}

// ADMIN_SESSION_SECRET is required. Falling back to the service-role key would
// couple two independent security boundaries to a single secret.
function encodeSession(adminId) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured');
  const payload = `${adminId}.${Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function decodeSession(value) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null; // Admin panel is not configured — reject all sessions.
  const [adminId, expires, signature] = String(value || '').split('.');
  if (!adminId || !expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return null;
  const payload = `${adminId}.${expires}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return adminId;
}

function requireAdmin(supabaseAdmin) {
  return async (req, res, next) => {
    const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
      const separator = part.indexOf('=');
      return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
    }));
    const adminId = decodeSession(cookies[SESSION_COOKIE] || req.headers['x-admin-session']);
    if (!adminId) return res.status(401).json({ error: 'Admin authentication required' });
    const { data: admin, error } = await supabaseAdmin.from('admins')
      .select('id,name,email,role,last_login_at,totp_enabled_at').eq('id', adminId).maybeSingle();
    if (error || !admin) return res.status(401).json({ error: 'Invalid admin session' });
    req.admin = admin;
    return next();
  };
}

function requireAdminRole(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.admin.role)) return next();
    return res.status(403).json({ error: 'Your admin role is not allowed to perform this action' });
  };
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// accountStatus: the sender's account now (suspended, disabled…), or visitor.
function normalizeTicket(ticket, controlById = {}) {
  return {
    ...ticket,
    createdAt: ticket.created_at,
    accountStatus: ticket.user_id ? enforcement.effectiveStatus(controlById[ticket.user_id]) : 'visitor'
  };
}

async function controlsFor(supabaseAdmin, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabaseAdmin.from('account_controls')
    .select('user_id,status,reason,suspended_until,rule_key,changed_at,changed_by').in('user_id', ids);
  if (error) throw error;
  return Object.fromEntries((data || []).map((control) => [control.user_id, control]));
}

// Express 4 does not catch a rejected async handler; this passes it to the error handler.
const caught = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// The account's control row with its status now (an ended timed suspension is active).
const accountOf = (control, bannedUntil) => (control
  ? { ...control, status: enforcement.effectiveStatus(control) }
  : { status: bannedUntil ? 'suspended' : 'active' });

function createAdminRoutes(supabaseAdmin) {
  // Fail fast if the session signing secret is missing so misconfigurations
  // are caught at startup rather than silently falling back to another key.
  if (!process.env.ADMIN_SESSION_SECRET) {
    console.error('FATAL: ADMIN_SESSION_SECRET is not set. Admin panel routes are disabled.');
    const disabledRouter = express.Router();
    disabledRouter.use((_req, res) => res.status(503).json({ error: 'Admin panel is not configured' }));
    return disabledRouter;
  }

  const router = express.Router();
  const adminAuth = requireAdmin(supabaseAdmin);
  const adminWrite = [adminAuth, requireAdminRole('super_admin', 'support')];
  const superAdmin = [adminAuth, requireAdminRole('super_admin')];
  const propertyNewsUrl = (process.env.PROPERTY_NEWS_API_URL || '').replace(/\/$/, '');
  const propertyNewsAdminApiKey = (process.env.PROPERTY_NEWS_ADMIN_API_KEY || '').trim();

  // Per-email brute-force protection for the admin login endpoint.
  // Addresses that are not admins are throttled here; an admin's own row
  // carries its lockout (lib/adminSecurity.js), shared by every instance.
  const loginFailTracker = new Map(); // email -> { count, lockedUntil }
  const LOGIN_MAX_ATTEMPTS = 5;
  const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

  async function propertyNewsRequest(path, options = {}) {
    if (!propertyNewsUrl || !propertyNewsAdminApiKey) {
      const error = new Error('Property News administration is not configured');
      error.statusCode = 503;
      throw error;
    }

    const response = await fetch(propertyNewsUrl + path, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
        Authorization: 'Bearer ' + propertyNewsAdminApiKey,
      },
    });

    const body = await response.text();
    if (!response.ok) {
      const parsed = body ? (() => { try { return JSON.parse(body); } catch { return null; } })() : null;
      const reason = parsed && parsed.detail ? parsed.detail : body || 'Property News request failed';
      const error = new Error(
        response.status === 401
          ? 'Property News admin auth failed. Check PROPERTY_NEWS_ADMIN_API_KEY matches NEWS_ADMIN_API_KEY on the Property News service.'
          : reason
      );
      error.statusCode = response.status;
      throw error;
    }

    return body ? JSON.parse(body) : null;
  }

  async function logActivity(admin, action, targetType, targetId, reason, metadata = {}) {
    const { error } = await supabaseAdmin.from('admin_activity').insert({
      admin_id: admin.id, action, target_type: targetType, target_id: String(targetId),
      reason: reason || null, metadata,
    });
    if (error) console.error('Admin activity log failed:', error.message);
  }

  function requiredReason(req, res) {
    const reason = String(req.body && req.body.reason || '').trim();
    if (!reason) {
      res.status(400).json({ error: 'A reason is required for this action' });
      return null;
    }
    return reason.slice(0, 2000);
  }

  router.get('/login', (_req, res) => res.type('html').send('<!doctype html><title>VaRoom Admin login</title><form method="post" action="/admin/login"><input name="email" type="email" required placeholder="Email"><input name="password" type="password" required placeholder="Password"><button>Log in</button></form>'));

  router.get('/set-password', (req, res) => {
    const token = String(req.query.token || '').replace(/[^a-zA-Z0-9]/g, '');
    return res.type('html').send(`<!doctype html><title>Set VaRoom Admin password</title><form method="post" action="/admin/set-password"><input name="token" type="hidden" value="${token}"><input name="password" type="password" minlength="12" required placeholder="New password"><button>Set password</button></form>`);
  });

  router.post('/set-password', async (req, res) => {
    const token = String(req.body && req.body.token || '').trim();
    const password = String(req.body && req.body.password || '');
    if (!token || password.length < 12) return res.status(400).json({ error: 'A token and password of at least 12 characters are required' });
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const { data: admin, error } = await supabaseAdmin.from('admins').select('id').eq('invite_token_hash', hash).gt('invite_expires_at', new Date().toISOString()).maybeSingle();
    if (error || !admin) return res.status(400).json({ error: 'Invite is invalid or expired' });
    const passwordHash = await hashPassword(password);
    const { error: updateError } = await supabaseAdmin.from('admins').update({ password_hash: passwordHash, password_set_at: new Date().toISOString(), invite_token_hash: null, invite_expires_at: null }).eq('id', admin.id);
    if (updateError) return res.status(502).json({ error: updateError.message });
    return res.json({ success: true });
  });

  // The admin dashboard is the frontend's React /admin page; the legacy
  // varoomadmin.html is retired. The API routes below serve that page.
  router.get('/', (req, res) => {
    const redirect = resolveFrontendRouteRedirect({
      frontendBaseUrl: process.env.PUBLIC_BASE_URL || process.env.CLIENT_BASE_URL,
      requestHost: req.get('host'),
      requestUrl: req.originalUrl,
      destinationPath: '/admin',
      unavailableMessage: 'The admin dashboard is not available from this server.',
    });
    if (redirect.location) return res.redirect(redirect.status, redirect.location);
    return res.status(redirect.status).send(redirect.message);
  });

  router.post('/login', async (req, res) => {
    const email = String(req.body && req.body.email || '').trim().toLowerCase();
    const password = String(req.body && req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    // Brute-force protection: check lockout before touching the database.
    const now = Date.now();
    const attempt = loginFailTracker.get(email) || { count: 0, lockedUntil: 0 };
    if (attempt.lockedUntil > now) {
      const waitSeconds = Math.ceil((attempt.lockedUntil - now) / 1000);
      res.set('Retry-After', String(waitSeconds));
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${waitSeconds}s.` });
    }

    const { data: admin, error } = await supabaseAdmin.from('admins').select('*').eq('email', email).maybeSingle();
    if (error) return res.status(502).json({ error: 'Unable to sign in right now' });
    const locked = admin && security.lockout(admin);
    if (locked) {
      res.set('Retry-After', String(locked.waitSeconds));
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${locked.waitSeconds}s.` });
    }
    const fail = async (message, extra = {}) => {
      if (admin) {
        await supabaseAdmin.from('admins').update(security.failedAttempt(admin)).eq('id', admin.id);
      } else {
        const newCount = attempt.count + 1;
        loginFailTracker.set(email, { count: newCount, lockedUntil: newCount >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_LOCKOUT_MS : attempt.lockedUntil });
      }
      return res.status(401).json({ error: message, ...extra });
    };
    if (!admin || !(await verifyPassword(password, admin.password_hash))) return fail('Invalid email or password');

    // Two-step sign-in: the password is right; the authenticator code is asked for next.
    if (admin.totp_enabled_at) {
      const code = String(req.body && req.body.code || '').trim();
      if (!code) return res.status(401).json({ error: 'Enter the 6-digit code from your authenticator app', code_required: true });
      let valid = false;
      try { valid = security.verifyTotp(security.decryptSecret(admin.totp_secret_encrypted), code); } catch { valid = false; }
      if (!valid) return fail('That code is not right. Check your authenticator app and try again.', { code_required: true });
    }

    // Success — clear the failure record and issue a session.
    loginFailTracker.delete(email);
    await supabaseAdmin.from('admins').update({ last_login_at: new Date().toISOString(), failed_logins: 0, locked_until: null }).eq('id', admin.id);
    res.set('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(encodeSession(admin.id))}; HttpOnly; SameSite=Lax;${process.env.NODE_ENV === 'production' ? ' Secure;' : ''} Max-Age=${SESSION_TTL_SECONDS}; Path=/`);
    return res.json({ admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, totp_enabled: Boolean(admin.totp_enabled_at) } });
  });

  router.post('/logout', adminAuth, (req, res) => {
    res.set('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`);
    res.status(204).end();
  });

  router.get('/session', adminAuth, (req, res) => {
    const { totp_enabled_at: totpEnabledAt, ...admin } = req.admin;
    return res.json({ admin: { ...admin, totp_enabled: Boolean(totpEnabledAt) } });
  });

  // Two-step sign-in for the signed-in admin: set up (a new secret, shown
  // once), confirm with a first code to turn it on, or turn it off with a code.
  router.post('/me/totp/setup', adminAuth, async (req, res) => {
    if (req.admin.totp_enabled_at) return res.status(409).json({ error: 'Two-step sign-in is already on' });
    const secret = security.newTotpSecret();
    const { error } = await supabaseAdmin.from('admins').update({ totp_secret_encrypted: security.encryptSecret(secret) }).eq('id', req.admin.id);
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ secret, uri: security.otpauthUri(secret, req.admin.email) });
  });

  async function codeMatches(adminId, code) {
    const { data, error } = await supabaseAdmin.from('admins').select('totp_secret_encrypted').eq('id', adminId).maybeSingle();
    if (error || !data || !data.totp_secret_encrypted) return false;
    try { return security.verifyTotp(security.decryptSecret(data.totp_secret_encrypted), String(code || '').trim()); } catch { return false; }
  }

  router.post('/me/totp/enable', adminAuth, async (req, res) => {
    if (!(await codeMatches(req.admin.id, req.body && req.body.code))) return res.status(400).json({ error: 'That code is not right. Check your authenticator app and try again.' });
    const { error } = await supabaseAdmin.from('admins').update({ totp_enabled_at: new Date().toISOString() }).eq('id', req.admin.id);
    if (error) return res.status(502).json({ error: error.message });
    await logActivity(req.admin, 'admin_two_step_enabled', 'admin', req.admin.id, null);
    return res.json({ enabled: true });
  });

  router.post('/me/totp/disable', adminAuth, async (req, res) => {
    if (!req.admin.totp_enabled_at) return res.status(409).json({ error: 'Two-step sign-in is not on' });
    if (!(await codeMatches(req.admin.id, req.body && req.body.code))) return res.status(400).json({ error: 'That code is not right. Check your authenticator app and try again.' });
    const { error } = await supabaseAdmin.from('admins').update({ totp_enabled_at: null, totp_secret_encrypted: null }).eq('id', req.admin.id);
    if (error) return res.status(502).json({ error: error.message });
    await logActivity(req.admin, 'admin_two_step_disabled', 'admin', req.admin.id, null);
    return res.json({ enabled: false });
  });

  router.get('/news/pending', adminAuth, async (_req, res) => {
    try {
      return res.json(await propertyNewsRequest('/api/admin/news/pending'));
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message });
    }
  });

  for (const action of ['approve', 'reject', 'edit', 'request-more-evidence']) {
    router.post(`/news/:id/${action}`, ...adminWrite, async (req, res) => {
      try {
        const payload = { ...(req.body || {}), action };
        const result = await propertyNewsRequest(`/api/admin/news/${encodeURIComponent(req.params.id)}/${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        await logActivity(req.admin, action === 'approve' ? 'property_news_published' : `property_news_${action}`, 'property_news', req.params.id, String(req.body && req.body.reason || '').trim());
        return res.json(result);
      } catch (error) {
        return res.status(error.statusCode || 502).json({ error: error.message });
      }
    });
  }

  // revenue: what VaRoom earned in the last 7 days (KES), not bookings, which hosts are paid directly.
  router.get('/overview', adminAuth, caught(async (_req, res) => {
    const since = daysAgo(7);
    const [signins, listings, tickets, revenue, attention, accounts] = await Promise.all([
      supabaseAdmin.rpc('admin_recent_signins', { p_since: since }),
      supabaseAdmin.from('listings').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      money.weekRevenue(supabaseAdmin),
      attentionCounts(supabaseAdmin),
      accountCounts(supabaseAdmin, enforcement.effectiveStatus).catch((error) => { console.error('Account counts failed:', error.message); return null; }),
    ]);
    if (signins.error) throw signins.error;
    return res.json({ signins: (signins.data || []).length, revenue, openTickets: tickets.count || 0, newListings: listings.count || 0, attention, accounts });
  }));

  // Each person's latest sign-in in the range (counted in the database, past any number of accounts).
  router.get('/signins', adminAuth, async (req, res) => {
    const range = Math.min(Math.max(Number(req.query.range) || 14, 1), 365);
    const { data, error } = await supabaseAdmin.rpc('admin_recent_signins', { p_since: daysAgo(range) });
    if (error) return res.status(502).json({ error: error.message });
    const rows = (data || []).map((row) => ({ user: row.email, method: row.provider || 'email', time: row.last_sign_in_at }));
    return res.json({ data: rows, series: signinSeries(rows, range) });
  });

  // VaRoom's revenue (plans, listing payments, V-Coins), plans, and payments that failed or were refunded.
  router.get('/revenue', adminAuth, caught(async (req, res) => {
    const range = Math.min(Math.max(Number(req.query.range) || 30, 1), 365);
    return res.json(await money.revenueReport(supabaseAdmin, range));
  }));

  // Money controls on an account (super admins): free plans and V-Coins.
  const moneyAction = (handler) => caught(async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error instanceof money.MoneyError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  });

  router.get('/users/:id/plans', adminAuth, caught(async (req, res) => res.json({ data: await money.plansFor(supabaseAdmin, req.params.id) })));

  router.post('/users/:id/free-plan', ...superAdmin, moneyAction(async (req, res) => {
    const days = Number(req.body && req.body.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'A free plan lasts 1 to 365 days' });
    const reason = requiredReason(req, res);
    if (reason === null) return undefined;
    return res.json(await money.giveFreePlan(supabaseAdmin, { userId: req.params.id, planId: String(req.body.plan_id || ''), days, reason, adminId: req.admin.id }));
  }));

  router.post('/users/:id/free-plan/end', ...superAdmin, moneyAction(async (req, res) => {
    const reason = requiredReason(req, res);
    if (reason === null) return undefined;
    await money.endFreePlan(supabaseAdmin, { userId: req.params.id, reason, adminId: req.admin.id });
    return res.json({ ended: true });
  }));

  router.post('/users/:id/vcoins', ...superAdmin, moneyAction(async (req, res) => {
    const amount = Number(req.body && req.body.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) return res.status(400).json({ error: 'Grant 1 to 10,000 V-Coins' });
    const reason = requiredReason(req, res);
    if (reason === null) return undefined;
    await money.grantVcoins(supabaseAdmin, { userId: req.params.id, amount, reason, adminId: req.admin.id });
    return res.json({ granted: amount });
  }));

  router.get('/support/tickets', adminAuth, caught(async (req, res) => {
    let query = supabaseAdmin.from('support_tickets').select('*').order('updated_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.priority) query = query.eq('priority', req.query.priority);
    const { data, error } = await query;
    if (error) return res.status(502).json({ error: error.message });
    const controls = await controlsFor(supabaseAdmin, (data || []).map((ticket) => ticket.user_id));
    return res.json({ data: (data || []).map((ticket) => normalizeTicket(ticket, controls)) });
  }));

  router.get('/support/tickets/:id', adminAuth, caught(async (req, res) => {
    const [ticketResult, repliesResult] = await Promise.all([
      supabaseAdmin.from('support_tickets').select('*').eq('id', req.params.id).single(),
      supabaseAdmin.from('support_ticket_replies').select('*, admin:admins(name)').eq('ticket_id', req.params.id).order('sent_at')
    ]);
    if (ticketResult.error) return res.status(404).json({ error: 'Ticket not found' });
    const controls = await controlsFor(supabaseAdmin, [ticketResult.data.user_id]);
    return res.json({ ticket: normalizeTicket(ticketResult.data, controls), replies: repliesResult.data || [] });
  }));

  router.post('/support/tickets/:id/replies', ...adminWrite, async (req, res) => {
    const message = String(req.body && req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Reply message is required' });
    const { data: ticket, error: ticketError } = await supabaseAdmin.from('support_tickets').select('*').eq('id', req.params.id).single();
    if (ticketError || !ticket) return res.status(404).json({ error: 'Ticket not found' });
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim() || crypto.randomUUID();
    const { data: existingReply } = await supabaseAdmin.from('support_ticket_replies')
      .select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
    if (existingReply) return res.status(200).json({ reply: existingReply });

    // The [#REF] lets a reply find its ticket even when a mail app drops the headers.
    const ref = `[${ticketRef(ticket.id)}]`;
    const subject = `${/^re:/i.test(ticket.subject) ? '' : 'Re: '}${ticket.subject}${ticket.subject.includes(ref) ? '' : ` ${ref}`}`;
    const inReplyTo = ticket.message_id || null;
    const references = [ticket.message_id].filter(Boolean).join(' ') || null;
    const messageId = `<support-reply-${crypto.randomUUID()}@varoom.co.ke>`;
    const { data: reply, error } = await supabaseAdmin.from('support_ticket_replies')
      .insert({
        ticket_id: ticket.id,
        admin_id: req.admin.id,
        message,
        delivery_status: 'pending',
        sender: SUPPORT_FROM,
        recipient: ticket.email,
        subject,
        message_id: messageId,
        in_reply_to: inReplyTo,
        references_header: references,
        idempotency_key: idempotencyKey
      }).select().single();
    if (error) return res.status(502).json({ error: error.message });

    try {
      const email = await sendEmail({
        from: SUPPORT_FROM,
        to: ticket.email,
        subject,
        html: `<p>${escapeHtml(message)}</p>`,
        headers: {
          'Message-ID': messageId,
          ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
          ...(references ? { References: references } : {})
        },
        idempotencyKey
      });
      const { data: sentReply, error: updateError } = await supabaseAdmin.from('support_ticket_replies')
        .update({ resend_email_id: email.id, delivery_status: 'sent', sent_at: new Date().toISOString(), provider_error: null })
        .eq('id', reply.id).select().single();
      if (updateError) return res.status(502).json({ error: updateError.message });
      // Answered: an open ticket is now in progress (waiting on the person).
      await supabaseAdmin.from('support_tickets').update({ updated_at: new Date().toISOString(), ...(ticket.status === 'open' ? { status: 'in_progress' } : {}) }).eq('id', ticket.id);
      if (ticket.user_id) {
        try {
          await createNotification({
            recipientUserId: ticket.user_id,
            actorUserId: req.admin.id,
            type: 'support_replied',
            title: 'Support replied',
            message: 'VaRoom Support has responded to your support request.',
            relatedEntityType: 'support_ticket',
            relatedEntityId: ticket.id,
            metadata: { ticket_id: ticket.id, subject: ticket.subject },
            eventKey: `support:${ticket.id}:${reply.id}`,
          });
        } catch (notificationError) {
          console.error('Support reply notification failed:', notificationError);
        }
      }
      return res.status(201).json({ reply: sentReply });
    } catch (emailError) {
      await supabaseAdmin.from('support_ticket_replies')
        .update({ delivery_status: 'failed', provider_error: emailError.message, sent_at: new Date().toISOString() })
        .eq('id', reply.id);
      return res.status(502).json({ error: emailError.message });
    }
  });

  // A reply that failed to send, sent again (the same message on the same thread).
  router.post('/support/tickets/:id/replies/:replyId/resend', ...adminWrite, caught(async (req, res) => {
    const { data: reply, error } = await supabaseAdmin.from('support_ticket_replies').select('*')
      .eq('id', req.params.replyId).eq('ticket_id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!reply || reply.direction !== 'outbound') return res.status(404).json({ error: 'Reply not found' });
    if (reply.delivery_status !== 'failed') return res.status(409).json({ error: 'This reply was not a failed one' });
    const headers = {
      ...(reply.message_id ? { 'Message-ID': reply.message_id } : {}),
      ...(reply.in_reply_to ? { 'In-Reply-To': reply.in_reply_to } : {}),
      ...(reply.references_header ? { References: reply.references_header } : {}),
    };
    try {
      const email = await sendEmail({
        from: SUPPORT_FROM, to: reply.recipient, subject: reply.subject, headers,
        html: String(reply.message).split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join(''),
        idempotencyKey: `support-resend-${reply.id}-${Date.now()}`,
      });
      const { data: sent, error: updateError } = await supabaseAdmin.from('support_ticket_replies')
        .update({ delivery_status: 'sent', resend_email_id: email.id, sent_at: new Date().toISOString(), provider_error: null, sender: SUPPORT_FROM })
        .eq('id', reply.id).select('*, admin:admins(name)').single();
      if (updateError) throw updateError;
      await logActivity(req.admin, 'support_reply_resent', 'support_ticket', req.params.id, null, { reply_id: reply.id });
      return res.json({ reply: sent });
    } catch (sendError) {
      await supabaseAdmin.from('support_ticket_replies').update({ provider_error: sendError.message }).eq('id', reply.id);
      return res.status(502).json({ error: sendError.message });
    }
  }));

  router.patch('/support/tickets/:id', ...adminWrite, caught(async (req, res) => {
    const allowed = ['status', 'priority', 'assigned_admin_id'];
    const update = Object.fromEntries(allowed.filter((key) => req.body && req.body[key] !== undefined).map((key) => [key, req.body[key]]));
    const { data, error } = await supabaseAdmin.from('support_tickets').update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ticket: normalizeTicket(data, await controlsFor(supabaseAdmin, [data.user_id])) });
  }));

  // User control is intentionally server-only: auth ban metadata invalidates
  // active Supabase sessions and account_controls is checked by critical DB
  // workflows. The browser never receives a service-role credential.
  // Accounts newest first, a page at a time (?q= matches email, name or username; ?offset=, ?limit=).
  // Accounts newest first, a page at a time (?q= matches email, name or username; ?offset=, ?limit=).
  // ?status=restricted lists the suspended and disabled accounts instead.
  router.get('/users', adminAuth, caught(async (req, res) => {
    if (req.query.status === 'restricted') return res.json(await restrictedAccounts());
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { data, error } = await supabaseAdmin.rpc('admin_list_accounts', { p_query: String(req.query.q || ''), p_limit: limit, p_offset: offset });
    if (error) throw error;
    const ids = (data || []).map((user) => user.id);
    const [controls, roles] = await Promise.all([controlsFor(supabaseAdmin, ids), rolesFor(ids)]);
    return res.json({
      data: (data || []).map((user) => ({
        id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at, provider: user.provider,
        profile: { full_name: user.full_name, username: user.username, role: roles[user.id] || null }, account: accountOf(controls[user.id], user.banned_until),
      })),
      total: data && data[0] ? Number(data[0].total) : 0,
    });
  }));

  async function rolesFor(ids) {
    if (!ids.length) return {};
    const { data, error } = await supabaseAdmin.from('profiles').select('id,role').in('id', ids);
    if (error) throw error;
    return Object.fromEntries((data || []).map((p) => [p.id, p.role]));
  }

  /** Every account suspended or disabled now (a small set), newest restriction first. */
  async function restrictedAccounts() {
    const { data: rows, error } = await supabaseAdmin.from('account_controls')
      .select('user_id,status,reason,suspended_until,rule_key,changed_at,changed_by').neq('status', 'active').order('changed_at', { ascending: false }).limit(500);
    if (error) throw error;
    const restricted = (rows || []).filter((row) => enforcement.effectiveStatus(row) !== 'active');
    const ids = restricted.map((row) => row.user_id);
    const [users, profiles] = await Promise.all([
      Promise.all(ids.map((id) => supabaseAdmin.auth.admin.getUserById(id).then(({ data }) => data && data.user).catch(() => null))),
      ids.length ? supabaseAdmin.from('profiles').select('id,full_name,username,role').in('id', ids) : { data: [] },
    ]);
    if (profiles.error) throw profiles.error;
    const profileById = Object.fromEntries((profiles.data || []).map((p) => [p.id, p]));
    const data = restricted.map((row, i) => {
      const user = users[i];
      return {
        id: row.user_id, email: user && user.email, created_at: user && user.created_at, last_sign_in_at: user && user.last_sign_in_at,
        provider: (user && user.app_metadata && user.app_metadata.provider) || 'email',
        profile: profileById[row.user_id] || null, account: accountOf(row, null),
      };
    });
    return { data, total: data.length };
  }

  // The "Verified host" badge on a host's listings and profile.
  router.post('/users/:id/verified', ...superAdmin, async (req, res) => {
    const verified = req.body && req.body.verified === true;
    const reason = requiredReason(req, res);
    if (reason === null) return;
    const { data, error } = await supabaseAdmin.from('profiles').update({ verified }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Profile not found' });
    await logActivity(req.admin, verified ? 'host_verified' : 'host_verification_removed', 'user', req.params.id, reason);
    if (verified) {
      await createNotification({
        supabase: supabaseAdmin, recipientUserId: req.params.id, type: 'host_verified', title: 'You are a verified host',
        message: 'VaRoom has checked your documents. Your listings and profile now show the Verified host badge.',
        relatedEntityType: 'profile', relatedEntityId: req.params.id, eventKey: `host-verified:${req.params.id}:${Date.now()}`,
      }).catch((notifyError) => console.error('Verified host notice failed:', notifyError.message));
    }
    return res.json({ verified });
  });

  // A host's listing document, opened for the admin checking it (recorded).
  router.get('/documents/:id/open', ...adminWrite, caught(async (req, res) => {
    const { data: document, error } = await supabaseAdmin.from('listing_documents')
      .select('id,host_id,storage_provider,storage_bucket,storage_key,original_filename,mime_type')
      .eq('id', req.params.id).eq('status', 'ready').is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!document) return res.status(404).json({ error: 'Document not found' });
    await logActivity(req.admin, 'listing_document_opened', 'user', document.host_id, null, { document_id: document.id });
    res.set('Cache-Control', 'private, no-store');
    return res.redirect(302, await signedDocumentUrl(document, { inline: true }));
  }));

  // Guest reviews of listings: hide one that breaks the rules, or restore it.
  router.get('/listing-reviews', adminAuth, caught(async (req, res) => {
    let query = supabaseAdmin.from('reviews').select('id,listing_id,host_id,client_id,rating,comment,status,created_at,listing:listings(title)')
      .order('created_at', { ascending: false }).limit(200);
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    const ids = [...new Set((data || []).flatMap((r) => [r.host_id, r.client_id]))];
    const { data: profiles } = ids.length ? await supabaseAdmin.from('profiles').select('id,full_name,username').in('id', ids) : { data: [] };
    const nameOf = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name || p.username]));
    return res.json({ data: (data || []).map((r) => ({ ...r, listing: r.listing && r.listing.title, host: nameOf[r.host_id] || null, guest: nameOf[r.client_id] || null })) });
  }));

  router.patch('/listing-reviews/:id', ...adminWrite, async (req, res) => {
    const status = String(req.body && req.body.status || '');
    if (!['published', 'removed'].includes(status)) return res.status(400).json({ error: 'A review is published or removed' });
    const reason = status === 'removed' ? requiredReason(req, res) : String(req.body && req.body.reason || '').trim();
    if (reason === null) return;
    const { data, error } = await supabaseAdmin.from('reviews').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('id,status').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Review not found' });
    await logActivity(req.admin, status === 'removed' ? 'listing_review_removed' : 'listing_review_restored', 'listing_review', data.id, reason);
    return res.json({ review: data });
  });

  // The health panel (lib/adminHealth.js).
  router.get('/health', adminAuth, caught(async (_req, res) => res.json(await healthReport(supabaseAdmin))));

  // The whole picture of one account (lib/adminInvestigation.js).
  router.get('/users/:id', adminAuth, caught(async (req, res) => {
    const overview = await investigation.accountOverview(supabaseAdmin, req.params.id);
    if (!overview) return res.status(404).json({ error: 'User not found' });
    return res.json(overview);
  }));

  // Private notes on an account: for admins only, never shown to the person.
  router.post('/users/:id/notes', ...adminWrite, async (req, res) => {
    const body = String(req.body && req.body.body || '').trim();
    if (!body || body.length > 4000) return res.status(400).json({ error: 'A note of up to 4,000 characters is required' });
    const { data, error } = await supabaseAdmin.from('admin_notes').insert({ user_id: req.params.id, admin_id: req.admin.id, body })
      .select('id,body,created_at').single();
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.admin, 'account_note_added', 'user', req.params.id, null);
    return res.status(201).json({ note: { ...data, admin: { name: req.admin.name } } });
  });

  // One search box: accounts, listings, tickets (also by #REF) and payments (by reference).
  router.get('/search', adminAuth, caught(async (req, res) => res.json(await investigation.search(supabaseAdmin, req.query.q))));

  // Saved replies for the Support section ({{name}} and {{ticket}} are filled in there).
  router.get('/support/templates', adminAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from('support_reply_templates').select('id,title,body,updated_at').order('title');
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: data || [] });
  });

  function templateFields(req, res) {
    const title = String(req.body && req.body.title || '').trim();
    const body = String(req.body && req.body.body || '').trim();
    if (!title || title.length > 120 || !body || body.length > 5000) {
      res.status(400).json({ error: 'A title (up to 120 characters) and text (up to 5,000) are required' });
      return null;
    }
    return { title, body, updated_at: new Date().toISOString(), updated_by: req.admin.id };
  }

  router.post('/support/templates', ...adminWrite, async (req, res) => {
    const fields = templateFields(req, res);
    if (!fields) return;
    const { data, error } = await supabaseAdmin.from('support_reply_templates').insert(fields).select('id,title,body,updated_at').single();
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.admin, 'support_template_created', 'support_template', data.id, null);
    return res.status(201).json({ template: data });
  });

  router.patch('/support/templates/:id', ...adminWrite, async (req, res) => {
    const fields = templateFields(req, res);
    if (!fields) return;
    const { data, error } = await supabaseAdmin.from('support_reply_templates').update(fields).eq('id', req.params.id).select('id,title,body,updated_at').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Template not found' });
    await logActivity(req.admin, 'support_template_edited', 'support_template', data.id, null);
    return res.json({ template: data });
  });

  router.delete('/support/templates/:id', ...adminWrite, async (req, res) => {
    const { data, error } = await supabaseAdmin.from('support_reply_templates').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Template not found' });
    await logActivity(req.admin, 'support_template_deleted', 'support_template', data.id, null);
    return res.status(204).end();
  });

  // Warn, suspend (for `days`, or until reviewed), disable (sign-in blocked)
  // or restore. lib/enforcement.js records and audits it and tells the person.
  router.post('/users/:id/status', ...superAdmin, async (req, res) => {
    const status = String(req.body && req.body.status || '');
    if (!['active', 'warning', 'suspended', 'disabled'].includes(status)) return res.status(400).json({ error: 'Invalid account status' });
    const days = req.body && req.body.days != null ? Number(req.body.days) : null;
    if (days !== null && (status !== 'suspended' || !Number.isInteger(days) || days < 1 || days > 365)) {
      return res.status(400).json({ error: 'A suspension lasts 1 to 365 days' });
    }
    const reason = status === 'active' ? String(req.body && req.body.reason || '').trim() : requiredReason(req, res);
    if (reason === null) return;
    const { data: existing, error: userError } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
    if (userError || !existing.user) return res.status(404).json({ error: 'User not found' });
    try {
      return res.json(await enforcement.applyAction(supabaseAdmin, {
        userId: req.params.id, action: status === 'active' ? 'restored' : status, reason, days, adminId: req.admin.id,
      }));
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }
  });

  // The automatic rules: what each does, its mode and limits, and what they recently saw and did.
  router.get('/rules', adminAuth, async (_req, res) => {
    const [rulesResult, hitsResult] = await Promise.all([
      supabaseAdmin.from('moderation_rules').select('key,mode,threshold,window_hours,updated_at').order('key'),
      supabaseAdmin.from('moderation_rule_hits').select('id,rule_key,target_type,target_id,action,metadata,created_at')
        .order('created_at', { ascending: false }).limit(100),
    ]);
    if (rulesResult.error || hitsResult.error) return res.status(502).json({ error: (rulesResult.error || hitsResult.error).message });
    const hits = hitsResult.data || [];
    const idsOf = (type) => [...new Set(hits.filter((hit) => hit.target_type === type).map((hit) => hit.target_id))];
    const [userIds, listingIds] = [idsOf('user'), idsOf('listing')];
    const [profiles, listings] = await Promise.all([
      userIds.length ? supabaseAdmin.from('profiles').select('id,full_name,username').in('id', userIds) : { data: [] },
      listingIds.length ? supabaseAdmin.from('listings').select('id,title').in('id', listingIds) : { data: [] },
    ]);
    const names = Object.fromEntries([
      ...(profiles.data || []).map((p) => [p.id, p.full_name || p.username]),
      ...(listings.data || []).map((l) => [l.id, l.title]),
    ]);
    return res.json({
      rules: (rulesResult.data || []).filter((rule) => enforcement.RULES[rule.key]).map(describeRule),
      hits: hits.map((hit) => ({ ...hit, target_name: names[hit.target_id] || null })),
    });
  });

  router.patch('/rules/:key', ...superAdmin, async (req, res) => {
    if (!enforcement.RULES[req.params.key]) return res.status(404).json({ error: 'Rule not found' });
    const body = req.body || {};
    const changes = {};
    if (body.mode !== undefined) {
      if (!['off', 'shadow', 'enforce'].includes(body.mode)) return res.status(400).json({ error: 'Mode is off, shadow or enforce' });
      changes.mode = body.mode;
    }
    for (const [field, label, max] of [['threshold', 'Threshold', 1000], ['window_hours', 'Window', 8760]]) {
      if (body[field] === undefined) continue;
      const value = Number(body[field]);
      if (!Number.isInteger(value) || value < 1 || value > max) return res.status(400).json({ error: `${label} must be a whole number from 1 to ${max}` });
      changes[field] = value;
    }
    if (!Object.keys(changes).length) return res.status(400).json({ error: 'Nothing to change' });
    const { data, error } = await supabaseAdmin.from('moderation_rules')
      .update({ ...changes, updated_at: new Date().toISOString(), updated_by: req.admin.id })
      .eq('key', req.params.key).select('key,mode,threshold,window_hours,updated_at').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Rule not found' });
    await logActivity(req.admin, 'rule_updated', 'rule', data.key, String(body.reason || '').trim(), changes);
    return res.json({ rule: describeRule(data) });
  });

  router.get('/listings', adminAuth, async (req, res) => {
    let query = supabaseAdmin.from('listings').select('id,title,host_id,created_at,availability_status,moderation_status,moderation_reason,moderated_at').order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('moderation_status', req.query.status);
    const { data, error } = await query;
    if (error) return res.status(502).json({ error: error.message });
    const hostIds = [...new Set((data || []).map((l) => l.host_id).filter(Boolean))];
    const { data: profiles } = hostIds.length ? await supabaseAdmin.from('profiles').select('id,full_name,username').in('id', hostIds) : { data: [] };
    const ownerById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    return res.json({ data: (data || []).map((listing) => ({ ...listing, owner: ownerById[listing.host_id] || null })) });
  });

  /** Hides, takes down or restores a listing, audited. Resolves the listing, or null when there is none. */
  async function moderateListing(admin, listingId, status, reason) {
    const changes = { moderation_status: status, moderation_reason: reason || null, moderated_at: new Date().toISOString(), moderated_by: admin.id };
    if (status === 'removed') changes.availability_status = 'unavailable';
    const { data, error } = await supabaseAdmin.from('listings').update(changes).eq('id', listingId).select().maybeSingle();
    if (error) throw error;
    if (data) await logActivity(admin, status === 'active' ? 'listing_restored' : `listing_${status}`, 'listing', data.id, reason);
    return data;
  }

  router.post('/listings/:id/moderation', ...adminWrite, async (req, res) => {
    const status = String(req.body && req.body.status || '');
    if (!['active', 'hidden', 'removed'].includes(status)) return res.status(400).json({ error: 'Invalid moderation status' });
    const reason = status === 'active' ? String(req.body && req.body.reason || '').trim() : requiredReason(req, res);
    if (reason === null) return;
    try {
      const data = await moderateListing(req.admin, req.params.id, status, reason);
      if (!data) return res.status(404).json({ error: 'Listing not found' });
      return res.json({ listing: data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  router.get('/updates', adminAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from('varoom_updates').select('*').order('created_at', { ascending: false });
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: data || [] });
  });

  router.post('/updates', ...adminWrite, async (req, res) => {
    const title = String(req.body && req.body.title || '').trim().slice(0, 160);
    const body = String(req.body && req.body.body || '').trim();
    const status = String(req.body && req.body.status || 'draft');
    const imageUrls = Array.isArray(req.body && req.body.image_urls) ? req.body.image_urls.slice(0, 8) : null;
    if (!body || body.length > 5000 || !['draft', 'published'].includes(status)) return res.status(400).json({ error: 'A valid body and status are required' });
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('varoom_updates').insert({ title: title || null, body, image_urls: imageUrls, status, published_at: status === 'published' ? now : null, created_by_admin_id: req.admin.id }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.admin, status === 'published' ? 'varoom_update_published' : 'varoom_update_saved_draft', 'varoom_update', data.id, null);
    return res.status(201).json({ update: data });
  });

  router.patch('/updates/:id', ...adminWrite, async (req, res) => {
    const changes = {};
    if (req.body?.title !== undefined) changes.title = String(req.body.title || '').trim().slice(0, 160) || null;
    if (req.body?.body !== undefined) changes.body = String(req.body.body || '').trim().slice(0, 5000);
    if (req.body?.image_urls !== undefined) changes.image_urls = Array.isArray(req.body.image_urls) ? req.body.image_urls.slice(0, 8) : null;
    changes.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('varoom_updates').update(changes).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Update not found' });
    await logActivity(req.admin, 'varoom_update_edited', 'varoom_update', data.id, null);
    return res.json({ update: data });
  });

  router.post('/updates/:id/status', ...adminWrite, async (req, res) => {
    const status = String(req.body && req.body.status || '');
    if (!['draft', 'published', 'unpublished', 'removed'].includes(status)) return res.status(400).json({ error: 'Invalid update status' });
    const reason = status === 'removed' ? requiredReason(req, res) : String(req.body && req.body.reason || '').trim();
    if (reason === null) return;
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('varoom_updates').update({ status, published_at: status === 'published' ? now : null, removed_at: status === 'removed' ? now : null, moderated_by: req.admin.id, moderation_reason: reason || null, updated_at: now }).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Update not found' });
    await logActivity(req.admin, `varoom_update_${status}`, 'varoom_update', data.id, reason);
    return res.json({ update: data });
  });

  // The audit trail, with each target's name (a person, listing, ticket…) where it still exists.
  router.get('/activity', adminAuth, caught(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
    const { data, error } = await supabaseAdmin.from('admin_activity').select('*, admin:admins(name,email)').order('created_at', { ascending: false }).limit(limit);
    if (error) return res.status(502).json({ error: error.message });
    const ruleLabels = Object.fromEntries(Object.entries(enforcement.RULES).map(([key, rule]) => [key, rule.label]));
    return res.json({ data: await investigation.activityNames(supabaseAdmin, data || [], ruleLabels) });
  }));

  router.get('/reports', adminAuth, async (req, res) => {
    let query = supabaseAdmin.from('listing_reports').select('*, listing:listings(title,host_id,moderation_status)').order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) return res.status(502).json({ error: error.message });
    const ids = [...new Set((data || []).flatMap((r) => [r.reporter_user_id, r.listing && r.listing.host_id]).filter(Boolean))];
    const { data: profiles } = ids.length ? await supabaseAdmin.from('profiles').select('id,full_name,username').in('id', ids) : { data: [] };
    const nameOf = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name || p.username]));
    return res.json({ data: (data || []).map((report) => ({
      ...report,
      listing: report.listing && report.listing.title,
      host_id: report.listing && report.listing.host_id,
      host: report.listing && nameOf[report.listing.host_id] || null,
      listing_moderation: report.listing && report.listing.moderation_status,
      reporter: nameOf[report.reporter_user_id] || report.reporter_user_id,
      createdAt: report.created_at,
    })) });
  });

  // Resolving a report can act at the same time: on the listing (hide, take
  // down) or on its host's account (warn, suspend until reviewed).
  const LISTING_REPORT_ACTIONS = {
    hide_listing: { listing: 'hidden' }, remove_listing: { listing: 'removed' },
    warn_host: { account: 'warning' }, suspend_host: { account: 'suspended' },
  };
  // On a chat report, the action is on the reported person's account.
  const USER_REPORT_ACTIONS = {
    warn: { account: 'warning' }, suspend_7_days: { account: 'suspended', days: 7 },
    suspend: { account: 'suspended' }, disable: { account: 'disabled' },
  };

  /** Validates a report action; responds and returns null when it is not allowed. */
  function reportAction(req, res, actions) {
    const key = req.body && req.body.action;
    if (!key) return {};
    const action = actions[key];
    if (!action) { res.status(400).json({ error: 'Invalid report action' }); return null; }
    if (action.account && req.admin.role !== 'super_admin') { res.status(403).json({ error: 'Only a super admin can act on an account' }); return null; }
    const reason = requiredReason(req, res);
    return reason === null ? null : { ...action, key, reason };
  }

  router.patch('/reports/:id', ...adminWrite, async (req, res) => {
    const action = reportAction(req, res, LISTING_REPORT_ACTIONS);
    if (!action) return;
    const status = action.key ? 'actioned' : req.body && req.body.status;
    if (!['pending', 'reviewed', 'actioned', 'dismissed', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid report status' });
    try {
      if (action.key) {
        const { data: report, error } = await supabaseAdmin.from('listing_reports').select('listing_id, listing:listings(host_id)').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!report) return res.status(404).json({ error: 'Report not found' });
        if (action.listing) await moderateListing(req.admin, report.listing_id, action.listing, action.reason);
        if (action.account) await enforcement.applyAction(supabaseAdmin, { userId: report.listing.host_id, action: action.account, reason: action.reason, adminId: req.admin.id });
      }
      const update = { status, reviewed_by: req.admin.id, reviewed_at: new Date().toISOString() };
      const { data, error } = await supabaseAdmin.from('listing_reports').update(update).eq('id', req.params.id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Report not found' });
      await logActivity(req.admin, `listing_report_${status}`, 'listing_report', data.id, action.reason || String(req.body.reason || '').trim(), action.key ? { action: action.key } : {});
      return res.json({ report: data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  router.get('/user-reports', adminAuth, async (req, res) => {
    let query = supabaseAdmin.from('chat_user_reports')
      .select('id,reporter_user_id,reported_user_id,conversation_id,reason,details,status,created_at')
      .order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) return res.status(502).json({ error: error.message });
    const ids = [...new Set((data || []).flatMap((report) => [report.reporter_user_id, report.reported_user_id]))];
    const { data: profiles, error: profileError } = ids.length
      ? await supabaseAdmin.from('profiles').select('id,full_name,username').in('id', ids)
      : { data: [], error: null };
    if (profileError) return res.status(502).json({ error: profileError.message });
    const profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
    return res.json({
      data: (data || []).map((report) => ({
        ...report,
        reporter: profileById[report.reporter_user_id] || null,
        reportedUser: profileById[report.reported_user_id] || null,
        createdAt: report.created_at,
      })),
    });
  });

  router.patch('/user-reports/:id', ...adminWrite, async (req, res) => {
    const action = reportAction(req, res, USER_REPORT_ACTIONS);
    if (!action) return;
    const status = action.key ? 'actioned' : String(req.body && req.body.status || '');
    if (!['pending', 'reviewed', 'actioned', 'dismissed', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid report status' });
    try {
      if (action.key) {
        const { data: report, error } = await supabaseAdmin.from('chat_user_reports').select('reported_user_id').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!report) return res.status(404).json({ error: 'User report not found' });
        await enforcement.applyAction(supabaseAdmin, { userId: report.reported_user_id, action: action.account, days: action.days || null, reason: action.reason, adminId: req.admin.id });
      }
      const { data, error } = await supabaseAdmin.from('chat_user_reports').update({ status, reviewed_by: req.admin.id, reviewed_at: new Date().toISOString() }).eq('id', req.params.id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'User report not found' });
      await logActivity(req.admin, `user_report_${status}`, 'user_report', data.id, action.reason || String(req.body && req.body.reason || '').trim(), action.key ? { action: action.key } : {});
      return res.json({ report: data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  // The reported conversation, for the admin investigating the report. Only
  // reported conversations can be read (Privacy Policy), and every reading is
  // recorded in Admin activity.
  router.get('/user-reports/:id/conversation', ...adminWrite, caught(async (req, res) => {
    const result = await investigation.reportedConversation(supabaseAdmin, req.params.id);
    if (!result) return res.status(404).json({ error: 'User report not found' });
    await logActivity(req.admin, 'reported_conversation_viewed', 'user_report', req.params.id, null, { conversation_id: result.report.conversation_id });
    return res.json(result);
  }));

  // Reviews of VaRoom itself. Approving one lets it appear on the sign-in
  // panel (the most recently approved one is shown); hiding takes it down.
  router.get('/varoom-reviews', adminAuth, async (req, res) => {
    let query = supabaseAdmin.from('varoom_reviews')
      .select('id,user_id,rating,comment,author_name,author_role,status,reviewed_at,approved_at,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(250);
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: data || [] });
  });

  router.patch('/varoom-reviews/:id', ...adminWrite, async (req, res) => {
    const status = String(req.body && req.body.status || '');
    if (!['approved', 'hidden', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid review status' });
    const now = new Date().toISOString();
    const update = { status, reviewed_by: req.admin.id, reviewed_at: now, approved_at: status === 'approved' ? now : null };
    const { data, error } = await supabaseAdmin.from('varoom_reviews').update(update).eq('id', req.params.id)
      .select('id,user_id,rating,comment,author_name,author_role,status,reviewed_at,approved_at,created_at,updated_at').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Review not found' });
    await logActivity(req.admin, `varoom_review_${status}`, 'varoom_review', data.id, String(req.body && req.body.reason || '').trim());
    return res.json({ review: data });
  });

  router.get('/account-deletions', adminAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from('account_deletions')
      .select('id,account_id,account_email,reason,reason_details,deleted_at')
      .order('deleted_at', { ascending: false });
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: data || [] });
  });

  router.get('/growth', adminAuth, async (req, res) => {
    const range = Math.min(Math.max(Number(req.query.range) || 14, 1), 365);
    const since = daysAgo(range);
    const [signups, listings] = await Promise.all([
      supabaseAdmin.rpc('admin_signup_days', { p_since: since }),
      supabaseAdmin.from('listings').select('created_at').gte('created_at', since)
    ]);
    if (signups.error || listings.error) return res.status(502).json({ error: (signups.error || listings.error).message });
    return res.json({ series: mergeSeries(signups.data || [], listings.data || [], range) });
  });

  router.get('/admins', adminAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from('admins').select('id,name,email,role,created_at,last_login_at,totp_enabled_at').order('created_at');
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: (data || []).map(({ totp_enabled_at: totpEnabledAt, ...admin }) => ({ ...admin, totp_enabled: Boolean(totpEnabledAt), lastLogin: admin.last_login_at || 'Never' })) });
  });

  // Super admins change roles and remove admins (not themselves, so there is
  // always a super admin). A change takes effect on the admin's next request.
  router.patch('/admins/:id', ...superAdmin, async (req, res) => {
    const role = req.body && req.body.role;
    if (!['super_admin', 'support', 'read_only'].includes(role)) return res.status(400).json({ error: 'Choose a valid role' });
    if (req.params.id === req.admin.id) return res.status(400).json({ error: 'Another super admin has to change your role' });
    const { data, error } = await supabaseAdmin.from('admins').update({ role }).eq('id', req.params.id).select('id,name,email,role').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Admin not found' });
    await logActivity(req.admin, 'admin_role_changed', 'admin', data.id, null, { role, email: data.email });
    return res.json({ admin: data });
  });

  router.delete('/admins/:id', ...superAdmin, async (req, res) => {
    if (req.params.id === req.admin.id) return res.status(400).json({ error: 'Another super admin has to remove you' });
    const { data, error } = await supabaseAdmin.from('admins').delete().eq('id', req.params.id).select('id,email').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Admin not found' });
    await logActivity(req.admin, 'admin_removed', 'admin', data.id, null, { email: data.email });
    return res.status(204).end();
  });

  // For an admin who lost their phone: they sign in with their password and set it up again.
  router.post('/admins/:id/totp/reset', ...superAdmin, async (req, res) => {
    if (req.params.id === req.admin.id) return res.status(400).json({ error: 'Turn off your own two-step sign-in from your settings' });
    const { data, error } = await supabaseAdmin.from('admins').update({ totp_enabled_at: null, totp_secret_encrypted: null }).eq('id', req.params.id).select('id,email').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Admin not found' });
    await logActivity(req.admin, 'admin_two_step_reset', 'admin', data.id, null, { email: data.email });
    return res.json({ reset: true });
  });

  router.post('/admins', ...superAdmin, async (req, res) => {
    const { name, email, role } = req.body || {};
    if (!name || !email || !['super_admin', 'support', 'read_only'].includes(role)) return res.status(400).json({ error: 'Name, email and valid role are required' });
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
    const temporaryHash = await hashPassword(inviteToken);
    const { data: admin, error } = await supabaseAdmin.from('admins').insert({
      name, email: String(email).trim().toLowerCase(), role, password_hash: temporaryHash,
      invited_by: req.admin.id, invite_token_hash: inviteHash, invite_expires_at: new Date(Date.now() + 86400000).toISOString()
    }).select('id,name,email,role').single();
    if (error) return res.status(400).json({ error: error.message });
    const link = `${process.env.PUBLIC_BASE_URL || ''}/admin/set-password?token=${inviteToken}`;
    try {
      await sendEmail({ from: SECURITY_EMAIL_FROM, to: admin.email, subject: 'Your VaRoom admin invite', html: `<p>You have been invited to VaRoom Admin.</p><p><a href="${escapeHtml(link)}">Set your password</a> (expires in 24 hours).</p>` });
    } catch (emailError) {
      await supabaseAdmin.from('admins').delete().eq('id', admin.id);
      return res.status(502).json({ error: emailError.message });
    }
    return res.status(201).json({ admin });
  });

  return router;
}

function describeRule(rule) {
  const definition = enforcement.RULES[rule.key];
  return { ...rule, label: definition.label, description: definition.describe(rule) };
}

/** signupDays: [{ day, signups }] from admin_signup_days; listings: rows with created_at. */
function mergeSeries(signupDays, listings, range) {
  const signupsOn = Object.fromEntries(signupDays.map((row) => [String(row.day).slice(0, 10), Number(row.signups)]));
  return Array.from({ length: range }, (_, index) => {
    const day = new Date(Date.now() - (range - 1 - index) * 86400000).toISOString().slice(0, 10);
    return { day, signups: signupsOn[day] || 0, listings: listings.filter((row) => row.created_at.slice(0, 10) === day).length };
  });
}

function signinSeries(rows, range) {
  return Array.from({ length: range }, (_, index) => {
    const day = new Date(Date.now() - (range - 1 - index) * 86400000).toISOString().slice(0, 10);
    return { day, signins: rows.filter((row) => row.time.slice(0, 10) === day).length };
  });
}

module.exports = { createAdminRoutes, requireAdmin, hashPassword };
