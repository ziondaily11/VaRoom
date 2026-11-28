'use strict';

// Support by email (migration 20261129_000098). Mail to any @varoom.co.ke
// address reaches Resend, whose signed `email.received` webhook
// (routes/supportInboundRoutes.js) arrives here: a reply joins its ticket,
// anything else opens one. Every new ticket, from email or the Support page,
// is acknowledged at once; a restricted account's message is filed as an
// appeal and the acknowledgement says where the account stands.

const crypto = require('crypto');
const { sendEmail } = require('./email');
const { effectiveStatus } = require('./enforcement');

const SUPPORT_FROM = process.env.RESEND_FROM_EMAIL || 'VaRoom Support <support@varoom.co.ke>';
const HOUR_MS = 3600000;
const AUTO_CLOSE_DAYS = 7;
const MAX_NEW_TICKETS_PER_DAY = 10;
const MAX_MESSAGE = 20000;

/** Resend signs webhooks the Svix way: HMAC-SHA256 of "id.timestamp.body" with the whsec_ secret. */
function verifyWebhook(rawBody, headers, secret, now = Date.now()) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];
  if (!secret || !id || !timestamp || !signatures) return false;
  if (!/^\d+$/.test(String(timestamp)) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return String(signatures).split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

const ticketRef = (id) => `#${String(id).slice(0, 8).toUpperCase()}`;

const CATEGORIES = [
  ['appeal', /\b(suspend\w*|appeal\w*|ban(ned)?|disabled|restricted|blocked)\b/i],
  ['sign_in', /\b(sign[ -]?in|log[ -]?in|password|otp|verification code|code didn'?t|can'?t access)\b/i],
  ['billing', /\b(pay(ment)?s?|paid|refund\w*|subscription|plan|invoice|charged?|paystack|m-?pesa|v-?coins?)\b/i],
  ['booking', /\b(booking|booked|reservation|check[ -]?in|cancel\w*)\b/i],
  ['report', /\b(scam\w*|fraud\w*|fake|report\w*|harass\w*|abus\w*)\b/i],
];
const categorize = (text) => (CATEGORIES.find(([, pattern]) => pattern.test(text)) || ['other'])[0];

/** A new ticket's category and priority, and the sender's restriction (for the acknowledgement). */
async function triage(admin, { userId, subject, message }) {
  let restriction = null;
  if (userId) {
    const { data, error } = await admin.from('account_controls').select('status,reason,suspended_until').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (data && effectiveStatus(data) !== 'active') restriction = data;
  }
  const category = restriction ? 'appeal' : categorize(`${subject}\n${message}`);
  return { category, priority: category === 'appeal' ? 'high' : null, restriction };
}

function acknowledgementText(ticket, restriction) {
  const ref = ticketRef(ticket.id);
  const lines = [`Hi ${ticket.name},`];
  if (restriction && restriction.status === 'disabled') {
    lines.push(`Your VaRoom account is disabled, so you can't sign in to it. We have filed your message as an appeal (ticket ${ref}) and a member of our team will review it and reply to this email.`);
  } else if (restriction) {
    const until = restriction.suspended_until ? `until ${new Date(restriction.suspended_until).toUTCString()}` : 'while our team reviews it';
    lines.push(`Your VaRoom account is suspended ${until}. You can still sign in and browse VaRoom; posting, booking and messaging are paused.`);
    if (restriction.reason) lines.push(`Reason: ${restriction.reason}`);
    lines.push(`We have filed your message as an appeal (ticket ${ref}). A member of our team will review it and reply to this email.`);
  } else {
    lines.push(`Thanks for contacting VaRoom Support. We have received your message and opened ticket ${ref}. A member of our team will reply to this email as soon as possible.`);
  }
  lines.push('To add anything, just reply to this email.', 'VaRoom Support');
  return { subject: `We received your message [${ref}]`, text: lines.join('\n\n') };
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const textToHtml = (text) => String(text).split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('');

/**
 * Emails the person that their ticket is open, recorded on the ticket as an
 * automatic reply. At most one per address per hour, so two auto-responders
 * can never answer each other in a loop.
 */
async function acknowledge(admin, ticket, { restriction = null, send = sendEmail } = {}) {
  const { count, error: countError } = await admin.from('support_ticket_replies').select('id', { count: 'exact', head: true })
    .eq('automatic', true).eq('recipient', ticket.email).gte('sent_at', new Date(Date.now() - HOUR_MS).toISOString());
  if (countError) throw countError;
  if (count) return null;
  const { subject, text } = acknowledgementText(ticket, restriction);
  const messageId = `<support-ack-${crypto.randomUUID()}@varoom.co.ke>`;
  const { data: reply, error } = await admin.from('support_ticket_replies').insert({
    ticket_id: ticket.id, admin_id: null, message: text, delivery_status: 'pending', sender: SUPPORT_FROM, recipient: ticket.email,
    subject, message_id: messageId, in_reply_to: ticket.message_id || null, references_header: ticket.message_id || null,
    idempotency_key: `support-ack-${ticket.id}`, direction: 'outbound', automatic: true,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return null; // already acknowledged
    throw error;
  }
  try {
    const sent = await send({
      from: SUPPORT_FROM, to: ticket.email, subject, html: textToHtml(text), idempotencyKey: `support-ack-${ticket.id}`,
      headers: { 'Message-ID': messageId, 'Auto-Submitted': 'auto-replied', ...(ticket.message_id ? { 'In-Reply-To': ticket.message_id, References: ticket.message_id } : {}) },
    });
    await admin.from('support_ticket_replies').update({ delivery_status: 'sent', resend_email_id: sent.id, sent_at: new Date().toISOString() }).eq('id', reply.id);
  } catch (sendError) {
    await admin.from('support_ticket_replies').update({ delivery_status: 'failed', provider_error: sendError.message }).eq('id', reply.id);
  }
  return reply.id;
}

// ---------- Inbound email ----------

const lowerKeys = (object) => Object.fromEntries(Object.entries(object || {}).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(' ') : String(value)]));

/** "Jane Doe <jane@x.com>" → { name, address }. */
function parseAddress(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.*?)<([^>]+)>\s*$/);
  const address = (match ? match[2] : text).trim().toLowerCase();
  const name = (match ? match[1] : '').trim().replace(/^"|"$/g, '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? { name, address } : null;
}

/** The message text without the quoted history below it. */
function messageText(email) {
  let text = String(email.text || '');
  if (!text.trim() && email.html) {
    text = String(email.html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  const quoteStart = text.search(/^(On .{3,300}wrote:|-{2,} ?Original Message ?-{2,}|From: .+)$/m);
  if (quoteStart > 0) text = text.slice(0, quoteStart);
  text = text.split('\n').filter((line) => !line.startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, MAX_MESSAGE);
}

/** Bounces, out-of-office and list mail: recorded on a ticket, never opening one. */
function isAutomatic(headers, address) {
  const auto = headers['auto-submitted'];
  return Boolean((auto && auto.toLowerCase() !== 'no') || headers['x-autoreply'] || headers['x-autorespond'] || headers['list-id']
    || /^(bulk|junk|list|auto_reply)$/i.test(headers.precedence || '')
    || /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/i.test(address));
}

/** The ticket an email answers: by its reply headers, else by [#REF] in the subject from the ticket's own address. */
async function findThread(admin, references, subject, address) {
  if (references.length) {
    const { data: tickets, error } = await admin.from('support_tickets').select('*').in('message_id', references).limit(1);
    if (error) throw error;
    if (tickets && tickets[0]) return tickets[0];
    const { data: replies, error: replyError } = await admin.from('support_ticket_replies').select('ticket_id').in('message_id', references).limit(1);
    if (replyError) throw replyError;
    if (replies && replies[0]) {
      const { data: ticket, error: ticketError } = await admin.from('support_tickets').select('*').eq('id', replies[0].ticket_id).maybeSingle();
      if (ticketError) throw ticketError;
      if (ticket) return ticket;
    }
  }
  const ref = String(subject).match(/\[#([0-9a-f]{8})\]/i);
  if (!ref) return null;
  const prefix = ref[1].toLowerCase();
  const { data, error } = await admin.from('support_tickets').select('*').eq('email', address)
    .gte('id', `${prefix}-0000-0000-0000-000000000000`).lte('id', `${prefix}-ffff-ffff-ffff-ffffffffffff`).limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

async function alreadyRecorded(admin, emailId) {
  const [tickets, replies] = await Promise.all([
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('inbound_email_id', emailId),
    admin.from('support_ticket_replies').select('id', { count: 'exact', head: true }).eq('inbound_email_id', emailId),
  ]);
  if (tickets.error || replies.error) throw tickets.error || replies.error;
  return Boolean(tickets.count || replies.count);
}

/** An `email.received` event: { ticketId, reply } when recorded, { skipped } when not. */
async function handleReceived(admin, event, { fetchEmail, send = sendEmail }) {
  const emailId = event && event.data && event.data.email_id;
  if (!emailId) return { skipped: 'no email id' };
  if (await alreadyRecorded(admin, emailId)) return { skipped: 'already recorded' };
  const email = await fetchEmail(emailId);
  const headers = lowerKeys(email.headers);
  const from = parseAddress(headers.from || email.from || event.data.from);
  if (!from) return { skipped: 'no sender' };
  // VaRoom's own mail (acknowledgements, notices) never becomes a ticket.
  if (from.address.endsWith('@varoom.co.ke')) return { skipped: 'own address' };
  const subject = String(email.subject || event.data.subject || '(no subject)').trim().slice(0, 300) || '(no subject)';
  const text = messageText(email) || '(no message text)';
  const messageId = email.message_id || event.data.message_id || headers['message-id'] || null;
  const references = `${headers['in-reply-to'] || ''} ${headers.references || ''}`.match(/<[^>]+>/g) || [];
  const recipient = [].concat(email.to || event.data.to || [])[0] || null;
  const attachments = (email.attachments || event.data.attachments || []).map((a) => a.filename).filter(Boolean);
  const body = attachments.length ? `${text}\n\n[Attachments: ${attachments.join(', ')} (open the email in Resend to download)]` : text;
  const now = new Date().toISOString();

  const thread = await findThread(admin, references, subject, from.address);
  if (thread) {
    const { error } = await admin.from('support_ticket_replies').insert({
      ticket_id: thread.id, admin_id: null, message: body, direction: 'inbound', delivery_status: 'received', sender: from.address,
      recipient, subject, message_id: messageId, inbound_email_id: emailId, sent_at: now,
    });
    if (error) {
      if (error.code === '23505') return { skipped: 'already recorded' };
      throw error;
    }
    // A reply reopens a ticket that was waiting on the person or already done.
    const { error: updateError } = await admin.from('support_tickets').update({ status: 'open', updated_at: now }).eq('id', thread.id);
    if (updateError) throw updateError;
    return { ticketId: thread.id, reply: true };
  }

  if (isAutomatic(headers, from.address)) return { skipped: 'automatic message' };
  const { count, error: floodError } = await admin.from('support_tickets').select('id', { count: 'exact', head: true })
    .eq('email', from.address).gte('created_at', new Date(Date.now() - 24 * HOUR_MS).toISOString());
  if (floodError) throw floodError;
  if (count >= MAX_NEW_TICKETS_PER_DAY) return { skipped: 'too many tickets from this sender today' };

  // An account is linked (and its status shared) only when the email provably
  // came from its address, so a forged sender learns nothing about it.
  const auth = email.authentication || {};
  const authenticated = auth.dmarc === 'pass' || (auth.spf === 'pass' && auth.dkim === 'pass');
  let userId = null;
  if (authenticated) {
    const { data, error } = await admin.rpc('varoom_user_id_by_email', { p_email: from.address });
    if (error) throw error;
    userId = data || null;
  }
  const triaged = await triage(admin, { userId, subject, message: text });
  const { data: ticket, error } = await admin.from('support_tickets').insert({
    user_id: userId, name: (from.name || from.address.split('@')[0]).slice(0, 120), email: from.address, subject, message: body,
    priority: triaged.priority || 'normal', category: triaged.category, source: 'email', message_id: messageId, inbound_email_id: emailId,
  }).select('*').single();
  if (error) {
    if (error.code === '23505') return { skipped: 'already recorded' };
    throw error;
  }
  await acknowledge(admin, ticket, { restriction: triaged.restriction, send }).catch((ackError) => console.error('Support acknowledgement failed:', ackError.message));
  return { ticketId: ticket.id, reply: false };
}

/** Tickets answered by an admin with no word back for 7 days are closed (an email reopens them). */
async function closeStaleTickets(admin, now = Date.now()) {
  const { data, error } = await admin.from('support_tickets').select('id').in('status', ['open', 'in_progress'])
    .lt('updated_at', new Date(now - AUTO_CLOSE_DAYS * 24 * HOUR_MS).toISOString()).limit(200);
  if (error) throw error;
  let closed = 0;
  for (const { id } of data || []) {
    const { data: latest, error: latestError } = await admin.from('support_ticket_replies').select('direction,automatic')
      .eq('ticket_id', id).order('sent_at', { ascending: false }).limit(1);
    if (latestError) throw latestError;
    const last = latest && latest[0];
    if (!last || last.direction !== 'outbound' || last.automatic) continue;
    const { error: closeError } = await admin.from('support_tickets').update({ status: 'closed' }).eq('id', id);
    if (closeError) throw closeError;
    await admin.from('admin_activity').insert({ admin_id: null, action: 'support_ticket_auto_closed', target_type: 'support_ticket', target_id: id, reason: `No reply for ${AUTO_CLOSE_DAYS} days`, metadata: {} });
    closed += 1;
  }
  return closed;
}

module.exports = { verifyWebhook, ticketRef, categorize, triage, acknowledge, acknowledgementText, parseAddress, messageText, handleReceived, closeStaleTickets };
