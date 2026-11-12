import type { SupabaseClient } from '@supabase/supabase-js';
import { workspaceHostWith } from '../team/team';
import type {
  AnalyticsOverview,
  DateRange,
  DiningSummary,
  Granularity,
  HostNiche,
  ListingOption,
  ListingRow,
  OverviewResult,
  PeriodMetrics,
  PlanPayment,
  Portfolio,
  ReviewSummary,
  StatusCount,
  TrendPoint,
} from './types';

// Host analytics reads: one host_analytics_overview call per range/listing
// (the database checks the host's plan), plus the host's plan payments.
// Responses are validated here so the page never renders a half-shaped value.

type Row = Record<string, unknown>;

const NICHES: readonly string[] = ['airbnb', 'hotel', 'venue', 'property', 'office', 'shop'];

function object(value: unknown, what: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Analytics returned an invalid ${what}.`);
  }
  return value as Row;
}

function list(value: unknown, what: string): Row[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Analytics returned an invalid ${what} list.`);
  return value.map((item) => object(item, what));
}

function count(value: unknown): number {
  const result = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(result)) {
    throw new Error('Analytics returned an invalid number.');
  }
  return result;
}

function optional(value: unknown): number | null {
  return value === null || value === undefined ? null : count(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function parseNiche(value: unknown): HostNiche | null {
  return typeof value === 'string' && NICHES.includes(value) ? (value as HostNiche) : null;
}

function statusCounts(value: unknown): StatusCount[] {
  return list(value, 'status').map((row) => ({ status: String(row.status), count: count(row.count) }));
}

export function parsePeriod(value: unknown): PeriodMetrics {
  const row = object(value, 'period');
  return {
    views: count(row.views),
    uniqueViewers: count(row.unique_viewers),
    contactWhatsapp: count(row.contact_whatsapp),
    contactPhone: count(row.contact_phone),
    contactEmail: count(row.contact_email),
    shares: count(row.shares),
    enquiries: count(row.enquiries),
    likes: count(row.likes),
    saves: count(row.saves),
    requests: count(row.requests),
    byStatus: statusCounts(row.by_status),
    approved: count(row.approved),
    approvedValue: count(row.approved_value),
    averageValue: optional(row.average_value),
    completed: count(row.completed),
    nights: count(row.nights),
    stays: count(row.stays),
    stayValue: count(row.stay_value),
    hours: count(row.hours),
    hourlyBookings: count(row.hourly_bookings),
    leaseRequests: count(row.lease_requests),
    leaseApproved: count(row.lease_approved),
    leaseMonths: count(row.lease_months),
    leaseMonthlyValue: optional(row.lease_monthly_value),
    leadDays: optional(row.lead_days),
    bookingResponseMinutes: optional(row.booking_response_minutes),
    bookingResponses: count(row.booking_responses),
    occupiedDays: count(row.occupied_days),
    capacityDays: count(row.capacity_days),
    chatThreads: count(row.chat_threads),
    chatReplied: count(row.chat_replied),
    chatRepliedWithinHour: count(row.chat_replied_within_hour),
    chatResponseMinutes: optional(row.chat_response_minutes),
  };
}

function parsePortfolio(value: unknown): Portfolio {
  const row = object(value, 'portfolio');
  const categories = Array.isArray(row.categories) ? row.categories.filter((c): c is string => typeof c === 'string') : [];
  return {
    listings: count(row.listings ?? 0),
    published: count(row.published ?? 0),
    categories,
    hasStays: row.has_stays === true,
    hasDining: row.has_dining === true,
    hasRent: row.has_rent === true,
    hasSale: row.has_sale === true,
    hasHourly: row.has_hourly === true,
  };
}

function parseTrend(value: unknown): TrendPoint[] {
  return list(value, 'trend').map((row) => ({
    bucket: String(row.bucket),
    views: count(row.views),
    contacts: count(row.contacts),
    enquiries: count(row.enquiries),
    requests: count(row.requests),
    approved: count(row.approved),
    approvedValue: count(row.approved_value),
  }));
}

function parseListings(value: unknown): ListingRow[] {
  return list(value, 'listing').map((row) => ({
    listingId: String(row.listing_id),
    title: String(row.title ?? '') || 'Untitled listing',
    category: text(row.category),
    listingPurpose: text(row.listing_purpose),
    publicationState: text(row.publication_state),
    availabilityStatus: text(row.availability_status),
    views: count(row.views),
    contacts: count(row.contacts),
    enquiries: count(row.enquiries),
    likes: count(row.likes),
    saves: count(row.saves),
    requests: count(row.requests),
    approved: count(row.approved),
    approvedValue: count(row.approved_value),
  }));
}

function parseDining(value: unknown): DiningSummary | null {
  if (value === null || value === undefined) return null;
  const row = object(value, 'dining summary');
  const weekday = Array.isArray(row.by_weekday) ? row.by_weekday.map(count) : [];
  if (weekday.length !== 7) throw new Error('Analytics returned invalid weekday counts.');
  return {
    total: count(row.total),
    previousTotal: count(row.previous_total ?? 0),
    guests: count(row.guests),
    tables: count(row.tables),
    occasions: count(row.occasions ?? 0),
    byStatus: statusCounts(row.by_status),
    byWeekday: weekday,
    byHour: list(row.by_hour, 'hour').map((h) => ({ hour: count(h.hour), count: count(h.count) })),
  };
}

function parseReviews(value: unknown): ReviewSummary {
  const row = object(value, 'review summary');
  const distribution = object(row.distribution, 'rating distribution');
  return {
    average: optional(row.average),
    count: count(row.count),
    inPeriod: count(row.in_period ?? 0),
    distribution: {
      1: count(distribution['1']),
      2: count(distribution['2']),
      3: count(distribution['3']),
      4: count(distribution['4']),
      5: count(distribution['5']),
    },
  };
}

export function parseOverview(value: unknown): OverviewResult {
  const row = object(value, 'overview');
  const niche = parseNiche(row.niche);
  if (row.access !== true) return { access: false, niche };
  const overview: AnalyticsOverview = {
    access: true,
    niche,
    portfolio: parsePortfolio(row.portfolio),
    trackingSince: text(row.tracking_since),
    current: parsePeriod(row.current),
    previous: parsePeriod(row.previous),
    trend: parseTrend(row.trend),
    listings: parseListings(row.listings),
    dining: parseDining(row.dining),
    reviews: parseReviews(row.reviews),
  };
  return overview;
}

export function parsePlanPayments(value: unknown): PlanPayment[] {
  return list(value, 'payment').map((row) => ({
    id: String(row.id),
    paidAt: typeof row.paid_at === 'string' ? row.paid_at : '',
    plan: String(row.plan ?? ''),
    amount: count(row.amount),
    status: String(row.status),
  }));
}

export async function fetchOverview(
  client: SupabaseClient,
  range: DateRange,
  granularity: Granularity,
  listingId: string | null,
  signal?: AbortSignal,
): Promise<OverviewResult> {
  let request = client.rpc('host_analytics_overview', {
    p_from: range.from,
    p_to: range.to,
    p_granularity: granularity,
    p_listing: listingId,
  });
  // A Finance member working as a company sees its numbers; the database checks the role.
  const company = workspaceHostWith('finance');
  if (company) request = request.setHeader('X-VaRoom-Host', company);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message || 'Analytics could not be loaded.');
  return parseOverview(data);
}

export async function fetchPlanPayments(client: SupabaseClient, signal?: AbortSignal): Promise<PlanPayment[]> {
  let request = client.rpc('host_plan_payments', {});
  const company = workspaceHostWith('finance');
  if (company) request = request.setHeader('X-VaRoom-Host', company);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message || 'Plan payments could not be loaded.');
  return parsePlanPayments(data);
}

/** The host's listings for the listing picker (own rows; RLS allows the owner). */
export async function fetchListingOptions(client: SupabaseClient, hostId: string, signal?: AbortSignal): Promise<ListingOption[]> {
  let request = client
    .from('listings')
    .select('id,title')
    .eq('host_id', hostId)
    .not('publication_state', 'in', '(discarded,cleanup_pending)')
    .order('created_at', { ascending: false });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message || 'Your listings could not be loaded.');
  return (data || []).map((row: { id: unknown; title: unknown }) => ({
    id: String(row.id),
    title: String(row.title || '') || 'Untitled listing',
  }));
}
