import React from 'react';

// Icons used across the Bookings views, unchanged from legacy-pages/bookings.html.

const stroke = (width: number, children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const CalendarIcon = () => stroke(2, <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>);
export const ClockIcon = () => stroke(2, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>);
export const CashIcon = () => stroke(2, <><circle cx="12" cy="12" r="9" /><path d="M9.5 15.5c.5.7 1.3 1 2.5 1s2.3-.6 2.3-1.6c0-2.3-4.8-1-4.8-3.3 0-1 1.1-1.6 2.3-1.6s2 .3 2.5 1M12 7.5v9" /></>);
export const ShieldIcon = () => stroke(2, <path d="M12 3 4.5 6v6c0 5 3.2 8.7 7.5 9 4.3-.3 7.5-4 7.5-9V6L12 3Z" />);
export const CheckIcon = () => stroke(2.5, <path d="m20 6-11 11-5-5" />);
export const BackIcon = () => stroke(2, <><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></>);
export const MessageIcon = () => stroke(1.8, <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-3.7-.8L4 20l1.5-4.1A7.4 7.4 0 0 1 4.5 12 7.5 7.5 0 0 1 12 4.5h.5A7.5 7.5 0 0 1 20 11.5Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>);

/** Small inline icons in card meta lines (legacy <i class="booking-icon">). */
export function CardIcon({ name }: { name: 'location' | 'calendar' }) {
  return (
    <i className="booking-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {name === 'location'
          ? <><path d="M20 10.5c0 5.2-8 10.5-8 10.5S4 15.7 4 10.5a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10.5" r="2.5" /></>
          : <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>}
      </svg>
    </i>
  );
}
