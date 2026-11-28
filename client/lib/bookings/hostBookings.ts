import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate, timeRange, type Booking, type BookingPerson } from './format';
import { applyExpiry } from './clientBookings';
import { listingOutcomes, unitsLeft, type ListingOutcome } from '../listings/listingAction';
import { apiFetch } from '../api';

// The host's booking requests (migrated from legacy-pages/bookings.html):
// loading, approve / decline, the month filter, listing videos and table
// reservations.

export const HOST_BOOKINGS_SELECT = 'id,status,start_date,end_date,hours,start_time,end_time,lease_start_date,lease_months,guest_count,event_type,event_notes,total_price,price_unit,created_at,client_id,'
  + 'listing:listings(id,title,location_text,category,listing_purpose,availability_status,listing_photos(storage_path),listing_booking_details(units_available,listing_purpose)),'
  + 'client:profiles!bookings_client_id_fkey(id,full_name,avatar_url,username)';

export interface HostBooking extends Omit<Booking, 'host'> {
  client_id: string;
  client: BookingPerson | null;
}

/**
 * After approving a rental or lease request on a live property, office or
 * shop: what to offer to mark it as (one unit), and how many units it has.
 * Null for stays, sales and listings already off the market.
 */
export function markAfterApproval(booking: Pick<HostBooking, 'lease_months' | 'listing'>): { outcome: ListingOutcome; units: number } | null {
  const listing = booking.listing;
  if (!listing || !listing.id || booking.lease_months == null || listing.availability_status !== 'available') return null;
  const outcome = listingOutcomes(listing).find((option) => option !== 'sold');
  return outcome ? { outcome, units: unitsLeft(listing) } : null;
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

/** Bookings whose guest the host may message: open requests (expiry applied), approved and completed (as the server allows). */
export const canMessageGuest = (b: Pick<HostBooking, 'status'>) => b.status === 'pending' || b.status === 'approved' || b.status === 'completed';

export async function fetchHostBookings(client: SupabaseClient, userId: string): Promise<HostBooking[]> {
  const { data, error } = await client
    .from('bookings')
    .select(HOST_BOOKINGS_SELECT)
    .eq('host_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // A request unanswered for 48 hours can't be approved any more (the database refuses it).
  return applyExpiry((data || []) as unknown as HostBooking[]);
}

export const RESPOND_FAILED = { approve: 'Failed to approve booking. Please try again.', decline: 'Failed to decline booking. Please try again.' };

/**
 * Approve or decline a pending request through the server (the host's own, or
 * a company's for its Managers, through the workspace header). The database
 * tells the guest; approving also posts a message in the chat with them.
 * Rejects with the server's reason ("booking_rule: …" for a booking rule).
 */
export function respondToBooking(bookingId: string, decision: 'approve' | 'decline'): Promise<{ status: 'approved' | 'declined' }> {
  return apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}/respond`, { method: 'POST', body: { decision } });
}

export function validDate(value: string | null | undefined): boolean {
  return Boolean(value) && !Number.isNaN(new Date(value as string).getTime());
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
  if (b.start_date) return formatDate(b.start_date) + (b.end_date ? ` → ${formatDate(b.end_date)}` : '');
  return b.lease_start_date ? `From ${formatDate(b.lease_start_date)}` : 'Dates to be confirmed';
}

/** "2 guests" when the guest gave a count (stays booked since it was saved), else ''. */
export function guestCountText(b: Pick<Booking, 'guest_count'>): string {
  const count = Number(b.guest_count);
  return Number.isInteger(count) && count > 0 ? `${count} guest${count === 1 ? '' : 's'}` : '';
}

export function hostDurationText(b: HostBooking): string {
  if (b.hours) return `${b.hours} hour${b.hours === 1 ? '' : 's'}${timeRange(b) ? ` · ${timeRange(b)}` : ''}`;
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

/** hostId: whose reservations (a team Manager's company); the server checks the role. */
export async function fetchTableReservations(token: string, hostId?: string, fetchFn: typeof fetch = fetch): Promise<TableReservation[]> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (hostId) headers['X-VaRoom-Host'] = hostId;
  const response = await fetchFn('/api/host/table-reservations', { headers });
  const payload = await response.json().catch(() => ({})) as { error?: string; reservations?: TableReservation[] };
  if (!response.ok) throw new Error(payload.error || 'Unable to load table reservations');
  return Array.isArray(payload.reservations) ? payload.reservations : [];
}

/** A dialable number: digits and a leading plus only. */
export const telHref = (phone: string | null | undefined) => `tel:${String(phone || '').replace(/[^+\d]/g, '')}`;
