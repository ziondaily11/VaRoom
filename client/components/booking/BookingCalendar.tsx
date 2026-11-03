import React, { useState } from 'react';
import { calendarMonth, isOpenDay, shiftMonth, type CalendarDates } from '../../lib/booking/bookingListing';
import { ICON_NEXT, ICON_PREV } from '../../lib/booking/bookingIcons';
import Svg from './Svg';

// The month calendar of the booking widget (markup unchanged): open days can
// be tapped; `dayClass` adds the selection classes. Until the open dates
// load every day shows as closed.

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function BookingCalendar({ dates, dayClass, onPick }: {
  dates: CalendarDates | null;
  dayClass: (day: string) => string;
  onPick: (day: string) => void;
}) {
  const [view, setView] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const month = calendarMonth(view.year, view.month);
  return (
    <div id="cal-container">
      <div className="cal-header">
        <div className="cal-title">{month.title}</div>
        <div className="cal-nav">
          <button type="button" id="cal-prev" aria-label="Previous month" onClick={() => setView(shiftMonth(view.year, view.month, -1))}><Svg markup={ICON_PREV} /></button>
          <button type="button" id="cal-next" aria-label="Next month" onClick={() => setView(shiftMonth(view.year, view.month, 1))}><Svg markup={ICON_NEXT} /></button>
        </div>
      </div>
      <div className="cal-grid">
        {DAYS_OF_WEEK.map((day) => <div className="cal-dow" key={day}>{day}</div>)}
        {Array.from({ length: month.leadingBlanks }, (_, index) => <div className="cal-day empty" key={`blank-${index}`} />)}
        {month.days.map((day) => {
          const open = Boolean(dates && isOpenDay(dates, day));
          return (
            <div key={day} className={`cal-day ${open ? 'open' : 'closed'}${dayClass(day)}`} data-date={day} onClick={open ? () => onPick(day) : undefined}>
              {Number(day.slice(8))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
