// Host plans for /pricing (migrated from legacy-pages/pricing.html). The
// server owns prices, Paystack plan codes and activation: the browser sends
// only a VaRoom plan id, and a return from Paystack never grants access by
// itself; the plan counts as active only once the server reports the paid
// reference as succeeded and that plan as the active subscription.
// Import-free so it can be tested directly.

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
  /** The VaRoom plan id once the server's plans are loaded (the fallback slot name before). */
  id: string;
  name: string;
  description: string;
  features: string[];
  cta: string;
  monthly: number;
  /** Yearly prices are not defined yet. */
  yearly: number | null;
  featured: boolean;
}

/** Shown until the server's plans load (legacy markup). */
export const DEFAULT_PLAN_CARDS: PlanCard[] = [
  { id: 'basic', name: 'Basic', description: 'For hosts getting started with their niche.', features: ['Up to 5 active listings', 'Analytics included', 'No landing-page promotion eligibility'], cta: 'Get Started', monthly: 3000, yearly: null, featured: false },
  { id: 'pro', name: 'Pro', description: 'More room to grow and become eligible for promotion.', features: ['Up to 12 active listings', 'Analytics included', 'Eligible for landing-page promotion; featuring is not guaranteed'], cta: 'Go Pro', monthly: 6000, yearly: null, featured: true },
  { id: 'premium', name: 'Premium', description: 'Maximum capacity with landing-page promotion eligibility.', features: ['Up to 20 active listings', 'Analytics included', 'Eligible for landing-page promotion; featuring is not guaranteed'], cta: 'Choose Premium', monthly: 12000, yearly: null, featured: false },
];

// Hosts without a property or shops & offices niche see the original plans.
const LEGACY_DESCRIPTIONS = ['Essential tools for getting started on VaRoom', 'More visibility and better listing capabilities', 'Maximum visibility and intelligent client engagement'];
const LEGACY_FEATURES = [
  ['All core host tools', 'Limited storage', 'Standard listing access'],
  ['Everything in Basic', 'Video listings', 'Increased storage', 'Get showcased to new clients searching within your niche'],
  ['Everything in Growth', 'Elie', 'Advanced video listing capabilities', 'Maximum storage', 'Get showcased to new clients in Marketplace and Discover', 'Elie can encourage clients in empty conversations to start conversations with hosts in their niche'],
];
const LEGACY_CTAS = ['Get Started', 'Upgrade to Growth', 'Upgrade to Pro'];

export const formatPrice = (value: number) => Number(value).toLocaleString('en-KE');

/** Yearly billing switches on only when every plan has a yearly price. */
export const yearlyReady = (cards: PlanCard[]) => cards.every((card) => Number(card.yearly) > 0);

/** Fill the cards from the server's plans for the host's niche. */
export function applyPlans(cards: PlanCard[], plans: BillingPlan[]): PlanCard[] {
  const next = cards.map((card) => ({ ...card, features: [...card.features] }));
  const isLegacy = plans.length > 0 && plans[0].niche === 'legacy';
  plans.forEach((plan, index) => {
    const card = isLegacy ? next[index] : next.find((item) => item.name.toLowerCase() === plan.display_name.toLowerCase());
    if (!card) return;
    if (isLegacy) {
      card.name = plan.display_name;
      card.description = LEGACY_DESCRIPTIONS[index] || card.description;
      card.features = [...(LEGACY_FEATURES[index] || card.features)];
      card.cta = LEGACY_CTAS[index] || card.cta;
    }
    card.id = plan.id;
    card.monthly = plan.monthly_amount_minor / 100;
    const limit = plan.features && plan.features.max_active_listings;
    if (card.features.length && limit) card.features[0] = `Up to ${limit} active listings`;
  });
  return next;
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

export const DRAFT_POINTER_PREFIX = 'varoom_listing_draft_pointer:';
export const LISTING_AFTER_UPGRADE_KEY = 'varoom_listing_after_upgrade';
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DraftPointer { hostId: string; cacheKey: string; createdAt: number; listingId?: string; returnTo?: string; category?: string }

/** The /list draft pointer for this host (same validation as listing-draft-cache.js). */
export function readDraftPointer(storage: Storage | null, hostId: string): DraftPointer | null {
  if (!storage || !hostId) return null;
  const value = storage.getItem(DRAFT_POINTER_PREFIX + hostId);
  if (!value) return null;
  let pointer: DraftPointer;
  try {
    pointer = JSON.parse(value);
  } catch (error) {
    console.warn('Ignoring a corrupt saved listing draft pointer:', error);
    storage.removeItem(DRAFT_POINTER_PREFIX + hostId);
    return null;
  }
  if (!pointer || pointer.hostId !== hostId || typeof pointer.cacheKey !== 'string' || !Number.isFinite(pointer.createdAt)) return null;
  return pointer;
}

/**
 * The listing a subscription unlocks: a draft from /list under a week old
 * (and of the requested niche), or one saved for after the upgrade.
 */
export function pendingListingId({ pointer, niche, afterUpgrade, now = Date.now() }: {
  pointer: DraftPointer | null;
  niche: string | null;
  afterUpgrade: string | null;
  now?: number;
}): string | null {
  let listingId: string | null = null;
  if (pointer && pointer.listingId && pointer.returnTo === 'list' && pointer.createdAt && now - pointer.createdAt <= DRAFT_MAX_AGE_MS
      && (!niche || pointer.category === niche)) {
    listingId = pointer.listingId;
  }
  try {
    const pending = JSON.parse(afterUpgrade || 'null') as { id?: string } | null;
    if (pending && pending.id) listingId = pending.id;
  } catch {
    // Ignore an unreadable saved value.
  }
  return listingId;
}

export function checkoutBody(planId: string, listingId: string | null, returnTo: string | null): { plan: string; listing_id?: string; return_to?: 'list' } {
  return {
    plan: planId,
    ...(listingId ? { listing_id: listingId } : {}),
    ...(returnTo === 'list' ? { return_to: 'list' as const } : {}),
  };
}

/** Start Paystack checkout; resolves the URL to send the browser to. */
export async function startCheckout(token: string, body: ReturnType<typeof checkoutBody>, fetchFn: FetchFn = fetch): Promise<string> {
  const response = await fetchFn('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  const result = await readJson(response);
  if (!response.ok || !result.authorization_url) throw new Error((result.error as string) || 'Unable to start checkout.');
  return result.authorization_url as string;
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
