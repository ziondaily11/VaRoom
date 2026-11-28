import React, { useState } from 'react';
import { dayLabel } from '../../lib/booking/bookingListing';
import { KIND_LABEL, type CalendarItem } from '../../lib/calendar/calendarView';

// The header's search: guests, event titles, places, clients and notes in the
// months already opened (no new requests). Picking a result opens it.

interface Props {
  query: string;
  results: CalendarItem[];
  colorOf: (item: CalendarItem) => string;
  titleOf: (listingId: string | null) => string | undefined;
  onQuery: (query: string) => void;
  onPick: (item: CalendarItem) => void;
}

export default function CalendarSearch({ query, results, colorOf, titleOf, onQuery, onPick }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="vc-search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <input type="search" value={query} placeholder="Search guests, events, places" aria-label="Search the calendar"
        onFocus={() => setOpen(true)} onChange={(e) => { onQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { onQuery(''); setOpen(false); } }} />
      {open && query.trim().length >= 2 && (
        <ul className="vc-search-results" aria-label="Search results">
          {results.length ? results.map((item) => (
            <li key={item.key}>
              <button type="button" style={{ ['--place' as string]: colorOf(item) } as React.CSSProperties} onClick={() => { onPick(item); setOpen(false); }}>
                <span className="vc-coming-day">{dayLabel(item.start)}{item.end !== item.start ? ` → ${dayLabel(item.end)}` : ''}{item.time ? ` · ${item.time}` : ''}</span>
                <strong>{item.title}</strong>
                <span className="vc-muted">{[KIND_LABEL[item.kind], titleOf(item.listingId)].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          )) : <li className="vc-muted vc-search-none">Nothing found in the months you’ve opened.</li>}
        </ul>
      )}
    </div>
  );
}
