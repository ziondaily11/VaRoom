// Links to Bookings. A host's own stays are under Hosting | My trips
// (?view=trips); clients have only their stays, so their links stay plain.

export type BookingsView = 'hosting' | 'trips';

export const bookingsView = (value: unknown): BookingsView => (value === 'trips' ? 'trips' : 'hosting');

/** Bookings, open on one of the signed-in person's own bookings when given. */
export function ownBookingHref(bookingId: string | null, host: boolean): string {
  const query = [host ? 'view=trips' : '', bookingId ? `booking=${encodeURIComponent(bookingId)}` : ''].filter(Boolean).join('&');
  return query ? `/bookings?${query}` : '/bookings';
}

/** Notifications a host gets as the guest of a booking (the others are about their listings). */
export const GUEST_BOOKING_NOTIFICATIONS = new Set(['booking_approved', 'booking_declined', 'booking_expired']);
