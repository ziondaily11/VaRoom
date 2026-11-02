// Booking types and display rules shared by the Bookings list, the booking
// detail (rail and phone page) and the host view. Ported from
// legacy-pages/bookings.html and booking-approved.html; import-free.

export type BookingStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired' | string;

export interface BookingPhoto { storage_path: string | null }

export interface BookingListing {
  id?: string | null;
  title?: string | null;
  location_text?: string | null;
  listing_photos?: BookingPhoto[] | null;
}

export interface BookingPerson {
  id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  username?: string | null;
}

export interface Booking {
  id: string;
  status: BookingStatus;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  lease_start_date: string | null;
  lease_months: number | null;
  total_price: number | string | null;
  price_unit: string | null;
  created_at: string;
  listing: BookingListing | null;
  host: BookingPerson | null;
}

export type ClientTab = 'upcoming' | 'past' | 'cancelled';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The card's date line (legacy describeDates). */
export function describeDates(b: Booking): string {
  if (b.hours) return `${b.start_date} · ${plural(b.hours, 'hour')}`;
  if (b.start_date && b.end_date) return `${b.start_date} → ${b.end_date}`;
  if (b.lease_start_date) return `From ${b.lease_start_date} · ${plural(b.lease_months as number, 'month')}`;
  return '';
}

/** The end-of-stay moment that sorts a booking into upcoming vs past. */
export function endMoment(b: Booking): Date {
  if (b.end_date) return new Date(b.end_date);
  if (b.start_date) return new Date(b.start_date);
  if (b.lease_start_date) {
    const d = new Date(b.lease_start_date);
    d.setMonth(d.getMonth() + (b.lease_months || 0));
    return d;
  }
  return new Date(b.created_at);
}

/** Whether the stay is over, so it can be reviewed (booking-approved.html). */
export function stayHasEnded(b: Booking, now: Date = new Date()): boolean {
  const day = b.end_date || b.start_date;
  return Boolean(day) && new Date(`${day}T23:59:59`) < now;
}

export const isCancelledStatus = (status: BookingStatus) => status === 'declined' || status === 'expired' || status === 'cancelled';

/**
 * The client tab a booking belongs to. Pending requests sit in Upcoming
 * (marked "Awaiting approval") instead of being hidden as they were before.
 */
export function clientTab(b: Booking, now: Date = new Date()): ClientTab | null {
  if (isCancelledStatus(b.status)) return 'cancelled';
  if (b.status === 'pending') return 'upcoming';
  if (b.status === 'approved') return endMoment(b) < now ? 'past' : 'upcoming';
  return null;
}

/** The status pill on a client card. */
export function statusLabel(status: BookingStatus): string {
  if (status === 'declined') return 'cancelled';
  if (status === 'pending') return 'Awaiting approval';
  return status;
}

export const formatAmount = (value: number | string | null | undefined) => Number(value || 0).toLocaleString();

/** " / unit" after the card price. */
export function perUnit(b: Booking): string {
  if (b.price_unit) return ` / ${b.price_unit}`;
  return b.hours ? ' / stay' : ' / night';
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName || 'there').split(' ')[0];
}

export function initial(name: string | null | undefined): string {
  return (name || '?').charAt(0).toUpperCase();
}

export function formatDetailDate(day: string | null): string {
  if (!day) return '';
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export interface DetailRow { label: string; value: string; icon: 'calendar' | 'clock' }

/** The "Booking Details" rows of an approved booking. */
export function detailRows(b: Booking): DetailRow[] {
  const row = (label: string, value: string): DetailRow => ({
    label, value, icon: label === 'Duration' || label === 'Lease length' ? 'clock' : 'calendar',
  });
  if (b.hours) return [row('Date', formatDetailDate(b.start_date)), row('Duration', plural(b.hours, 'hour'))];
  if (b.start_date && b.end_date) {
    const nights = Math.round((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000);
    return [
      row('Check-in', formatDetailDate(b.start_date)),
      row('Check-out', formatDetailDate(b.end_date)),
      row('Duration', plural(nights, 'night')),
    ];
  }
  if (b.lease_start_date) {
    return [row('Move-in date', formatDetailDate(b.lease_start_date)), row('Lease length', plural(b.lease_months as number, 'month'))];
  }
  return [];
}

/** Title and text shown instead of the detail for a booking that is not approved. */
export function statusMessage(status: BookingStatus): [string, string] {
  const messages: Record<string, [string, string]> = {
    pending: ['Still awaiting approval', 'Your host hasn’t responded to this booking request yet.'],
    declined: ['This request was declined', 'Your host wasn’t able to accept this booking request.'],
    cancelled: ['Booking cancelled', 'This booking request was cancelled.'],
    expired: ['This request expired', 'The booking window for this request has passed.'],
  };
  return messages[status] || [`Booking status: ${status}`, ''];
}

/** Bookings that can still be cancelled by the client. */
export const isCancellable = (b: Booking) => b.status === 'pending' || b.status === 'approved';

export interface BookingStats { total: number; upcoming: number; invested: number }

/** The rail's Stats Summary: approved bookings only, as before. */
export function computeStats(bookings: Booking[], now: Date = new Date()): BookingStats {
  const approved = bookings.filter((b) => b.status === 'approved');
  return {
    total: approved.length,
    upcoming: approved.filter((b) => endMoment(b) >= now).length,
    invested: approved.reduce((sum, b) => sum + Number(b.total_price || 0), 0),
  };
}

/** The rail calendar for the current month: leading blanks, then the days. */
export function calendarMonth(now: Date = new Date()): { label: string; leading: number; days: number; today: number } {
  return {
    label: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    leading: new Date(now.getFullYear(), now.getMonth(), 1).getDay(),
    days: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    today: now.getDate(),
  };
}
