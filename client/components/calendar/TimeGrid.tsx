import React, { useEffect, useRef, useState } from 'react';
import { dayLabel, plural } from '../../lib/booking/bookingListing';
import {
  barBox, gridHours, KIND_LABEL, layoutTimes, layoutWeek, splitTimed, itemsOn,
  type CalendarItem,
} from '../../lib/calendar/calendarView';
import type { CalendarListing } from '../../lib/calendar/hostCalendar';
import type { DayInfo } from './MonthView';
import { eventLabel } from '../../lib/booking/eventTypes';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveAvatarUrl } from '../resolveStoredPhotoUrl';

// The Week and Day views: hours down the side, days across (one day for Day).
// Week puts stays, day hires and untimed entries in an all-day row of bars
// above the grid; Day lists them as cards. Timed entries (hourly bookings,
// viewings, timed events, tables) sit at their hours, side by side where they
// overlap. Today's column is tinted and the current time is a line with a pill.
// A venue hired for a day is a card over its hire hours. Cards show a tag (the
// event, else the kind), the booker, a description and who; CSS container
// queries drop parts that don't fit the card's size.

const HOUR_PX = 52;
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Minutes past midnight now, refreshed each minute while the grid shows today. */
function useNow(active: boolean): number {
  const read = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const [now, setNow] = useState(read);
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(read()), 60000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

interface Props {
  days: string[];
  items: CalendarItem[];
  info: ReadonlyMap<string, DayInfo>;
  today: string;
  selectedDay: string | null;
  selectedKey: string | null;
  loading: boolean;
  colorOf: (item: CalendarItem) => string;
  listingOf: (id: string | null) => CalendarListing | undefined;
  onPickDay: (day: string) => void;
  onPickItem: (item: CalendarItem) => void;
  onOpenDay?: (day: string) => void;
  /** An empty hour was clicked: add there (the half hour under the pointer; 09:00 from the keyboard). */
  onAddAt?: (day: string, time: string, anchor: { x: number; y: number } | null) => void;
}

/** What an all-day entry is on this day: a stay's check-in, check-out or a night in between. */
function stayLabel(item: CalendarItem, day: string): string {
  if (item.kind !== 'booking' && item.kind !== 'request') return KIND_LABEL[item.kind];
  if (item.halfStart && item.start === day) return item.kind === 'request' ? 'Request · check-in' : 'Check-in';
  if (item.halfEnd && item.end === day) return 'Check-out';
  return item.halfStart ? 'Staying' : KIND_LABEL[item.kind];
}

/**
 * A card's parts (the reference's cards): a tag (the event, else the kind),
 * the title (the host's own, else the booker when the tag is the event), a
 * description (the host's notes, else the guest's) and who: the name first,
 * then guests and the place.
 */
function cardOf(item: CalendarItem, listing: CalendarListing | undefined) {
  const { source } = item;
  const event = source.type === 'booking' ? eventLabel(source.value.event_type) : null;
  const name = source.type === 'booking' ? source.value.guest : source.type === 'event' || source.type === 'table' ? source.value.client_name : null;
  const guests = source.type === 'booking' || source.type === 'event' || source.type === 'table' ? source.value.guest_count : null;
  return {
    tag: event || KIND_LABEL[item.kind],
    title: source.type === 'booking' ? source.value.host_title || (event ? source.value.guest || 'Guest' : item.title) : item.title,
    text: source.type === 'booking' ? source.value.host_notes || source.value.event_notes
      : source.type === 'event' ? source.value.notes : source.type === 'table' ? source.value.occasion : null,
    who: [name, guests ? plural(guests, 'guest') : null, listing?.title].filter(Boolean).join(' · '),
    name,
    avatar: source.type === 'booking' ? source.value.avatar : null,
  };
}

/** The booker's photo, or their initial. */
function Face({ name, src }: { name: string | null | undefined; src: string | null | undefined }) {
  const url = src ? resolveAvatarUrl(src, getSupabaseClient()) : null;
  return url ? <img className="vc-face" src={url} alt="" /> : <i className="vc-face" aria-hidden="true">{(name || '?').trim().charAt(0).toUpperCase()}</i>;
}

function Grid({ days, items, today, selectedKey, colorOf, listingOf, onPickDay, onPickItem, onAddAt, rich }: Props & { rich: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const { timed } = splitTimed(items);
  const hours = gridHours(timed.filter((i) => days.includes(i.start)));
  const showsToday = days.includes(today);
  const now = useNow(showsToday);
  const top = (m: number) => ((m - hours.start * 60) / 60) * HOUR_PX;

  // Open at 07:00, or at the first entry if it's earlier (no scroll listeners).
  useEffect(() => {
    const first = Math.min(7 * 60, ...timed.filter((i) => days.includes(i.start)).map((i) => layoutTimes([i])[0]?.from ?? 1440));
    if (scroller.current) scroller.current.scrollTop = Math.max(0, top(first) - 8);
    // Once per set of days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  return (
    <div className="vc-tg-scroll" ref={scroller}>
      <div className="vc-tg-body" style={{ height: (hours.end - hours.start) * HOUR_PX, gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="vc-tg-gutter" aria-hidden="true">
          {Array.from({ length: hours.end - hours.start }, (_, i) => <span key={i} style={{ top: i * HOUR_PX }}>{clock((hours.start + i) * 60)}</span>)}
        </div>
        {days.map((day) => (
          <div key={day} className={`vc-tg-col${day === today ? ' is-today' : ''}${day < today ? ' is-past' : ''}`} style={{ ['--hour' as string]: `${HOUR_PX}px` } as React.CSSProperties}>
            <button type="button" className="vc-tg-slot" aria-label={onAddAt ? `Add to ${dayLabel(day, true)}` : dayLabel(day, true)}
              onClick={(e) => {
                if (!onAddAt) { onPickDay(day); return; }
                if (!e.detail) { onAddAt(day, '09:00', null); return; }
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                onAddAt(day, clock(Math.min(23 * 60 + 30, hours.start * 60 + Math.floor(y / (HOUR_PX / 2)) * 30)), { x: e.clientX, y: e.clientY });
              }} />
            {layoutTimes(timed.filter((i) => i.start === day)).map((p) => { const card = cardOf(p.item, listingOf(p.item.listingId)); return (
              <button key={p.item.key} type="button"
                className={`vc-block is-${p.item.kind}${rich ? ' is-rich' : ''}${p.item.key === selectedKey ? ' is-selected' : ''}`}
                style={{ top: top(p.from), height: Math.max(24, ((p.to - p.from) / 60) * HOUR_PX - 3), left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)`, ['--place' as string]: colorOf(p.item) } as React.CSSProperties}
                title={`${KIND_LABEL[p.item.kind]}: ${p.item.title} · ${clock(p.from)}–${clock(p.to)}`}
                onClick={() => onPickItem(p.item)}>
                <span className="vc-block-tag">{card.tag}</span>
                <strong>{card.title}</strong>
                <span className="vc-block-time">{clock(p.from)}–{clock(p.to)}</span>
                {card.text && <span className="vc-block-desc">{card.text}</span>}
                {card.who && <span className="vc-block-foot">{card.name && <Face name={card.name} src={card.avatar} />}<span>{card.who}</span></span>}
              </button>
            ); })}
            {day === today && now >= hours.start * 60 && (
              <div className="vc-now" style={{ top: top(now) }} aria-label={`Now, ${clock(now)}`}><span>{clock(now)}</span></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeekView(props: Props) {
  const { days, items, info, today, selectedDay, selectedKey, colorOf, onPickDay, onPickItem, onOpenDay } = props;
  const { allDay } = splitTimed(items);
  const { segments, hidden } = layoutWeek(days, allDay, 3);
  const lanes = Math.max(1, Math.min(3, segments.reduce((max, s) => Math.max(max, s.lane + 1), 0)));
  return (
    <div className="vc-tg" aria-busy={props.loading}>
      <div className="vc-tg-head" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
        <span />
        {days.map((day) => (
          <button key={day} type="button" className={`vc-tg-day${day === today ? ' is-today' : ''}${day === selectedDay ? ' is-selected' : ''}`}
            onClick={() => (onOpenDay ? onOpenDay(day) : onPickDay(day))} aria-label={`${dayLabel(day, true)}: open the day`}>
            <span>{SHORT_DAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}</span><strong>{Number(day.slice(8))}</strong>
          </button>
        ))}
      </div>
      <div className="vc-tg-allday" style={{ gridTemplateColumns: '52px minmax(0, 1fr)' }}>
        <span className="vc-tg-label">All day</span>
        <div className="vc-tg-lanes" style={{ height: `calc(${lanes} * var(--bar-step) + 8px)` }}>
          {days.map((day, col) => {
            const state = info.get(day);
            return (
              <button key={day} type="button" aria-label={`${dayLabel(day, true)}${state?.allClosed ? ', closed' : ''}`} onClick={() => onPickDay(day)}
                className={`vc-tg-allcell${state?.allClosed && day >= today ? ' is-closed' : ''}${state?.cleaning && day >= today ? ' is-cleaning' : ''}${state?.clash && day >= today ? ' is-clash' : ''}`}
                style={{ left: `${(col / 7) * 100}%`, width: `${100 / 7}%` }}>
                {hidden[col] > 0 && <span className="vc-more">+{hidden[col]}</span>}
              </button>
            );
          })}
          {segments.map((segment) => {
            const box = barBox(segment);
            return (
              <button key={segment.item.key} type="button"
                className={`vc-bar is-${segment.item.kind}${segment.cutLeft ? ' is-cut-left' : ''}${segment.cutRight ? ' is-cut-right' : ''}${segment.item.key === selectedKey ? ' is-selected' : ''}`}
                style={{ left: box.left, width: box.width, top: `calc(4px + ${segment.lane} * var(--bar-step))`, ['--place' as string]: colorOf(segment.item) } as React.CSSProperties}
                title={`${KIND_LABEL[segment.item.kind]}: ${segment.item.title}`} onClick={() => onPickItem(segment.item)}>
                <span className="vc-bar-title">{segment.item.title}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Grid {...props} rich={false} />
    </div>
  );
}

export function DayView(props: Props) {
  const { days, items, colorOf, listingOf, onPickItem, selectedKey } = props;
  const day = days[0];
  const onDay = itemsOn(items, day);
  const { allDay } = splitTimed(onDay);
  const state = props.info.get(day);
  return (
    <div className="vc-tg is-day" aria-busy={props.loading}>
      {(state?.allClosed || state?.clash || state?.cleaning || state?.price != null || state?.roomsLeft != null) && (
        <p className="vc-day-flags">
          {state?.clash && <span className="is-clash">Double booked</span>}
          {state?.allClosed && <span>Closed</span>}
          {state?.cleaning && <span>Cleaning</span>}
          {state?.roomsLeft != null && <span>{state.roomsLeft} rooms left</span>}
          {state?.price != null && <span>Special price</span>}
        </p>
      )}
      {allDay.length > 0 && (
        <ul className="vc-day-cards">
          {allDay.map((item) => { const card = cardOf(item, listingOf(item.listingId)); return (
            <li key={item.key}>
              <button type="button" className={`vc-day-card is-${item.kind}${item.key === selectedKey ? ' is-selected' : ''}`}
                style={{ ['--place' as string]: colorOf(item) } as React.CSSProperties} onClick={() => onPickItem(item)}>
                <span className="vc-block-kind">{stayLabel(item, day)}</span>
                <strong>{card.title}</strong>
                <span className="vc-muted">{item.start === item.end ? 'All day' : `${dayLabel(item.start)} → ${dayLabel(item.end)}`}</span>
                {card.who && <span className="vc-block-foot">{card.name && <Face name={card.name} src={card.avatar} />}<span>{card.who}</span></span>}
              </button>
            </li>
          ); })}
        </ul>
      )}
      <Grid {...props} rich />
      {!onDay.length && <p className="vc-muted vc-day-empty">Nothing on this day yet.</p>}
    </div>
  );
}
