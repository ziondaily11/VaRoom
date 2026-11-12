'use strict';

const { sendEmail } = require('./email');

// Chat Settings → "Email me about unread messages". Every few minutes the
// server emails people about chats with a message they have left unread for
// their chosen time: one email per chat per run of unread messages, never the
// message text, at most HOURLY_CAP an hour. Elie's replies don't count.

const NOTIFICATION_EMAIL_FROM = process.env.NOTIFICATION_EMAIL_FROM || 'VaRoom <notifications@varoom.co.ke>';
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MIN_DELAY_MS = 15 * 60 * 1000;
const HOURLY_CAP = 5;

/** Minutes before an unread message is emailed about: the person's choice, else hosts 15 and clients never. */
function alertMinutes(profile) {
  if (profile && Number.isInteger(profile.email_alert_minutes)) return profile.email_alert_minutes;
  return profile && profile.role === 'host' ? 15 : 0;
}

/**
 * Chats to email about now, from unread messages (oldest first): each
 * recipient's oldest unread message per chat that is old enough for them,
 * newer than a "Delete chat", and not already covered by an email.
 * `clears` and `sent` map "user:conversation" to times (ms).
 */
function dueAlerts({ messages, conversations, profiles, clears, sent, now }) {
  const conversationsById = new Map(conversations.map((c) => [c.id, c]));
  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const firstUnread = new Map();
  messages.forEach((message) => {
    const conversation = conversationsById.get(message.conversation_id);
    if (!conversation || message.is_auto_reply) return;
    const userId = message.sender_id === conversation.host_id ? conversation.client_id : conversation.host_id;
    const key = `${userId}:${conversation.id}`;
    if (!userId || firstUnread.has(key) || Date.parse(message.created_at) <= (clears.get(key) || 0)) return;
    firstUnread.set(key, { userId, conversation, message });
  });
  return [...firstUnread.entries()]
    .filter(([key, { userId, message }]) => {
      const minutes = alertMinutes(profilesById.get(userId));
      const created = Date.parse(message.created_at);
      return minutes > 0 && created <= now - minutes * 60_000 && (sent.get(key) || 0) < created;
    })
    .map(([, alert]) => alert);
}

const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function alertEmail({ senderName, listingTitle, link }) {
  const about = listingTitle ? ` about <strong>${escapeHtml(listingTitle)}</strong>` : '';
  return {
    subject: `${senderName} sent you a message on VaRoom`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px 24px;color:#181513;background:#fffdfb;border:1px solid #e3d9d2;border-radius:8px">`
      + `<h2 style="font-size:19px;margin:0 0 10px">You have an unread message</h2>`
      + `<p style="font-size:14px;line-height:1.55;color:#594f47;margin:0 0 20px">${escapeHtml(senderName)} sent you a message${about}. Messages stay private in VaRoom, so reply there.</p>`
      + `<a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 18px;background:#111111;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:700;font-size:14px">Open the chat</a>`
      + `<p style="font-size:12px;color:#9e8e89;line-height:1.5;border-top:1px solid #eae1dc;padding-top:14px;margin:24px 0 0">You get these emails when a message waits unread. Change or turn them off in Chats → Chat Settings.</p></div>`,
  };
}

const byKey = (rows, time) => new Map((rows || []).map((row) => [`${row.user_id}:${row.conversation_id}`, Date.parse(row[time])]));

/** One run: emails everyone due an alert; returns how many were sent. */
async function sendUnreadChatAlerts(admin, { now = Date.now(), send = sendEmail, baseUrl = process.env.PUBLIC_BASE_URL || process.env.CLIENT_BASE_URL || 'https://varoom.co.ke' } = {}) {
  const { data: messages, error } = await admin.from('messages')
    .select('id,conversation_id,sender_id,created_at,listing_id,is_auto_reply')
    .is('read_at', null).is('deleted_at', null)
    .gte('created_at', new Date(now - LOOKBACK_MS).toISOString())
    .lte('created_at', new Date(now - MIN_DELAY_MS).toISOString())
    .order('created_at', { ascending: true }).limit(2000);
  if (error) throw error;
  if (!messages || !messages.length) return 0;

  const { data: conversations, error: conversationError } = await admin.from('conversations')
    .select('id,host_id,client_id,listing_id').in('id', [...new Set(messages.map((m) => m.conversation_id))]);
  if (conversationError) throw conversationError;
  const people = [...new Set((conversations || []).flatMap((c) => [c.host_id, c.client_id]).filter(Boolean))];
  const [profiles, clears, sentRows] = await Promise.all([
    admin.from('profiles').select('id,role,full_name,email_alert_minutes').in('id', people),
    admin.from('conversation_clears').select('user_id,conversation_id,cleared_at').in('user_id', people),
    admin.from('chat_email_alerts').select('user_id,conversation_id,last_sent_at').in('user_id', people),
  ]);
  for (const result of [profiles, clears, sentRows]) if (result.error) throw result.error;

  const sent = byKey(sentRows.data, 'last_sent_at');
  const due = dueAlerts({ messages, conversations: conversations || [], profiles: profiles.data || [], clears: byKey(clears.data, 'cleared_at'), sent, now });
  if (!due.length) return 0;

  const listingIds = [...new Set(due.map(({ message, conversation }) => message.listing_id || conversation.listing_id).filter(Boolean))];
  const { data: listings } = listingIds.length ? await admin.from('listings').select('id,title').in('id', listingIds) : { data: [] };
  const titles = new Map((listings || []).map((l) => [l.id, l.title]));
  const names = new Map((profiles.data || []).map((p) => [p.id, p.full_name]));
  const recent = new Map();
  (sentRows.data || []).forEach((row) => {
    if (Date.parse(row.last_sent_at) > now - 3_600_000) recent.set(row.user_id, (recent.get(row.user_id) || 0) + 1);
  });

  let count = 0;
  for (const { userId, conversation, message } of due) {
    if ((recent.get(userId) || 0) >= HOURLY_CAP) continue;
    try {
      const { data: auth } = await admin.auth.admin.getUserById(userId);
      const to = auth && auth.user && auth.user.email;
      if (!to) continue;
      const email = alertEmail({
        senderName: names.get(message.sender_id) || 'Someone',
        listingTitle: titles.get(message.listing_id || conversation.listing_id),
        link: `${baseUrl.replace(/\/$/, '')}/chats?c=${encodeURIComponent(conversation.id)}`,
      });
      await send({ from: NOTIFICATION_EMAIL_FROM, to, ...email, idempotencyKey: `chat-alert:${userId}:${message.id}` });
      const { error: saveError } = await admin.from('chat_email_alerts')
        .upsert({ user_id: userId, conversation_id: conversation.id, last_sent_at: new Date(now).toISOString() }, { onConflict: 'user_id,conversation_id' });
      if (saveError) throw saveError;
      recent.set(userId, (recent.get(userId) || 0) + 1);
      count += 1;
    } catch (alertError) {
      console.error('Unread chat email failed:', { userId, conversationId: conversation.id, error: alertError.message });
    }
  }
  return count;
}

module.exports = { NOTIFICATION_EMAIL_FROM, HOURLY_CAP, alertMinutes, dueAlerts, alertEmail, sendUnreadChatAlerts };
