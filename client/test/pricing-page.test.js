const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const pricing = loadTs(path.join(root, 'lib', 'billing', 'pricing.ts'));
const theme = loadTs(path.join(root, 'lib', 'theme.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });

test('niche plans fill the matching cards by name: id, price and listing limit', () => {
  const cards = pricing.applyPlans(pricing.DEFAULT_PLAN_CARDS, [
    { id: 'property_basic', display_name: 'Basic', monthly_amount_minor: 250000, niche: 'property', features: { max_active_listings: 4 } },
    { id: 'property_pro', display_name: 'Pro', monthly_amount_minor: 600000, niche: 'property', features: null },
  ]);
  assert.equal(cards[0].id, 'property_basic');
  assert.equal(cards[0].monthly, 2500);
  assert.equal(cards[0].features[0], 'Up to 4 active listings');
  assert.equal(cards[1].id, 'property_pro');
  assert.equal(cards[1].features[0], 'Up to 12 active listings', 'no limit keeps the text');
  assert.equal(cards[2].id, 'premium', 'unmatched cards keep their fallback');
  assert.equal(pricing.DEFAULT_PLAN_CARDS[0].id, 'basic', 'defaults are not mutated');
  assert.equal(pricing.formatPrice(12000), (12000).toLocaleString('en-KE'));
  assert.equal(pricing.yearlyReady(cards), false, 'yearly billing stays "Soon"');
});

test('legacy niche plans fill cards in order with the original wording', () => {
  const cards = pricing.applyPlans(pricing.DEFAULT_PLAN_CARDS, [
    { id: 'starter', display_name: 'Starter', monthly_amount_minor: 100000, niche: 'legacy' },
    { id: 'growth', display_name: 'Growth', monthly_amount_minor: 200000, niche: 'legacy' },
    { id: 'pro', display_name: 'Pro', monthly_amount_minor: 300000, niche: 'legacy' },
  ]);
  assert.deepEqual(cards.map((c) => [c.id, c.name, c.cta]), [['starter', 'Starter', 'Get Started'], ['growth', 'Growth', 'Upgrade to Growth'], ['pro', 'Pro', 'Upgrade to Pro']]);
  assert.equal(cards[1].description, 'More visibility and better listing capabilities');
  assert.equal(cards[2].features[1], 'Elie');
});

test('plans, entitlements and checkout send the token; errors carry the server message', async () => {
  let seen;
  const plans = await pricing.fetchPlans('tok', async (url, init) => { seen = init; return json(200, { plans: [{ id: 'p' }] }); });
  assert.equal(plans.length, 1);
  assert.equal(seen.headers.Authorization, 'Bearer tok');
  await assert.rejects(pricing.fetchPlans('t', async () => json(200, { plans: [] })), /No plans configured/);
  await assert.rejects(pricing.fetchPlans('t', async () => json(403, { error: 'Host account required' })), /Host account required/);
  assert.equal(pricing.currentPlanId({ active: true, subscription: { plan_id: 'property_pro' } }), 'property_pro');
  assert.equal(pricing.currentPlanId({ active: false, subscription: { plan_id: 'x' } }), null);

  let request;
  const url = await pricing.startCheckout('tok', pricing.checkoutBody('property_pro', 'l1', 'list'), async (u, init) => { request = { u, init }; return json(200, { authorization_url: 'https://checkout.paystack.com/x' }); });
  assert.equal(url, 'https://checkout.paystack.com/x');
  assert.equal(request.u, '/api/billing/checkout');
  assert.deepEqual(JSON.parse(request.init.body), { plan: 'property_pro', listing_id: 'l1', return_to: 'list' }, 'only the plan id (and listing) — never a price');
  assert.deepEqual(pricing.checkoutBody('p', null, 'elsewhere'), { plan: 'p' });
  await assert.rejects(pricing.startCheckout('t', { plan: 'p' }, async () => json(409, { error: 'An upgrade payment is already being processed.' })), /already being processed/);
});

test('the /list draft is used only when recent, from /list and of the requested niche', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  const pointer = { hostId: 'h1', cacheKey: 'k', createdAt: now - 3600000, listingId: 'l1', returnTo: 'list', category: 'property' };
  assert.equal(pricing.pendingListingId({ pointer, niche: 'property', afterUpgrade: null, now }), 'l1');
  assert.equal(pricing.pendingListingId({ pointer, niche: 'shop', afterUpgrade: null, now }), null);
  assert.equal(pricing.pendingListingId({ pointer: { ...pointer, createdAt: now - 8 * 86400000 }, niche: null, afterUpgrade: null, now }), null);
  assert.equal(pricing.pendingListingId({ pointer: { ...pointer, returnTo: 'home' }, niche: null, afterUpgrade: null, now }), null);
  assert.equal(pricing.pendingListingId({ pointer: null, niche: null, afterUpgrade: '{"id":"l9"}', now }), 'l9');
  const store = new Map([['varoom_listing_draft_pointer:h1', JSON.stringify(pointer)], ['varoom_listing_draft_pointer:h2', '{bad']]);
  const storage = { getItem: (k) => store.get(k) || null, removeItem: (k) => store.delete(k) };
  assert.equal(pricing.readDraftPointer(storage, 'h1').listingId, 'l1');
  assert.equal(pricing.readDraftPointer(storage, 'h3'), null);
  assert.equal(pricing.readDraftPointer(storage, 'h2'), null);
  assert.equal(store.has('varoom_listing_draft_pointer:h2'), false, 'a corrupt pointer is removed');
  store.set('varoom_listing_draft_pointer:h4', JSON.stringify({ ...pointer, hostId: 'someone-else' }));
  assert.equal(pricing.readDraftPointer(storage, 'h4'), null, 'another host\'s pointer is ignored');
});

test('return from Paystack: active only for a succeeded payment of the active plan', async () => {
  const server = (payment, entitlements, paymentStatus = 200) => async (url) => (url.includes('/payments/')
    ? json(paymentStatus, paymentStatus < 300 ? { payment } : { error: 'Unable to verify payment' })
    : json(200, { entitlements }));
  const active = { active: true, subscription: { status: 'active', plan_id: 'property_pro' } };
  assert.deepEqual({ ...(await pricing.checkReturnedPayment('t', 'ref', server({ status: 'succeeded', plan_id: 'property_pro' }, active))) }, { kind: 'active', planId: 'property_pro' });
  assert.equal((await pricing.checkReturnedPayment('t', 'ref', server({ status: 'succeeded', plan_id: 'property_basic' }, active))).kind, 'verifying', 'a different plan is not the paid one');
  assert.equal((await pricing.checkReturnedPayment('t', null, server(null, active))).kind, 'verifying', 'no reference never activates');
  assert.equal((await pricing.checkReturnedPayment('t', 'ref', server({ status: 'pending' }, active))).kind, 'verifying');
  for (const status of ['failed', 'abandoned', 'refunded']) {
    assert.equal((await pricing.checkReturnedPayment('t', 'ref', server({ status }, { active: false }))).kind, 'failed');
  }
  await assert.rejects(pricing.checkReturnedPayment('t', 'ref', server(null, null, 502)), /Unable to verify payment/);
  assert.equal(pricing.RETURN_POLL_MS, 2000);
  assert.equal(pricing.RETURN_MAX_ATTEMPTS, 60);
});

test('pricing is dark unless the user chose Light, from the first paint', () => {
  assert.equal(theme.resolveTheme('/pricing', null, false), 'dark');
  assert.equal(theme.resolveTheme('/pricing?billing=return', 'system', false), 'dark');
  assert.equal(theme.resolveTheme('/pricing', 'light', true), 'light');
  assert.equal(theme.resolveTheme('/bookings', null, false), 'light', 'other pages follow the setting');
  const boot = theme.themeBootScript();
  assert.match(boot, /\["\/pricing"\]\.indexOf\(path\) >= 0 && saved !== 'light'\) saved = 'dark';/);
});

test('page: hosts only, legacy wording, checkout leaves for Paystack, polling stops on unmount', () => {
  const page = read('pages', 'pricing.tsx');
  for (const text of ['Host plans', 'Pricing', '← Back to dashboard', 'Yearly billing is coming soon. Prices shown are per month.', 'Current Plan', 'Opening secure checkout for', 'Please log in again to continue.']) {
    assert.ok(page.includes(text), text);
  }
  assert.match(page, /router\.replace\(loginUrl\('\/pricing'\)\)/);
  assert.match(page, /router\.replace\('\/client-home'\)/);
  assert.match(page, /window\.location\.assign\(url\)/);
  assert.match(page, /return \(\) => \{ stopped = true; window\.clearTimeout\(timer\); \};/);
  assert.doesNotMatch(page, /getSession\(|from\('profiles'\)/, 'identity comes from AuthProvider');
});

test('legacy pricing.html is retired; old URLs reach the native page', () => {
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'pricing.html')), false);
  const config = read('next.config.js');
  assert.match(config, /source: '\/pricing\.html',\s*destination: '\/pricing'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/pricing', '\/pricing\.html', '\/legacy-pages\/pricing\.html'\]/);
  assert.doesNotMatch(server, /'\/pricing': 'pricing\.html'/);
  // /list's draft cache is native now; Pricing reads the same pointer.
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'listing-draft-cache.js')), false);
  assert.ok(fs.existsSync(path.join(root, 'lib', 'listWizard', 'draftCache.ts')));
});
