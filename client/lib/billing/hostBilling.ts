// A host's plan, listing allowance, payment method and billing history for
// Settings → Plans & Billing. Everything comes from the billing API (the
// billing tables are server-only). Cached in memory per host for a short
// time, shared by concurrent callers, and cleared on sign-out.

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type SubscriptionStatus = 'active' | 'past_due' | 'cancel_requested';

export interface BillingSubscription {
  id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  listing_allowance_limit: number | null;
  niche: string | null;
  billing_plans: { id: string; display_name: string; features: { max_active_listings?: number } | null } | null;
}

export interface HostEntitlements {
  active: boolean;
  planId: string | null;
  subscription: BillingSubscription | null;
  canCreateAnotherListing: { allowed: boolean; limit: number | null; activeCount?: number; reason: string | null };
  /** The host's niche pays per listing: Silver or Gold (Property, Shops & Offices). */
  listingTiers?: boolean;
  /** Paid Silver / Gold listings not yet used by a published listing. */
  listingCredits?: { silver: number; gold: number };
}

export interface PaymentMethod {
  channel: string | null;
  brand: string | null;
  last4: string | null;
  exp_month: string | null;
  exp_year: string | null;
  bank: string | null;
}

export interface BillingPayment {
  id: string;
  kind: 'subscription' | 'listing' | 'vcoins';
  description: string;
  plan_name: string | null;
  listing_title: string | null;
  amount_minor: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  paid_at: string | null;
  created_at: string;
  reference: string;
  method: PaymentMethod | null;
}

export interface HostBilling {
  entitlements: HostEntitlements;
  /** null when the history could not be loaded (the rest still shows). */
  payments: BillingPayment[] | null;
  paymentMethod: PaymentMethod | null;
}

export const BILLING_TTL_MS = 2 * 60 * 1000;
export const SILVER_LISTING_MINOR = 100000;
export const GOLD_LISTING_MINOR = 200000;

const cache = new Map<string, { at: number; value: HostBilling }>();
const inFlight = new Map<string, Promise<HostBilling>>();

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try { return (await response.json()) as Record<string, unknown>; } catch { return {}; }
}

async function request(fetchFn: FetchFn, url: string, token: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetchFn(url, { ...init, headers: { ...authHeaders(token), ...(init.headers || {}) } });
  const body = await readJson(response);
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Request failed (${response.status})`);
  return body;
}

/** Cached when fresh; otherwise one request pair shared by every caller. */
export function loadHostBilling(userId: string, token: string, { fetchFn = fetch, force = false, now = Date.now() }: { fetchFn?: FetchFn; force?: boolean; now?: number } = {}): Promise<HostBilling> {
  const cached = cache.get(userId);
  if (!force && cached && now - cached.at < BILLING_TTL_MS) return Promise.resolve(cached.value);
  const pending = inFlight.get(userId);
  if (pending) return pending;
  const load = (async () => {
    const [entitlementsBody, paymentsResult] = await Promise.all([
      request(fetchFn, '/api/billing/entitlements', token),
      request(fetchFn, '/api/billing/payments', token).catch((error: Error) => {
        console.warn('Billing history could not be loaded:', error.message);
        return null;
      }),
    ]);
    const value: HostBilling = {
      entitlements: entitlementsBody.entitlements as HostEntitlements,
      payments: paymentsResult ? (paymentsResult.payments as BillingPayment[]) || [] : null,
      paymentMethod: paymentsResult ? (paymentsResult.payment_method as PaymentMethod | null) || null : null,
    };
    cache.set(userId, { at: Date.now(), value });
    return value;
  })();
  inFlight.set(userId, load);
  load.then(() => inFlight.delete(userId), () => inFlight.delete(userId));
  return load;
}

/** The cached value, fresh or not, for an instant first paint. */
export function cachedHostBilling(userId: string | null): HostBilling | null {
  return (userId && cache.get(userId)?.value) || null;
}

export function invalidateHostBilling(userId: string): void {
  cache.delete(userId);
  planActive.delete(userId);
}

export function clearHostBillingCache(): void {
  cache.clear();
  inFlight.clear();
  planActive.clear();
}

// ---------- Whether the host has an active plan (Host Home's rail card) ----------
// Answered from the full billing load when Settings → Plans already made it,
// else by one entitlements request; remembered for ten minutes per account.

export const PLAN_ACTIVE_TTL_MS = 10 * 60 * 1000;
const planActive = new Map<string, { at: number; value: boolean }>();

export function peekPlanActive(userId: string, now: number = Date.now()): boolean | null {
  const known = planActive.get(userId);
  if (known && now - known.at < PLAN_ACTIVE_TTL_MS) return known.value;
  const billing = cache.get(userId);
  return billing && billing.value.entitlements ? Boolean(billing.value.entitlements.active) : null;
}

export async function loadPlanActive(userId: string, token: string, { fetchFn = fetch, now = Date.now() }: { fetchFn?: FetchFn; now?: number } = {}): Promise<boolean> {
  const known = peekPlanActive(userId, now);
  if (known !== null) return known;
  const body = await request(fetchFn, '/api/billing/entitlements', token);
  const entitlements = body.entitlements as Partial<HostEntitlements> | null | undefined;
  const value = Boolean(entitlements && entitlements.active);
  planActive.set(userId, { at: now, value });
  return value;
}

export async function cancelSubscription(token: string, fetchFn: FetchFn = fetch): Promise<BillingSubscription> {
  const body = await request(fetchFn, '/api/billing/subscription/cancel', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  return body.subscription as BillingSubscription;
}

/** Paystack's own page for changing the card on a subscription. */
export async function cardUpdateLink(token: string, fetchFn: FetchFn = fetch): Promise<string> {
  const body = await request(fetchFn, '/api/billing/subscription/manage-link', token);
  const link = typeof body.link === 'string' ? body.link : '';
  if (!link.startsWith('https://')) throw new Error('Unable to open the card update page');
  return link;
}

// ---------- Display ----------

export const formatKes = (minor: number) => `KES ${(Number(minor) / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface PlanSummary {
  kind: 'plan' | 'listing-tiers' | 'none';
  name: string;
  status: SubscriptionStatus | null;
  line: string;
  price: string | null;
  canUpgrade: boolean;
  canCancel: boolean;
  canUpdateCard: boolean;
}

export function planSummary(billing: HostBilling): PlanSummary {
  const { entitlements, payments } = billing;
  const subscription = entitlements && entitlements.active ? entitlements.subscription : null;
  if (!subscription && entitlements && entitlements.listingTiers) {
    const credits = entitlements.listingCredits || { silver: 0, gold: 0 };
    const ready = [credits.gold ? `${credits.gold} Gold` : '', credits.silver ? `${credits.silver} Silver` : ''].filter(Boolean).join(' and ');
    const total = credits.gold + credits.silver;
    return {
      kind: 'listing-tiers', name: 'Silver & Gold', status: null,
      line: `Silver ${formatKes(SILVER_LISTING_MINOR)} or Gold ${formatKes(GOLD_LISTING_MINOR)} per listing, live for 30 days from publishing.`
        + (ready ? ` You have ${ready} paid listing${total === 1 ? '' : 's'} ready to publish.` : ''),
      price: null, canUpgrade: true, canCancel: false, canUpdateCard: false,
    };
  }
  if (!subscription) {
    return {
      kind: 'none', name: 'No plan', status: null, line: 'Choose a plan to unlock more for your listings.',
      price: null, canUpgrade: true, canCancel: false, canUpdateCard: false,
    };
  }
  const name = subscription.billing_plans?.display_name || 'Your plan';
  const end = formatDate(subscription.current_period_end);
  const line = subscription.status === 'cancel_requested'
    ? `Cancelled. Your plan stays active until ${end}.`
    : subscription.status === 'past_due'
      ? 'Your last payment didn’t go through. Paystack will try again; update your card to keep your plan.'
      : `Renews on ${end}.`;
  const lastCharge = (payments || []).find((payment) => payment.kind === 'subscription' && payment.status === 'succeeded' && payment.plan_name === name);
  return {
    kind: 'plan', name, status: subscription.status, line,
    price: lastCharge ? `${formatKes(lastCharge.amount_minor)} / month` : null,
    // Upgrading was offered only to Property / Shops & Offices monthly plans,
    // which are no longer sold (Silver and Gold replaced them); they run to the end of their period.
    canUpgrade: false,
    canCancel: subscription.status === 'active' || subscription.status === 'past_due',
    canUpdateCard: subscription.status === 'active' || subscription.status === 'past_due',
  };
}

export interface ListingAllowance { limit: number | null; active: number; remaining: number | null; percent: number }

/** Plan listings in use (paid Silver, Gold and pay-as-you-list listings are not counted). */
export function listingAllowance(billing: HostBilling): ListingAllowance | null {
  const { entitlements } = billing;
  if (!entitlements || !entitlements.active) return null;
  const { limit, activeCount } = entitlements.canCreateAnotherListing || { limit: null, activeCount: 0 };
  const active = Math.max(0, Number(activeCount) || 0);
  if (!limit) return { limit: null, active, remaining: null, percent: 0 };
  return { limit, active, remaining: Math.max(0, limit - active), percent: Math.min(100, Math.round((active / limit) * 100)) };
}

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', verve: 'Verve', 'american express': 'American Express', amex: 'American Express' };

export function methodLabel(method: PaymentMethod | null): { title: string; detail: string } | null {
  if (!method) return null;
  if (method.channel === 'mobile_money') {
    const name = method.bank && /m-?pesa/i.test(method.bank) ? 'M-Pesa' : (method.bank || 'Mobile money');
    return { title: name, detail: method.last4 ? `•••• ${method.last4}` : 'Mobile money' };
  }
  if (method.channel === 'card' || method.last4) {
    const brand = method.brand ? (BRANDS[method.brand.trim().toLowerCase()] || method.brand.trim().replace(/^\w/, (c) => c.toUpperCase())) : 'Card';
    const expiry = method.exp_month && method.exp_year ? ` · Expires ${method.exp_month}/${method.exp_year.slice(-2)}` : '';
    return { title: 'Card', detail: `${brand}${method.last4 ? ` •••• ${method.last4}` : ''}${expiry}` };
  }
  const channel = (method.channel || 'Payment').replace(/_/g, ' ');
  return { title: channel.replace(/^\w/, (c) => c.toUpperCase()), detail: method.bank || '' };
}

export const PAYMENT_STATUS_LABELS: Record<BillingPayment['status'], string> = {
  succeeded: 'Paid', pending: 'Processing', failed: 'Failed', refunded: 'Refunded',
};
