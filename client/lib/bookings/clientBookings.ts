import type { SupabaseClient } from '@supabase/supabase-js';
import type { Booking } from './format';

// The client's bookings: list pages, the 48-hour expiry of unanswered
// requests, cancelling, reviews and opening the host conversation. Ported
// from legacy-pages/bookings.html and booking-approved.html.

export const CLIENT_BOOKINGS_SELECT = 'id,status,start_date,end_date,hours,lease_start_date,lease_months,total_price,price_unit,created_at,'
  + 'listing:listings(id,title,location_text,listing_photos(storage_path)),'
  + 'host:profiles!bookings_host_id_fkey(id,full_name,avatar_url,username)';

export const BOOKINGS_PAGE_SIZE = 8;
export const PENDING_EXPIRY_MS = 48 * 3600 * 1000;

export interface BookingPage {
  bookings: Booking[];
  hasMore: boolean;
  reviewedIds: string[];
}

/**
 * One page of the client's bookings, newest first, with which of them were
 * reviewed. Asks for one extra row to learn whether another page exists.
 */
export async function fetchClientBookingPage(client: SupabaseClient, userId: string, offset: number, limit = BOOKINGS_PAGE_SIZE): Promise<BookingPage> {
  const { data, error } = await client
    .from('bookings')
    .select(CLIENT_BOOKINGS_SELECT)
    .eq('client_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);
  if (error) throw error;
  const rows = (data || []) as unknown as Booking[];
  const bookings = rows.slice(0, limit);
  let reviewedIds: string[] = [];
  if (bookings.length) {
    const { data: reviews, error: reviewError } = await client
      .from('reviews')
      .select('booking_id')
      .in('booking_id', bookings.map((b) => b.id));
    if (!reviewError && reviews) reviewedIds = (reviews as Array<{ booking_id: string }>).map((r) => r.booking_id);
  }
  return { bookings, hasMore: rows.length > limit, reviewedIds };
}

/** Requests the host never answered expire after 48 hours. */
export function isExpiredRequest(b: Booking, now: number = Date.now()): boolean {
  return b.status === 'pending' && new Date(b.created_at).getTime() < now - PENDING_EXPIRY_MS;
}

/** Show unanswered requests as expired while the database sweep runs. */
export function applyExpiry(bookings: Booking[], now: number = Date.now()): Booking[] {
  return bookings.map((b) => (isExpiredRequest(b, now) ? { ...b, status: 'expired' } : b));
}

/** The lazy 48-hour sweep (same update as before). */
export async function expirePendingBookings(client: SupabaseClient, userId: string, now: number = Date.now()): Promise<void> {
  const nowIso = new Date(now).toISOString();
  await client
    .from('bookings')
    .update({ status: 'expired', responded_at: nowIso })
    .eq('status', 'pending')
    .lt('created_at', new Date(now - PENDING_EXPIRY_MS).toISOString())
    .eq('client_id', userId);
}

export type Notify = (payload: Record<string, unknown>) => Promise<unknown>;

/**
 * Cancel one of the client's own pending or approved bookings and tell the
 * host. Resolves the notification error (if any) so the caller can say the
 * booking was cancelled but the host was not notified.
 */
export async function cancelClientBooking(
  client: SupabaseClient,
  { booking, userId, guestName, notify }: { booking: Booking; userId: string; guestName: string | null; notify: Notify | null },
): Promise<{ notifyError: Error | null }> {
  const { data, error } = await client
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', booking.id)
    .eq('client_id', userId)
    .in('status', ['pending', 'approved'])
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This booking can no longer be cancelled.');

  const listing = booking.listing || {};
  const host = booking.host || {};
  if (!notify || !host.id) return { notifyError: notify ? null : new Error('Notifications are unavailable.') };
  try {
    await notify({
      recipient_user_id: host.id,
      actor_user_id: userId,
      type: 'booking_cancelled',
      title: 'Booking cancelled',
      message: `"${guestName || 'A guest'}" cancelled their booking for "${listing.title || 'this listing'}".`,
      related_entity_type: 'booking',
      related_entity_id: booking.id,
      booking_id: booking.id,
      event_key: `booking-cancelled:${booking.id}`,
      metadata: { booking_id: booking.id, listing_id: listing.id || null, listing_name: listing.title || null, cancelled_by: 'client' },
    });
    return { notifyError: null };
  } catch (notifyError) {
    return { notifyError: notifyError instanceof Error ? notifyError : new Error(String(notifyError)) };
  }
}

/** The conversation with the booking's host (created on first use). */
export async function openBookingConversation(client: SupabaseClient, { listingId, hostId, clientId }: { listingId: string; hostId: string; clientId: string }): Promise<string> {
  const { data, error } = await client
    .from('conversations')
    .upsert({ listing_id: listingId, host_id: hostId, client_id: clientId }, { onConflict: 'listing_id,client_id' })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface BookingReview { id?: string; rating: number; comment: string | null }

export const REVIEW_FALLBACK_ERROR = 'We couldn’t submit your review. Please try again.';

/** Submit a verified review (POST /api/bookings/:id/review). */
export async function submitBookingReview(
  { bookingId, rating, comment, token }: { bookingId: string; rating: number; comment: string; token: string | null },
  fetchFn: typeof fetch = fetch,
): Promise<BookingReview | null> {
  const response = await fetchFn(`/api/bookings/${encodeURIComponent(bookingId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rating, comment }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; review?: BookingReview };
  if (!response.ok) throw new Error(payload.error || REVIEW_FALLBACK_ERROR);
  return payload.review || { rating, comment };
}

/** The client's review of a booking, if there is one. */
export async function fetchBookingReview(client: SupabaseClient, bookingId: string): Promise<BookingReview | null> {
  const { data } = await client
    .from('reviews')
    .select('id,rating,comment,created_at')
    .eq('booking_id', bookingId)
    .maybeSingle();
  return (data as BookingReview | null) || null;
}

export type OwnBookingResult =
  | { kind: 'ok'; booking: Booking }
  | { kind: 'missing' }
  | { kind: 'not-yours' };

/** One booking for the detail page, only when it belongs to the signed-in client. */
export async function fetchOwnBooking(client: SupabaseClient, bookingId: string, userId: string): Promise<OwnBookingResult> {
  const { data, error } = await client
    .from('bookings')
    .select(`${CLIENT_BOOKINGS_SELECT},client_id`)
    .eq('id', bookingId)
    .maybeSingle();
  if (error || !data) return { kind: 'missing' };
  const row = data as unknown as Booking & { client_id: string };
  if (row.client_id !== userId) return { kind: 'not-yours' };
  return { kind: 'ok', booking: row };
}
