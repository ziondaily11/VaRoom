import React from 'react';
import { WEEK, type BusinessHours, type DayHours } from '../../lib/chat/businessHours';

// Chat Settings → Business hours: each day open (with its hours) or closed,
// Monday first, Nairobi time.

const DEFAULT_DAY: DayHours = { open: '08:00', close: '20:00' };

export default function BusinessHoursEditor({ value, onChange }: { value: BusinessHours; onChange: (next: BusinessHours) => void }) {
  const setDay = (index: number, hours: DayHours | null) => onChange({ ...value, days: value.days.map((day, i) => (i === index ? hours : day)) });
  return (
    <div className="cs-hours">
      {WEEK.map(([label, index]) => {
        const day = value.days[index];
        return (
          <div key={label} className="cs-hours-day">
            <label className="cs-hours-open">
              <input type="checkbox" checked={Boolean(day)} onChange={(event) => setDay(index, event.target.checked ? DEFAULT_DAY : null)} />
              {label}
            </label>
            {day ? (
              <span className="cs-hours-times">
                <input type="time" step={900} aria-label={`${label} opens`} value={day.open} onChange={(event) => { if (event.target.value) setDay(index, { ...day, open: event.target.value }); }} />
                <span aria-hidden="true">–</span>
                <input type="time" step={900} aria-label={`${label} closes`} value={day.close} onChange={(event) => { if (event.target.value) setDay(index, { ...day, close: event.target.value }); }} />
              </span>
            ) : <span className="cs-hours-closed">Closed · away all day</span>}
          </div>
        );
      })}
      <p className="cs-row__desc">Nairobi time. Hours can run past midnight (e.g. 18:00–02:00).</p>
    </div>
  );
}
