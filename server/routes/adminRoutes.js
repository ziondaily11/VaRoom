const crypto = require('crypto');
const express = require('express');
const { sendEmail } = require('../lib/email');

const SESSION_COOKIE = 'varoom_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SUPPORT_FROM = 'VaRoom Support <support@varoom.co.ke>';

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

function encodeSession(adminId) {
  const payload = `${adminId}.${Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS}`;
  const signature = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY)
    .update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function decodeSession(value) {
  const [adminId, expires, signature] = String(value || '').split('.');
  if (!adminId || !expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return null;
  const payload = `${adminId}.${expires}`;
  const expected = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY)
    .update(payload).digest('hex');
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
      .select('id,name,email,role,last_login_at').eq('id', adminId).maybeSingle();
    if (error || !admin) return res.status(401).json({ error: 'Invalid admin session' });
    req.admin = admin;
    return next();
  };
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function normalizeTicket(ticket) {
  return {
    ...ticket,
    createdAt: ticket.created_at,
    accountStatus: ticket.user_id ? 'active' : 'visitor'
  };
}

function createAdminRoutes(supabaseAdmin) {
  const router = express.Router();
  const adminAuth = requireAdmin(supabaseAdmin);
  const propertyNewsUrl = (process.env.PROPERTY_NEWS_API_URL || '').replace(/\/$/, '');

  async function propertyNewsRequest(path, options = {}) {
    if (!propertyNewsUrl || !process.env.PROPERTY_NEWS_ADMIN_API_KEY) {
      const error = new Error('Property News administration is not configured');
      error.statusCode = 503;
      throw error;
    }
    const response = await fetch(`${propertyNewsUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.PROPERTY_NEWS_ADMIN_API_KEY}`,
        ...(options.headers || {}),
      },
    });
    const body = await response.text();
    if (!response.ok) {
      const error = new Error(body || 'Property News request failed');
      error.statusCode = response.status;
      throw error;
    }
    return body ? JSON.parse(body) : null;
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

  router.get('/', adminAuth, (_req, res) => {
    const clientBaseUrl = process.env.CLIENT_BASE_URL;
    if (clientBaseUrl) return res.redirect(`${clientBaseUrl.replace(/\/$/, '')}/admin`);
    return res.status(404).json({ error: 'Admin dashboard client is not configured' });
  });

  router.post('/login', async (req, res) => {
    const email = String(req.body && req.body.email || '').trim().toLowerCase();
    const password = String(req.body && req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const { data: admin, error } = await supabaseAdmin.from('admins').select('*').eq('email', email).maybeSingle();
    if (error || !admin || !(await verifyPassword(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await supabaseAdmin.from('admins').update({ last_login_at: new Date().toISOString() }).eq('id', admin.id);
    res.set('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(encodeSession(admin.id))}; HttpOnly; SameSite=Lax;${process.env.NODE_ENV === 'production' ? ' Secure;' : ''} Max-Age=${SESSION_TTL_SECONDS}; Path=/`);
    return res.json({ admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  });

  router.post('/logout', adminAuth, (req, res) => {
    res.set('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`);
    res.status(204).end();
  });

  router.get('/session', adminAuth, (req, res) => res.json({ admin: req.admin }));

  router.get('/news/pending', adminAuth, async (_req, res) => {
    try {
      return res.json(await propertyNewsRequest('/api/admin/news/pending'));
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message });
    }
  });

  for (const action of ['approve', 'reject', 'edit', 'request-more-evidence']) {
    router.post(`/news/:id/${action}`, adminAuth, async (req, res) => {
      try {
        const payload = { ...(req.body || {}), action };
        return res.json(await propertyNewsRequest(`/api/admin/news/${encodeURIComponent(req.params.id)}/${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }));
      } catch (error) {
        return res.status(error.statusCode || 502).json({ error: error.message });
      }
    });
  }

  router.get('/overview', adminAuth, async (_req, res) => {
    const since = daysAgo(7);
    const [users, listings, tickets, bookings] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from('listings').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      supabaseAdmin.from('bookings').select('total_price', { count: 'exact' }).gte('created_at', since).in('status', ['approved', 'completed'])
    ]);
    const signins = (users.data && users.data.users || []).filter((user) => user.last_sign_in_at && user.last_sign_in_at >= since);
    const revenue = (bookings.data || []).reduce((sum, booking) => sum + Number(booking.total_price || 0), 0);
    return res.json({ signins: signins.length, revenue, openTickets: tickets.count || 0, newListings: listings.count || 0 });
  });

  router.get('/signins', adminAuth, async (req, res) => {
    const since = daysAgo(Number(req.query.range) || 14);
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return res.status(502).json({ error: error.message });
    const rows = (data.users || []).filter((user) => user.last_sign_in_at && user.last_sign_in_at >= since)
      .sort((a, b) => new Date(b.last_sign_in_at) - new Date(a.last_sign_in_at))
      .map((user) => ({ user: user.email, method: user.app_metadata && user.app_metadata.provider || 'Email', time: user.last_sign_in_at, device: 'Web' }));
    return res.json({ data: rows, series: signinSeries(rows, Number(req.query.range) || 14) });
  });

  router.get('/revenue', adminAuth, async (req, res) => {
    const since = daysAgo(Number(req.query.range) || 7);
    const { data, error } = await supabaseAdmin.from('bookings')
      .select('id,total_price,created_at,client_id,listing_id,listing:listings(title)').gte('created_at', since)
      .in('status', ['approved', 'completed']).order('created_at', { ascending: false });
    if (error) return res.status(502).json({ error: error.message });
    const transactions = (data || []).map((booking) => ({ id: booking.id, payer: booking.client_id, listing: booking.listing && booking.listing.title, amount: Number(booking.total_price || 0), date: booking.created_at }));
    return res.json({ transactions, total: transactions.reduce((sum, row) => sum + row.amount, 0), series: dailySeries(transactions, 'amount', Number(req.query.range) || 7) });
  });

  router.get('/support/tickets', adminAuth, async (req, res) => {
    let query = supabaseAdmin.from('support_tickets').select('*').order('updated_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.priority) query = query.eq('priority', req.query.priority);
    const { data, error } = await query;
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: (data || []).map(normalizeTicket) });
  });

  router.get('/support/tickets/:id', adminAuth, async (req, res) => {
    const [ticketResult, repliesResult] = await Promise.all([
      supabaseAdmin.from('support_tickets').select('*').eq('id', req.params.id).single(),
      supabaseAdmin.from('support_ticket_replies').select('*').eq('ticket_id', req.params.id).order('sent_at')
    ]);
    if (ticketResult.error) return res.status(404).json({ error: 'Ticket not found' });
    return res.json({ ticket: normalizeTicket(ticketResult.data), replies: repliesResult.data || [] });
  });

  router.post('/support/tickets/:id/replies', adminAuth, async (req, res) => {
    const message = String(req.body && req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Reply message is required' });
    const { data: ticket, error: ticketError } = await supabaseAdmin.from('support_tickets').select('*').eq('id', req.params.id).single();
    if (ticketError || !ticket) return res.status(404).json({ error: 'Ticket not found' });
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim() || crypto.randomUUID();
    const { data: existingReply } = await supabaseAdmin.from('support_ticket_replies')
      .select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
    if (existingReply) return res.status(200).json({ reply: existingReply });

    const subject = `Re: ${ticket.subject}`;
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
        html: `<p>${message.replace(/</g, '&lt;')}</p>`,
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
      await supabaseAdmin.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticket.id);
      return res.status(201).json({ reply: sentReply });
    } catch (emailError) {
      await supabaseAdmin.from('support_ticket_replies')
        .update({ delivery_status: 'failed', provider_error: emailError.message, sent_at: new Date().toISOString() })
        .eq('id', reply.id);
      return res.status(502).json({ error: emailError.message });
    }
  });

  router.patch('/support/tickets/:id', adminAuth, async (req, res) => {
    const allowed = ['status', 'priority', 'assigned_admin_id'];
    const update = Object.fromEntries(allowed.filter((key) => req.body && req.body[key] !== undefined).map((key) => [key, req.body[key]]));
    const { data, error } = await supabaseAdmin.from('support_tickets').update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ticket: normalizeTicket(data) });
  });

  router.get('/reports', adminAuth, async (req, res) => {
    let query = supabaseAdmin.from('listing_reports').select('*, listing:listings(title)').order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: (data || []).map((report) => ({ ...report, listing: report.listing && report.listing.title, reporter: report.reporter_user_id, createdAt: report.created_at })) });
  });

  router.patch('/reports/:id', adminAuth, async (req, res) => {
    const update = { status: req.body.status, reviewed_by: req.admin.id, reviewed_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin.from('listing_reports').update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ report: data });
  });

  router.get('/growth', adminAuth, async (req, res) => {
    const range = Number(req.query.range) || 14;
    const since = daysAgo(range);
    const [users, listings] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from('listings').select('created_at').gte('created_at', since)
    ]);
    const signups = (users.data && users.data.users || []).filter((user) => user.created_at >= since).map((user) => ({ created_at: user.created_at }));
    return res.json({ series: mergeSeries(signups, listings.data || [], range) });
  });

  router.get('/admins', adminAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from('admins').select('id,name,email,role,created_at,last_login_at').order('created_at');
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: (data || []).map((admin) => ({ ...admin, lastLogin: admin.last_login_at || 'Never' })) });
  });

  router.post('/admins', adminAuth, async (req, res) => {
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
      await sendEmail({ to: admin.email, subject: 'Your VaRoom admin invite', html: `<p>You have been invited to VaRoom Admin.</p><p><a href="${link}">Set your password</a> (expires in 24 hours).</p>` });
    } catch (emailError) {
      await supabaseAdmin.from('admins').delete().eq('id', admin.id);
      return res.status(502).json({ error: emailError.message });
    }
    return res.status(201).json({ admin });
  });

  return router;
}

function dailySeries(rows, field, range) {
  const result = [];
  for (let i = range - 1; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400000);
    const key = day.toISOString().slice(0, 10);
    result.push({ day: key, revenue: rows.filter((row) => row.date.slice(0, 10) === key).reduce((sum, row) => sum + Number(row[field] || 0), 0) });
  }
  return result;
}

function mergeSeries(signups, listings, range) {
  return Array.from({ length: range }, (_, index) => {
    const day = new Date(Date.now() - (range - 1 - index) * 86400000).toISOString().slice(0, 10);
    return { day, signups: signups.filter((row) => row.created_at.slice(0, 10) === day).length, listings: listings.filter((row) => row.created_at.slice(0, 10) === day).length };
  });
}

function signinSeries(rows, range) {
  return Array.from({ length: range }, (_, index) => {
    const day = new Date(Date.now() - (range - 1 - index) * 86400000).toISOString().slice(0, 10);
    return { day, signins: rows.filter((row) => row.time.slice(0, 10) === day).length };
  });
}

module.exports = { createAdminRoutes, requireAdmin, hashPassword };
