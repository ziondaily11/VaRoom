'use strict';

// Account deactivation, as the Privacy Policy and Terms describe it
// ("Account Deletion"): deleting an account deactivates it for 30 days, then
// it is permanently deleted unless the person signs in again first.
// "Deactivate account" in Settings is the same without the deadline.
//
// While deactivated: the profile and listings are hidden from other people
// (migration 20261105_000060 and the checks that use isDeactivated), chats
// show "Deactivated account" and take no new messages, and paid plans stop
// renewing. Signing in again in the usual way restores everything.

const DELETION_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWING_STATUSES = ['active', 'past_due'];

/** Whether an account (profile row with deactivated_at) is deactivated. */
const isDeactivated = (profile) => Boolean(profile && profile.deactivated_at);

/** The deactivation state of one account (null when there is no profile). */
async function deactivationState(admin, userId) {
  const { data, error } = await admin.from('profiles')
    .select('id,deactivated_at,deletion_scheduled_for').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Ids among `ids` whose accounts are deactivated. */
async function deactivatedAmong(admin, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return new Set();
  const { data, error } = await admin.from('profiles').select('id').in('id', unique).not('deactivated_at', 'is', null);
  if (error) throw error;
  return new Set((data || []).map((row) => row.id));
}

/** Stops Paystack renewing this host's plans (the paid period stays). Failures are retried by the scheduled run. */
async function cancelRenewals(admin, paystack, hostId) {
  const { data, error } = await admin.from('host_subscriptions')
    .select('id,provider_subscription_code,provider_email_token')
    .eq('host_id', hostId).in('status', RENEWING_STATUSES);
  if (error) throw error;
  const failures = [];
  for (const subscription of data || []) {
    if (!subscription.provider_subscription_code || !subscription.provider_email_token) continue;
    try {
      await paystack.disableSubscription({ code: subscription.provider_subscription_code, token: subscription.provider_email_token });
      const { error: updateError } = await admin.from('host_subscriptions')
        .update({ status: 'cancel_requested', cancel_at_period_end: true }).eq('id', subscription.id);
      // Paystack no longer renews it; its webhook records the same state if this write failed.
      if (updateError) console.error('Unable to record subscription cancellation', { subscriptionId: subscription.id, message: updateError.message });
    } catch (cancelError) {
      failures.push({ subscriptionId: subscription.id, message: cancelError.message });
    }
  }
  return { failures };
}

/**
 * Deactivates an account: hidden from others at once, every session signed
 * out, plans stop renewing. With `scheduleDeletion` (Delete account) it is
 * permanently deleted after DELETION_GRACE_DAYS unless the person signs in.
 */
async function deactivateAccount(admin, paystack, { userId, accessToken, scheduleDeletion, now = new Date() }) {
  const deactivatedAt = now.toISOString();
  const deletionScheduledFor = scheduleDeletion ? new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS).toISOString() : null;
  const { error } = await admin.from('profiles')
    .update({ deactivated_at: deactivatedAt, deletion_scheduled_for: deletionScheduledFor }).eq('id', userId);
  if (error) throw error;

  // Sessions on other devices end too, so only a new sign-in brings the account back.
  if (accessToken) {
    const { error: signOutError } = await admin.auth.admin.signOut(accessToken, 'global');
    if (signOutError) console.error('Deactivation sign-out failed:', { userId, message: signOutError.message });
  }
  try {
    const { failures } = await cancelRenewals(admin, paystack, userId);
    if (failures.length) console.error('Deactivation could not stop every renewal (retried hourly):', { userId, failures });
  } catch (renewalError) {
    console.error('Deactivation renewal check failed (retried hourly):', { userId, message: renewalError.message });
  }
  return { deactivatedAt, deletionScheduledFor };
}

/**
 * Signing in again restores a deactivated account. Only a sign-in after the
 * deactivation counts: a session left over from before it does not.
 */
async function reactivateAccount(admin, user) {
  const state = await deactivationState(admin, user.id);
  if (!isDeactivated(state)) return { reactivated: false, reason: 'active' };
  const signedInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : NaN;
  if (!Number.isFinite(signedInAt) || signedInAt <= new Date(state.deactivated_at).getTime()) {
    return { reactivated: false, reason: 'sign_in_required' };
  }
  const wasScheduledForDeletion = Boolean(state.deletion_scheduled_for);
  const { error } = await admin.from('profiles')
    .update({ deactivated_at: null, deletion_scheduled_for: null })
    .eq('id', user.id).eq('deactivated_at', state.deactivated_at);
  if (error) throw error;
  return { reactivated: true, wasScheduledForDeletion };
}

/**
 * Permanently deletes accounts whose 30 days have passed without a sign-in,
 * and retries stopping renewals for deactivated hosts. Safe to run any time.
 */
async function runDeactivationMaintenance(admin, paystack, { deleteAccount, now = new Date(), batchSize = 20 } = {}) {
  const result = { deleted: [], failed: [], renewalFailures: 0 };
  const { data: due, error } = await admin.from('profiles')
    .select('id,deactivated_at,deletion_scheduled_for')
    .not('deletion_scheduled_for', 'is', null)
    .lte('deletion_scheduled_for', now.toISOString())
    .order('deletion_scheduled_for', { ascending: true })
    .limit(batchSize);
  if (error) throw error;
  for (const account of due || []) {
    try {
      // Read again just before deleting: a sign-in may have restored it.
      const current = await deactivationState(admin, account.id);
      if (!current || !current.deletion_scheduled_for || new Date(current.deletion_scheduled_for).getTime() > now.getTime()) continue;
      await deleteAccount(account.id);
      result.deleted.push(account.id);
    } catch (deleteError) {
      result.failed.push({ id: account.id, message: deleteError.message });
    }
  }

  const { data: renewing, error: renewingError } = await admin.from('host_subscriptions')
    .select('host_id').in('status', RENEWING_STATUSES);
  if (renewingError) throw renewingError;
  const deactivatedHosts = await deactivatedAmong(admin, (renewing || []).map((row) => row.host_id));
  for (const hostId of deactivatedHosts) {
    const { failures } = await cancelRenewals(admin, paystack, hostId);
    result.renewalFailures += failures.length;
  }
  return result;
}

module.exports = {
  DELETION_GRACE_DAYS,
  isDeactivated,
  deactivationState,
  deactivatedAmong,
  cancelRenewals,
  deactivateAccount,
  reactivateAccount,
  runDeactivationMaintenance,
};
