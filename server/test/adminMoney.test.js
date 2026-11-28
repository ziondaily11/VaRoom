'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';

const money = require('../lib/adminMoney');
const { fakeSupabase } = require('./helpers/fakeSupabase');

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();
const PLAN = (id, display_name, monthly, extra = {}) => ({ id, display_name, monthly_amount_minor: monthly, niche: 'airbnb', active: true, features: { max_active_listings: 3 }, ...extra });

test('revenue is what VaRoom earned: plans, listings and V-Coins; free plans are not monthly revenue', async () => {
  const db = fakeSupabase({
    profiles: [{ id: 'H1', full_name: 'Host One' }, { id: 'H2', full_name: 'Host Two' }],
    billing_payments: [
      { id: 'P1', host_id: 'H1', payment_kind: 'subscription', plan_id: 'airbnb_pro', amount_minor: 250000, status: 'succeeded', created_at: iso(-2), paid_at: iso(-2), provider_reference: 'r1' },
      { id: 'P2', host_id: 'H1', payment_kind: 'vcoins', vcoins: 100, amount_minor: 10000, status: 'succeeded', created_at: iso(-1), paid_at: iso(-1), provider_reference: 'r2' },
      { id: 'P3', host_id: 'H2', payment_kind: 'listing', listing_tier: 'gold', amount_minor: 100000, status: 'succeeded', created_at: iso(-40), provider_reference: 'old' },
      { id: 'P4', host_id: 'H2', payment_kind: 'subscription', amount_minor: 150000, status: 'abandoned', created_at: iso(-3), provider_reference: 'r4' },
      { id: 'P5', host_id: 'H2', payment_kind: 'listing', amount_minor: 50000, status: 'refunded', created_at: iso(-3), provider_reference: 'r5' },
    ],
    host_subscriptions: [
      { id: 'S1', host_id: 'H1', plan_id: 'airbnb_pro', status: 'active', current_period_end: iso(20), provider_subscription_code: 'SUB_1', billing_plans: { display_name: 'Airbnb Pro', monthly_amount_minor: 250000 } },
      { id: 'S2', host_id: 'H2', plan_id: 'airbnb_starter', status: 'past_due', current_period_end: iso(2), provider_subscription_code: 'SUB_2', cancel_at_period_end: true, billing_plans: { display_name: 'Starter', monthly_amount_minor: 100000 } },
      { id: 'S3', host_id: 'H3', plan_id: 'airbnb_pro', status: 'active', current_period_end: iso(10), provider_subscription_code: null, provider_metadata: { comp: true }, billing_plans: { display_name: 'Airbnb Pro', monthly_amount_minor: 250000 } },
      { id: 'S4', host_id: 'H4', plan_id: 'airbnb_pro', status: 'active', current_period_end: iso(-1), provider_subscription_code: 'SUB_4', billing_plans: { display_name: 'Airbnb Pro', monthly_amount_minor: 250000 } },
    ],
  });
  const report = await money.revenueReport(db, 30);
  assert.equal(report.total, 2600, 'KES, the 40-day-old payment is outside the range');
  assert.deepEqual(report.byKind, { subscription: 2500, listing: 0, vcoins: 100 });
  assert.equal(report.transactions[0].payer, 'Host One');
  assert.equal(report.mrr, 3500, 'paid, unexpired plans only');
  assert.deepEqual([report.subscribers.paid, report.subscribers.pastDue, report.subscribers.cancelling], [2, 1, 1]);
  assert.deepEqual(report.failed.map((p) => p.id), ['P4']);
  assert.deepEqual(report.refunded.map((p) => p.id), ['P5']);
  assert.deepEqual(report.freePlans.map((f) => f.host_id), ['H3']);
  assert.equal(report.series.length, 30);
  assert.equal(report.series.reduce((sum, d) => sum + d.revenue, 0), 2600);
  assert.equal(await money.weekRevenue(db), 2600);
});

function hostDb(extra = {}) {
  return fakeSupabase({
    profiles: [{ id: 'H1', listing_categories: ['airbnb'] }],
    billing_plans: [PLAN('airbnb_starter', 'Starter', 100000), PLAN('airbnb_pro', 'Pro', 250000, { features: {} }), PLAN('hotel_plus', 'Hotel Plus', 300000, { niche: 'hotel' })],
    host_subscriptions: [],
    listings: [{ id: 'L1', host_id: 'H1', category: 'airbnb', publication_state: 'published', availability_status: 'available', paid_listing_until: null, live_until: iso(-5) }],
    ...extra,
  });
}

test('a free plan: only the host niche plans, extends listings, tells the host; extending adds days', async () => {
  const db = hostDb();
  assert.deepEqual((await money.plansFor(db, 'H1')).map((p) => [p.id, p.listings]), [['airbnb_starter', 3], ['airbnb_pro', null]]);
  await assert.rejects(money.giveFreePlan(db, { userId: 'H1', planId: 'hotel_plus', days: 30, reason: 'x', adminId: 'A1' }), /niche plans/);

  const given = await money.giveFreePlan(db, { userId: 'H1', planId: 'airbnb_starter', days: 30, reason: 'Launch partner', adminId: 'A1' });
  const sub = db.tables.host_subscriptions[0];
  assert.deepEqual([sub.status, sub.provider, sub.provider_subscription_code, sub.provider_metadata.comp, sub.listing_allowance_limit, sub.cancel_at_period_end], ['active', 'paystack', undefined, true, 3, true]);
  assert.ok(Math.abs(Date.parse(given.until) - (Date.now() + 30 * DAY)) < 5000);
  assert.equal(db.tables.listings[0].live_until, given.until, 'the plan keeps their listings online');
  assert.equal(db.tables.notifications[0].type, 'plan_granted');
  assert.equal(db.tables.admin_activity[0].action, 'free_plan_given');

  const extended = await money.giveFreePlan(db, { userId: 'H1', planId: 'airbnb_pro', days: 10, reason: 'More time', adminId: 'A1' });
  assert.equal(db.tables.host_subscriptions.length, 1);
  assert.equal(db.tables.host_subscriptions[0].plan_id, 'airbnb_pro');
  assert.ok(Math.abs(Date.parse(extended.until) - (Date.now() + 40 * DAY)) < 5000, 'days are added to the free time left');
});

test('a plan paid through Paystack is never changed here', async () => {
  const db = hostDb({ host_subscriptions: [{ id: 'S1', host_id: 'H1', plan_id: 'airbnb_starter', status: 'active', current_period_end: iso(10), provider_subscription_code: 'SUB_1' }] });
  await assert.rejects(money.giveFreePlan(db, { userId: 'H1', planId: 'airbnb_pro', days: 30, reason: 'x', adminId: 'A1' }), (error) => error.status === 409);
  await assert.rejects(money.endFreePlan(db, { userId: 'H1', reason: 'x', adminId: 'A1' }), (error) => error.status === 404);
  assert.equal(db.tables.host_subscriptions[0].status, 'active');
});

test('free plans end early on request, or by themselves when their time is up', async () => {
  const db = hostDb({ host_subscriptions: [
    { id: 'S1', host_id: 'H1', plan_id: 'airbnb_starter', status: 'active', current_period_end: iso(5), provider_metadata: { comp: true } },
    { id: 'S2', host_id: 'H2', plan_id: 'airbnb_starter', status: 'active', current_period_end: iso(-1), provider_metadata: { comp: true } },
    { id: 'S3', host_id: 'H3', plan_id: 'airbnb_starter', status: 'active', current_period_end: iso(-1), provider_subscription_code: 'SUB_3' },
  ] });
  assert.equal(await money.expireFreePlans(db), 1);
  assert.deepEqual(db.tables.host_subscriptions.map((s) => s.status), ['active', 'expired', 'active'], 'a Paystack plan is left to Paystack');
  await money.endFreePlan(db, { userId: 'H1', reason: 'Asked to pay', adminId: 'A1' });
  assert.equal(db.tables.host_subscriptions[0].status, 'expired');
});

test('V-Coins are granted as a ledger grant, audited and notified', async () => {
  const db = fakeSupabase({ elie_ledger: [] });
  await money.grantVcoins(db, { userId: 'U1', amount: 250, reason: 'Sorry for the outage', adminId: 'A1' });
  assert.deepEqual(db.tables.elie_ledger.map((r) => [r.user_id, r.delta, r.kind]), [['U1', 250, 'grant']]);
  assert.equal(db.tables.admin_activity[0].action, 'vcoins_granted');
  assert.equal(db.tables.notifications[0].type, 'vcoins_granted');
});

test('wiring: checkout explains a free plan; the expiry job runs; one niche mapping', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const billing = read('routes/billingRoutes.js');
  assert.match(billing, /if \(existing && isComp\(existing\)\) \{\s+return res\.status\(409\)\.json\(\{ error: `You have a free plan from VaRoom until/);
  assert.doesNotMatch(billing, /function billingNicheFor/);
  assert.match(read('server.js'), /scheduleJob\('Free plans', \{ first: 5 \* 60 \* 1000, every: 60 \* 60 \* 1000 \},/);
  assert.doesNotMatch(read('routes/adminRoutes.js'), /from\('bookings'\)\s*\.select\('total_price'/, 'revenue no longer counts bookings');
});
