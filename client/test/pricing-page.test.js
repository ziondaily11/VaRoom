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

test('Property and Shops & Offices show Silver and Gold, priced per listing by the server', () => {
  for (const niche of ['property', 'shops_offices']) {
    const cards = pricing.applyPlans(pricing.DEFAULT_PLAN_CARDS, [
      { id: 'silver', display_name: 'Silver', monthly_amount_minor: 100000, billing_interval: 'one_time', niche },
      { id: 'gold', display_name: 'Gold', monthly_amount_minor: 200000, billing_interval: 'one_time', niche },
    ]);
    assert.deepEqual(cards.map((c) => [c.id, c.name, c.monthly, c.perListing, c.featured]), [['silver', 'Silver', 1000, true, false], ['gold', 'Gold', 2000, true, true]]);
    assert.ok(cards[1].features.some((f) => /landing page/.test(f)), 'Gold is eligible for the landing page');
    assert.ok(!cards[0].features.some((f) => /landing page/.test(f)), 'Silver is not');
    assert.ok(cards.every((c) => c.features.includes('Shown in VaRoom Discover')), 'Discover is the same for both');
    assert.ok(cards.every((c) => c.features[0] === 'One listing live for 30 days'));
  }
  const unchanged = pricing.applyPlans(pricing.DEFAULT_PLAN_CARDS, [{ id: 'silver', display_name: 'Silver', monthly_amount_minor: 100, niche: 'property' }]);
  unchanged[0].features.push('mutated');
  assert.equal(pricing.LISTING_TIER_CARDS[0].features.includes('mutated'), false, 'defaults are not mutated');
  assert.equal(pricing.formatPrice(12000), (12000).toLocaleString('en-KE'));
  assert.equal(pricing.yearlyReady(unchanged), false, 'yearly billing stays "Soon"');

  const page = read('pages', 'pricing.tsx');
  assert.match(page, /card\.perListing \? '\/listing'/, 'priced per listing, not per month');
  assert.match(page, /perListing \? \(/, 'the monthly / yearly switch is hidden for per-listing plans');
  assert.ok(page.includes('the 30 days start when you publish it'));
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

test('Airbnb, Hotel and Venue plans use their own cards, priced and listed by the server', () => {
  const hotel = pricing.applyPlans(pricing.DEFAULT_PLAN_CARDS, [
    { id: 'hotel_dining', display_name: 'Dining', monthly_amount_minor: 200000, niche: 'hotel', features: { included_rooms: 0 } },
    { id: 'hotel_boutique', display_name: 'Boutique', monthly_amount_minor: 400000, niche: 'hotel', features: { included_rooms: 20 } },
    { id: 'hotel_standard', display_name: 'Hotel', monthly_amount_minor: 800000, niche: 'hotel', features: { included_rooms: 60 } },
    { id: 'hotel_plus', display_name: 'Hotel Plus', monthly_amount_minor: 1500000, niche: 'hotel', features: { included_rooms: null } },
  ]);
  assert.deepEqual(hotel.map((c) => [c.id, c.name, c.monthly]), [
    ['hotel_dining', 'Dining', 2000], ['hotel_boutique', 'Boutique', 4000], ['hotel_standard', 'Hotel', 8000], ['hotel_plus', 'Hotel Plus', 15000],
  ]);
  assert.equal(hotel[1].features[0], 'Up to 20 rooms');
  assert.equal(hotel[2].featured, true);

  const airbnb = pricing.applyPlans(pricing.DEFAULT_PLAN_CARDS, [
    { id: 'airbnb_starter', display_name: 'Starter', monthly_amount_minor: 150000, niche: 'airbnb' },
    { id: 'airbnb_business', display_name: 'Business', monthly_amount_minor: 750000, niche: 'airbnb' },
    { id: 'unknown_plan', display_name: 'Unknown', monthly_amount_minor: 100, niche: 'airbnb' },
  ]);
  assert.deepEqual(airbnb.map((c) => c.id), ['airbnb_starter', 'airbnb_business'], 'only plans the server offers, unknown ids dropped');
  assert.equal(airbnb[0].features[0], 'Up to 2 active listings');

  const venue = pricing.applyPlans(pricing.DEFAULT_PLAN_CARDS, pricing.NICHE_PLAN_CARDS.venue.map((card) => (
    { id: card.id, display_name: card.name, monthly_amount_minor: card.monthly * 100, niche: 'venue' }
  )));
  assert.deepEqual(venue.map((c) => [c.name, c.monthly]), [['Venue', 2500], ['Venue Pro', 5000], ['Venue Premium', 10000]]);
  assert.equal(pricing.NICHE_PLAN_CARDS.airbnb[0].features.length, 3, 'niche defaults are not mutated');
  assert.match(read('pages', 'pricing.tsx'), /plans--four/);
});

test('first paint shows only the host\'s own niche cards, never another niche\'s', () => {
  assert.deepEqual(pricing.cardsForNiche('hotel').map((c) => c.id), ['hotel_dining', 'hotel_boutique', 'hotel_standard', 'hotel_plus']);
  assert.deepEqual(pricing.cardsForNiche('airbnb').map((c) => c.id), ['airbnb_starter', 'airbnb_pro', 'airbnb_business']);
  assert.deepEqual(pricing.cardsForNiche('venue').map((c) => c.id), ['venue_basic', 'venue_pro', 'venue_premium']);
  for (const niche of ['property', 'shop', 'office']) assert.deepEqual(pricing.cardsForNiche(niche).map((c) => c.name), ['Silver', 'Gold']);
  assert.equal(pricing.cardsForNiche(null), null, 'unknown niche waits for the server');
  assert.equal(pricing.cardsForNiche('unknown'), null);
  pricing.cardsForNiche('hotel')[0].features.push('mutated');
  assert.equal(pricing.NICHE_PLAN_CARDS.hotel[0].features.includes('mutated'), false, 'returns copies');

  const page = read('pages', 'pricing.tsx');
  assert.match(page, /useState<PlanCard\[\] \| null>\(null\)/, 'no default cards before the niche is known');
  assert.doesNotMatch(page, /useState<PlanCard\[\]>\(DEFAULT_PLAN_CARDS\)/);
});

test('plans cache is per account and niche, and expires', () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const plans = [{ id: 'hotel_dining', display_name: 'Dining', monthly_amount_minor: 200000, niche: 'hotel' }];
  pricing.writeCachedPlans(storage, 'user-a', 'hotel', plans, 1000);
  assert.deepEqual(pricing.readCachedPlans(storage, 'user-a', 'hotel', 2000), plans);
  assert.equal(pricing.readCachedPlans(storage, 'user-b', 'hotel', 2000), null, 'other accounts never see it');
  assert.equal(pricing.readCachedPlans(storage, 'user-a', 'airbnb', 2000), null, 'a niche change ignores it');
  assert.equal(pricing.readCachedPlans(storage, 'user-a', 'hotel', 1000 + pricing.PLANS_CACHE_TTL_MS + 1), null, 'expired');
  store.set(pricing.PLANS_CACHE_PREFIX + 'user-a', '{not json');
  assert.equal(pricing.readCachedPlans(storage, 'user-a', 'hotel', 2000), null, 'corrupt entries are ignored');
  assert.equal(pricing.readCachedPlans(null, 'user-a', 'hotel'), null);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.equal(pricing.readCachedPlans(throwing, 'user-a', 'hotel'), null);
  assert.doesNotThrow(() => pricing.writeCachedPlans(throwing, 'user-a', 'hotel', plans));
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
  const paystack = async (u, init) => { request = { u, init }; return json(200, { authorization_url: 'https://checkout.paystack.com/x' }); };
  const url = await pricing.startCheckout('tok', 'airbnb_pro', paystack);
  assert.equal(url, 'https://checkout.paystack.com/x');
  assert.equal(request.u, '/api/billing/checkout');
  assert.equal(request.init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(request.init.body), { plan: 'airbnb_pro' }, 'only the plan id, never a price');
  await assert.rejects(pricing.startCheckout('t', 'p', async () => json(409, { error: 'An upgrade payment is already being processed.' })), /already being processed/);

  await pricing.startListingTierCheckout('tok', 'gold', {}, paystack);
  assert.equal(request.u, '/api/billing/listing-checkout');
  assert.deepEqual(JSON.parse(request.init.body), { tier: 'gold' }, 'only the tier, never a price');
  await pricing.startListingTierCheckout('tok', 'silver', { draft: 'd1', edit: null }, paystack);
  assert.deepEqual(JSON.parse(request.init.body), { tier: 'silver', draft: 'd1' }, 'the draft to come back to');
  await assert.rejects(pricing.startListingTierCheckout('t', 'gold', {}, async () => json(403, { error: 'Silver and Gold are available for Property and Shops & Offices' })), /Silver and Gold/);
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

test('upgrade: one message box, plan names, retry, phone dots, keyboard labels, no extra font', () => {
  const page = read('pages', 'pricing.tsx');
  assert.match(page, /setNotice\(\{ tone: 'good', text: `Your \$\{planName\(result\.planId\)\} plan is active\.` \}\)/, 'the plan name, never its code');
  assert.doesNotMatch(page, /Your \$\{result\.planId\} plan/);
  assert.match(page, /setNotice\(\{ tone: 'busy', text: RETURN_MESSAGES\.verifying \}\)/);
  assert.match(page, /'Plans could not load\. Please check your connection and try again\.', retry: true/);
  assert.match(page, /setPlansAttempt\(\(n\) => n \+ 1\)/);
  assert.match(page, /<div className="plan-dots" role="group" aria-label="Choose a plan to view">/);
  assert.match(page, /<button type="button" className=\{`billing-label/);
  assert.doesNotMatch(page, /<span className=\{`billing-label[^>]*onClick/);
  assert.doesNotMatch(page, /fonts\.googleapis/);
  const styles = read('components', 'pricing', 'pricingStyles.ts');
  assert.match(styles, /\.pricing-page \.pricing-notice\.is-bad/);
  assert.match(styles, /flex:0 0 78vw/, 'the next plan peeks in on phones');
});
