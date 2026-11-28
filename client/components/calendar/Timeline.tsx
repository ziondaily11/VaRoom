import React from 'react';
import { dayLabel } from '../../lib/booking/bookingListing';
import { barBox, KIND_LABEL, layoutWeek, type CalendarItem } from '../../lib/calendar/calendarView';
import type { CalendarListing } from '../../lib/calendar/hostCalendar';

// The listings timeline: one row per place, the month's days across, so a
// host with several units, spaces or room types sees the whole business at
// once. Entries are bars in the place's colour, styled by kind, as in Month
// (a stay from the middle of its check-in day to the middle of its check-out
// day). Closed days are hatched. The names stay put while the days scroll.

const SHORT_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const LANES = 2;

interface Props {
  listings: CalendarListing[];
  days: string[];
  today: string;
  selectedDay: string | null;
  selectedKey: string | null;
  items: CalendarItem[];
  closedAt: (listingId: string, day: string) => boolean;
  placeColor: (listingId: string) => string;
  colorOf: (item: CalendarItem) => string;
  onPickDay: (day: string) => void;
  onPickItem: (item: CalendarItem) => void;
}

export default function Timeline({ listings, days, today, selectedDay, selectedKey, items, closedAt, placeColor, colorOf, onPickDay, onPickItem }: Props) {
  const n = days.length;
  return (
    <div className="vc-timeline" role="grid" aria-label="Places by day" style={{ ['--days' as string]: n } as React.CSSProperties}>
      <div className="vc-tl-row vc-tl-head" role="row">
        <span className="vc-tl-name" role="columnheader">Place</span>
        <div className="vc-tl-track">
          {days.map((day) => (
            <span key={day} role="columnheader" className={`vc-tl-day${day === today ? ' is-today' : ''}`}>
              <small>{SHORT_DAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}</small>{Number(day.slice(8))}
            </span>
          ))}
        </div>
      </div>
      {listings.map((listing) => {
        const { segments, hidden } = layoutWeek(days, items.filter((item) => item.listingId === listing.id), LANES);
        const lanes = Math.max(1, Math.min(LANES, segments.reduce((max, s) => Math.max(max, s.lane + 1), 0)));
        return (
          <div key={listing.id} className="vc-tl-row" role="row">
            <span className="vc-tl-name" role="rowheader" title={listing.title}>
              <i className="vc-swatch" style={{ background: placeColor(listing.id) }} aria-hidden="true" />{listing.title}
            </span>
            <div className="vc-tl-track" style={{ height: `calc(${lanes} * var(--bar-step) + 12px)` }}>
              {days.map((day, col) => {
                const closed = day >= today && closedAt(listing.id, day);
                return (
                  <button key={day} type="button" role="gridcell" onClick={() => onPickDay(day)}
                    className={`vc-tl-cell${closed ? ' is-closed' : ''}${day < today ? ' is-past' : ''}${day === today ? ' is-today' : ''}${day === selectedDay ? ' is-selected' : ''}`}
                    style={{ left: `${(col / n) * 100}%`, width: `${100 / n}%` }} aria-label={`${listing.title}, ${dayLabel(day, true)}${closed ? ', closed' : ''}`}>
                    {hidden[col] > 0 && <span className="vc-more">+{hidden[col]}</span>}
                  </button>
                );
              })}
              {segments.map((segment) => {
                const box = barBox(segment, n);
                return (
                  <button key={segment.item.key} type="button"
                    className={`vc-bar is-${segment.item.kind}${segment.cutLeft ? ' is-cut-left' : ''}${segment.cutRight ? ' is-cut-right' : ''}${segment.item.key === selectedKey ? ' is-selected' : ''}`}
                    style={{ left: box.left, width: box.width, top: `calc(6px + ${segment.lane} * var(--bar-step))`, ['--place' as string]: colorOf(segment.item) } as React.CSSProperties}
                    title={`${KIND_LABEL[segment.item.kind]}: ${segment.item.title}`} onClick={() => onPickItem(segment.item)}>
                    <span className="vc-bar-title">{segment.item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
