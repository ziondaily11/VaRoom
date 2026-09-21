'use strict';

const supabaseAdmin = require('./supabaseClient');

// Suspension is deliberately a capability restriction, not an authentication
// restriction. Suspended people keep their normal session and read access.
async function accountCanCreateActivity(userId) {
  const { data, error } = await supabaseAdmin.from('account_controls')
    .select('status').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return !data || data.status === 'active';
}

async function rejectSuspendedActivity(res, userId) {
  if (await accountCanCreateActivity(userId)) return false;
  res.status(403).json({
    error: 'Your account is suspended. You can continue browsing VaRoom and contact Support to submit an appeal.',
    code: 'ACCOUNT_SUSPENDED',
  });
  return true;
}

module.exports = { accountCanCreateActivity, rejectSuspendedActivity };
