'use strict';

const supabaseAdmin = require('./supabaseClient');
const { createNotification } = require('./notifications');

// "New message" notifications, sent only to people who have Message
// notifications on (profiles.message_notifications; unset means on).

async function messageNotificationsOn(userId, admin = supabaseAdmin) {
  const { data, error } = await admin.from('profiles').select('message_notifications').eq('id', userId).maybeSingle();
  if (error) throw error;
  return !data || data.message_notifications !== false;
}

/** Creates the notification unless the recipient turned message notifications off. Returns whether it was sent. */
async function notifyNewMessage({ recipientUserId, admin = supabaseAdmin, create = createNotification, ...notification }) {
  if (!(await messageNotificationsOn(recipientUserId, admin))) return false;
  await create({ recipientUserId, type: 'new_message', title: 'New message', ...notification });
  return true;
}

module.exports = { messageNotificationsOn, notifyNewMessage };
