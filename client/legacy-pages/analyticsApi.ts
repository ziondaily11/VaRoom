import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HostAnalyticsApi,
  HostBookingSummary,
  HostBookingTrendPoint,
  HostListingRanking,
  HostPlanPayment,
  HostReservationSummary,
  HostReviewSummary,
  StatusCount,
} from './Analytics';

interface SupabaseClientWindow extends Window {
  supabaseClient?: SupabaseClient;
}

function getSharedClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('The shared Supabase client is not available.');
  }
  const client = (window as SupabaseClientWindow).supabaseClient;
  if (!client) throw new Error('The shared Supabase client is not available.');
  return client;
}

async function rpc<T>(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const { data, error } = await getSharedClient().rpc(name, args).abortSignal(signal);
  if (error) throw error;
  return data as T;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Analytics RPC returned an invalid object.');
  }
  return value as Record<string, unknown>;
}

function rows(value: unknown): Record<string, unknown>[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Analytics RPC returned an invalid list.');
  return value.map(object);
}

function count(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Analytics RPC returned an invalid count.');
  return result;
}

function statusCounts(value: unknown): StatusCount[] {
  return rows(value).map((row) => ({
    status: String(row.status),
    count: count(row.count),
  }));
}

export const supabaseHostAnalyticsApi: HostAnalyticsApi = {
  async getBookingSummary(from, to, signal): Promise<HostBookingSummary> {
    const result = object(await rpc('host_booking_summary', { p_from: from, p_to: to }, signal));
    return {
      requests: count(result.requests),
      byStatus: statusCounts(result.by_status),
      approvedCount: count(result.approved_count),
      approvedValue: count(result.approved_value),
      averageApprovedValue: result.average_approved_value === null
        ? null
        : count(result.average_approved_value),
      completedStays: count(result.completed_stays),
    };
  },

  async getBookingTrend(from, to, granularity, signal): Promise<HostBookingTrendPoint[]> {
    return rows(await rpc(
      'host_booking_trend',
      { p_from: from, p_to: to, p_granularity: granularity },
      signal
    )).map((row) => ({
      bucket: String(row.bucket),
      requests: count(row.requests),
      approvedValue: count(row.approved_value),
    }));
  },

  async getListingRanking(from, to, signal): Promise<HostListingRanking[]> {
    return rows(await rpc('host_listing_ranking', { p_from: from, p_to: to }, signal)).map((row) => ({
      listingId: String(row.listing_id),
      title: String(row.title ?? ''),
      requests: count(row.requests),
      approved: count(row.approved),
      approvedValue: count(row.approved_value),
    }));
  },

  async getReservationSummary(from, to, signal): Promise<HostReservationSummary | null> {
    const result = await rpc<unknown>('host_reservation_summary', { p_from: from, p_to: to }, signal);
    if (result === null) return null;
    const value = object(result);
    const rawWeekday = value.by_weekday;
    if (!Array.isArray(rawWeekday)) throw new Error('Analytics RPC returned invalid weekday counts.');
    return {
      total: count(value.total),
      guests: count(value.guests),
      tables: count(value.tables),
      byStatus: statusCounts(value.by_status),
      byWeekday: rawWeekday.map(count),
    };
  },

  async getReviewSummary(signal): Promise<HostReviewSummary> {
    const result = object(await rpc('host_review_summary', {}, signal));
    const distribution = object(result.distribution);
    return {
      average: result.average === null ? null : count(result.average),
      count: count(result.count),
      distribution: {
        '1': count(distribution['1']),
        '2': count(distribution['2']),
        '3': count(distribution['3']),
        '4': count(distribution['4']),
        '5': count(distribution['5']),
      },
    };
  },

  async getPlanPayments(signal): Promise<HostPlanPayment[]> {
    return rows(await rpc('host_plan_payments', {}, signal)).map((row) => ({
      id: String(row.id),
      paidAt: typeof row.paid_at === 'string' ? row.paid_at : null,
      plan: String(row.plan ?? ''),
      amount: count(row.amount),
      status: String(row.status),
    }));
  },
};
