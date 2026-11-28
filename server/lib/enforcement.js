'use strict';

// Account enforcement (migration 20261128_000097): warnings, timed and
// open-ended suspensions, disabling, restoring, the notice each one sends,
// and the automatic rules. Admins (routes/adminRoutes.js) and the rules both
// act through applyAction, so every action is recorded, audited and notified
// the same way. Rules run in the background of the request that triggered
// them and never fail it.

const { sendEmail } = require('./email');
// Loaded when used, so this module loads without database credentials.
const createNotification = (...args) => require('./notifications').createNotification(...args);

const DAY_MS = 86400000;
const LADDER_DAYS = 180;
const SUPPORT_FROM = process.env.RESEND_FROM_EMAIL || 'VaRoom Support <support@varoom.co.ke>';
const supportUrl = () => `${(process.env.PUBLIC_BASE_URL || 'https://varoom.co.ke').replace(/\/$/, '')}/support`;

/** An account_controls row's status now: a timed suspension that has ended counts as active. */
function effectiveStatus(control, now = Date.now()) {
  if (!control) return 'active';
  if (control.status === 'suspended' && control.suspended_until && new Date(control.suspended_until).getTime() <= now) return 'active';
  return control.status;
}

const span = (hours) => (hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`);

// What each rule does, for the admin page (rows live in moderation_rules).
const RULES = {
  account_reports: { label: 'Reported by several people', describe: (r) => `Suspends an account until an admin reviews it when ${r.threshold} different people report it within ${span(r.window_hours)}.` },
  listing_reports: { label: 'Listing reported by several people', describe: (r) => `Hides a listing when ${r.threshold} different people report it within ${span(r.window_hours)}.` },
  scam_messages: { label: 'Scam-like messages', describe: (r) => `Flags messages asking for money before a viewing or to leave VaRoom; ${r.threshold} within ${span(r.window_hours)} moves the sender one step up the penalty ladder.` },
  conversation_burst: { label: 'Messaging many hosts at once', describe: (r) => `Starting ${r.threshold} new conversations within ${span(r.window_hours)} moves the account one step up the penalty ladder.` },
  expired_requests: { label: 'Unanswered booking requests', describe: (r) => `${r.threshold} booking requests left to expire within ${span(r.window_hours)} moves the host one step up the penalty ladder.` },
  linked_accounts: { label: 'Linked accounts', describe: () => 'A suspension or disabling also applies to the other accounts linked to it, and to an account linked to a restricted one later.' },
};

const PAYMENT = /\b(deposit|booking fee|viewing fee|commitment fee|reservation fee|holding fee|advance payment)\b/i;
const BEFORE_VIEWING = /\bbefore (the |you |we )?(view|viewing|visit|see|meet)/i;
const MONEY_TRANSFER = /\b(m-?pesa|till( number)?|pay ?bill|send money|western union)\b/i;
const OFF_PLATFORM = /\b(outside|off|away from|avoid|skip|bypass) varoom\b/i;

/** A message asking for money before a viewing, or to leave VaRoom. */
function looksLikeScam(text) {
  const value = String(text || '');
  return OFF_PLATFORM.test(value) || (PAYMENT.test(value) && (BEFORE_VIEWING.test(value) || MONEY_TRANSFER.test(value)));
}

const since = (hours, now = Date.now()) => new Date(now - hours * 3600000).toISOString();

async function audit(admin, adminId, action, targetType, targetId, reason, metadata = {}) {
  const { error } = await admin.from('admin_activity').insert({
    admin_id: adminId || null, action, target_type: targetType, target_id: String(targetId), reason: reason || null, metadata,
  });
  if (error) console.error('Enforcement audit failed:', error.message);
}

const NOTICES = {
  warning: () => ({ title: 'A warning on your account', lead: 'VaRoom has issued a warning on your account.', next: 'Your account works as normal. Further problems may lead to a suspension.' }),
  suspended: (until) => ({
    title: 'Your account has been suspended',
    lead: until ? `Your VaRoom account is suspended until ${new Date(until).toUTCString()}.` : 'Your VaRoom account is suspended while our team reviews it.',
    next: 'You can still sign in and browse VaRoom. Posting, booking and messaging are paused while the suspension lasts.',
  }),
  disabled: () => ({ title: 'Your account has been disabled', lead: 'Your VaRoom account has been disabled.', next: 'You can no longer sign in to this account.' }),
  restored: () => ({ title: 'Your account has been restored', lead: 'Your VaRoom account is active again.', next: 'Everything is available to you once more.' }),
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The in-app notice and the email. Neither failing undoes the action. */
async function notifyAccount(admin, userId, action, reason, until, actionId) {
  const notice = NOTICES[action](until);
  const appeal = action === 'restored' ? '' : 'If you think this is a mistake, reply to this email or contact Support to appeal.';
  try {
    await createNotification({
      supabase: admin, recipientUserId: userId, type: `account_${action}`, title: notice.title,
      message: [notice.lead, action === 'restored' ? '' : `Reason: ${reason}`].filter(Boolean).join(' '),
      relatedEntityType: 'account_action', relatedEntityId: actionId, eventKey: `account-action:${actionId}`,
    });
  } catch (error) { console.error('Account notice notification failed:', error.message); }
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data && data.user && data.user.email;
    if (!email) return;
    const lines = [notice.lead, action === 'restored' ? '' : `Reason: ${reason}`, notice.next, appeal].filter(Boolean);
    await sendEmail({
      from: SUPPORT_FROM, to: email, subject: notice.title,
      html: `${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}${appeal ? `<p><a href="${escapeHtml(supportUrl())}">Contact VaRoom Support</a></p>` : ''}`,
      idempotencyKey: `account-action-${actionId}`,
    });
  } catch (error) { console.error('Account notice email failed:', error.message); }
}

/**
 * Warns, suspends (for `days`, or until reviewed), disables (sign-in blocked)
 * or restores an account. adminId is null when a rule acts ("System").
 */
async function applyAction(admin, { userId, action, reason, days = null, ruleKey = null, adminId = null }) {
  const now = new Date();
  const until = action === 'suspended' && days ? new Date(now.getTime() + days * DAY_MS).toISOString() : null;
  const text = String(reason || '').trim() || (action === 'restored' ? 'Restored' : 'No reason given');
  if (action !== 'warning') {
    const { error } = await admin.from('account_controls').upsert({
      user_id: userId, status: action === 'restored' ? 'active' : action, reason: text,
      suspended_until: until, rule_key: ruleKey, changed_at: now.toISOString(), changed_by: adminId,
    });
    if (error) throw error;
    // Disabled blocks sign-in; suspension keeps the session (browse-only).
    const auth = await admin.auth.admin.updateUserById(userId, { ban_duration: action === 'disabled' ? '876000h' : 'none' });
    if (auth.error) throw auth.error;
  }
  const { data: record, error } = await admin.from('account_enforcement_actions').insert({
    user_id: userId, action, reason: text, rule_key: ruleKey, admin_id: adminId, suspended_until: until,
  }).select('id').single();
  if (error) throw error;
  await audit(admin, adminId, action === 'warning' ? 'account_warned' : `account_${action}`, 'user', userId, text, { rule_key: ruleKey, suspended_until: until });
  await notifyAccount(admin, userId, action, text, until, record.id);
  if (ruleKey !== 'linked_accounts') await applyToLinked(admin, userId, action, text, days);
  return { status: action === 'warning' ? null : action === 'restored' ? 'active' : action, reason: text, suspended_until: until };
}

// ---------- Rules ----------

async function loadRule(admin, key) {
  const { data, error } = await admin.from('moderation_rules').select('key,mode,threshold,window_hours').eq('key', key).maybeSingle();
  if (error) throw error;
  return data && data.mode !== 'off' ? data : null;
}

async function recordHit(admin, rule, targetType, targetId, action, metadata = {}) {
  const { error } = await admin.from('moderation_rule_hits').insert({ rule_key: rule.key, target_type: targetType, target_id: targetId, action, metadata });
  if (error) console.error('Rule hit record failed:', error.message);
}

async function countHits(admin, rule, targetId, { flagged }) {
  let query = admin.from('moderation_rule_hits').select('id', { count: 'exact', head: true })
    .eq('rule_key', rule.key).eq('target_id', targetId).gte('created_at', since(rule.window_hours));
  query = flagged ? query.eq('action', 'flagged') : query.neq('action', 'flagged');
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

/** Acts once per target per window: in shadow mode it only records `would_<action>`. */
async function fire(admin, rule, targetType, targetId, action, metadata, act) {
  if (await countHits(admin, rule, targetId, { flagged: false })) return;
  if (rule.mode === 'enforce') await act();
  await recordHit(admin, rule, targetType, targetId, rule.mode === 'enforce' ? action : `would_${action}`, metadata);
}

async function restriction(admin, userId) {
  const { data, error } = await admin.from('account_controls').select('status,suspended_until,rule_key').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data && effectiveStatus(data) !== 'active' ? data : null;
}

/** The next step for repeat problems: a warning, then 7 days, then until reviewed. */
async function nextStep(admin, userId) {
  const { count, error } = await admin.from('account_enforcement_actions').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).in('action', ['warning', 'suspended']).gte('created_at', new Date(Date.now() - LADDER_DAYS * DAY_MS).toISOString());
  if (error) throw error;
  if (!count) return { action: 'warning', days: null };
  return { action: 'suspended', days: count === 1 ? 7 : null };
}

async function escalate(admin, rule, userId, reason, metadata) {
  if (await restriction(admin, userId)) return;
  const step = await nextStep(admin, userId);
  const label = step.action === 'warning' ? 'warning' : step.days ? 'suspended_7_days' : 'suspended';
  await fire(admin, rule, 'user', userId, label, metadata, () => applyAction(admin, { userId, ...step, reason, ruleKey: rule.key }));
}

const guard = (name, fn) => async (...args) => {
  try { await fn(...args); } catch (error) { console.error(`Enforcement rule ${name} failed:`, error.message); }
};

const checkAccountReports = guard('account_reports', async (admin, userId) => {
  const rule = await loadRule(admin, 'account_reports');
  if (!rule || await restriction(admin, userId)) return;
  const { data, error } = await admin.from('chat_user_reports').select('reporter_user_id')
    .eq('reported_user_id', userId).neq('status', 'dismissed').gte('created_at', since(rule.window_hours));
  if (error) throw error;
  const reporters = new Set((data || []).map((row) => row.reporter_user_id)).size;
  if (reporters < rule.threshold) return;
  const reason = `Automatic: reported by ${reporters} people within ${span(rule.window_hours)}. Suspended until an admin reviews it.`;
  await fire(admin, rule, 'user', userId, 'suspended', { reporters }, () => applyAction(admin, { userId, action: 'suspended', reason, ruleKey: rule.key }));
});

const checkListingReports = guard('listing_reports', async (admin, listingId) => {
  const rule = await loadRule(admin, 'listing_reports');
  if (!rule) return;
  const [{ data: listing, error: listingError }, { data, error }] = await Promise.all([
    admin.from('listings').select('id,title,host_id,moderation_status').eq('id', listingId).maybeSingle(),
    admin.from('listing_reports').select('reporter_user_id').eq('listing_id', listingId).neq('status', 'dismissed').gte('created_at', since(rule.window_hours)),
  ]);
  if (listingError || error) throw listingError || error;
  if (!listing || listing.moderation_status !== 'active') return;
  const reporters = new Set((data || []).map((row) => row.reporter_user_id).filter(Boolean)).size;
  if (reporters < rule.threshold) return;
  const reason = `Automatic: reported by ${reporters} people within ${span(rule.window_hours)}. Hidden until an admin reviews it.`;
  await fire(admin, rule, 'listing', listingId, 'hidden', { reporters }, async () => {
    const { error: hideError } = await admin.from('listings').update({ moderation_status: 'hidden', moderation_reason: reason, moderated_at: new Date().toISOString(), moderated_by: null }).eq('id', listingId);
    if (hideError) throw hideError;
    await audit(admin, null, 'listing_hidden', 'listing', listingId, reason, { rule_key: rule.key });
    await createNotification({
      supabase: admin, recipientUserId: listing.host_id, type: 'listing_hidden', title: 'Your listing has been hidden',
      message: `"${listing.title || 'Your listing'}" is hidden while our team reviews reports about it. Contact Support if you think this is a mistake.`,
      relatedEntityType: 'listing', relatedEntityId: listingId, eventKey: `listing-hidden:${listingId}:${Date.now()}`,
    }).catch((notifyError) => console.error('Listing hidden notice failed:', notifyError.message));
  });
});

/** A sent text message: scam-like ones are flagged, and repeats escalate. */
const checkMessage = guard('scam_messages', async (admin, userId, messageId, text) => {
  if (!looksLikeScam(text)) return;
  const rule = await loadRule(admin, 'scam_messages');
  if (!rule) return;
  await recordHit(admin, rule, 'user', userId, 'flagged', { message_id: messageId });
  const flagged = await countHits(admin, rule, userId, { flagged: true });
  if (flagged >= rule.threshold) await escalate(admin, rule, userId, `Automatic: ${flagged} messages asking for money before a viewing or to leave VaRoom within ${span(rule.window_hours)}.`, { flagged });
});

/** A conversation this person started (asking a host about a listing). */
const noteConversationStarted = guard('conversation_burst', async (admin, userId, conversationId) => {
  const rule = await loadRule(admin, 'conversation_burst');
  if (!rule) return;
  await recordHit(admin, rule, 'user', userId, 'flagged', { conversation_id: conversationId });
  const started = await countHits(admin, rule, userId, { flagged: true });
  if (started >= rule.threshold) await escalate(admin, rule, userId, `Automatic: ${started} new conversations started within ${span(rule.window_hours)}.`, { started });
});

/** Hosts whose booking requests just expired unanswered. */
const checkExpiredRequests = guard('expired_requests', async (admin, hostIds) => {
  const rule = hostIds.length ? await loadRule(admin, 'expired_requests') : null;
  if (!rule) return;
  for (const hostId of new Set(hostIds)) {
    const { count, error } = await admin.from('bookings').select('id', { count: 'exact', head: true })
      .eq('host_id', hostId).eq('status', 'expired').gte('responded_at', since(rule.window_hours));
    if (error) throw error;
    if ((count || 0) >= rule.threshold) await escalate(admin, rule, hostId, `Automatic: ${count} booking requests left unanswered until they expired within ${span(rule.window_hours)}.`, { expired: count });
  }
});

async function groupMembers(admin, userId) {
  const { data: own, error } = await admin.from('account_group_members').select('group_id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!own) return [];
  const { data, error: membersError } = await admin.from('account_group_members').select('user_id').eq('group_id', own.group_id).neq('user_id', userId);
  if (membersError) throw membersError;
  return (data || []).map((row) => row.user_id);
}

/** Suspending or disabling reaches linked accounts; restoring lifts what this rule applied to them. */
async function applyToLinked(admin, userId, action, reason, days) {
  if (action === 'warning') return;
  const rule = await loadRule(admin, 'linked_accounts').catch(() => null);
  if (!rule) return;
  for (const memberId of await groupMembers(admin, userId)) {
    const current = await restriction(admin, memberId);
    if (action === 'restored') {
      if (current && current.rule_key === 'linked_accounts' && rule.mode === 'enforce') {
        await applyAction(admin, { userId: memberId, action: 'restored', reason: 'The linked account was restored.', ruleKey: rule.key });
      }
      continue;
    }
    if (current) continue;
    await fire(admin, rule, 'user', memberId, action, { linked_to: userId }, () => applyAction(admin, { userId: memberId, action, days, reason: `Linked to a restricted account: ${reason}`, ruleKey: rule.key }));
  }
}

/** Two accounts just linked: a restriction on one reaches the other. */
const checkLinkedAccounts = guard('linked_accounts', async (admin, firstId, secondId) => {
  const rule = await loadRule(admin, 'linked_accounts');
  if (!rule) return;
  for (const [restrictedId, otherId] of [[firstId, secondId], [secondId, firstId]]) {
    const current = await restriction(admin, restrictedId);
    if (!current || await restriction(admin, otherId)) continue;
    const days = current.suspended_until ? Math.max(1, Math.ceil((new Date(current.suspended_until) - Date.now()) / DAY_MS)) : null;
    await fire(admin, rule, 'user', otherId, current.status, { linked_to: restrictedId }, () => applyAction(admin, { userId: otherId, action: current.status, days, reason: 'Linked to a restricted account.', ruleKey: rule.key }));
  }
});

/** Timed suspensions that have ended are lifted (and the person told). */
async function liftEndedSuspensions(admin, now = new Date()) {
  const { data, error } = await admin.from('account_controls').select('user_id')
    .eq('status', 'suspended').not('suspended_until', 'is', null).lte('suspended_until', now.toISOString());
  if (error) throw error;
  for (const row of data || []) {
    await applyAction(admin, { userId: row.user_id, action: 'restored', reason: 'The suspension period ended.' });
  }
  return (data || []).length;
}

module.exports = {
  RULES, effectiveStatus, looksLikeScam, applyAction, liftEndedSuspensions,
  checkAccountReports, checkListingReports, checkMessage, noteConversationStarted, checkExpiredRequests, checkLinkedAccounts,
};
