// Host plans for /pricing (migrated from legacy-pages/pricing.html). The
// server owns prices, Paystack plan codes and activation: the browser sends
// only a VaRoom plan id (or Silver / Gold tier), and a return from Paystack never grants access by
// itself; the plan counts as active only once the server reports the paid
// reference as succeeded and that plan as the active subscription.
// Import-free so it can be tested directly.

// The plans with Elie: away answers, @reply, reply drafts and "Write with
// Elie", 300 a month (server/lib/elieHost.js ELIE_HOST_ACTION_LIMIT).
export const ELIE_FEATURE = 'Elie (300 actions a month)';

export interface BillingPlan {
  id: string;
  display_name: string;
  currency?: string;
  monthly_amount_minor: number;
  billing_interval?: string;
  features?: { max_active_listings?: number | null } | null;
  niche: string;
}

export interface PlanCard {
  /** The VaRoom plan id, or the tier (silver / gold) of a per-listing plan. */
  id: string;
  name: string;
  description: string;
  features: string[];
  cta: string;
  monthly: number;
  /** Yearly prices are not defined yet. */
  yearly: number | null;
  featured: boolean;
  /** Paid once per listing (Silver, Gold) rather than monthly. */
  perListing?: boolean;
}

/** The original plans, for hosts without a niche plan set (filled in order from the server's legacy plans). */
export const DEFAULT_PLAN_CARDS: PlanCard[] = [
  { id: 'basic', name: 'Basic', description: 'Essential tools for getting started on VaRoom', features: ['All core host tools', 'Limited storage', 'Standard listing access'], cta: 'Get Started', monthly: 800, yearly: null, featured: false },
  { id: 'growth', name: 'Growth', description: 'More visibility and better listing capabilities', features: ['Everything in Basic', 'Video listings', 'Increased storage', 'Get showcased to new clients searching within your niche'], cta: 'Upgrade to Growth', monthly: 1300, yearly: null, featured: true },
  { id: 'pro', name: 'Pro', description: 'Maximum visibility and intelligent client engagement', features: ['Everything in Growth', ELIE_FEATURE, 'Advanced video listing capabilities', 'Maximum storage', 'Get showcased to new clients in Marketplace and Discover', 'Elie can encourage clients in empty conversations to start conversations with hosts in their niche'], cta: 'Upgrade to Pro', monthly: 1800, yearly: null, featured: false },
];

// Property and Shops & Offices pay per listing: Silver or Gold keeps one
// listing live for 30 days from when it is published. Gold ranks above
// Silver in Marketplace and is eligible for the landing page; VaRoom
// Discover treats both the same.
export const LISTING_TIER_CARDS: PlanCard[] = [
  { id: 'silver', name: 'Silver', description: 'One listing, live for 30 days from when you publish it.', perListing: true, monthly: 1000, yearly: null, featured: false, cta: 'Choose Silver',
    features: ['One listing live for 30 days', 'Shown in Marketplace', 'Shown in VaRoom Discover', 'Analytics included'] },
  { id: 'gold', name: 'Gold', description: 'More visibility for one listing, live for 30 days from when you publish it.', perListing: true, monthly: 2000, yearly: null, featured: true, cta: 'Choose Gold',
    features: ['One listing live for 30 days', 'Shown above Silver listings in Marketplace', 'Eligible for the landing page; featuring is not guaranteed', 'Shown in VaRoom Discover', 'Analytics included'] },
];

// Airbnb, Hotel and Event Venue plans unlock features; the included listings,
// rooms or spaces are shown here but not enforced on publishing yet. The
// server's plans (matched by id) set the price and which cards appear.
const nicheCard = (id: string, name: string, monthly: number, description: string, features: string[], cta: string, featured = false): PlanCard => (
  { id, name, description, features, cta, monthly, yearly: null, featured }
);

export const NICHE_PLAN_CARDS: Record<string, PlanCard[]> = {
  property: LISTING_TIER_CARDS,
  shops_offices: LISTING_TIER_CARDS,
  airbnb: [
    nicheCard('airbnb_starter', 'Starter', 1500, 'For hosts with one or two short-stay units.',
      ['Up to 2 active listings', 'Core host tools', 'Analytics included'], 'Get Started'),
    nicheCard('airbnb_pro', 'Pro', 3500, 'For growing hosts who want more guests to find them.',
      ['Up to 6 active listings', 'Everything in Starter', 'Video listings', 'Showcased to clients searching your niche', 'Eligible for landing-page promotion; featuring is not guaranteed'], 'Go Pro', true),
    nicheCard('airbnb_business', 'Business', 7500, 'For operators running a portfolio of short-stay units.',
      ['Up to 15 active listings', 'Everything in Pro', ELIE_FEATURE, 'Showcased in Marketplace and Discover'], 'Choose Business'),
  ],
  hotel: [
    nicheCard('hotel_dining', 'Dining', 2000, 'For hotel restaurants taking table reservations only.',
      ['Restaurant only, no rooms', 'Table reservations and menu', 'Analytics included'], 'Get Started'),
    nicheCard('hotel_boutique', 'Boutique', 4000, 'For guest houses and boutique hotels.',
      ['Up to 20 rooms', 'Stays and table reservations', 'Video listings', 'Analytics included'], 'Choose Boutique'),
    nicheCard('hotel_standard', 'Hotel', 8000, 'For mid-size hotels that want more direct bookings.',
      ['21 to 60 rooms', 'Everything in Boutique', 'Showcased to clients searching your niche', 'Eligible for landing-page promotion; featuring is not guaranteed'], 'Choose Hotel', true),
    nicheCard('hotel_plus', 'Hotel Plus', 15000, 'For large hotels with maximum visibility.',
      ['61 rooms or more', 'Everything in Hotel', ELIE_FEATURE, 'Showcased in Marketplace and Discover'], 'Choose Hotel Plus'),
  ],
  venue: [
    nicheCard('venue_basic', 'Venue', 2500, 'For venues with one or two bookable spaces.',
      ['Up to 2 bookable spaces', 'Core host tools', 'Analytics included'], 'Get Started'),
    nicheCard('venue_pro', 'Venue Pro', 5000, 'For venues that want more events booked.',
      ['Up to 5 bookable spaces', 'Everything in Venue', 'Video listings', 'Showcased to clients searching your niche', 'Eligible for landing-page promotion; featuring is not guaranteed'], 'Go Pro', true),
    nicheCard('venue_premium', 'Venue Premium', 10000, 'For large venues and multi-space event centres.',
      ['Up to 12 bookable spaces', 'Everything in Venue Pro', ELIE_FEATURE, 'Showcased in Marketplace and Discover'], 'Choose Premium'),
  ],
};

export const formatPrice = (value: number) => Number(value).toLocaleString('en-KE');

const PROPERTY_SHOP_NICHES = new Set(['property', 'shop', 'office']);
const copyCards = (cards: PlanCard[]) => cards.map((card) => ({ ...card, features: [...card.features] }));

/**
 * The cards to show for the host's posting niche before the server's plans
 * arrive, so a host never sees another niche's plans first. Null when the
 * niche is unknown (wait for the server instead of guessing).
 */
export function cardsForNiche(hostNiche: string | null | undefined): PlanCard[] | null {
  if (!hostNiche) return null;
  if (PROPERTY_SHOP_NICHES.has(hostNiche)) return copyCards(LISTING_TIER_CARDS);
  if (['airbnb', 'hotel', 'venue'].includes(hostNiche)) return copyCards(NICHE_PLAN_CARDS[hostNiche]);
  return null;
}

// ---- Plans cache (per account, this tab) ----

// v2: Property and Shops & Offices moved to Silver and Gold, so older saved plans are ignored.
export const PLANS_CACHE_PREFIX = 'varoom_billing_plans:v2:';
export const PLANS_CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedPlans { hostNiche: string | null; savedAt: number; plans: BillingPlan[] }

/** The server's plans saved for this account and niche within the TTL, else null. */
export function readCachedPlans(storage: Storage | null, userId: string, hostNiche: string | null, now = Date.now()): BillingPlan[] | null {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(PLANS_CACHE_PREFIX + userId);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedPlans;
    if (!cached || cached.hostNiche !== hostNiche || !Array.isArray(cached.plans) || !cached.plans.length
        || !Number.isFinite(cached.savedAt) || now - cached.savedAt > PLANS_CACHE_TTL_MS) return null;
    return cached.plans;
  } catch {
    return null;
  }
}

export function writeCachedPlans(storage: Storage | null, userId: string, hostNiche: string | null, plans: BillingPlan[], now = Date.now()) {
  if (!storage || !userId) return;
  try {
    storage.setItem(PLANS_CACHE_PREFIX + userId, JSON.stringify({ hostNiche, savedAt: now, plans } satisfies CachedPlans));
  } catch { /* Storage full or unavailable: the next visit fetches again. */ }
}

/** Yearly billing switches on only when every plan has a yearly price. */
export const yearlyReady = (cards: PlanCard[]) => cards.every((card) => Number(card.yearly) > 0);

/** Fill the cards from the server's plans for the host's niche. */
export function applyPlans(cards: PlanCard[], plans: BillingPlan[]): PlanCard[] {
  const nicheCards = plans.length > 0 ? NICHE_PLAN_CARDS[plans[0].niche] : undefined;
  if (nicheCards) {
    return plans.flatMap((serverPlan) => {
      const card = nicheCards.find((item) => item.id === serverPlan.id);
      return card ? [{ ...card, features: [...card.features], name: serverPlan.display_name || card.name, monthly: serverPlan.monthly_amount_minor / 100 }] : [];
    });
  }
  // Legacy plans, in price order, fill the original cards in order.
  const next = copyCards(cards);
  plans.forEach((plan, index) => {
    const card = next[index];
    if (!card) return;
    card.id = plan.id;
    card.name = plan.display_name;
    card.monthly = plan.monthly_amount_minor / 100;
  });
  return next.slice(0, plans.length);
}

type FetchFn = typeof fetch;
const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const readJson = (response: Response) => response.json().catch(() => ({})) as Promise<Record<string, unknown>>;

export async function fetchPlans(token: string, fetchFn: FetchFn = fetch): Promise<BillingPlan[]> {
  const response = await fetchFn('/api/billing/plans', { headers: authHeaders(token) });
  const result = await readJson(response);
  const plans = result.plans as BillingPlan[] | undefined;
  if (!response.ok || !Array.isArray(plans) || !plans.length) throw new Error((result.error as string) || 'No plans configured');
  return plans;
}

export interface Entitlements {
  active?: boolean;
  subscription?: { plan_id?: string; status?: string } | null;
  /** Paid Silver / Gold listings not yet used. */
  listingCredits?: Record<ListingTier, number>;
}

export async function fetchEntitlements(token: string, fetchFn: FetchFn = fetch): Promise<Entitlements | null> {
  const response = await fetchFn('/api/billing/entitlements', { headers: authHeaders(token) });
  const result = await readJson(response);
  if (!response.ok) throw new Error((result.error as string) || 'Unable to load your subscription');
  return (result.entitlements as Entitlements) || null;
}

export function currentPlanId(entitlements: Entitlements | null): string | null {
  return (entitlements && entitlements.active && entitlements.subscription && entitlements.subscription.plan_id) || null;
}

// ---- Checkout ----

/**
 * A started payment. Card: Paystack's popup opens with `accessCode`;
 * `authorizationUrl` is the full-page fallback. M-Pesa: the PIN prompt is on
 * the phone and `displayText` says so.
 */
export type CheckoutStart =
  | { channel: 'card'; reference: string; accessCode: string | null; authorizationUrl: string }
  | { channel: 'mpesa'; reference: string; displayText: string };

async function postCheckout(url: string, token: string, body: Record<string, string>, fetchFn: FetchFn): Promise<CheckoutStart> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  const result = await readJson(response);
  const reference = typeof result.reference === 'string' ? result.reference : '';
  if (response.ok && reference && result.channel === 'mpesa') {
    return { channel: 'mpesa', reference, displayText: typeof result.display_text === 'string' ? result.display_text : 'Check your phone and enter your M-Pesa PIN.' };
  }
  if (!response.ok || !reference || typeof result.authorization_url !== 'string') throw new Error((result.error as string) || 'Unable to start checkout.');
  return { channel: 'card', reference, accessCode: typeof result.access_code === 'string' ? result.access_code : null, authorizationUrl: result.authorization_url };
}

/** Start a monthly plan's card checkout (only the plan id is sent, never a price). Paystack renews plans on cards only. */
export const startCheckout = (token: string, planId: string, fetchFn: FetchFn = fetch) => postCheckout('/api/billing/checkout', token, { plan: planId }, fetchFn);

export type ListingTier = 'silver' | 'gold';

/** Where the card fallback (Paystack's full page) returns the host on /list: the draft being continued, or the listing being edited. */
export interface ListingReturn { draft?: string | null; edit?: string | null }

/** How the host pays for Silver or Gold: M-Pesa to this phone, or card. */
export type ListingPayment = { channel: 'mpesa'; phone: string } | { channel: 'card' };

/** Pay for one Silver or Gold listing (only the tier is sent, never a price). */
export const startListingTierCheckout = (token: string, tier: ListingTier, payment: ListingPayment, back: ListingReturn = {}, fetchFn: FetchFn = fetch) => postCheckout(
  '/api/billing/listing-checkout', token, {
    tier, channel: payment.channel, ...(payment.channel === 'mpesa' ? { phone: payment.phone } : {}),
    ...(back.draft ? { draft: back.draft } : {}), ...(back.edit ? { edit: back.edit } : {}),
  }, fetchFn,
);

/** A Safaricom number written the way hosts type it (07…, 01…, +254…, spaces): valid or not. The server normalises it. */
export const isMpesaPhone = (value: string) => /^(?:\+?254|0)?[71]\d{8}$/.test(value.replace(/[\s\-()]/g, ''));

/** M-Pesa gives the host 180 seconds to enter the PIN. */
export const MPESA_WINDOW_MS = 180 * 1000;

export type PaymentState = 'paid' | 'failed' | 'pending';

/**
 * One server check of a listing payment (Silver / Gold). The server verifies
 * it with Paystack; only `paid` unlocks anything. While M-Pesa waits for the
 * PIN, Paystack may report an unpaid charge as abandoned, so that counts as
 * failed only once the 180 seconds are over.
 */
export async function checkListingPayment(token: string, reference: string, { waitingForPin = false } = {}, fetchFn: FetchFn = fetch): Promise<PaymentState> {
  const response = await fetchFn(`/api/billing/payments/${encodeURIComponent(reference)}`, { headers: authHeaders(token) });
  const result = await readJson(response);
  if (!response.ok) throw new Error((result.error as string) || 'Unable to verify payment');
  const status = (result.payment as { status?: string } | undefined)?.status || '';
  if (status === 'succeeded') return 'paid';
  if (status === 'failed' || status === 'refunded' || (status === 'abandoned' && !waitingForPin)) return 'failed';
  return 'pending';
}

// ---- Return from Paystack (?billing=return&reference=…) ----

export const RETURN_POLL_MS = 2000;
export const RETURN_MAX_ATTEMPTS = 60;

export const RETURN_MESSAGES = {
  failed: 'Your payment was not completed. Your plan has not been activated.',
  verifying: 'Your payment is being verified. Your plan will activate only after VaRoom confirms it.',
  error: 'Your payment is being verified. Refresh this page shortly for the latest status.',
};

export type ReturnStatus =
  | { kind: 'active'; planId: string }
  | { kind: 'failed' }
  | { kind: 'verifying' };

/** One check of a returned payment against the server. Throws when it cannot be verified yet. */
export async function checkReturnedPayment(token: string, reference: string | null, fetchFn: FetchFn = fetch): Promise<ReturnStatus> {
  type ReturnedPayment = { status?: string; plan_id?: string };
  let payment: ReturnedPayment | null = null;
  if (reference) {
    const paymentResponse = await fetchFn(`/api/billing/payments/${encodeURIComponent(reference)}`, { headers: authHeaders(token) });
    const paymentResult = await readJson(paymentResponse);
    if (!paymentResponse.ok) throw new Error((paymentResult.error as string) || 'Unable to verify payment');
    payment = (paymentResult.payment as ReturnedPayment | undefined) || null;
  }
  const response = await fetchFn('/api/billing/entitlements', { headers: authHeaders(token) });
  const result = await readJson(response);
  const entitlements = result.entitlements as Entitlements | undefined;
  const subscription = entitlements && entitlements.subscription;
  if (response.ok && entitlements && entitlements.active && subscription && subscription.status === 'active'
      && reference && payment && payment.status === 'succeeded' && subscription.plan_id === payment.plan_id) {
    return { kind: 'active', planId: subscription.plan_id as string };
  }
  if (payment && ['failed', 'abandoned', 'refunded'].includes(payment.status || '')) return { kind: 'failed' };
  return { kind: 'verifying' };
}
