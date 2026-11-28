import React, { useMemo, useState } from 'react';
import { calendarMonth, dayLabel, isOpenDay, rangeIsOpen, shiftMonth, todayString, turnoverFree, type CalendarDates } from '../../lib/booking/bookingListing';
import { ICON_NEXT, ICON_PREV } from '../../lib/booking/bookingIcons';
import Svg from './Svg';

// The booking widget's month calendar. Every day is a button: open days can
// be picked; past, booked and closed days are disabled and say why to screen
// readers ("Fri 20 Nov 2026, booked"). The chosen stay shows as one band from
// check-in to check-out. The calendar never goes back before this month, nor
// past the host's booking window. Changing month slides the days in from the
// side they come from (animation.md C4); with reduced motion they just change.
// Until the open dates load, every day shows as closed. For nightly stays,
// once check-in is picked, a closed or booked day can still be the check-out
// when every night before it is open (another guest's check-in day).

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  dates: CalendarDates | null;
  /** Check-in (or the hourly date); null when nothing is picked. */
  start: string | null;
  /** Check-out; always null for hourly bookings. */
  end: string | null;
  /** The last day guests may book (host's booking window), or null. */
  lastDay: string | null;
  /** Nightly stays: a check-out day needn't be open itself. */
  nightly?: boolean;
  /** Days after check-out kept free for cleaning: they mustn't be someone else's. */
  turnover?: number;
  onPick: (day: string) => void;
}

const monthOf = (day: string) => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 });
const monthIndex = (view: { year: number; month: number }) => view.year * 12 + view.month;

export default function BookingCalendar({ dates, start, end, lastDay, nightly = false, turnover = 0, onPick }: Props) {
  const today = todayString();
  const first = monthOf(today);
  const last = lastDay ? monthOf(lastDay) : null;
  const [view, setView] = useState(first);
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const month = calendarMonth(view.year, view.month);
  const canGoBack = monthIndex(view) > monthIndex(first);
  const canGoForward = !last || monthIndex(view) < monthIndex(last);

  const go = (by: 1 | -1) => {
    setDirection(by === 1 ? 'next' : 'prev');
    setView(shiftMonth(view.year, view.month, by));
  };

  const states = useMemo(() => month.days.map((day) => {
    const open = Boolean(dates && isOpenDay(dates, day));
    const booked = Boolean(dates && dates.unavailable.has(day));
    const past = day < today;
    const isStart = day === start;
    const isEnd = day === end;
    const inRange = Boolean(start && end && day > start && day < end);
    const checkout = Boolean(nightly && dates && start && !end && !open && day > start && rangeIsOpen(dates, start, day) && turnoverFree(dates, day, turnover));
    return { day, open, booked, past, isStart, isEnd, inRange, checkout };
  }), [month.days, dates, today, start, end, nightly, turnover]);

  const why = (state: (typeof states)[number]) => (state.isStart ? (end ? 'check-in' : 'selected')
    : state.isEnd ? 'check-out'
      : state.open ? 'open'
        : state.checkout ? 'check-out only'
          : state.past ? 'past'
            : state.booked ? 'booked' : 'not available');

  return (
    <div className="cal" id="cal-container">
      <div className="cal-header">
        <div className="cal-title" aria-live="polite">{month.title}</div>
        <div className="cal-nav">
          <button type="button" id="cal-prev" aria-label="Previous month" disabled={!canGoBack} onClick={() => go(-1)}><Svg markup={ICON_PREV} /></button>
          <button type="button" id="cal-next" aria-label="Next month" disabled={!canGoForward} onClick={() => go(1)}><Svg markup={ICON_NEXT} /></button>
        </div>
      </div>
      <div className="cal-dows" aria-hidden="true">
        {DAYS_OF_WEEK.map((day) => <div className="cal-dow" key={day}>{day.slice(0, 2)}</div>)}
      </div>
      <div className={`cal-grid${direction ? ` slide-${direction}` : ''}`} key={`${view.year}-${view.month}`} role="group" aria-label={`${month.title}: choose a day`}>
        {Array.from({ length: month.leadingBlanks }, (_, index) => <span className="cal-day empty" key={`blank-${index}`} aria-hidden="true" />)}
        {states.map((state) => {
          const classes = ['cal-day', state.open ? 'open' : 'closed'];
          if (state.past) classes.push('past');
          if (state.booked && !state.past) classes.push('booked');
          if (state.isStart || state.isEnd) classes.push('range-end');
          if (state.isStart && end) classes.push('range-start');
          if (state.isEnd) classes.push('range-last');
          if (state.inRange) classes.push('in-range');
          if (state.checkout) classes.push('checkout');
          if (state.day === today) classes.push('today');
          return (
            <button
              key={state.day}
              type="button"
              className={classes.join(' ')}
              data-date={state.day}
              disabled={!state.open && !state.checkout}
              aria-pressed={state.isStart || state.isEnd || state.inRange ? true : undefined}
              aria-label={`${dayLabel(state.day, true)}, ${why(state)}`}
              onClick={() => onPick(state.day)}
            >
              <span>{Number(state.day.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
