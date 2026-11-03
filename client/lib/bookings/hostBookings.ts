import type { SupabaseClient } from '@supabase/supabase-js';
import type { Booking, BookingPerson } from './format';
import type { Notify } from './clientBookings';

// The host's booking requests (migrated from legacy-pages/bookings.html):
// loading, approve / decline, the month filter, listing videos and table
// reservations.

export const HOST_BOOKINGS_SELECT = 'id,status,start_date,end_date,hours,lease_start_date,lease_months,total_price,price_unit,created_at,client_id,'
  + 'listing:listings(id,title,location_text,listing_photos(storage_path)),'
  + 'client:profiles!bookings_client_id_fkey(id,full_name,avatar_url,username)';

export interface HostBooking extends Omit<Booking, 'host'> {
  client_id: string;
  client: BookingPerson | null;
}

export type HostTab = 'pending' | 'confirmed' | 'declined' | 'completed' | 'table-reservations';

/** The booking status listed under a host tab. */
export const HOST_TAB_STATUS: Record<Exclude<HostTab, 'table-reservations'>, string> = {
  pending: 'pending', confirmed: 'approved', declined: 'declined', completed: 'completed',
};

export function hostTabFor(status: string): HostTab | null {
  if (status === 'approved') return 'confirmed';
  return status === 'pending' || status === 'declined' || status === 'completed' ? status : null;
}

export async function fetchHostBookings(client: SupabaseClient, userId: string): Promise<HostBooking[]> {
  const { data, error } = await client
    .from('bookings')
    .select(HOST_BOOKINGS_SELECT)
    .eq('host_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as HostBooking[];
}

export const RESPOND_FAILED = { approve: 'Failed to approve booking. Please try again.', decline: 'Failed to decline booking. Please try again.' };

/**
 * Approve or decline a pending request (only the host's own, only while still
 * pending), then tell the guest. A failed notification does not undo it.
 */
export async function respondToBooking(
  client: SupabaseClient,
  { booking, userId, decision, notify, now = new Date() }: { booking: HostBooking; userId: string; decision: 'approve' | 'decline'; notify: Notify | null; now?: Date },
): Promise<{ status: 'approved' | 'declined' }> {
  const status = decision === 'approve' ? 'approved' : 'declined';
  const { data, error } = await client
    .from('bookings')
    .update({ status, responded_at: now.toISOString() })
    .eq('id', booking.id)
    .eq('host_id', userId)
    .eq('status', 'pending')
    .select('id,client_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This booking request has already been processed.');
  const title = (booking.listing && booking.listing.title) || 'this listing';
  const payload = decision === 'approve'
    ? { type: 'booking_approved', title: 'Booking confirmed', message: `Your booking for "${title}" has been confirmed.`, event_key: `booking-approved:${booking.id}` }
    : { type: 'booking_declined', title: 'Booking declined', message: `Your booking request for "${title}" was declined.`, event_key: `booking-declined:${booking.id}` };
  try {
    await notify?.({
      recipient_user_id: (data as { client_id: string }).client_id,
      actor_user_id: userId,
      ...payload,
      related_entity_type: 'booking',
      related_entity_id: booking.id,
      booking_id: booking.id,
      metadata: { booking_id: booking.id, listing_id: (booking.listing && booking.listing.id) || null },
    });
  } catch (notifyError) {
    console.error(`Booking ${decision} notification failed:`, notifyError);
  }
  return { status };
}

export function validDate(value: string | null | undefined): boolean {
  return Boolean(value) && !Number.isNaN(new Date(value as string).getTime());
}

export function formatHostDate(value: string | null | undefined): string {
  if (!validDate(value)) return '';
  return new Date(value as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function requestedTime(value: string | null | undefined, now: number = Date.now()): string {
  if (!validDate(value)) return 'Request received recently';
  const minutes = Math.floor(Math.max(0, now - new Date(value as string).getTime()) / 60000);
  if (minutes < 60) return `Requested ${Math.max(1, minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Requested ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Requested ${days} day${days === 1 ? '' : 's'} ago`;
}

/** Bookings are listed under the month of their stay (or request). */
export function isBookingInMonth(b: Booking | HostBooking, month: Date): boolean {
  const value = b.start_date || b.lease_start_date || b.end_date || b.created_at;
  if (!validDate(value)) return true;
  const date = new Date(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

export function hostDateText(b: HostBooking): string {
  if (b.start_date) return formatHostDate(b.start_date) + (b.end_date ? ` → ${formatHostDate(b.end_date)}` : '');
  return b.lease_start_date ? `From ${formatHostDate(b.lease_start_date)}` : 'Dates to be confirmed';
}

export function hostDurationText(b: HostBooking): string {
  if (b.hours) return `${b.hours} hour${b.hours === 1 ? '' : 's'}`;
  if (b.start_date && b.end_date) return `${Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000)} nights`;
  return '';
}

// Listing videos are shared with Marketplace (lib/media/listingVideo.ts).
export { fetchListingVideo, type ListingVideo } from '../media/listingVideo';

export interface TableReservation {
  id?: string;
  restaurant_name?: string | null;
  listing_title?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  requested_date?: string | null;
  requested_time?: string | null;
  guest_count?: number | string | null;
  table_count?: number | string | null;
  special_occasion?: boolean | null;
  occasion_details?: string | null;
}

export async function fetchTableReservations(token: string, fetchFn: typeof fetch = fetch): Promise<TableReservation[]> {
  const response = await fetchFn('/api/host/table-reservations', { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({})) as { error?: string; reservations?: TableReservation[] };
  if (!response.ok) throw new Error(payload.error || 'Unable to load table reservations');
  return Array.isArray(payload.reservations) ? payload.reservations : [];
}

/** A dialable number: digits and a leading plus only. */
export const telHref = (phone: string | null | undefined) => `tel:${String(phone || '').replace(/[^+\d]/g, '')}`;
