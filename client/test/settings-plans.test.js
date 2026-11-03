const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const fresh = () => loadTs(path.join(root, 'lib', 'billing', 'hostBilling.ts'));
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });

const subscription = (status = 'active', extra = {}) => ({
  id: 'sub-1', plan_id: 'property_premium', status, current_period_start: '2026-11-01T00:00:00Z', current_period_end: '2026-12-01T00:00:00Z',
  cancel_at_period_end: status === 'cancel_requested', listing_allowance_limit: 5, niche: 'property',
  billing_plans: { id: 'property_basic', display_name: 'Basic', features: { max_active_listings: 5 } }, ...extra,
});
const entitled = (sub, activeCount = 3, limit = 5) => ({ active: true, planId: sub.plan_id, subscription: sub, canCreateAnotherListing: { allowed: activeCount < limit, limit, activeCount, reason: null } });
const payAsYouList = { active: false, planId: null, subscription: null, canCreateAnotherListing: { allowed: false, limit: null, activeCount: 0, reason: 'No active niche subscription.' } };
const paid = (extra) => ({ id: 'p1', kind: 'subscription', description: 'Basic plan — monthly', plan_name: 'Basic', listing_title: null, amount_minor: 300000, currency: 'KES', status: 'succeeded', paid_at: '2026-11-01T08:00:00Z', created_at: '2026-11-01T07:59:00Z', reference: 'ref-1', method: null, ...extra });

test('billing loads once per host: both endpoints together, shared while in flight, reused while fresh', async () => {
  const hb = fresh();
  const urls = [];
  const fetchFn = async (url, init) => {
    urls.push(url);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    await new Promise((r) => setTimeout(r, 5));
    return url.endsWith('/entitlements') ? json(200, { entitlements: entitled(subscription()) }) : json(200, { payments: [paid()], payment_method: { channel: 'card', brand: 'visa', last4: '4081', exp_month: '03', exp_year: '2030', bank: null } });
  };
  const [a, b] = await Promise.all([hb.loadHostBilling('u1', 'tok', { fetchFn }), hb.loadHostBilling('u1', 'tok', { fetchFn })]);
  assert.equal(a, b);
  assert.deepEqual(urls.sort(), ['/api/billing/entitlements', '/api/billing/payments']);
  await hb.loadHostBilling('u1', 'tok', { fetchFn });
  assert.equal(urls.length, 2, 'fresh cache: no new requests');
  assert.equal(hb.cachedHostBilling('u1'), a);
  assert.equal(hb.cachedHostBilling('u2'), null, 'per host');
  await hb.loadHostBilling('u1', 'tok', { fetchFn, now: Date.now() + hb.BILLING_TTL_MS + 1 });
  assert.equal(urls.length, 4, 'stale: loaded again');
  hb.invalidateHostBilling('u1');
  assert.equal(hb.cachedHostBilling('u1'), null);
  await hb.loadHostBilling('u1', 'tok', { fetchFn });
  hb.clearHostBillingCache();
  assert.equal(hb.cachedHostBilling('u1'), null);
  assert.match(read('lib', 'auth', 'clearUserData.ts'), /clearHostBillingCache\(\);/, 'cleared on sign-out and account change');
});

test('a failed history still shows the plan; a failed plan is an error', async () => {
  const hb = fresh();
  const partial = await hb.loadHostBilling('u1', 't', { fetchFn: async (url) => (url.endsWith('/entitlements') ? json(200, { entitlements: payAsYouList }) : json(500, { error: 'Unable to load billing history' })) });
  assert.equal(partial.payments, null);
  assert.equal(hb.planSummary(partial).name, 'Pay as you list');
  await assert.rejects(hb.loadHostBilling('u2', 't', { fetchFn: async (url) => (url.endsWith('/entitlements') ? json(500, { error: 'Unable to load entitlements' }) : json(200, { payments: [] })) }), /Unable to load entitlements/);
  assert.equal(hb.cachedHostBilling('u2'), null, 'failures are not cached');
});

test('plan summary: pay as you list, active, payment due and cancelled', () => {
  const hb = fresh();
  const none = hb.planSummary({ entitlements: payAsYouList, payments: [], paymentMethod: null });
  assert.deepEqual({ ...none }, { kind: 'pay-as-you-list', name: 'Pay as you list', status: null, line: 'KES 1,000 per listing, live for 30 days.', price: null, canUpgrade: true, canCancel: false, canUpdateCard: false });
  const active = hb.planSummary({ entitlements: entitled(subscription()), payments: [paid()], paymentMethod: null });
  assert.equal(active.name, 'Basic');
  assert.match(active.line, /^Renews on /);
  assert.equal(active.price, 'KES 3,000 / month');
  assert.deepEqual([active.canUpgrade, active.canCancel, active.canUpdateCard], [true, true, true]);
  const top = hb.planSummary({ entitlements: entitled(subscription('active', { billing_plans: { id: 'property_premium', display_name: 'Premium', features: { max_active_listings: 20 } } })), payments: [], paymentMethod: null });
  assert.equal(top.canUpgrade, false, 'nothing above Premium');
  assert.equal(top.price, null, 'no payment for this plan yet');
  const due = hb.planSummary({ entitlements: entitled(subscription('past_due')), payments: [], paymentMethod: null });
  assert.match(due.line, /didn’t go through/);
  assert.deepEqual([due.canUpgrade, due.canCancel, due.canUpdateCard], [false, true, true]);
  const cancelled = hb.planSummary({ entitlements: entitled(subscription('cancel_requested')), payments: [], paymentMethod: null });
  assert.match(cancelled.line, /^Cancelled\. Your plan stays active until /);
  assert.deepEqual([cancelled.canUpgrade, cancelled.canCancel, cancelled.canUpdateCard], [false, false, false]);
  const expired = hb.planSummary({ entitlements: { ...payAsYouList, subscription: subscription() }, payments: [], paymentMethod: null });
  assert.equal(expired.kind, 'pay-as-you-list', 'a plan past its period is no longer the current plan');
});

test('remaining listings: limit minus active plan listings', () => {
  const hb = fresh();
  assert.deepEqual({ ...hb.listingAllowance({ entitlements: entitled(subscription(), 3, 5) }) }, { limit: 5, active: 3, remaining: 2, percent: 60 });
  assert.deepEqual({ ...hb.listingAllowance({ entitlements: entitled(subscription(), 7, 5) }) }, { limit: 5, active: 7, remaining: 0, percent: 100 });
  assert.equal(hb.listingAllowance({ entitlements: entitled(subscription(), 4, null) }).remaining, null, 'no limit on legacy plans');
  assert.equal(hb.listingAllowance({ entitlements: payAsYouList }), null);
});

test('payment method labels: card, M-Pesa, other', () => {
  const hb = fresh();
  assert.deepEqual({ ...hb.methodLabel({ channel: 'card', brand: 'visa', last4: '4081', exp_month: '03', exp_year: '2030', bank: null }) }, { title: 'Card', detail: 'Visa •••• 4081 · Expires 03/30' });
  assert.deepEqual({ ...hb.methodLabel({ channel: 'mobile_money', brand: null, last4: null, exp_month: null, exp_year: null, bank: 'M-PESA' }) }, { title: 'M-Pesa', detail: 'Mobile money' });
  assert.equal(hb.methodLabel({ channel: 'bank_transfer', brand: null, last4: null, exp_month: null, exp_year: null, bank: 'Equity' }).title, 'Bank transfer');
  assert.equal(hb.methodLabel(null), null);
  assert.equal(hb.formatKes(100000), 'KES 1,000');
});

test('cancel and update card call the billing API; a bad link is refused', async () => {
  const hb = fresh();
  let sent;
  const sub = await hb.cancelSubscription('tok', async (url, init) => { sent = { url, init }; return json(200, { subscription: subscription('cancel_requested') }); });
  assert.equal(sent.url, '/api/billing/subscription/cancel');
  assert.equal(sent.init.method, 'POST');
  assert.equal(sub.status, 'cancel_requested');
  await assert.rejects(hb.cancelSubscription('tok', async () => json(409, { error: 'This subscription is already cancelled' })), /already cancelled/);
  assert.equal(await hb.cardUpdateLink('tok', async () => json(200, { link: 'https://paystack.com/manage/x' })), 'https://paystack.com/manage/x');
  await assert.rejects(hb.cardUpdateLink('tok', async () => json(200, { link: 'javascript:alert(1)' })), /Unable to open/);
});

test('Plans & Billing: hosts only, after Your Account, with every part of the section', () => {
  const sections = read('components', 'settings', 'SettingsSections.tsx');
  assert.match(sections, /isHost \? \[CATEGORIES\[0\], PLANS_CATEGORY, \.\.\.CATEGORIES\.slice\(1\)\] : CATEGORIES/);
  const page = read('pages', 'settings.tsx');
  assert.match(page, /isHost=\{role === 'host'\}/);
  assert.match(page, /view === 'plans' && role === 'host'/);
  assert.match(page, /wanted === 'plans' && role === 'host'/);
  const plans = read('components', 'settings', 'PlansSection.tsx');
  for (const text of ['Current plan', 'Remaining listings', 'Payment method', 'Billing information', 'Invoices', 'Danger zone', 'Cancel subscription', 'Yes, cancel subscription', 'Keep my plan', 'Print or save as PDF', 'Update card']) {
    assert.ok(plans.includes(text), text);
  }
  assert.match(plans, /href="\/pricing"/, 'Upgrade goes to the plans page');
  assert.match(plans, /invalidateHostBilling\(userId\)/, 'refreshed after cancelling');
});
