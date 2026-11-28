import React from 'react';
import { calendarMonth, dayLabel } from '../../lib/booking/bookingListing';
import { KIND_LABEL, SHOW_OPTIONS, type CalendarItem, type ShowKey } from '../../lib/calendar/calendarView';
import type { CalendarListing } from '../../lib/calendar/hostCalendar';

// The Calendar's left column: a mini month (a dot on busy days), "My places"
// (each in its colour, with a tick to show or hide it and ⚙ for its
// settings), "Show" (the kinds of entries), and "Coming up". Below 1280px it
// is a drawer opened from the header's Filters button.

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface Props {
  year: number;
  month: number;
  today: string;
  selectedDay: string | null;
  busyDays: ReadonlySet<string>;
  places: Array<{ listing: CalendarListing; color: string; shown: boolean }>;
  show: ReadonlySet<ShowKey>;
  coming: CalendarItem[];
  colorOf: (item: CalendarItem) => string;
  open: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPickDay: (day: string) => void;
  onTogglePlace: (id: string) => void;
  onSettings: (listing: CalendarListing) => void;
  onToggleShow: (key: ShowKey) => void;
  onPickItem: (item: CalendarItem) => void;
}

export default function CalendarSidebar(props: Props) {
  const { year, month, today, selectedDay, busyDays, places, show, coming, colorOf, open } = props;
  const grid = calendarMonth(year, month);
  return (
    <>
      {open && <button type="button" className="vc-scrim vc-only-narrow" aria-label="Close filters" onClick={props.onClose} />}
      <aside className={`vc-side${open ? ' is-open' : ''}`} aria-label="Calendar filters">
        <section className="vc-mini" aria-label={grid.title}>
          <div className="vc-mini-head">
            <strong>{grid.title}</strong>
            <span>
              <button type="button" aria-label="Previous month" onClick={props.onPrev}>‹</button>
              <button type="button" aria-label="Next month" onClick={props.onNext}>›</button>
            </span>
          </div>
          <div className="vc-mini-grid">
            {WEEKDAYS.map((d, i) => <span key={`${d}${i}`} className="vc-mini-dow" aria-hidden="true">{d}</span>)}
            {Array.from({ length: grid.leadingBlanks }, (_, i) => <span key={`b${i}`} aria-hidden="true" />)}
            {grid.days.map((day) => (
              <button key={day} type="button" onClick={() => props.onPickDay(day)} aria-label={dayLabel(day, true)}
                className={`vc-mini-day${day === today ? ' is-today' : ''}${day === selectedDay ? ' is-selected' : ''}${day < today ? ' is-past' : ''}`}>
                {Number(day.slice(8))}{busyDays.has(day) && <i aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>

        {places.length > 0 && (
          <section className="vc-side-block" aria-label="My places">
            <h3>My places</h3>
            <ul className="vc-checks">
              {places.map(({ listing, color, shown }) => (
                <li key={listing.id}>
                  <label>
                    <input type="checkbox" checked={shown} onChange={() => props.onTogglePlace(listing.id)} style={{ accentColor: color }} />
                    <i className="vc-swatch" style={{ background: color }} aria-hidden="true" />
                    <span title={listing.title}>{listing.title}</span>
                  </label>
                  {!listing.planner && (
                    <button type="button" className="vc-gear" aria-label={`Settings for ${listing.title}`} onClick={() => props.onSettings(listing)}>⚙</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="vc-side-block" aria-label="Show">
          <h3>Show</h3>
          <ul className="vc-checks">
            {SHOW_OPTIONS.map((option) => (
              <li key={option.key}>
                <label>
                  <input type="checkbox" checked={show.has(option.key)} onChange={() => props.onToggleShow(option.key)} />
                  <i className={`vc-kind-dot is-${option.key}`} aria-hidden="true" />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="vc-side-block" aria-label="Coming up">
          <h3>Coming up</h3>
          {coming.length ? (
            <ul className="vc-coming">
              {coming.map((item) => (
                <li key={item.key}>
                  <button type="button" onClick={() => props.onPickItem(item)} style={{ ['--place' as string]: colorOf(item) } as React.CSSProperties}>
                    <span className="vc-coming-day">{dayLabel(item.start)}{item.time ? ` · ${item.time}` : ''}</span>
                    <strong>{item.title}</strong>
                    <span className="vc-muted">{KIND_LABEL[item.kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="vc-muted">Nothing coming up this month.</p>}
        </section>
      </aside>
    </>
  );
}
