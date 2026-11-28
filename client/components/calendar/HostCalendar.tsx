import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calendarMonth, dayLabel, ksh, nightsBetween, plural, shiftMonth, todayString } from '../../lib/booking/bookingListing';
import {
  cachedMonth, calendarErrorText, clearCalendarCache, closedWeekly, covers, daysBetweenInclusive, eventOn, isClosed, listingOff, loadMonth, monthRange,
  minutesOf, monthSummary, plannerSummary, setClosed, setHours, setWeekdays, weekday,
  type CalendarBooking, type CalendarEvent, type CalendarListing, type EventColor, type HostCalendarData,
} from '../../lib/calendar/hostCalendar';
import { respondToBooking } from '../../lib/bookings/hostBookings';
import { clearHostBookings } from '../../lib/bookings/bookingsCache';
import { useToast } from '../bookings/useBookingActions';
import ListingPicker from '../analytics/ListingPicker';
import { CALENDAR_CSS } from './calendarStyles';
import EventForm from './EventForm';
import Timeline from './Timeline';
import SyncPanel from './SyncPanel';

// The host's Calendar: a month of every stay, venue and hotel listing (or one,
// ?listing=), with what each day holds. A day opens its panel (the right rail
// on wide screens, a sheet on smaller ones) to approve requests and to close or
// reopen the day. "Select days" closes or reopens a range at once. Closing is
// shown at once and confirmed by the server; a refusal puts it back. The host's
// own events (booked offline, viewings, notes) show in colour; Timeline shows
// one row per listing. Property, office and shop listings are planned, not
// booked by the night: they show move-ins, lease ends, outcomes and viewings,
// without the closing and booking controls.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OUTCOME_WORD = { sold: 'Sold', rented: 'Rented', leased: 'Leased' } as const;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const firstName = (name: string | null) => (name || 'Guest').trim().split(/\s+/)[0];
const timeText = (event: CalendarEvent) => (event.start_time ? `${event.start_time}–${event.end_time} ` : '');

interface Props { client: SupabaseClient; hostId: string; listingId: string | null; onListingChange: (id: string | null) => void }

export default function HostCalendar({ client, hostId, listingId, onListingChange }: Props) {
  const toast = useToast();
  const today = todayString();
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [data, setData] = useState<HostCalendarData | null>(() => cachedMonth(hostId, view.year, view.month)?.data || null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(today);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [range, setRange] = useState<{ start: string | null; end: string | null } | null>(null);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<'month' | 'timeline'>('month');
  const [form, setForm] = useState<{ event: CalendarEvent | null; preset?: { title: string; listingId: string; color: EventColor } } | null>(null);

  const refresh = useCallback((force: boolean) => {
    const { year, month } = view;
    return loadMonth(client, hostId, year, month, force).then((next) => { setData(next); setFailed(false); });
  }, [client, hostId, view]);

  useEffect(() => {
    let active = true;
    setData(cachedMonth(hostId, view.year, view.month)?.data || null);
    loadMonth(client, hostId, view.year, view.month).then((next) => {
      if (!active) return;
      setData(next);
      setFailed(false);
      const after = shiftMonth(view.year, view.month, 1);
      void loadMonth(client, hostId, after.year, after.month).catch(() => undefined);
    }, (error: unknown) => {
      console.error('Calendar: the month could not be loaded:', error);
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [client, hostId, view]);

  const month = calendarMonth(view.year, view.month);
  const all = useMemo(() => data?.listings || [], [data]);
  const listings = useMemo(() => {
    const one = listingId ? all.filter((l) => l.id === listingId) : [];
    return one.length ? one : all;
  }, [all, listingId]);
  const byId = useMemo(() => new Map(all.map((l) => [l.id, l])), [all]);
  const closedAt = useCallback((id: string, day: string) => {
    const override = overrides.get(`${id}|${day}`);
    return override ?? Boolean(data && (isClosed(data.closed, id, day) || closedWeekly(byId.get(id), day)));
  }, [data, overrides, byId]);
  const bookings = useMemo(() => {
    const ids = new Set(listings.map((l) => l.id));
    return (data?.bookings || []).filter((b) => ids.has(b.listing_id));
  }, [data, listings]);
  // Events on the shown listings, and those not tied to any.
  const events = useMemo(() => {
    const ids = new Set(listings.map((l) => l.id));
    return (data?.events || []).filter((e) => !e.listing_id || ids.has(e.listing_id));
  }, [data, listings]);
  // Hotel restaurants' table reservations (a dining-only listing isn't in the list, so only the filter narrows them).
  const tables = useMemo(() => (data?.tables || []).filter((t) => !listingId || t.listing_id === listingId), [data, listingId]);
  const single = listings.length === 1 ? listings[0] : null;
  const stays = useMemo(() => listings.filter((l) => !l.planner), [listings]);
  const stay = single && !single.planner ? single : null;
  const plannerOnly = listings.length > 0 && stays.length === 0;
  const shownIds = useMemo(() => new Set(listings.map((l) => l.id)), [listings]);
  const leases = useMemo(() => (data?.leases || []).filter((l) => shownIds.has(l.listing_id)), [data, shownIds]);
  const outcomes = useMemo(() => (data?.outcomes || []).filter((o) => shownIds.has(o.listing_id)), [data, shownIds]);
  const summary = useMemo(() => (data && stays.length ? monthSummary(data, stays, month.days, closedAt) : null), [data, stays, month.days, closedAt]);
  const planned = useMemo(() => (data && plannerOnly ? plannerSummary(data, shownIds, month.days[0], month.days[month.days.length - 1]) : null),
    [data, plannerOnly, shownIds, month.days]);

  const cells = useMemo(() => month.days.map((day) => {
    const taking = bookings.filter((b) => covers(b, byId.get(b.listing_id), day));
    const dayEvents = events.filter((e) => eventOn(e, day));
    const dayTables = tables.filter((t) => t.date === day);
    const offline = dayEvents.filter((e) => e.blocks);
    const dayLeases = leases.filter((l) => l.start === day || (l.status !== 'pending' && l.end === day));
    const dayOutcomes = outcomes.filter((o) => o.date === day);
    const closedCount = stays.filter((l) => closedAt(l.id, day)).length;
    const allClosed = stays.length > 0 && closedCount === stays.length;
    const state = day < today ? 'past' : allClosed ? 'closed'
      : taking.some((b) => b.status !== 'pending') || offline.length ? 'booked' : taking.length ? 'requested' : 'open';
    const roomsLeft = stay && stay.category === 'hotel' && stay.units
      ? Math.max(0, stay.units - taking.length - offline.reduce((sum, e) => sum + (e.units || 1), 0)) : null;
    const clash = stays.some((l) => {
      const used = taking.filter((b) => b.listing_id === l.id && b.end_date).length
        + offline.filter((e) => e.listing_id === l.id && !(l.price_unit === 'hour' && e.start_time)).reduce((sum, e) => sum + (e.units || 1), 0);
      return used > (l.category === 'hotel' ? Math.max(1, l.units || 1) : 1);
    });
    return { day, taking, dayEvents, dayTables, dayLeases, dayOutcomes, closedCount, allClosed, state, roomsLeft, clash };
  }), [month.days, bookings, events, tables, leases, outcomes, byId, stays, closedAt, today, stay]);

  // ---------- Actions ----------

  const apply = async (targets: CalendarListing[], from: string, to: string | null, closed: boolean) => {
    const last = to || monthRange(view.year, view.month).to;
    const next = new Map(overrides);
    targets.forEach((l) => daysBetweenInclusive(from < today ? today : from, last).forEach((day) => next.set(`${l.id}|${day}`, closed)));
    setOverrides(next);
    setBusy('closing');
    try {
      await Promise.all(targets.map((l) => setClosed(client, l.id, from < today ? today : from, to, closed)));
      clearCalendarCache(hostId);
      await refresh(true);
      toast.show(closed ? 'Closed. Guests can’t book those days.' : 'Reopened. Guests can book those days again.');
    } catch (error) {
      console.error('Calendar: closing failed:', error);
      toast.show(calendarErrorText(error, 'That didn’t save. Please try again.'));
    } finally {
      setOverrides(new Map());
      setBusy(null);
    }
  };

  const respond = async (booking: CalendarBooking, decision: 'approve' | 'decline') => {
    setBusy(booking.id);
    try {
      await respondToBooking(client, { booking, userId: hostId, decision });
      clearCalendarCache(hostId);
      clearHostBookings();
      await refresh(true);
      toast.show(decision === 'approve' ? 'Booking approved!' : 'Booking declined.');
    } catch (error) {
      console.error(`Calendar: failed to ${decision} booking:`, error);
      toast.show(calendarErrorText(error, decision === 'approve' ? 'Failed to approve booking. Please try again.' : 'Failed to decline booking. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const saved = async (message: string) => {
    setForm(null);
    clearCalendarCache(hostId);
    toast.show(message);
    await refresh(true).catch(() => undefined);
  };

  const toggleWeekday = async (listing: CalendarListing, dow: number) => {
    const current = listing.closed_weekdays || [];
    setBusy('weekdays');
    try {
      await setWeekdays(client, listing.id, current.includes(dow) ? current.filter((d) => d !== dow) : [...current, dow]);
      clearCalendarCache(hostId);
      await refresh(true);
    } catch (error) {
      console.error('Calendar: weekly closed days failed:', error);
      toast.show(calendarErrorText(error, 'That didn’t save. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const saveHours = async (listing: CalendarListing, start: string | null, end: string | null, buffer: number) => {
    setBusy('hours');
    try {
      await setHours(client, listing.id, start, end, buffer);
      clearCalendarCache(hostId);
      await refresh(true);
      toast.show('Hire hours saved.');
    } catch (error) {
      console.error('Calendar: hire hours failed:', error);
      toast.show(calendarErrorText(error, 'That didn’t save. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const pick = (day: string) => {
    if (range) {
      if (day < today) return;
      setRange(!range.start || range.end ? { start: day, end: null } : { start: day < range.start ? day : range.start, end: day < range.start ? range.start : day });
      return;
    }
    setSelected(day);
    setSheetOpen(true);
  };
  const go = (by: 1 | -1) => { setView(shiftMonth(view.year, view.month, by)); setRange((r) => (r ? { start: null, end: null } : r)); };
  const rangeDays = range?.start ? daysBetweenInclusive(range.start, range.end || range.start) : [];

  // ---------- What needs the host's attention ----------

  const notices = stays.flatMap((l) => {
    const off = listingOff(l);
    const onwards = (data?.closed || []).find((c) => c.listing_id === l.id && !c.end_date);
    return [
      off ? { key: `${l.id}-off`, text: `${l.title} ${off}, so guests can’t book it.`, action: <Link href="/host-home?view=my-listings">Manage listing</Link> } : null,
      onwards ? {
        key: `${l.id}-closed`, text: `${l.title} is closed from ${dayLabel(onwards.start_date < today ? today : onwards.start_date, true)} onwards.`,
        action: <button type="button" disabled={Boolean(busy)} onClick={() => { void apply([l], onwards.start_date, null, false); }}>Open it</button>,
      } : null,
    ].filter(Boolean) as Array<{ key: string; text: string; action: React.ReactNode }>;
  });

  const agendaFrom = month.days[0] > today ? month.days[0] : today;
  const inAgenda = (day: string) => day >= agendaFrom && month.days.includes(day);
  const agenda = [
    ...bookings.flatMap((b) => {
      const listing = byId.get(b.listing_id);
      const place = listings.length > 1 ? ` · ${listing?.title || ''}` : '';
      const rows = [] as Array<{ key: string; day: string; kind: string; tone: string; who: string }>;
      if (inAgenda(b.start_date)) rows.push({ key: `${b.id}-in`, day: b.start_date, kind: b.status === 'pending' ? 'Request' : listing?.price_unit === 'night' || listing?.price_unit == null ? 'Check-in' : 'Booked', tone: b.status === 'pending' ? 'request' : 'booked', who: `${b.guest || 'Guest'}${place}` });
      if (b.status !== 'pending' && b.end_date && listing?.price_unit !== 'day' && inAgenda(b.end_date)) rows.push({ key: `${b.id}-out`, day: b.end_date, kind: 'Check-out', tone: 'booked', who: `${b.guest || 'Guest'}${place}` });
      return rows;
    }),
    ...leases.flatMap((l) => {
      const place = listings.length > 1 ? ` · ${byId.get(l.listing_id)?.title || ''}` : '';
      const rows = [] as Array<{ key: string; day: string; kind: string; tone: string; who: string }>;
      if (inAgenda(l.start)) rows.push({ key: `l${l.id}-in`, day: l.start, kind: l.status === 'pending' ? 'Request' : 'Move-in', tone: l.status === 'pending' ? 'request' : 'booked', who: `${l.guest || 'Tenant'}${l.months ? ` · ${plural(l.months, 'month')}` : ''}${place}` });
      if (l.status !== 'pending' && inAgenda(l.end)) rows.push({ key: `l${l.id}-out`, day: l.end, kind: 'Lease ends', tone: 'booked', who: `${l.guest || 'Tenant'}${place}` });
      return rows;
    }),
    ...outcomes.filter((o) => inAgenda(o.date)).map((o) => ({
      key: `o${o.id}`, day: o.date, kind: OUTCOME_WORD[o.outcome], tone: 'table', who: `${byId.get(o.listing_id)?.title || ''}${o.units > 1 ? ` · ${plural(o.units, 'unit')}` : ''}${o.agreed_amount ? ` · ${ksh(Number(o.agreed_amount))}` : ''}`,
    })),
    ...events.filter((e) => inAgenda(e.start_date)).map((e) => ({
      key: `${e.id}-${e.start_date}`, day: e.start_date, kind: e.source === 'ical' ? 'Other site' : e.blocks ? 'Booked offline' : e.viewing ? 'Viewing' : 'Note', tone: `ev is-${e.color || 'blue'}`,
      who: `${timeText(e)}${e.title}${listings.length > 1 && e.listing_id ? ` · ${byId.get(e.listing_id)?.title || ''}` : ''}`,
    })),
    ...tables.filter((t) => inAgenda(t.date)).map((t) => ({
      key: `t${t.id}`, day: t.date, kind: 'Table', tone: 'table', who: `${t.time} · ${t.client_name || 'Guest'} · ${plural(t.guest_count, 'guest')}`,
    })),
  ].sort((a, b) => a.day.localeCompare(b.day));

  const describe = (b: CalendarBooking) => {
    const listing = byId.get(b.listing_id);
    const when = !b.end_date ? `${dayLabel(b.start_date)}${b.start_time ? ` · ${b.start_time}–${b.end_time}` : b.hours ? ` · ${plural(b.hours, 'hour')}` : ''}`
      : listing?.price_unit === 'day' ? `${dayLabel(b.start_date)} → ${dayLabel(b.end_date)} · ${plural(nightsBetween(b.start_date, b.end_date) + 1, 'day')}`
        : `${dayLabel(b.start_date)} → ${dayLabel(b.end_date)} · ${plural(nightsBetween(b.start_date, b.end_date), 'night')}`;
    return [when, b.guest_count ? plural(b.guest_count, 'guest') : null, b.total_price ? ksh(Number(b.total_price)) : null].filter(Boolean).join(' · ');
  };

  const selectedCell = cells.find((c) => c.day === selected);
  const checkingOut = bookings.filter((b) => b.end_date === selected && b.status !== 'pending' && byId.get(b.listing_id)?.price_unit !== 'day');
  const panelBookings = [...(selectedCell?.taking || []), ...checkingOut.filter((b) => !selectedCell?.taking.includes(b))];

  return (
    <div className="va-analytics vc">
      <style dangerouslySetInnerHTML={{ __html: CALENDAR_CSS }} />
      {toast.element}
      <div className="vc-wrap">
        <header className="vc-top">
          <div>
            <h1>Calendar</h1>
            <p className="vc-sub">{plannerOnly ? 'Your viewings, move-ins, lease ends and notes in one place.' : 'Every day your places can be booked. Close the days you’re not available.'}</p>
          </div>
          <div className="vc-controls">
            {all.length > 1 && <ListingPicker options={all.map((l) => ({ id: l.id, title: l.title }))} value={listingId} onChange={onListingChange} />}
            {stays.length > 1 && (
              <div className="vc-toggle" role="group" aria-label="View">
                <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Month</button>
                <button type="button" aria-pressed={mode === 'timeline'} onClick={() => setMode('timeline')}>Timeline</button>
              </div>
            )}
            {stays.length > 0 && (
              <button type="button" className={`vc-pill${range ? ' is-on' : ''}`} aria-pressed={Boolean(range)} onClick={() => setRange(range ? null : { start: null, end: null })}>
                {range ? 'Done selecting' : 'Select days'}
              </button>
            )}
            <button type="button" className="vc-pill is-primary" disabled={!data} onClick={() => setForm({ event: null })}>+ Add</button>
          </div>
        </header>

        {data && !all.length && (
          <div className="vc-empty">
            <h2>No listings to show yet</h2>
            <p>The calendar shows your listings once they’re published.</p>
            <Link href="/list" className="vc-pill">List a space</Link>
          </div>
        )}
        {failed && !data && <p className="vc-error" role="alert">The calendar couldn’t load. Check your connection and try again.</p>}

        {notices.length > 0 && (
          <ul className="vc-notices">
            {notices.map((n) => <li key={n.key}><span>{n.text}</span>{n.action}</li>)}
          </ul>
        )}

        {planned && (
          <section className="vc-stats" aria-label="This month">
            <div><span>Viewings</span><strong>{planned.viewings}</strong></div>
            <div><span>Move-ins</span><strong>{planned.moveIns}</strong></div>
            <div><span>Leases ending</span><strong>{planned.leaseEnds}</strong></div>
            <div className={planned.requests ? 'is-alert' : ''}><span>Requests waiting</span><strong>{planned.requests}</strong></div>
          </section>
        )}

        {summary && all.length > 0 && (
          <section className="vc-stats" aria-label="This month">
            <div><span>{stay?.price_unit === 'day' ? 'Days booked' : 'Nights booked'}</span><strong>{summary.nightsBooked}</strong></div>
            <div><span>Occupancy</span><strong>{summary.occupancy == null ? '—' : `${Math.round(summary.occupancy * 100)}%`}</strong></div>
            <div><span>Earned</span><strong>{ksh(summary.earned)}</strong>{summary.offline > 0 && <em>+ {ksh(summary.offline)} entered by you</em>}</div>
            <div className={summary.requests ? 'is-alert' : ''}><span>Requests waiting</span><strong>{summary.requests}</strong></div>
          </section>
        )}

        {(!data || all.length > 0) && (
          <div className="vc-layout">
            <section className="vc-card vc-month" aria-busy={!data}>
              <div className="vc-month-head">
                <h2 aria-live="polite">{month.title}</h2>
                <div className="vc-nav">
                  <button type="button" aria-label="Previous month" onClick={() => go(-1)}>‹</button>
                  <button type="button" onClick={() => { setView({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }); setSelected(today); }}>Today</button>
                  <button type="button" aria-label="Next month" onClick={() => go(1)}>›</button>
                </div>
              </div>
              {mode === 'timeline' ? (
                <Timeline listings={stays} days={month.days} today={today} selected={selected} bookings={bookings} events={events} closedAt={closedAt} onPick={pick} />
              ) : (
                <div className="vc-grid" role="group" aria-label={month.title}>
                  {WEEKDAYS.map((d) => <div className="vc-dow" key={d} aria-hidden="true">{d}</div>)}
                  {Array.from({ length: month.leadingBlanks }, (_, i) => <span key={`b${i}`} className="vc-day is-blank" aria-hidden="true" />)}
                  {cells.map((cell) => {
                    const inRange = rangeDays.includes(cell.day);
                    const classes = ['vc-day', `is-${data ? cell.state : 'loading'}`];
                    if (cell.day === today) classes.push('is-today');
                    if (!range && cell.day === selected) classes.push('is-selected');
                    if (inRange) classes.push('is-in-range');
                    if (cell.clash && cell.state !== 'past') classes.push('is-clash');
                    const chips = [
                      ...cell.taking.map((b) => ({ key: b.id, tone: b.status === 'pending' ? 'request' : 'booked', label: `${b.start_time ? `${b.start_time} ` : ''}${firstName(b.guest)}${listings.length > 1 ? ` · ${byId.get(b.listing_id)?.title || ''}` : ''}` })),
                      ...cell.dayLeases.map((l) => ({ key: `l${l.id}${l.start === cell.day ? 'in' : 'out'}`, tone: l.status === 'pending' ? 'request' : 'booked', label: `${l.start === cell.day ? 'Move-in' : 'Lease ends'} · ${firstName(l.guest)}` })),
                      ...cell.dayOutcomes.map((o) => ({ key: `o${o.id}`, tone: 'table', label: `${OUTCOME_WORD[o.outcome]}${listings.length > 1 ? ` · ${byId.get(o.listing_id)?.title || ''}` : ''}` })),
                      ...cell.dayEvents.map((e) => ({ key: `e${e.id}`, tone: `ev is-${e.color || 'blue'}`, label: `${timeText(e)}${e.title}` })),
                      ...cell.dayTables.map((t) => ({ key: `t${t.id}`, tone: 'table', label: `${t.time} Table · ${plural(t.guest_count, 'guest')}` })),
                    ];
                    return (
                      <button key={cell.day} type="button" className={classes.join(' ')} disabled={!data || Boolean(range && cell.day < today)}
                        aria-pressed={range ? inRange : cell.day === selected}
                        aria-label={`${dayLabel(cell.day, true)}: ${cell.allClosed ? 'closed' : chips.length ? chips.map((c) => c.label).join(', ') : 'open'}`}
                        onClick={() => pick(cell.day)}>
                        <span className="vc-num">{Number(cell.day.slice(8))}</span>
                        {cell.clash && cell.state !== 'past' && <span className="vc-tag is-clash">Double booked</span>}
                        {cell.allClosed && cell.state !== 'past' && <span className="vc-tag">Closed</span>}
                        {!cell.allClosed && cell.closedCount > 0 && <span className="vc-tag">{cell.closedCount} closed</span>}
                        {cell.roomsLeft != null && stay && cell.roomsLeft < (stay.units || 0) && <span className="vc-tag">{cell.roomsLeft} left</span>}
                        <span className="vc-chips">
                          {chips.slice(0, 2).map((c) => <span key={c.key} className={`vc-chip is-${c.tone}`}>{c.label}</span>)}
                          {chips.length > 2 && <span className="vc-more">+{chips.length - 2}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="vc-legend" aria-hidden="true">
                <span><i className="is-booked" />Booked</span><span><i className="is-request" />Request</span><span><i className="is-closed" />Closed</span><span><i className="is-ev is-blue" />Your events</span>
              </div>
            </section>

            <aside className={`vc-card vc-panel${sheetOpen ? ' is-open' : ''}`} aria-label={dayLabel(selected, true)}
              onKeyDown={(event) => { if (event.key === 'Escape') setSheetOpen(false); }}>
              <div className="vc-panel-head">
                <h2>{dayLabel(selected, true)}</h2>
                <button type="button" className="vc-close" aria-label="Close" onClick={() => setSheetOpen(false)}>×</button>
              </div>
              <ul className="vc-places">
                {listings.filter((l) => l.planner).map((l) => (
                  <li key={l.id}><div><strong>{l.title}</strong><span className="vc-state">Viewings, move-ins and notes</span></div></li>
                ))}
                {stays.map((l) => {
                  const closed = closedAt(l.id, selected);
                  const weekly = closedWeekly(l, selected);
                  const taking = selectedCell?.taking.filter((b) => b.listing_id === l.id) || [];
                  const offline = (selectedCell?.dayEvents || []).filter((e) => e.blocks && e.listing_id === l.id);
                  const used = taking.length + offline.reduce((sum, e) => sum + (e.units || 1), 0);
                  const state = weekly ? `Closed every ${WEEKDAY_NAMES[weekday(selected)]}` : closed ? 'Closed'
                    : l.category === 'hotel' && l.units ? `${Math.max(0, l.units - used)} of ${l.units} rooms left`
                      : taking.some((b) => b.status !== 'pending') || offline.length ? 'Booked' : taking.length ? 'Requested' : 'Open';
                  return (
                    <li key={l.id}>
                      <div><strong>{l.title}</strong><span className={`vc-state is-${closed ? 'closed' : 'open'}`}>{state}</span></div>
                      <div className="vc-place-actions">
                        {selected >= today && l.category === 'hotel' && !closed && (l.units || 1) > 1 && (
                          <button type="button" className="vc-pill" onClick={() => setForm({ event: null, preset: { title: 'Rooms closed', listingId: l.id, color: 'purple' } })}>Close rooms…</button>
                        )}
                        {selected >= today && !weekly && (
                          <button type="button" className="vc-pill" disabled={Boolean(busy)} onClick={() => { void apply([l], selected, selected, !closed); }}>
                            {closed ? 'Reopen' : 'Close day'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {panelBookings.length ? (
                <ul className="vc-bookings">
                  {panelBookings.map((b) => (
                    <li key={b.id}>
                      <div className="vc-booking-top">
                        <strong>{b.guest || 'Guest'}</strong>
                        <span className={`vc-badge is-${b.status === 'pending' ? 'request' : 'booked'}`}>{b.status === 'pending' ? 'Request' : b.end_date === selected && byId.get(b.listing_id)?.price_unit !== 'day' ? 'Checks out' : 'Booked'}</span>
                      </div>
                      {listings.length > 1 && <span className="vc-muted">{byId.get(b.listing_id)?.title}</span>}
                      <span className="vc-muted">{describe(b)}</span>
                      {b.status === 'pending' && (
                        <div className="vc-actions">
                          <button type="button" className="vc-btn is-primary" disabled={Boolean(busy)} onClick={() => { void respond(b, 'approve'); }}>{busy === b.id ? 'Saving…' : 'Approve'}</button>
                          <button type="button" className="vc-btn" disabled={Boolean(busy)} onClick={() => { void respond(b, 'decline'); }}>Decline</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : !selectedCell?.dayEvents.length && <p className="vc-muted vc-nothing">Nothing booked on this day.</p>}
              {Boolean(selectedCell?.dayEvents.length) && (
                <ul className="vc-bookings">
                  {selectedCell?.dayEvents.map((e) => (
                    <li key={`e${e.id}`} className={`vc-event is-${e.color || 'blue'}`}>
                      <div className="vc-booking-top">
                        <strong>{e.title}</strong>
                        <span className="vc-badge is-ev">{e.source === 'ical' ? 'From another site' : e.blocks ? 'Booked offline' : e.viewing ? 'Viewing' : 'Note'}</span>
                      </div>
                      <span className="vc-muted">
                        {[e.start_time ? `${e.start_time}–${e.end_time}` : 'All day', e.listing_id ? byId.get(e.listing_id)?.title : null,
                          e.guest_count ? plural(e.guest_count, 'guest') : null, e.amount ? ksh(Number(e.amount)) : null,
                          e.repeat ? `Every ${e.repeat === 'weekly' ? 'week' : 'month'}` : null].filter(Boolean).join(' · ')}
                      </span>
                      {(e.client_name || e.client_phone) && (
                        <span className="vc-muted">{e.client_name}{e.client_phone && <> · <a href={`tel:${e.client_phone.replace(/\s+/g, '')}`}>{e.client_phone}</a></>}</span>
                      )}
                      {e.notes && <p className="vc-notes">{e.notes}</p>}
                      {e.source === 'ical'
                        ? <p className="vc-muted">Change it on that site; the next sync updates it here.</p>
                        : <div className="vc-actions"><button type="button" className="vc-btn" onClick={() => setForm({ event: e })}>Edit</button></div>}
                    </li>
                  ))}
                </ul>
              )}
              {listings.filter((l) => l.price_unit === 'hour').map((l) => (
                <DayHours key={l.id} listing={l} showName={listings.length > 1}
                  bookings={(selectedCell?.taking || []).filter((b) => b.listing_id === l.id && b.start_time)}
                  events={(selectedCell?.dayEvents || []).filter((e) => e.listing_id === l.id && e.start_time)} />
              ))}
              {Boolean(selectedCell?.dayTables.length) && (
                <ul className="vc-bookings">
                  {selectedCell?.dayTables.map((t) => (
                    <li key={`t${t.id}`}>
                      <div className="vc-booking-top">
                        <strong>{t.time} · {t.client_name || 'Guest'}</strong>
                        <span className="vc-badge is-table">Table · {t.status === 'requested' ? 'New' : t.status === 'contacted' ? 'Contacted' : 'Closed'}</span>
                      </div>
                      <span className="vc-muted">{[t.restaurant_name, plural(t.guest_count, 'guest'), plural(t.table_count, 'table'), t.occasion].filter(Boolean).join(' · ')}</span>
                      {t.client_phone && <a className="vc-muted" href={`tel:${t.client_phone.replace(/[^+\d]/g, '')}`}>{t.client_phone}</a>}
                    </li>
                  ))}
                </ul>
              )}
              {Boolean(selectedCell?.dayLeases.length || selectedCell?.dayOutcomes.length) && (
                <ul className="vc-bookings">
                  {selectedCell?.dayLeases.map((l) => (
                    <li key={`l${l.id}`}>
                      <div className="vc-booking-top">
                        <strong>{l.guest || 'Tenant'}</strong>
                        <span className={`vc-badge is-${l.status === 'pending' ? 'request' : 'booked'}`}>{l.status === 'pending' ? 'Request' : l.start === selected ? 'Moves in' : 'Lease ends'}</span>
                      </div>
                      <span className="vc-muted">{[byId.get(l.listing_id)?.title, l.months ? plural(l.months, 'month') : null, `Ends ${dayLabel(l.end, true)}`, l.total_price ? ksh(Number(l.total_price)) : null].filter(Boolean).join(' · ')}</span>
                      {l.status === 'pending' && <Link href="/bookings" className="vc-link">Answer in Bookings</Link>}
                    </li>
                  ))}
                  {selectedCell?.dayOutcomes.map((o) => (
                    <li key={`o${o.id}`}>
                      <div className="vc-booking-top"><strong>{byId.get(o.listing_id)?.title}</strong><span className="vc-badge is-table">{OUTCOME_WORD[o.outcome]}</span></div>
                      <span className="vc-muted">{[o.units > 1 ? plural(o.units, 'unit') : null, o.agreed_amount ? ksh(Number(o.agreed_amount)) : null].filter(Boolean).join(' · ') || 'Marked on this day'}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="vc-btn" onClick={() => setForm({ event: null })}>+ Add to {dayLabel(selected)}</button>
              {stay && (
                <SyncPanel key={stay.id} client={client} hostId={hostId} listing={stay} showToast={toast.show}
                  onChanged={() => { clearCalendarCache(hostId); void refresh(true).catch(() => undefined); }} />
              )}
              {stay?.price_unit === 'hour' && <HireHours key={stay.id} listing={stay} busy={Boolean(busy)} onSave={(start, end, buffer) => saveHours(stay, start, end, buffer)} />}
              {stay && (
                <div className="vc-weekly">
                  <h3>Closed every week</h3>
                  <div role="group" aria-label={`Days ${stay.title} is closed every week`}>
                    {WEEKDAYS.map((name, dow) => (
                      <button key={name} type="button" aria-pressed={Boolean(stay.closed_weekdays?.includes(dow))} disabled={Boolean(busy)}
                        onClick={() => { void toggleWeekday(stay, dow); }}>{name.slice(0, 2)}</button>
                    ))}
                  </div>
                </div>
              )}
              <Link href="/bookings" className="vc-link">All bookings</Link>
            </aside>
          </div>
        )}

        {data && all.length > 0 && (
          <section className="vc-card vc-agenda" aria-label="Coming up">
            <h2>{agendaFrom === today ? 'Coming up this month' : `In ${month.title}`}</h2>
            {agenda.length ? (
              <ul>
                {agenda.map((row) => (
                  <li key={row.key}>
                    <button type="button" onClick={() => { setSelected(row.day); setSheetOpen(true); }}>
                      <span className="vc-agenda-day">{dayLabel(row.day)}</span>
                      <span className={`vc-badge is-${row.tone}`}>{row.kind}</span>
                      <span className="vc-agenda-who">{row.who}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="vc-muted">Nothing coming up this month.</p>}
          </section>
        )}
      </div>

      {form && data && (
        <EventForm client={client} hostId={hostId} listings={all} event={form.event} preset={form.preset || null} day={selected < today ? today : selected}
          listingId={single ? single.id : null} onClose={() => setForm(null)} onSaved={(message) => { void saved(message); }} />
      )}

      {range && (
        <div className="vc-rangebar" role="region" aria-label="Selected days">
          <span>{range.start ? `${plural(rangeDays.length, 'day')} selected${listings.length > 1 ? ` · ${plural(listings.length, 'listing')}` : ''}` : 'Tap the first and last day'}</span>
          <div>
            <button type="button" className="vc-btn is-primary" disabled={!range.start || Boolean(busy)}
              onClick={() => { if (range.start) void apply(listings, range.start, range.end || range.start, true).then(() => setRange(null)); }}>Close</button>
            <button type="button" className="vc-btn" disabled={!range.start || Boolean(busy)}
              onClick={() => { if (range.start) void apply(listings, range.start, range.end || range.start, false).then(() => setRange(null)); }}>Reopen</button>
            <button type="button" className="vc-btn" onClick={() => setRange(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** An hourly venue's day: its hire hours as a bar, with each booking and timed event placed at its time. */
function DayHours({ listing, showName, bookings, events }: { listing: CalendarListing; showName: boolean; bookings: CalendarBooking[]; events: CalendarEvent[] }) {
  const open = minutesOf(listing.hire_start, 0);
  const close = listing.hire_start ? minutesOf(listing.hire_end, 1440) : 1440;
  const span = Math.max(60, close - open);
  const place = (from: string | null | undefined, to: string | null | undefined) => {
    const start = Math.max(open, minutesOf(from, open));
    const end = Math.min(close, minutesOf(to, close));
    return { left: `${((start - open) / span) * 100}%`, width: `${(Math.max(0, end - start) / span) * 100}%` };
  };
  return (
    <div className="vc-hours" aria-label={`${listing.title}: hours`}>
      {showName && <strong>{listing.title}</strong>}
      <div className="vc-hours-bar">
        {bookings.map((b) => <span key={b.id} className={`is-${b.status === 'pending' ? 'request' : 'booked'}`} style={place(b.start_time, b.end_time)} title={`${b.start_time}–${b.end_time} ${b.guest || 'Guest'}`} />)}
        {events.map((e) => <span key={e.id} className={`is-ev is-${e.color || 'blue'}${e.blocks ? '' : ' is-note'}`} style={place(e.start_time, e.end_time)} title={`${e.start_time}–${e.end_time} ${e.title}`} />)}
      </div>
      <div className="vc-hours-scale"><span>{listing.hire_start || '00:00'}</span><span>{listing.hire_end || '24:00'}</span></div>
    </div>
  );
}

const BUFFERS = [0, 15, 30, 45, 60, 90, 120];

/** Hire hours and the gap kept between bookings, for one venue hired by the hour. */
function HireHours({ listing, busy, onSave }: { listing: CalendarListing; busy: boolean; onSave: (start: string | null, end: string | null, buffer: number) => void }) {
  const [anyTime, setAnyTime] = useState(!listing.hire_start);
  const [start, setStart] = useState(listing.hire_start || '08:00');
  const [end, setEnd] = useState(listing.hire_end || '22:00');
  const [buffer, setBuffer] = useState(listing.buffer_minutes || 0);
  return (
    <form className="vc-weekly vc-hire" onSubmit={(event) => { event.preventDefault(); onSave(anyTime ? null : start, anyTime ? null : end, buffer); }}>
      <h3>Hire hours</h3>
      <label className="vc-check"><input type="checkbox" checked={anyTime} onChange={(event) => setAnyTime(event.target.checked)} />Any time of day</label>
      {!anyTime && (
        <div className="vc-row">
          <label className="vc-field">Opens<input type="time" required value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="vc-field">Closes<input type="time" required value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
      )}
      <label className="vc-field">Gap between bookings (set-up and clean-up)
        <select value={buffer} onChange={(event) => setBuffer(Number(event.target.value))}>
          {BUFFERS.map((m) => <option key={m} value={m}>{m ? `${m} minutes` : 'None'}</option>)}
        </select>
      </label>
      <button type="submit" className="vc-btn" disabled={busy}>Save hours</button>
    </form>
  );
}
