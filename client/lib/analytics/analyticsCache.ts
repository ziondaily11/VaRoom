import type { SupabaseClient } from '@supabase/supabase-js';
import { createCache, type CacheRead } from '../cache/createCache';
import { CACHE_NAMESPACES } from '../cache/namespaces';
import { fetchListingOptions, fetchOverview, fetchPlanPayments } from './analyticsApi';
import type { DateRange, Granularity, ListingOption, OverviewResult, PlanPayment } from './types';

// Host analytics caches. Session storage, keyed by account, so returning to
// Analytics (or switching back to a range already seen) renders straight away
// and refreshes in the background. User-scoped: cleared on sign-out and when
// the account changes; keys carry the user id so accounts never share entries.

const FRESH_MS = 2 * 60 * 1000;
const MAX_AGE_MS = 30 * 60 * 1000;

const isObject = (value: unknown) => Boolean(value) && typeof value === 'object';

const overviewCache = createCache<OverviewResult>({
  namespace: `${CACHE_NAMESPACES.hostAnalytics}overview:`,
  storage: 'session',
  ttlMs: FRESH_MS,
  maxAgeMs: MAX_AGE_MS,
  maxEntries: 24,
  userScoped: true,
  // Only unlocked results are kept, so a host who has just subscribed never
  // sees a cached "locked" page.
  validate: (value) => isObject(value) && (value as { access?: unknown }).access === true,
});

const paymentsCache = createCache<PlanPayment[]>({
  namespace: `${CACHE_NAMESPACES.hostAnalytics}payments:`,
  storage: 'session',
  ttlMs: 5 * 60 * 1000,
  maxAgeMs: MAX_AGE_MS,
  maxEntries: 4,
  userScoped: true,
  validate: (value) => Array.isArray(value),
});

const listingsCache = createCache<ListingOption[]>({
  namespace: `${CACHE_NAMESPACES.hostAnalytics}listings:`,
  storage: 'session',
  ttlMs: 5 * 60 * 1000,
  maxAgeMs: MAX_AGE_MS,
  maxEntries: 4,
  userScoped: true,
  validate: (value) => Array.isArray(value),
});

export function overviewKey(userId: string, range: DateRange, granularity: Granularity, listingId: string | null): string {
  return [userId, range.from, range.to, granularity, listingId || 'all'].join(':');
}

export function peekOverview(key: string): CacheRead<OverviewResult> | null {
  return overviewCache.read(key);
}

export function loadOverview(
  client: SupabaseClient,
  key: string,
  range: DateRange,
  granularity: Granularity,
  listingId: string | null,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<OverviewResult> {
  return overviewCache.load(key, () => fetchOverview(client, range, granularity, listingId), options);
}

export function peekPlanPayments(userId: string): CacheRead<PlanPayment[]> | null {
  return paymentsCache.read(userId);
}

export function loadPlanPayments(client: SupabaseClient, userId: string, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<PlanPayment[]> {
  return paymentsCache.load(userId, () => fetchPlanPayments(client), options);
}

export function peekListingOptions(userId: string): CacheRead<ListingOption[]> | null {
  return listingsCache.read(userId);
}

export function loadListingOptions(client: SupabaseClient, userId: string, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<ListingOption[]> {
  return listingsCache.load(userId, () => fetchListingOptions(client, userId), options);
}

/** Drop this account's analytics, e.g. after a plan change. */
export function invalidateAnalytics(userId: string): void {
  overviewCache.invalidate(`${userId}:`);
  paymentsCache.remove(userId);
  listingsCache.remove(userId);
}
