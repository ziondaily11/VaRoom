import type { SupabaseClient } from '@supabase/supabase-js';
import { PENDING_EXPIRY_MS } from '../bookings/clientBookings';

// Host Home's "Needs your attention" card (replaces "Your listings at a
// glance"). What it shows depends on the account, most urgent first:
// booking requests, unanswered chats, paid listings about to go offline;
// when nothing needs doing, the plans card for hosts without a
// subscription (hidden for a week with "Not now"); otherwise "all caught up".
// A host with no listings sees "List your first space".

export interface PendingRequest {
  id: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  listing: { title: string | null } | null;
  client: { full_name: string | null } | null;
}

export interface AttentionListing {
  id: string;
  title: string | null;
  availability_status: string | null;
  paid_listing_until?: string | null;
}

export interface ExpiringListing { id: string; title: string; until: string; days: number }

export type AttentionView =
  | { kind: 'loading' }
  | { kind: 'first-listing' }
  | { kind: 'actions'; requests: PendingRequest[]; requestCount: number; chats: number; expiring: ExpiringListing[] }
  | { kind: 'upgrade' }
  | { kind: 'caught-up'; live: number };

/** Paid listings that go offline within this many days are flagged. */
export const EXPIRY_WARNING_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function expiringListings(listings: AttentionListing[], now: number = Date.now()): ExpiringListing[] {
  return listings
    // A listing marked sold, rented or leased is off the market: its term ending is no news.
    .filter((listing) => listing.paid_listing_until && !['sold', 'rented', 'leased'].includes(String(listing.availability_status)))
    .map((listing) => {
      const until = Date.parse(String(listing.paid_listing_until));
      return { id: listing.id, title: listing.title || 'Your listing', until: String(listing.paid_listing_until), days: Math.ceil((until - now) / DAY_MS) };
    })
    .filter((listing) => Number.isFinite(listing.days) && listing.days >= 0 && listing.days <= EXPIRY_WARNING_DAYS)
    .sort((a, b) => a.days - b.days);
}

/**
 * What the card shows. `subscribed` is null until known (it is only asked
 * for when nothing more urgent is shown); `upgradeSnoozed` hides the plans
 * card for a while.
 */
export function attentionView(input: {
  listings: AttentionListing[] | null | 'error';
  requests: { rows: PendingRequest[]; count: number } | null;
  chats: number;
  subscribed: boolean | null;
  upgradeSnoozed: boolean;
  now?: number;
}): AttentionView {
  const { listings, requests, chats, subscribed, upgradeSnoozed, now = Date.now() } = input;
  if (listings === null || requests === null) return { kind: 'loading' };
  const rows = Array.isArray(listings) ? listings : [];
  if (Array.isArray(listings) && listings.length === 0 && requests.count === 0) return { kind: 'first-listing' };
  const expiring = expiringListings(rows, now);
  if (requests.count > 0 || chats > 0 || expiring.length > 0) {
    return { kind: 'actions', requests: requests.rows, requestCount: requests.count, chats, expiring };
  }
  if (subscribed === false && !upgradeSnoozed) return { kind: 'upgrade' };
  return { kind: 'caught-up', live: rows.filter((listing) => (listing.availability_status || 'available') === 'available').length };
}

/** The newest booking requests still waiting for a reply (requests expire after 48 hours), and how many there are. */
export async function fetchPendingRequests(client: SupabaseClient, hostId: string, now: number = Date.now()): Promise<{ rows: PendingRequest[]; count: number }> {
  const since = new Date(now - PENDING_EXPIRY_MS).toISOString();
  const { data, count, error } = await client
    .from('bookings')
    .select('id,created_at,start_date,end_date,listing:listings(title),client:profiles!bookings_client_id_fkey(full_name)', { count: 'exact' })
    .eq('host_id', hostId)
    .eq('status', 'pending')
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) throw error;
  const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] || null : value || null);
  const rows = ((data || []) as unknown as Array<PendingRequest & { listing: unknown; client: unknown }>).map((row) => ({
    ...row,
    listing: one(row.listing as PendingRequest['listing']),
    client: one(row.client as PendingRequest['client']),
  }));
  return { rows, count: count ?? rows.length };
}

// ---------- "Not now" on the plans card: hidden for a week, per account ----------

export const UPGRADE_SNOOZE_MS = 7 * DAY_MS;
const snoozeKey = (userId: string) => `varoom:upgrade-card-snoozed:${userId}`;

export function isUpgradeSnoozed(storage: Pick<Storage, 'getItem'> | null, userId: string, now: number = Date.now()): boolean {
  try {
    const at = Number(storage?.getItem(snoozeKey(userId)));
    return Number.isFinite(at) && at > 0 && now - at < UPGRADE_SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozeUpgrade(storage: Pick<Storage, 'setItem'> | null, userId: string, now: number = Date.now()): void {
  try { storage?.setItem(snoozeKey(userId), String(now)); } catch { /* Storage unavailable: it shows again next visit. */ }
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
