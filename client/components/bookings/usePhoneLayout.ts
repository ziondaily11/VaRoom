import { useEffect, useState } from 'react';

// Where a booking's details open. Phones (≤860px) open the booking details
// page; every larger screen opens them in the Bookings right rail. Matches the
// 860px breakpoint used by the shell and the Bookings styles.

export const PHONE_QUERY = '(max-width: 860px)';

/** True on phones, false on larger screens, null before the first client render. */
export function usePhoneLayout(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}

// The booking whose details page was opened from the Bookings list in this
// tab, so widening the window can go back to the list instead of adding a
// second list entry to the history.
let openedFromList: string | null = null;

export function markOpenedFromList(bookingId: string | null): void {
  openedFromList = bookingId;
}

export function wasOpenedFromList(bookingId: string): boolean {
  return openedFromList === bookingId;
}
