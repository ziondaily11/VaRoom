import React from 'react';
import Link from 'next/link';
import { dayLabel, ksh, nightsBetween, plural } from '../../lib/booking/bookingListing';
import { initial } from '../../lib/bookings/format';
import { getSupabaseClient } from '../../lib/supabase/client';
import { resolveAvatarUrl } from '../resolveStoredPhotoUrl';
import { KIND_LABEL, type CalendarItem } from '../../lib/calendar/calendarView';
import type { CalendarBooking, CalendarListing, MonthSummary, PlannerSummary } from '../../lib/calendar/hostCalendar';

// The Calendar's right column. With nothing chosen: what needs attention, today,
// this month and requests waiting. A day: each place's state there (close,
// reopen, close rooms), the day's price and hours, and its entries. An entry:
// its details card (guest, dates, guests, price) and what can be done with it.
// Below 1280px it slides over the page (a sheet on phones).

export interface PlaceRow { listing: CalendarListing; color: string; state: string; closed: boolean; weekly: boolean }
export interface Notice { key: string; text: string; action: React.ReactNode }
export interface TodayRow { item: CalendarItem; label: string }

type View =
  | { kind: 'overview'; notices: Notice[]; today: TodayRow[]; summary: MonthSummary | null; planned: PlannerSummary | null; staysPriceUnit: string | null; requests: CalendarItem[]; monthTitle: string }
  | { kind: 'day'; day: string; rows: PlaceRow[]; items: CalendarItem[]; extra: React.ReactNode }
  | { kind: 'item'; item: CalendarItem };

interface Props {
  view: View;
  open: boolean;
  today: string;
  busy: string | null;
  listingOf: (id: string | null) => CalendarListing | undefined;
  colorOf: (item: CalendarItem) => string;
  onClose: () => void;
  onBack: (() => void) | null;
  onPickItem: (item: CalendarItem) => void;
  onRespond: (booking: CalendarBooking, decision: 'approve' | 'decline') => void;
  onEditEvent: (item: CalendarItem) => void;
  onAdd: (day: string) => void;
  onCloseDay: (listing: CalendarListing, close: boolean) => void;
  onCloseRooms: (listing: CalendarListing) => void;
}

function Avatar({ name, src }: { name: string | null; src: string | null | undefined }) {
  const url = src ? resolveAvatarUrl(src, getSupabaseClient()) : null;
  return url ? <img className="vc-avatar" src={url} alt="" /> : <span className="vc-avatar" aria-hidden="true">{initial(name)}</span>;
}

function ItemRow({ item, colorOf, onPick, label }: { item: CalendarItem; colorOf: (item: CalendarItem) => string; onPick: (item: CalendarItem) => void; label?: string }) {
  return (
    <li>
      <button type="button" className={`vc-item-row is-${item.kind}`} style={{ ['--place' as string]: colorOf(item) } as React.CSSProperties} onClick={() => onPick(item)}>
        <span className="vc-item-kind">{label || KIND_LABEL[item.kind]}</span>
        <strong>{item.title}</strong>
        {item.time && <span className="vc-muted">{item.time}</span>}
      </button>
    </li>
  );
}

/** "Fri 4 Dec → Mon 7 Dec · 3 nights", a venue's days, or an hourly booking's time. */
function when(b: CalendarBooking, listing: CalendarListing | undefined): string {
  if (!b.end_date) return `${dayLabel(b.start_date, true)}${b.start_time ? ` · ${b.start_time}–${b.end_time}` : b.hours ? ` · ${plural(b.hours, 'hour')}` : ''}`;
  if (listing?.price_unit === 'day') return `${dayLabel(b.start_date)} → ${dayLabel(b.end_date, true)} · ${plural(nightsBetween(b.start_date, b.end_date) + 1, 'day')}`;
  return `${dayLabel(b.start_date)} → ${dayLabel(b.end_date, true)} · ${plural(nightsBetween(b.start_date, b.end_date), 'night')}`;
}

function ItemCard({ item, props }: { item: CalendarItem; props: Props }) {
  const { busy, listingOf, colorOf, onRespond, onEditEvent } = props;
  const listing = listingOf(item.listingId);
  const place = listing && <p className="vc-place"><i className="vc-swatch" style={{ background: colorOf(item) }} aria-hidden="true" />{listing.title}</p>;
  const badge = <span className={`vc-badge is-${item.kind}`}>{KIND_LABEL[item.kind]}</span>;
  const { source } = item;
  if (source.type === 'booking') {
    const b = source.value;
    return (
      <div className="vc-card-body">
        <div className="vc-person"><Avatar name={b.guest} src={b.avatar} /><div><strong>{b.guest || 'Guest'}</strong>{badge}</div></div>
        {place}
        <dl className="vc-facts">
          <dt>When</dt><dd>{when(b, listing)}</dd>
          {b.guest_count ? <><dt>Guests</dt><dd>{plural(b.guest_count, 'guest')}</dd></> : null}
          {b.total_price ? <><dt>Price</dt><dd>{ksh(Number(b.total_price))}</dd></> : null}
        </dl>
        {b.status === 'pending' && (
          <div className="vc-actions">
            <button type="button" className="vc-btn is-primary" disabled={Boolean(busy)} onClick={() => onRespond(b, 'approve')}>{busy === b.id ? 'Saving…' : 'Approve'}</button>
            <button type="button" className="vc-btn" disabled={Boolean(busy)} onClick={() => onRespond(b, 'decline')}>Decline</button>
          </div>
        )}
        <div className="vc-links"><Link href={`/bookings?booking=${encodeURIComponent(b.id)}`}>Open in Bookings</Link><Link href="/chats">Chats</Link></div>
      </div>
    );
  }
  if (source.type === 'event') {
    const e = source.value;
    return (
      <div className="vc-card-body">
        <div className="vc-person"><span className="vc-avatar is-event" style={{ background: colorOf(item) }} aria-hidden="true" /><div><strong>{e.title}</strong>{badge}</div></div>
        {place}
        <dl className="vc-facts">
          <dt>When</dt><dd>{e.start_date === e.end_date ? dayLabel(e.start_date, true) : `${dayLabel(e.start_date)} → ${dayLabel(e.end_date, true)}`}{e.start_time ? ` · ${e.start_time}–${e.end_time}` : ' · all day'}</dd>
          {e.repeat ? <><dt>Repeats</dt><dd>Every {e.repeat === 'weekly' ? 'week' : 'month'}{e.repeat_until ? ` until ${dayLabel(e.repeat_until, true)}` : ''}</dd></> : null}
          {e.client_name || e.client_phone ? <><dt>Client</dt><dd>{e.client_name}{e.client_phone && <> · <a href={`tel:${e.client_phone.replace(/[^+\d]/g, '')}`}>{e.client_phone}</a></>}</dd></> : null}
          {e.guest_count ? <><dt>Guests</dt><dd>{plural(e.guest_count, 'guest')}</dd></> : null}
          {e.amount ? <><dt>Amount</dt><dd>{ksh(Number(e.amount))}{e.units > 1 ? ` · ${plural(e.units, 'room')}` : ''}</dd></> : null}
        </dl>
        {e.notes && <p className="vc-notes">{e.notes}</p>}
        {e.source === 'ical'
          ? <p className="vc-muted">Change it on that site; the next sync updates it here.</p>
          : <div className="vc-actions"><button type="button" className="vc-btn" onClick={() => onEditEvent(item)}>Edit</button></div>}
      </div>
    );
  }
  if (source.type === 'lease') {
    const l = source.value;
    return (
      <div className="vc-card-body">
        <div className="vc-person"><Avatar name={l.guest} src={l.avatar} /><div><strong>{l.guest || 'Tenant'}</strong>{badge}</div></div>
        {place}
        <dl className="vc-facts">
          <dt>Moves in</dt><dd>{dayLabel(l.start, true)}</dd>
          {l.months ? <><dt>Lease</dt><dd>{plural(l.months, 'month')}, ends {dayLabel(l.end, true)}</dd></> : null}
          {l.total_price ? <><dt>Price</dt><dd>{ksh(Number(l.total_price))}</dd></> : null}
        </dl>
        <div className="vc-links"><Link href="/bookings">{l.status === 'pending' ? 'Answer in Bookings' : 'Open in Bookings'}</Link></div>
      </div>
    );
  }
  if (source.type === 'outcome') {
    const o = source.value;
    return (
      <div className="vc-card-body">
        <div className="vc-person"><span className="vc-avatar is-event" style={{ background: colorOf(item) }} aria-hidden="true" /><div><strong>{item.title}</strong>{badge}</div></div>
        {place}
        <dl className="vc-facts">
          <dt>On</dt><dd>{dayLabel(o.date, true)}</dd>
          {o.units > 1 ? <><dt>Units</dt><dd>{o.units}</dd></> : null}
          {o.agreed_amount ? <><dt>Agreed</dt><dd>{ksh(Number(o.agreed_amount))}</dd></> : null}
        </dl>
      </div>
    );
  }
  const t = source.value;
  return (
    <div className="vc-card-body">
      <div className="vc-person"><Avatar name={t.client_name} src={null} /><div><strong>{t.client_name || 'Guest'}</strong>{badge}</div></div>
      <dl className="vc-facts">
        <dt>When</dt><dd>{dayLabel(t.date, true)} · {t.time}</dd>
        <dt>Restaurant</dt><dd>{t.restaurant_name}</dd>
        <dt>Party</dt><dd>{plural(t.guest_count, 'guest')} · {plural(t.table_count, 'table')}</dd>
        {t.occasion ? <><dt>Occasion</dt><dd>{t.occasion}</dd></> : null}
        <dt>Status</dt><dd>{t.status === 'requested' ? 'New' : t.status === 'contacted' ? 'Contacted' : 'Closed'}</dd>
        {t.client_phone ? <><dt>Phone</dt><dd><a href={`tel:${t.client_phone.replace(/[^+\d]/g, '')}`}>{t.client_phone}</a></dd></> : null}
      </dl>
      <div className="vc-links"><Link href="/bookings">Open in Bookings</Link></div>
    </div>
  );
}

export default function DetailsPanel(props: Props) {
  const { view, open, today, busy, colorOf, onClose, onBack, onPickItem } = props;
  const title = view.kind === 'overview' ? 'Overview' : view.kind === 'day' ? dayLabel(view.day, true) : KIND_LABEL[view.item.kind];
  return (
    <>
      {open && <button type="button" className="vc-scrim vc-only-narrow" aria-label="Close" onClick={onClose} />}
      <aside className={`vc-details${open ? ' is-open' : ''}`} aria-label={title} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="vc-panel-head">
          {onBack && <button type="button" className="vc-back" onClick={onBack} aria-label="Back to overview">‹</button>}
          <h2>{title}</h2>
          <button type="button" className="vc-close vc-only-narrow" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {view.kind === 'item' && <ItemCard item={view.item} props={props} />}

        {view.kind === 'day' && (
          <div className="vc-card-body">
            {view.rows.length > 0 && (
              <ul className="vc-places">
                {view.rows.map((row) => (
                  <li key={row.listing.id}>
                    <div><strong><i className="vc-swatch" style={{ background: row.color }} aria-hidden="true" />{row.listing.title}</strong><span className={`vc-state is-${row.closed ? 'closed' : 'open'}`}>{row.state}</span></div>
                    {!row.listing.planner && view.day >= today && (
                      <div className="vc-actions">
                        {row.listing.category === 'hotel' && !row.closed && (row.listing.units || 1) > 1 && (
                          <button type="button" className="vc-pill" onClick={() => props.onCloseRooms(row.listing)}>Close rooms…</button>
                        )}
                        {!row.weekly && (
                          <button type="button" className="vc-pill" disabled={Boolean(busy)} onClick={() => props.onCloseDay(row.listing, !row.closed)}>{row.closed ? 'Reopen' : 'Close day'}</button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {view.extra}
            {view.items.length ? (
              <ul className="vc-item-list">{view.items.map((item) => <ItemRow key={item.key} item={item} colorOf={colorOf} onPick={onPickItem} />)}</ul>
            ) : <p className="vc-muted">Nothing on this day.</p>}
            <button type="button" className="vc-btn is-wide" onClick={() => props.onAdd(view.day)}>+ Add to {dayLabel(view.day)}</button>
          </div>
        )}

        {view.kind === 'overview' && (
          <div className="vc-card-body">
            {view.notices.length > 0 && (
              <ul className="vc-notices">{view.notices.map((n) => <li key={n.key}><span>{n.text}</span>{n.action}</li>)}</ul>
            )}
            <section className="vc-widget" aria-label="Today">
              <h3>Today</h3>
              {view.today.length
                ? <ul className="vc-item-list">{view.today.map((row) => <ItemRow key={`${row.item.key}${row.label}`} item={row.item} label={row.label} colorOf={colorOf} onPick={onPickItem} />)}</ul>
                : <p className="vc-muted">Nothing today.</p>}
            </section>
            {view.summary && (
              <section className="vc-widget" aria-label={view.monthTitle}>
                <h3>{view.monthTitle}</h3>
                <div className="vc-meter" aria-label={`Occupancy ${view.summary.occupancy == null ? 'unknown' : `${Math.round(view.summary.occupancy * 100)}%`}`}>
                  <span style={{ width: `${Math.round((view.summary.occupancy || 0) * 100)}%` }} />
                </div>
                <dl className="vc-facts">
                  <dt>Occupancy</dt><dd>{view.summary.occupancy == null ? '—' : `${Math.round(view.summary.occupancy * 100)}%`}</dd>
                  <dt>{view.staysPriceUnit === 'day' ? 'Days booked' : 'Nights booked'}</dt><dd>{view.summary.nightsBooked}</dd>
                  <dt>Earned</dt><dd>{ksh(view.summary.earned)}</dd>
                  {view.summary.offline > 0 ? <><dt>Entered by you</dt><dd>{ksh(view.summary.offline)}</dd></> : null}
                </dl>
              </section>
            )}
            {view.planned && (
              <section className="vc-widget" aria-label={view.monthTitle}>
                <h3>{view.monthTitle}</h3>
                <dl className="vc-facts">
                  <dt>Viewings</dt><dd>{view.planned.viewings}</dd>
                  <dt>Move-ins</dt><dd>{view.planned.moveIns}</dd>
                  <dt>Leases ending</dt><dd>{view.planned.leaseEnds}</dd>
                </dl>
              </section>
            )}
            <section className="vc-widget" aria-label="Requests waiting">
              <h3>Requests waiting{view.requests.length ? ` (${view.requests.length})` : ''}</h3>
              {view.requests.length ? (
                <ul className="vc-item-list">
                  {view.requests.map((item) => (
                    <li key={item.key} className="vc-request">
                      <ItemRow item={item} colorOf={colorOf} onPick={onPickItem} label={dayLabel(item.start)} />
                      {item.source.type === 'booking' ? (
                        <div className="vc-actions">
                          <button type="button" className="vc-btn is-primary" disabled={Boolean(busy)} onClick={() => props.onRespond(item.source.value as CalendarBooking, 'approve')}>Approve</button>
                          <button type="button" className="vc-btn" disabled={Boolean(busy)} onClick={() => props.onRespond(item.source.value as CalendarBooking, 'decline')}>Decline</button>
                        </div>
                      ) : <Link href="/bookings" className="vc-link">Answer in Bookings</Link>}
                    </li>
                  ))}
                </ul>
              ) : <p className="vc-muted">None right now.</p>}
            </section>
          </div>
        )}
      </aside>
    </>
  );
}
