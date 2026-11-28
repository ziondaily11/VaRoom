import React from 'react';
import { dayLabel, ksh } from '../../lib/booking/bookingListing';
import { barBox, itemsOn, KIND_LABEL, layoutWeek, type CalendarItem } from '../../lib/calendar/calendarView';

// The month: one row per week. A day cell carries its state (closed, cleaning,
// double booked, rooms left, a special price) and opens the day; entries are
// bars laid over the row, a stay running from the middle of its check-in day
// to the middle of its check-out day. Bars past three lanes show as "+N".
// Phones show up to three dots per day instead of bars.

export interface DayInfo {
  allClosed: boolean;
  someClosed: number;
  cleaning: boolean;
  clash: boolean;
  roomsLeft: number | null;
  price: number | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LANES = 3;

interface Props {
  weeks: Array<Array<string | null>>;
  items: CalendarItem[];
  info: ReadonlyMap<string, DayInfo>;
  today: string;
  selectedDay: string | null;
  selectedKey: string | null;
  inRange: (day: string) => boolean;
  selecting: boolean;
  loading: boolean;
  colorOf: (item: CalendarItem) => string;
  onPickDay: (day: string) => void;
  onPickItem: (item: CalendarItem) => void;
}

export default function MonthView({ weeks, items, info, today, selectedDay, selectedKey, inRange, selecting, loading, colorOf, onPickDay, onPickItem }: Props) {
  return (
    <div className={`vc-month-grid${selecting ? ' is-selecting' : ''}`} role="grid" aria-busy={loading}>
      <div className="vc-week vc-week-head" role="row">
        {WEEKDAYS.map((d) => <span key={d} role="columnheader" className="vc-dow">{d}</span>)}
      </div>
      {weeks.map((week, w) => {
        const { segments, hidden } = layoutWeek(week, items, LANES);
        return (
          <div key={week.find(Boolean) || w} className="vc-week" role="row">
            {week.map((day, col) => {
              if (!day) return <span key={`blank${col}`} className="vc-cell is-blank" aria-hidden="true" />;
              const state = info.get(day);
              const classes = ['vc-cell'];
              if (loading) classes.push('is-loading');
              if (day < today) classes.push('is-past');
              if (day === today) classes.push('is-today');
              if (state?.allClosed && day >= today) classes.push('is-closed');
              if (state?.cleaning && day >= today) classes.push('is-cleaning');
              if (state?.clash && day >= today) classes.push('is-clash');
              if (day === selectedDay && !selecting) classes.push('is-selected');
              if (inRange(day)) classes.push('is-in-range');
              return (
                <button key={day} type="button" role="gridcell" className={classes.join(' ')} disabled={loading || (selecting && day < today)}
                  aria-label={`${dayLabel(day, true)}${state?.allClosed ? ', closed' : ''}${state?.clash ? ', double booked' : ''}`}
                  onClick={() => onPickDay(day)}>
                  <span className="vc-cell-top">
                    <span className="vc-num">{Number(day.slice(8))}</span>
                    {state?.price != null && day >= today && <span className="vc-cell-price">{ksh(state.price)}</span>}
                  </span>
                  <span className="vc-cell-tags">
                    {state?.clash && day >= today && <span className="is-clash">Double booked</span>}
                    {state?.allClosed && day >= today && <span>Closed</span>}
                    {!state?.allClosed && Boolean(state?.someClosed) && day >= today && <span>{state?.someClosed} closed</span>}
                    {state?.cleaning && day >= today && <span>Cleaning</span>}
                    {state?.roomsLeft != null && <span>{state.roomsLeft} left</span>}
                  </span>
                  {hidden[col] > 0 && <span className="vc-more">+{hidden[col]} more</span>}
                  <span className="vc-cell-dots" aria-hidden="true">
                    {itemsOn(items, day).slice(0, 3).map((item) => <i key={item.key} style={{ background: colorOf(item) }} />)}
                  </span>
                </button>
              );
            })}
            {segments.map((segment) => {
              const { item } = segment;
              const box = barBox(segment);
              return (
                <button key={`${item.key}:${w}`} type="button"
                  className={`vc-bar is-${item.kind}${segment.cutLeft ? ' is-cut-left' : ''}${segment.cutRight ? ' is-cut-right' : ''}${item.key === selectedKey ? ' is-selected' : ''}`}
                  style={{ left: box.left, width: box.width, top: `calc(var(--bar-top) + ${segment.lane} * var(--bar-step))`, ['--place' as string]: colorOf(item) } as React.CSSProperties}
                  title={`${KIND_LABEL[item.kind]}: ${item.title}${item.time ? ` · ${item.time}` : ''}`}
                  onClick={() => onPickItem(item)}>
                  {item.time && <span className="vc-bar-time">{item.time.split('–')[0]}</span>}
                  <span className="vc-bar-title">{item.title}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
