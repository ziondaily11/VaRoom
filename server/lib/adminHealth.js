'use strict';

// The admin health panel (GET /admin/health): background jobs, emails that
// failed, Paystack webhooks that failed, plans whose renewal never arrived,
// calendar links that fail, Elie and Property News, and settings that are
// missing. Each check stands alone: one failing check never hides the others.

const { jobStatus } = require('./jobHealth');
const { chatbotApiUrl } = require('./elieHost');

const DAY_MS = 86400000;

async function check(run) {
  try { return await run(); } catch (error) { return { error: error.message || String(error) }; }
}

async function rows(query) {
  const { data, error, count } = await query;
  if (error) throw error;
  return { count: count ?? (data || []).length, recent: data || [] };
}

/** Whether a service answers its /health within 5 seconds. */
async function ping(name, baseUrl, fetchFn) {
  if (!baseUrl) return { name, configured: false, ok: false };
  const started = Date.now();
  try {
    const response = await fetchFn(`${baseUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
    return { name, configured: true, ok: response.ok, status: response.status, ms: Date.now() - started };
  } catch (error) {
    return { name, configured: true, ok: false, error: error.name === 'TimeoutError' ? 'No answer within 5 seconds' : error.message, ms: Date.now() - started };
  }
}

async function healthReport(admin, { now = Date.now(), fetchFn = fetch, env = process.env } = {}) {
  const week = new Date(now - 7 * DAY_MS).toISOString();
  const [email, webhooks, stuckPlans, calendar, media, admins, services] = await Promise.all([
    check(() => rows(admin.from('support_ticket_replies').select('id,recipient,subject,provider_error,sent_at', { count: 'exact' })
      .eq('delivery_status', 'failed').gte('sent_at', week).order('sent_at', { ascending: false }).limit(5))),
    check(() => rows(admin.from('paystack_webhook_events').select('id,event_type,processing_status,processing_error,received_at', { count: 'exact' })
      .eq('processing_status', 'failed').gte('received_at', week).order('received_at', { ascending: false }).limit(5))),
    // Paid through Paystack, still live, but a day past their period: the renewal never arrived.
    check(() => rows(admin.from('host_subscriptions').select('id,host_id,plan_id,status,current_period_end', { count: 'exact' })
      .in('status', ['active', 'past_due', 'cancel_requested']).not('provider_subscription_code', 'is', null)
      .lt('current_period_end', new Date(now - DAY_MS).toISOString()).order('current_period_end').limit(10))),
    check(() => rows(admin.from('calendar_feeds').select('id,host_id,name,last_error,last_synced_at', { count: 'exact' })
      .not('last_error', 'is', null).order('last_synced_at', { ascending: false }).limit(5))),
    check(() => rows(admin.from('draft_media_cleanup_jobs').select('listing_id,status,attempts,last_error,updated_at', { count: 'exact' })
      .neq('status', 'completed').not('last_error', 'is', null).order('updated_at', { ascending: false }).limit(5))),
    check(async () => {
      const { data, error } = await admin.from('admins').select('name,email,role,totp_enabled_at');
      if (error) throw error;
      return { withoutTwoStep: (data || []).filter((a) => !a.totp_enabled_at).map((a) => ({ name: a.name, email: a.email, role: a.role })) };
    }),
    Promise.all([ping('Elie', chatbotApiUrl(), fetchFn), ping('Property News', env.PROPERTY_NEWS_API_URL, fetchFn)]),
  ]);

  const jobs = jobStatus().map((job) => {
    const late = job.last_run_at ? now - Date.parse(job.last_run_at) > 2 * job.every_ms + 5 * 60 * 1000 : false;
    return { ...job, state: job.last_error ? 'failing' : late ? 'late' : job.last_run_at ? 'ok' : 'waiting' };
  });

  return {
    checked_at: new Date(now).toISOString(),
    jobs,
    email,
    webhooks,
    stuckPlans,
    calendar,
    media,
    services,
    config: {
      inboundEmail: Boolean(env.RESEND_WEBHOOK_SECRET),
      outboundEmail: Boolean(env.RESEND_API_KEY),
      paystackWebhook: Boolean(env.PAYSTACK_SECRET_KEY),
      adminsWithoutTwoStep: admins.withoutTwoStep || [],
    },
  };
}

module.exports = { healthReport, ping };
