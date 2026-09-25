const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { sendEmail } = require('../lib/email');
const { createNotification } = require('../lib/notifications');

const SESSION_COOKIE = 'varoom_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SUPPORT_FROM = process.env.RESEND_FROM_EMAIL || 'VaRoom Support <support@varoom.co.ke>';

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

function requireAdminRole(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.admin.role)) return next();
    return res.status(403).json({ error: 'Your admin role is not allowed to perform this action' });
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
  const adminWrite = [adminAuth, requireAdminRole('super_admin', 'support')];
  const superAdmin = [adminAuth, requireAdminRole('super_admin')];
  const propertyNewsUrl = (process.env.PROPERTY_NEWS_API_URL || '').replace(/\/$/, '');
  const propertyNewsAdminApiKey = (process.env.PROPERTY_NEWS_ADMIN_API_KEY || '').trim();

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

  router.get('/', (_req, res) => res.sendFile(path.join(__dirname, '../../client/legacy-pages/varoomadmin.html')));
  router.get('/varoomadmin.js', (_req, res) => res.sendFile(path.join(__dirname, '../../client/legacy-pages/varoomadmin.js')));

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

  router.post('/support/tickets/:id/replies', ...adminWrite, async (req, res) => {
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

  router.patch('/support/tickets/:id', ...adminWrite, async (req, res) => {
    const allowed = ['status', 'priority', 'assigned_admin_id'];
    const update = Object.fromEntries(allowed.filter((key) => req.body && req.body[key] !== undefined).map((key) => [key, req.body[key]]));
    const { data, error } = await supabaseAdmin.from('support_tickets').update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ticket: normalizeTicket(data) });
  });

  // User control is intentionally server-only: auth ban metadata invalidates
  // active Supabase sessions and account_controls is checked by critical DB
  // workflows. The browser never receives a service-role credential.
  router.get('/users', adminAuth, async (req, res) => {
    const query = String(req.query.q || '').trim().toLowerCase();
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return res.status(502).json({ error: error.message });
    const ids = (data.users || []).map((user) => user.id);
    const [profilesResult, controlsResult] = await Promise.all([
      ids.length ? supabaseAdmin.from('profiles').select('id,full_name,username').in('id', ids) : { data: [] },
      ids.length ? supabaseAdmin.from('account_controls').select('user_id,status,reason,changed_at,changed_by').in('user_id', ids) : { data: [] },
    ]);
    if (profilesResult.error || controlsResult.error) return res.status(502).json({ error: (profilesResult.error || controlsResult.error).message });
    const profileById = Object.fromEntries((profilesResult.data || []).map((p) => [p.id, p]));
    const controlById = Object.fromEntries((controlsResult.data || []).map((c) => [c.user_id, c]));
    const users = (data.users || []).map((user) => ({
      id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at,
      profile: profileById[user.id] || null, account: controlById[user.id] || { status: user.banned_until ? 'suspended' : 'active' },
    })).filter((user) => !query || [user.email, user.profile?.full_name, user.profile?.username].filter(Boolean).join(' ').toLowerCase().includes(query));
    return res.json({ data: users });
  });

  router.get('/users/:id', adminAuth, async (req, res) => {
    const [{ data: userData, error: userError }, profileResult, listingsResult, activityResult] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(req.params.id),
      supabaseAdmin.from('profiles').select('id,full_name,username').eq('id', req.params.id).maybeSingle(),
      supabaseAdmin.from('listings').select('id,title,created_at,availability_status,moderation_status,moderation_reason').eq('host_id', req.params.id).order('created_at', { ascending: false }),
      supabaseAdmin.from('admin_activity').select('*').eq('target_id', req.params.id).order('created_at', { ascending: false }),
    ]);
    if (userError || !userData.user) return res.status(404).json({ error: 'User not found' });
    const { data: control } = await supabaseAdmin.from('account_controls').select('*').eq('user_id', req.params.id).maybeSingle();
    return res.json({ user: { id: userData.user.id, email: userData.user.email, created_at: userData.user.created_at, last_sign_in_at: userData.user.last_sign_in_at, profile: profileResult.data || null, account: control || { status: userData.user.banned_until ? 'suspended' : 'active' } }, listings: listingsResult.data || [], activity: activityResult.data || [] });
  });

  router.post('/users/:id/status', ...superAdmin, async (req, res) => {
    const status = String(req.body && req.body.status || '');
    if (!['active', 'suspended', 'disabled'].includes(status)) return res.status(400).json({ error: 'Invalid account status' });
    const reason = status === 'active' ? String(req.body && req.body.reason || '').trim() : requiredReason(req, res);
    if (reason === null) return;
    const { data: existing, error: userError } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
    if (userError || !existing.user) return res.status(404).json({ error: 'User not found' });
    const { error } = await supabaseAdmin.from('account_controls').upsert({ user_id: req.params.id, status, reason: reason || null, changed_at: new Date().toISOString(), changed_by: req.admin.id });
    if (error) return res.status(502).json({ error: error.message });
    // Suspension is intentionally not an auth ban: people retain their normal
    // session and browse-only access. Clear legacy auth bans when moderation
    // changes so this lifecycle is enforced by account_controls instead.
    const authUpdate = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { ban_duration: 'none' });
    if (authUpdate.error) return res.status(502).json({ error: authUpdate.error.message });
    await logActivity(req.admin, status === 'active' ? 'account_restored' : `account_${status}`, 'user', req.params.id, reason);
    return res.json({ status, reason: reason || null });
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

  router.post('/listings/:id/moderation', ...adminWrite, async (req, res) => {
    const status = String(req.body && req.body.status || '');
    if (!['active', 'hidden', 'removed'].includes(status)) return res.status(400).json({ error: 'Invalid moderation status' });
    const reason = status === 'active' ? String(req.body && req.body.reason || '').trim() : requiredReason(req, res);
    if (reason === null) return;
    const changes = { moderation_status: status, moderation_reason: reason || null, moderated_at: new Date().toISOString(), moderated_by: req.admin.id };
    if (status === 'removed') changes.availability_status = 'unavailable';
    const { data, error } = await supabaseAdmin.from('listings').update(changes).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Listing not found' });
    await logActivity(req.admin, status === 'active' ? 'listing_restored' : `listing_${status}`, 'listing', data.id, reason);
    return res.json({ listing: data });
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

  router.get('/activity', adminAuth, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
    const { data, error } = await supabaseAdmin.from('admin_activity').select('*, admin:admins(name,email)').order('created_at', { ascending: false }).limit(limit);
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: data || [] });
  });

  router.get('/reports', adminAuth, async (req, res) => {
    let query = supabaseAdmin.from('listing_reports').select('*, listing:listings(title)').order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: (data || []).map((report) => ({ ...report, listing: report.listing && report.listing.title, reporter: report.reporter_user_id, createdAt: report.created_at })) });
  });

  router.patch('/reports/:id', ...adminWrite, async (req, res) => {
    if (!['pending', 'reviewed', 'actioned', 'dismissed', 'resolved'].includes(req.body && req.body.status)) return res.status(400).json({ error: 'Invalid report status' });
    const update = { status: req.body.status, reviewed_by: req.admin.id, reviewed_at: new Date().toISOString() };
    const { data, error } = await supabaseAdmin.from('listing_reports').update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await logActivity(req.admin, `listing_report_${req.body.status}`, 'listing_report', data.id, String(req.body.reason || '').trim());
    return res.json({ report: data });
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
    const status = String(req.body && req.body.status || '');
    if (!['pending', 'reviewed', 'actioned', 'dismissed', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid report status' });
    const { data, error } = await supabaseAdmin.from('chat_user_reports').update({ status, reviewed_by: req.admin.id, reviewed_at: new Date().toISOString() }).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'User report not found' });
    await logActivity(req.admin, `user_report_${status}`, 'user_report', data.id, String(req.body && req.body.reason || '').trim());
    return res.json({ report: data });
  });

  router.get('/account-deletions', adminAuth, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from('account_deletions')
      .select('id,account_id,account_email,reason,reason_details,deleted_at')
      .order('deleted_at', { ascending: false });
    if (error) return res.status(502).json({ error: error.message });
    return res.json({ data: data || [] });
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
