import React from 'react';
import { dayLabel } from '../../lib/booking/bookingListing';
import { covers, eventOn, type CalendarBooking, type CalendarEvent, type CalendarListing } from '../../lib/calendar/hostCalendar';

// The listings timeline: one row per listing, the month's days across, so a
// host with several units, spaces or room types sees the whole business at
// once. The first column stays put while the days scroll sideways.

interface Props {
  listings: CalendarListing[]; days: string[]; today: string; selected: string;
  bookings: CalendarBooking[]; events: CalendarEvent[];
  closedAt: (listingId: string, day: string) => boolean;
  onPick: (day: string) => void;
}

export default function Timeline({ listings, days, today, selected, bookings, events, closedAt, onPick }: Props) {
  return (
    <div className="vc-timeline" role="grid" aria-label="Listings by day" style={{ ['--days' as string]: days.length } as React.CSSProperties}>
      <div className="vc-tl-row vc-tl-head" role="row">
        <span className="vc-tl-name" role="columnheader">Place</span>
        {days.map((day) => (
          <span key={day} role="columnheader" className={`vc-tl-day${day === today ? ' is-today' : ''}`}>{Number(day.slice(8))}</span>
        ))}
      </div>
      {listings.map((listing) => (
        <div key={listing.id} className="vc-tl-row" role="row">
          <span className="vc-tl-name" role="rowheader" title={listing.title}>{listing.title}</span>
          {days.map((day) => {
            const taking = bookings.filter((b) => b.listing_id === listing.id && covers(b, listing, day));
            const event = events.find((e) => e.listing_id === listing.id && eventOn(e, day));
            const closed = closedAt(listing.id, day);
            const state = closed ? 'closed' : taking.some((b) => b.status !== 'pending') ? 'booked' : taking.length ? 'request' : event?.blocks ? 'offline' : 'open';
            const what = [closed ? 'closed' : null, ...taking.map((b) => `${b.status === 'pending' ? 'request' : 'booked'}: ${b.guest || 'guest'}`), event ? event.title : null].filter(Boolean).join(', ') || 'open';
            return (
              <button key={day} type="button" role="gridcell"
                className={`vc-tl-cell is-${state}${event && !closed ? ` has-event is-ev is-${event.color || 'blue'}` : ''}${day < today ? ' is-past' : ''}${day === selected ? ' is-selected' : ''}`}
                aria-label={`${listing.title}, ${dayLabel(day, true)}: ${what}`} title={what} onClick={() => onPick(day)} />
            );
          })}
        </div>
      ))}
    </div>
  );
}
