import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calendarMonth, dayLabel, ksh, plural, todayString } from '../../lib/booking/bookingListing';
import {
  cachedMonth, cachedMonths, calendarErrorText, clearCalendarCache, closedWeekly, covers, daysBetweenInclusive, eventOn, isClosed, listingOff, loadMonth,
  minutesOf, monthSummary, parsePrice, plannerSummary, priceOn, setClosed, setDatePrice, setHours, setWeekdays, weekday,
  type CalendarBooking, type CalendarEvent, type CalendarListing, type EventColor, type HostCalendarData,
} from '../../lib/calendar/hostCalendar';
import {
  ALL_SHOWN, EVENT_HEX, buildItems, defaultMode, itemsOn, mergeData, monthWeeks, monthsOf, placeColor, saveMode, savedMode, searchItems, upcoming, visibleRange, weekDays,
  type CalendarItem, type CalendarMode, type ShowKey,
} from '../../lib/calendar/calendarView';
import { respondToBooking } from '../../lib/bookings/hostBookings';
import { clearHostBookings } from '../../lib/bookings/bookingsCache';
import { useToast } from '../bookings/useBookingActions';
import { CALENDAR_CSS } from './calendarStyles';
import CalendarHeader from './CalendarHeader';
import CalendarSidebar from './CalendarSidebar';
import MonthView, { type DayInfo } from './MonthView';
import DetailsPanel, { type Notice, type PlaceRow, type TodayRow } from './DetailsPanel';
import PlaceSettings from './PlaceSettings';
import { DayPrice } from './PricePanel';
import EventForm from './EventForm';
import Timeline from './Timeline';
import { DayView, WeekView } from './TimeGrid';
import CalendarSearch from './CalendarSearch';

// The host's Calendar (docs/host-controls/CALENDAR_UI_PLAN.md): a header with
// the date and the views; on the left a mini month, the places (each in its
// colour), what to show and what's coming up; in the middle the month, where
// stays are bars from check-in to check-out (or Week and Day: an hour grid,
// with stays in an all-day row); on the right an overview, the
// chosen day or the chosen entry. A place's settings (prices, availability,
// sync) open in a drawer. Below 1280px the side columns slide over the page;
// on phones the details and settings are bottom sheets, Day has a week strip
// and Month shows dots. Search looks through the months already opened.
// Property, office and shop listings are planned, not booked by the night:
// they show move-ins, lease ends, outcomes and viewings, without closing and
// booking controls.

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const addDaysTo = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const NO_COLOR = '#8b8b95';

type Selection = { day: string } | { key: string } | null;

interface Props { client: SupabaseClient; hostId: string; listingId: string | null; onListingChange: (id: string | null) => void }

export default function HostCalendar({ client, hostId, listingId, onListingChange }: Props) {
  const toast = useToast();
  const today = todayString();
  const [focus, setFocus] = useState(today);
  const [mode, setModeState] = useState<CalendarMode | null>(() => savedMode(hostId));
  // Phones start on Day (decided once; layout itself is CSS).
  const [phone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [listingsSeen, setListingsSeen] = useState<CalendarListing[]>([]);
  const chosenMode: CalendarMode = mode ?? defaultMode(listingsSeen, phone);
  const loadRange = visibleRange(chosenMode === 'timeline' ? 'month' : chosenMode === 'day' ? 'week' : chosenMode, focus);
  const months = useMemo(() => monthsOf(loadRange.from, loadRange.to), [loadRange.from, loadRange.to]);
  const monthsKey = months.map((m) => `${m.year}-${m.month}`).join(',');
  const cachedAll = () => {
    const parts = months.map((m) => cachedMonth(hostId, m.year, m.month)?.data);
    return parts.every(Boolean) ? mergeData(parts as HostCalendarData[]) : null;
  };
  const [data, setData] = useState<HostCalendarData | null>(cachedAll);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [show, setShow] = useState<Set<ShowKey>>(() => new Set(ALL_SHOWN));
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string | null; end: string | null } | null>(null);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [rangePrice, setRangePrice] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<{ event: CalendarEvent | null; day?: string; preset?: { title: string; listingId: string; color: EventColor } } | null>(null);

  const loadAll = useCallback((force: boolean) => Promise.all(months.map((m) => loadMonth(client, hostId, m.year, m.month, force))).then(mergeData),
    // The months are keyed by monthsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, hostId, monthsKey]);
  const refresh = useCallback((force: boolean) => loadAll(force).then((next) => { setData(next); setFailed(false); }), [loadAll]);

  useEffect(() => {
    let active = true;
    setData(cachedAll());
    loadAll(false).then((next) => {
      if (!active) return;
      setData(next);
      setListingsSeen(next.listings);
      setFailed(false);
      // The next month, in the background, for a quick step forward.
      const last = months[months.length - 1];
      const after = last.month === 11 ? { year: last.year + 1, month: 0 } : { year: last.year, month: last.month + 1 };
      void loadMonth(client, hostId, after.year, after.month).catch(() => undefined);
    }, (error: unknown) => {
      console.error('Calendar: the month could not be loaded:', error);
      if (active) setFailed(true);
    });
    return () => { active = false; };
    // The months are keyed by monthsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAll]);

  // ---------- What is shown ----------

  const focusYear = Number(focus.slice(0, 4));
  const focusMonth = Number(focus.slice(5, 7)) - 1;
  const month = calendarMonth(focusYear, focusMonth);
  const all = useMemo(() => data?.listings || [], [data]);
  const byId = useMemo(() => new Map(all.map((l) => [l.id, l])), [all]);
  const colors = useMemo(() => new Map(all.map((l, i) => [l.id, placeColor(i)])), [all]);
  const shown = useMemo(() => {
    const one = listingId ? all.filter((l) => l.id === listingId) : [];
    return one.length ? one : all.filter((l) => !hidden.has(l.id));
  }, [all, listingId, hidden]);
  const allShown = shown.length === all.length;
  const shownIds = useMemo(() => new Set(shown.map((l) => l.id)), [shown]);
  const single = shown.length === 1 ? shown[0] : null;
  const stays = useMemo(() => shown.filter((l) => !l.planner), [shown]);
  const stay = single && !single.planner ? single : null;
  const plannerOnly = shown.length > 0 && stays.length === 0;
  const closedAt = useCallback((id: string, day: string) => {
    const override = overrides.get(`${id}|${day}`);
    return override ?? Boolean(data && (isClosed(data.closed, id, day) || closedWeekly(byId.get(id), day)));
  }, [data, overrides, byId]);
  const bookings = useMemo(() => (data?.bookings || []).filter((b) => shownIds.has(b.listing_id)), [data, shownIds]);
  const events = useMemo(() => (data?.events || []).filter((e) => !e.listing_id || shownIds.has(e.listing_id)), [data, shownIds]);
  const items = useMemo(() => (data ? buildItems(data, shown, allShown, show) : []), [data, shown, allShown, show]);
  const itemColor = useCallback((item: CalendarItem) => (item.color && EVENT_HEX[item.color]) || (item.listingId && colors.get(item.listingId)) || NO_COLOR, [colors]);
  const summary = useMemo(() => (data && stays.length ? monthSummary(data, stays, month.days, closedAt) : null), [data, stays, month.days, closedAt]);
  const planned = useMemo(() => (data && plannerOnly ? plannerSummary(data, shownIds, month.days[0], month.days[month.days.length - 1]) : null),
    [data, plannerOnly, shownIds, month.days]);

  const viewDays = useMemo(() => (chosenMode === 'week' ? weekDays(focus) : chosenMode === 'day' ? [focus] : month.days), [chosenMode, focus, month.days]);
  // Each shown day's state: closed, cleaning, double booked, rooms left, a special price.
  const info = useMemo(() => {
    const map = new Map<string, DayInfo>();
    const showClosed = show.has('closed');
    viewDays.forEach((day) => {
      const taking = bookings.filter((b) => covers(b, byId.get(b.listing_id), day));
      const offline = events.filter((e) => e.blocks && eventOn(e, day));
      const closedCount = stays.filter((l) => closedAt(l.id, day)).length;
      const cleaning = stays.some((l) => {
        const n = l.category === 'hotel' ? 0 : l.turnover_days || 0;
        if (!n) return false;
        const lasts = [
          ...bookings.filter((b) => b.listing_id === l.id && b.end_date).map((b) => (l.price_unit === 'day' ? b.end_date as string : addDaysTo(b.end_date as string, -1))),
          ...events.filter((e) => e.listing_id === l.id && e.blocks).map((e) => e.end_date),
        ];
        return lasts.some((last) => last < day && day <= addDaysTo(last, n));
      });
      const clash = stays.some((l) => {
        const used = taking.filter((b) => b.listing_id === l.id && b.end_date).length
          + offline.filter((e) => e.listing_id === l.id && !(l.price_unit === 'hour' && e.start_time)).reduce((sum, e) => sum + (e.units || 1), 0);
        return used > (l.category === 'hotel' ? Math.max(1, l.units || 1) : 1);
      });
      const price = stay && data ? priceOn(stay, data.prices, day) : null;
      map.set(day, {
        allClosed: showClosed && stays.length > 0 && closedCount === stays.length,
        someClosed: showClosed ? closedCount : 0,
        cleaning: showClosed && cleaning,
        clash,
        roomsLeft: stay && stay.category === 'hotel' && stay.units && day >= today
          ? Math.max(0, stay.units - taking.length - offline.reduce((sum, e) => sum + (e.units || 1), 0)) : null,
        price: price?.special ? price.price : null,
      });
    });
    return map;
  }, [viewDays, bookings, events, byId, stays, closedAt, stay, data, today, show]);
  // Search: every month opened so far, with the same places and kinds shown.
  const results = useMemo(() => {
    const opened = query.trim().length >= 2 ? cachedMonths(hostId) : [];
    return opened.length ? searchItems(buildItems(mergeData(opened), shown, allShown, show), (id) => (id ? byId.get(id)?.title : undefined), query, today) : [];
    // data: a reload refreshes the cache searched here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, hostId, shown, allShown, show, byId, today, data]);
  const busyDays = useMemo(() => new Set(month.days.filter((day) => itemsOn(items, day).length > 0)), [month.days, items]);

  // ---------- Actions ----------

  const apply = async (targets: CalendarListing[], from: string, to: string | null, closed: boolean) => {
    const last = to || visibleRange('month', focus).to;
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

  const changed = (message: string) => {
    toast.show(message);
    clearCalendarCache(hostId);
    void refresh(true).catch(() => undefined);
  };

  const toggleWeekday = async (listing: CalendarListing, dow: number) => {
    const current = listing.closed_weekdays || [];
    setBusy('weekdays');
    try {
      await setWeekdays(client, listing.id, current.includes(dow) ? current.filter((d) => d !== dow) : [...current, dow]);
      changed(current.includes(dow) ? `Open on ${WEEKDAY_NAMES[dow]}s again.` : `Closed every ${WEEKDAY_NAMES[dow]}.`);
    } catch (error) {
      toast.show(calendarErrorText(error, 'That didn’t save. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const saveHours = async (listing: CalendarListing, start: string | null, end: string | null, buffer: number) => {
    setBusy('hours');
    try {
      await setHours(client, listing.id, start, end, buffer);
      changed('Hire hours saved.');
    } catch (error) {
      toast.show(calendarErrorText(error, 'That didn’t save. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const priceRange = async (price: number | null) => {
    if (!range?.start) return;
    setBusy('price');
    try {
      await Promise.all(stays.map((l) => setDatePrice(client, l.id, range.start as string, range.end || (range.start as string), price)));
      changed(price ? `Price set to ${ksh(price)} for those days.` : 'Those days are back to their usual price.');
      setRange(null);
      setRangePrice('');
    } catch (error) {
      toast.show(calendarErrorText(error, 'That didn’t save. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const pickDay = (day: string) => {
    if (range) {
      if (day < today) return;
      setRange(!range.start || range.end ? { start: day, end: null } : { start: day < range.start ? day : range.start, end: day < range.start ? range.start : day });
      return;
    }
    if (chosenMode === 'day' || !viewDays.includes(day)) setFocus(day);
    setSelection({ day });
    setPanelOpen(true);
    setSideOpen(false);
  };
  const pickItem = (item: CalendarItem) => {
    if (range) return;
    setSelection({ key: item.key });
    setPanelOpen(true);
    setSideOpen(false);
  };
  const pickResult = (item: CalendarItem) => {
    setRange(null);
    setFocus(item.start);
    setSelection({ key: item.key });
    setPanelOpen(true);
    setSideOpen(false);
  };
  const shiftMonthOf = (by: 1 | -1) => {
    const next = new Date(Date.UTC(focusYear, focusMonth + by, 1)).toISOString().slice(0, 10);
    setFocus(next);
    setRange((r) => (r ? { start: null, end: null } : r));
  };
  // ‹ › step by the view: a day, a week or a month.
  const go = (by: 1 | -1) => {
    if (chosenMode === 'day' || chosenMode === 'week') {
      setFocus(new Date(Date.parse(`${focus}T00:00:00Z`) + by * (chosenMode === 'day' ? 1 : 7) * 86400000).toISOString().slice(0, 10));
      setRange((r) => (r ? { start: null, end: null } : r));
    } else shiftMonthOf(by);
  };
  const goToday = () => { setFocus(today); setSelection({ day: today }); };
  const setMode = (next: CalendarMode) => { setModeState(next); saveMode(hostId, next); };
  const openDay = (day: string) => { setFocus(day); setMode('day'); setSelection({ day }); };
  const togglePlace = (id: string) => {
    if (listingId) onListingChange(null);
    setHidden((current) => {
      const base = listingId ? new Set(all.filter((l) => l.id !== listingId).map((l) => l.id)) : new Set(current);
      if (base.has(id)) base.delete(id); else base.add(id);
      return base.size === all.length ? current : base;
    });
  };
  const toggleShow = (key: ShowKey) => setShow((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const rangeDays = range?.start ? new Set(daysBetweenInclusive(range.start, range.end || range.start)) : new Set<string>();

  // ---------- The right column ----------

  const notices: Notice[] = stays.flatMap((l) => {
    const off = listingOff(l);
    const onwards = (data?.closed || []).find((c) => c.listing_id === l.id && !c.end_date);
    return [
      off ? { key: `${l.id}-off`, text: `${l.title} ${off}, so guests can’t book it.`, action: <Link href="/host-home?view=my-listings">Manage listing</Link> } : null,
      onwards ? {
        key: `${l.id}-closed`, text: `${l.title} is closed from ${dayLabel(onwards.start_date < today ? today : onwards.start_date, true)} onwards.`,
        action: <button type="button" disabled={Boolean(busy)} onClick={() => { void apply([l], onwards.start_date, null, false); }}>Open it</button>,
      } : null,
    ].filter(Boolean) as Notice[];
  });

  const todayRows: TodayRow[] = [
    ...items.filter((i) => i.start === today).map((item) => ({ item, label: item.kind === 'booking' && item.halfStart ? 'Check-in' : '' })),
    ...items.filter((i) => i.kind === 'booking' && i.halfEnd && i.end === today).map((item) => ({ item, label: 'Check-out' })),
  ];

  const selectedItem = selection && 'key' in selection ? items.find((i) => i.key === selection.key) || null : null;
  const selectedDay = selection && 'day' in selection ? selection.day : selectedItem ? selectedItem.start : null;

  const dayRows = (day: string): PlaceRow[] => shown.map((l) => {
    const color = colors.get(l.id) || NO_COLOR;
    if (l.planner) return { listing: l, color, state: 'Viewings, move-ins and notes', closed: false, weekly: false };
    const closed = closedAt(l.id, day);
    const weekly = closedWeekly(l, day);
    const taking = bookings.filter((b) => b.listing_id === l.id && covers(b, l, day));
    const offline = events.filter((e) => e.blocks && e.listing_id === l.id && eventOn(e, day));
    const used = taking.length + offline.reduce((sum, e) => sum + (e.units || 1), 0);
    const state = weekly ? `Closed every ${WEEKDAY_NAMES[weekday(day)]}` : closed ? 'Closed'
      : l.category === 'hotel' && l.units ? `${Math.max(0, l.units - used)} of ${l.units} rooms left`
        : taking.some((b) => b.status !== 'pending') || offline.length ? 'Booked' : taking.length ? 'Requested' : 'Open';
    return { listing: l, color, state, closed, weekly };
  });

  const panelView = selectedItem
    ? { kind: 'item' as const, item: selectedItem }
    : selection && 'day' in selection
      ? {
        kind: 'day' as const, day: selection.day, rows: dayRows(selection.day), items: itemsOn(items, selection.day),
        extra: (
          <>
            {stay && data && (
              <DayPrice key={`${stay.id}-${selection.day}`} client={client} listing={stay} prices={data.prices} day={selection.day} today={today} onChanged={changed} onError={toast.show} />
            )}
            {stays.filter((l) => l.price_unit === 'hour').map((l) => (
              <DayHours key={l.id} listing={l} showName={stays.length > 1} color={colors.get(l.id) || NO_COLOR}
                bookings={bookings.filter((b) => b.listing_id === l.id && b.start_time && b.start_date === selection.day)}
                events={events.filter((e) => e.listing_id === l.id && e.start_time && eventOn(e, selection.day))} />
            ))}
          </>
        ),
      }
      : {
        kind: 'overview' as const, notices, today: todayRows, summary, planned, staysPriceUnit: stay?.price_unit || null,
        requests: items.filter((i) => i.kind === 'request'), monthTitle: month.title,
      };

  const settingsListing = settingsFor ? byId.get(settingsFor) : undefined;
  const modes: CalendarMode[] = stays.length > 1 ? ['day', 'week', 'month', 'timeline'] : ['day', 'week', 'month'];
  const shownMode = modes.includes(chosenMode) ? chosenMode : 'month';
  const gridProps = {
    days: viewDays, items, info, today, selectedDay: selection && 'day' in selection ? selection.day : null, selectedKey: selectedItem?.key || null,
    loading: !data, colorOf: itemColor, listingOf: (id: string | null) => (id ? byId.get(id) : undefined), onPickDay: pickDay, onPickItem: pickItem, onOpenDay: openDay,
  };
  const viewTitle = shownMode === 'day' ? dayLabel(focus, true)
    : shownMode === 'week' ? `${dayLabel(viewDays[0])} – ${dayLabel(viewDays[6], true)}` : month.title;

  return (
    <div className="va-analytics vc">
      <style dangerouslySetInnerHTML={{ __html: CALENDAR_CSS }} />
      {toast.element}
      <div className="vc-wrap">
        <CalendarHeader day={selectedDay || focus} monthTitle={viewTitle} mode={shownMode} modes={modes} selecting={Boolean(range)}
          canSelect={stays.length > 0} canAdd={Boolean(data)} onMode={setMode} onPrev={() => go(-1)} onNext={() => go(1)} onToday={goToday}
          onSelect={() => setRange(range ? null : { start: null, end: null })} onAdd={() => setForm({ event: null, day: selectedDay || today })}
          onFilters={() => setSideOpen(true)} onOverview={() => { setSelection(null); setPanelOpen(true); }}
          search={<CalendarSearch query={query} results={results} colorOf={itemColor} titleOf={(id) => (id ? byId.get(id)?.title : undefined)} onQuery={setQuery} onPick={pickResult} />} />

        {failed && !data && <p className="vc-error" role="alert">The calendar couldn’t load. Check your connection and try again.</p>}
        {data && !all.length && (
          <div className="vc-empty">
            <h2>No listings to show yet</h2>
            <p>The calendar shows your listings once they’re published.</p>
            <Link href="/list" className="vc-pill">List a space</Link>
          </div>
        )}

        {(!data || all.length > 0) && (
          <div className="vc-shell">
            <CalendarSidebar year={focusYear} month={focusMonth} today={today} selectedDay={selectedDay} busyDays={busyDays}
              places={all.map((listing) => ({ listing, color: colors.get(listing.id) || NO_COLOR, shown: shownIds.has(listing.id) }))}
              show={show} coming={upcoming(items, today, 6)} colorOf={itemColor} open={sideOpen} onClose={() => setSideOpen(false)}
              onPrev={() => shiftMonthOf(-1)} onNext={() => shiftMonthOf(1)} onPickDay={(day) => { setFocus(day); pickDay(day); }} onTogglePlace={togglePlace}
              onSettings={(l) => setSettingsFor(l.id)} onToggleShow={toggleShow} onPickItem={pickItem} />

            <main className="vc-main" aria-label={viewTitle}>
              <div className="vc-main-head">
                <h2 aria-live="polite">{viewTitle}</h2>
                <div className="vc-legend" aria-hidden="true">
                  <span><i className="is-booking" />Booked</span><span><i className="is-request" />Request</span>
                  <span><i className="is-offline" />Offline</span><span><i className="is-other" />Other site</span>
                  <span><i className="is-closed" />Closed</span>
                </div>
              </div>
              {shownMode === 'day' && (
                <div className="vc-strip vc-only-phone" role="group" aria-label="This week">
                  {weekDays(focus).map((day) => (
                    <button key={day} type="button" aria-pressed={day === focus} className={day === today ? 'is-today' : undefined} aria-label={dayLabel(day, true)} onClick={() => setFocus(day)}>
                      <span>{SHORT_DAYS[weekday(day)]}</span><strong>{Number(day.slice(8))}</strong>{itemsOn(items, day).length > 0 && <i aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}
              {shownMode === 'week' ? <WeekView {...gridProps} />
                : shownMode === 'day' ? <DayView {...gridProps} />
                  : shownMode === 'timeline' ? (
                <Timeline listings={stays} days={month.days} today={today} selectedDay={gridProps.selectedDay} selectedKey={gridProps.selectedKey} items={items}
                  closedAt={closedAt} placeColor={(id) => colors.get(id) || NO_COLOR} colorOf={itemColor} onPickDay={pickDay} onPickItem={pickItem} />
              ) : (
                <MonthView weeks={monthWeeks(month.days, month.leadingBlanks)} items={items} info={info} today={today}
                  selectedDay={selection && 'day' in selection ? selection.day : null} selectedKey={selectedItem?.key || null}
                  inRange={(day) => rangeDays.has(day)} selecting={Boolean(range)} loading={!data} colorOf={itemColor} onPickDay={pickDay} onPickItem={pickItem} />
              )}
            </main>

            <DetailsPanel view={panelView} open={panelOpen} today={today} busy={busy} listingOf={(id) => (id ? byId.get(id) : undefined)}
              colorOf={itemColor} onClose={() => setPanelOpen(false)} onBack={selection ? () => setSelection(null) : null} onPickItem={pickItem}
              onRespond={(b, decision) => { void respond(b, decision); }}
              onEditEvent={(item) => { if (item.source.type === 'event') setForm({ event: item.source.value }); }}
              onAdd={(day) => setForm({ event: null, day })} onCloseDay={(l, close) => { if (selectedDay) void apply([l], selectedDay, selectedDay, close); }}
              onCloseRooms={(l) => setForm({ event: null, day: selectedDay || today, preset: { title: 'Rooms closed', listingId: l.id, color: 'purple' } })} />
          </div>
        )}
      </div>

      {settingsListing && (
        <PlaceSettings client={client} hostId={hostId} listing={settingsListing} color={colors.get(settingsListing.id) || NO_COLOR} busy={Boolean(busy)}
          onClose={() => setSettingsFor(null)} onChanged={changed} onError={toast.show} onRefresh={() => { clearCalendarCache(hostId); void refresh(true).catch(() => undefined); }}
          onToggleWeekday={(l, dow) => { void toggleWeekday(l, dow); }} onSaveHours={(l, s, e, b) => { void saveHours(l, s, e, b); }} />
      )}

      {form && data && (
        <EventForm client={client} hostId={hostId} listings={all} event={form.event} preset={form.preset || null}
          day={form.day && form.day >= today ? form.day : today} listingId={single ? single.id : null}
          onClose={() => setForm(null)} onSaved={(message) => { setForm(null); changed(message); }} />
      )}

      {range && (
        <div className="vc-rangebar" role="region" aria-label="Selected days">
          <span>{range.start ? `${plural(rangeDays.size, 'day')} selected${stays.length > 1 ? ` · ${plural(stays.length, 'place')}` : ''}` : 'Tap the first and last day'}</span>
          <div>
            <button type="button" className="vc-btn is-primary" disabled={!range.start || Boolean(busy)}
              onClick={() => { if (range.start) void apply(stays, range.start, range.end || range.start, true).then(() => setRange(null)); }}>Close</button>
            <button type="button" className="vc-btn" disabled={!range.start || Boolean(busy)}
              onClick={() => { if (range.start) void apply(stays, range.start, range.end || range.start, false).then(() => setRange(null)); }}>Reopen</button>
            <input className="vc-range-price" inputMode="numeric" aria-label="Price for these days (KSh)" placeholder="Price KSh" value={rangePrice} onChange={(e) => setRangePrice(e.target.value)} />
            <button type="button" className="vc-btn" disabled={!range.start || !parsePrice(rangePrice) || Boolean(busy)} onClick={() => { void priceRange(parsePrice(rangePrice)); }}>Set price</button>
            <button type="button" className="vc-btn" disabled={!range.start || Boolean(busy)} onClick={() => { void priceRange(null); }}>Usual price</button>
            <button type="button" className="vc-btn" onClick={() => setRange(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** An hourly venue's day: its hire hours as a bar, with each booking and timed event at its time. */
function DayHours({ listing, showName, color, bookings, events }: { listing: CalendarListing; showName: boolean; color: string; bookings: CalendarBooking[]; events: CalendarEvent[] }) {
  const open = minutesOf(listing.hire_start, 0);
  const close = listing.hire_start ? minutesOf(listing.hire_end, 1440) : 1440;
  const span = Math.max(60, close - open);
  const place = (from: string | null | undefined, to: string | null | undefined) => {
    const start = Math.max(open, minutesOf(from, open));
    const end = Math.min(close, minutesOf(to, close));
    return { left: `${((start - open) / span) * 100}%`, width: `${(Math.max(0, end - start) / span) * 100}%` };
  };
  return (
    <section className="vc-section vc-hours" aria-label={`${listing.title}: hours`}>
      <h3>{showName ? `${listing.title}: hours` : 'Hours'}</h3>
      <div className="vc-hours-bar" style={{ ['--place' as string]: color } as React.CSSProperties}>
        {bookings.map((b) => <span key={b.id} className={`is-${b.status === 'pending' ? 'request' : 'booking'}`} style={place(b.start_time, b.end_time)} title={`${b.start_time}–${b.end_time} ${b.guest || 'Guest'}`} />)}
        {events.map((e) => <span key={e.id} className={`is-${e.blocks ? 'offline' : 'note'}`} style={place(e.start_time, e.end_time)} title={`${e.start_time}–${e.end_time} ${e.title}`} />)}
      </div>
      <div className="vc-hours-scale"><span>{listing.hire_start || '00:00'}</span><span>{listing.hire_end || '24:00'}</span></div>
    </section>
  );
}
