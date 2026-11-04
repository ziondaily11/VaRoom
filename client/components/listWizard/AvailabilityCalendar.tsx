import React, { useState } from 'react';

// Step 4's availability calendar for short stays (unchanged from
// legacy-pages/list.html): tap a future day to open or close it.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtDate = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** The next 30 days from today, as list.html's "Open next 30 days". */
export function next30Days(): string[] {
  const today = new Date();
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return fmtDate(date.getFullYear(), date.getMonth(), date.getDate());
  });
}

export function AvailabilityCalendar({ hint, openDates, onChange }: { hint: string; openDates: string[]; onChange: (dates: string[]) => void }) {
  const [view, setView] = useState(() => { const now = new Date(); return { month: now.getMonth(), year: now.getFullYear() }; });
  const open = new Set(openDates);
  const firstDay = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const shift = (delta: number) => setView(({ month, year }) => {
    const next = month + delta;
    return next < 0 ? { month: 11, year: year - 1 } : next > 11 ? { month: 0, year: year + 1 } : { month: next, year };
  });
  const toggle = (date: string) => onChange(open.has(date) ? openDates.filter((item) => item !== date) : [...openDates, date]);

  return (
    <div className="field">
      <label>Availability</label>
      <p className="booking-hint" id="availability-hint">{hint}</p>
      <div className="cal-quick">
        <button type="button" id="cal-open-30" onClick={() => onChange(Array.from(new Set([...openDates, ...next30Days()])))}>Open next 30 days</button>
        <button type="button" id="cal-clear" onClick={() => onChange([])}>Clear all</button>
      </div>
      <div className="cal-header">
        <div className="cal-title" id="cal-title">{MONTHS[view.month]} {view.year}</div>
        <div className="cal-nav">
          <button type="button" id="cal-prev" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <button type="button" id="cal-next" aria-label="Next month" onClick={() => shift(1)}>›</button>
        </div>
      </div>
      <div className="cal-grid" id="cal-grid">
        {DAYS.map((day) => <div className="cal-dow" key={day}>{day}</div>)}
        {Array.from({ length: firstDay }, (_, index) => <div className="cal-day empty" key={`empty-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const date = fmtDate(view.year, view.month, day);
          const past = new Date(view.year, view.month, day) < today;
          return (
            <div
              key={date}
              className={`cal-day${past ? ' past' : ''}${open.has(date) ? ' selected' : ''}`}
              data-date={date}
              onClick={past ? undefined : () => toggle(date)}
            >{day}</div>
          );
        })}
      </div>
      <p className="cal-legend">🟩 Open for booking &nbsp;·&nbsp; tap to toggle</p>
    </div>
  );
}
