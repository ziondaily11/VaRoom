import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fmtDate, formatMetric, kes, label, num } from '../../lib/analytics/format';
import { change, contactTaps, lockedFeatures, NICHE_LABEL, sortListings, type Kpi, type ListingColumn, type ListingKey } from '../../lib/analytics/niche';
import type { DiningSummary, HostNiche, ListingRow, PeriodMetrics, PlanPayment, ReviewSummary } from '../../lib/analytics/types';
import { Gauge, MiniColumns, MixBar, Sparkline, statusTone } from './AnalyticsCharts';
import { Icon, kpiIcon } from './analyticsIcons';

// Cards of the analytics page. Each takes ready data; loading and errors are
// handled once by the page. Copy is kept to labels: the numbers do the talking.

export function Card({ title, icon, action, className = '', children }: {
  title?: string; icon?: string; action?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section className={`va-card ${className}`}>
      {(title || action) && (
        <div className="va-card-h">
          {title && <h2>{icon && <span className="va-ico"><Icon name={icon} size={16} /></span>}{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Delta({ kpi, vs }: { kpi: Pick<Kpi, 'value' | 'previous' | 'better'>; vs?: string }) {
  const ch = change(kpi.value, kpi.previous);
  if (ch === null) return null;
  let pill: ReactNode;
  if (ch === 'new') {
    pill = <span className={`va-delta ${kpi.better === 'up' ? 'up' : 'down'}`}>New</span>;
  } else if (Math.abs(ch) < 0.005) {
    pill = <span className="va-delta flat">0%</span>;
  } else {
    const rising = ch > 0;
    pill = <span className={`va-delta ${rising === (kpi.better === 'up') ? 'up' : 'down'}`}>{rising ? '↑' : '↓'} {formatMetric(Math.abs(ch), 'percent')}</span>;
  }
  return <span title={vs ? `Compared with the ${vs.replace('vs ', '')}` : undefined}>{pill}{vs && <span className="va-vs"> {vs}</span>}</span>;
}

export function Hero({ kpi, spark, vs }: { kpi: Kpi; spark: number[]; vs: string }) {
  return (
    <section className="va-card va-hero" aria-label={kpi.label}>
      <div className="va-hero-top">
        <span className="va-hero-label" title={kpi.note}>{kpi.label}</span>
        <span className="va-ico"><Icon name={kpiIcon(kpi.key)} /></span>
      </div>
      <div>
        <p className="va-hero-value">{formatMetric(kpi.value, kpi.format)}</p>
        <div className="va-hero-foot" style={{ marginTop: 12 }}><Delta kpi={kpi} vs={vs} /></div>
      </div>
      <div className="va-hero-spark"><Sparkline values={spark} width={300} height={76} variant="hero" /></div>
    </section>
  );
}

export function Tile({ kpi, spark, vs }: { kpi: Kpi; spark: number[] | null; vs: string }) {
  const none = kpi.value === null;
  return (
    <section className="va-card va-tile" aria-label={kpi.label}>
      <div className="va-tile-top">
        <span className="va-tile-label" title={kpi.note}>{kpi.label}</span>
        <span className="va-ico"><Icon name={kpiIcon(kpi.key)} /></span>
      </div>
      <p className={`va-tile-value${none ? ' none' : ''}`}>{none ? '—' : formatMetric(kpi.value, kpi.format)}</p>
      {kpi.format === 'percent' && kpi.value !== null && (
        <span className="va-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, kpi.value * 100)}%` }} /></span>
      )}
      <div className="va-tile-foot">
        <Delta kpi={kpi} vs={vs} />
        {spark && <Sparkline values={spark} />}
      </div>
    </section>
  );
}

export function ListingTable({ rows, columns, initialSort, onSelect }: {
  rows: ListingRow[]; columns: ListingColumn[]; initialSort: ListingKey; onSelect: (listingId: string) => void;
}) {
  const [key, setKey] = useState<ListingKey>(initialSort);
  const sortKey = columns.some((c) => c.key === key) ? key : columns[columns.length - 1].key;
  const sorted = useMemo(() => sortListings(rows, sortKey), [rows, sortKey]);
  const top = Math.max(1, ...rows.map((r) => r[sortKey]));
  return (
    <div className="va-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Listing</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="num" aria-sort={sortKey === c.key ? 'descending' : undefined}>
                <button type="button" className={sortKey === c.key ? 'on' : ''} onClick={() => setKey(c.key)}>{c.label}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.listingId} className="va-row" onClick={() => onSelect(r.listingId)}>
              <th scope="row">
                <span className="va-listing">
                  <span className="va-rank">{i + 1}</span>
                  <span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(r.listingId); }}>{r.title}</button>
                    {r.publicationState && r.publicationState !== 'published' && <span className="va-tag">{label(r.publicationState)}</span>}
                    {r.publicationState === 'published' && r.availabilityStatus && r.availabilityStatus !== 'available' && <span className="va-tag">{label(r.availabilityStatus)}</span>}
                  </span>
                </span>
              </th>
              {columns.map((c) => (
                <td key={c.key} className="num">
                  {c.format === 'kes' ? kes.format(r[c.key]) : num.format(r[c.key])}
                  {c.key === sortKey && r[c.key] > 0 && <span className="va-cellbar" style={{ width: `${(r[c.key] / top) * 100}%` }} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Responsiveness({ current, previous }: { current: PeriodMetrics; previous: PeriodMetrics }) {
  const withinHour = current.chatThreads ? current.chatRepliedWithinHour / current.chatThreads : null;
  return (
    <div className="va-gauge">
      <Gauge value={withinHour} caption="within an hour" />
      <div className="va-stats">
        <div className="va-stat">
          <span>Chat reply</span>
          <span><b>{current.chatResponseMinutes === null ? '—' : formatMetric(current.chatResponseMinutes, 'duration')}</b>
            <Delta kpi={{ value: current.chatResponseMinutes, previous: previous.chatResponseMinutes, better: 'down' }} /></span>
        </div>
        <div className="va-stat">
          <span>Booking decision</span>
          <span><b>{current.bookingResponseMinutes === null ? '—' : formatMetric(current.bookingResponseMinutes, 'duration')}</b>
            <Delta kpi={{ value: current.bookingResponseMinutes, previous: previous.bookingResponseMinutes, better: 'down' }} /></span>
        </div>
        <div className="va-stat">
          <span>Chats answered</span>
          <b>{current.chatThreads ? formatMetric(current.chatReplied / current.chatThreads, 'percent') : '—'}</b>
        </div>
      </div>
    </div>
  );
}

export function GuestInterest({ current }: { current: PeriodMetrics }) {
  const parts = [
    { key: 'whatsapp', label: 'WhatsApp', value: current.contactWhatsapp, swatch: 'sw-c3' },
    { key: 'phone', label: 'Calls', value: current.contactPhone, swatch: 'sw-c1' },
    { key: 'email', label: 'Email', value: current.contactEmail, swatch: 'sw-c2' },
  ];
  return (
    <>
      <p className="va-readout">{num.format(contactTaps(current))}<small>contact taps</small></p>
      <MixBar parts={parts} />
      <ul className="va-legend">
        {parts.map((p) => <li key={p.key}><i className={p.swatch} />{p.label} <b>{num.format(p.value)}</b></li>)}
      </ul>
      <div className="va-mini">
        <div><span><Icon name="heart" size={14} />Likes</span><b>{num.format(current.likes)}</b></div>
        <div><span><Icon name="star" size={14} />Saves</span><b>{num.format(current.saves)}</b></div>
        <div><span><Icon name="share" size={14} />Shares</span><b>{num.format(current.shares)}</b></div>
      </div>
    </>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function DiningPanel({ dining }: { dining: DiningSummary }) {
  if (dining.total === 0) return <div className="va-empty">No table reservations yet</div>;
  const party = dining.total ? dining.guests / dining.total : null;
  const hours = dining.byHour.length
    ? (() => {
      const first = Math.min(...dining.byHour.map((h) => h.hour));
      const last = Math.max(...dining.byHour.map((h) => h.hour));
      const counts = new Map(dining.byHour.map((h) => [h.hour, h.count]));
      return Array.from({ length: last - first + 1 }, (_, i) => ({ label: `${String(first + i).padStart(2, '0')}h`, value: counts.get(first + i) || 0 }));
    })()
    : [];
  return (
    <div className="va-dining">
      <div className="va-mini">
        <div><span>Requests</span><b>{num.format(dining.total)}</b><Delta kpi={{ value: dining.total, previous: dining.previousTotal, better: 'up' }} /></div>
        <div><span>Guests</span><b>{num.format(dining.guests)}</b></div>
        <div><span>Avg party</span><b>{formatMetric(party, 'decimal')}</b></div>
        <div><span>Occasions</span><b>{num.format(dining.occasions)}</b></div>
      </div>
      <div><h3>Busiest days</h3><MiniColumns items={WEEKDAYS.map((d, i) => ({ label: d, value: dining.byWeekday[i] }))} /></div>
      <div><h3>Busiest times</h3>{hours.length ? <MiniColumns items={hours} /> : <div className="va-empty">—</div>}</div>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="va-stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= Math.round(value) ? '' : 'off'}><Icon name="star" size={16} filled /></span>)}
    </span>
  );
}

export function Reviews({ reviews }: { reviews: ReviewSummary }) {
  if (reviews.count === 0) return <div className="va-empty">No reviews yet</div>;
  const avg = reviews.average ?? 0;
  return (
    <>
      <div className="va-rating" aria-label={`${avg.toFixed(1)} out of 5 from ${reviews.count} reviews`}>
        <b>{avg.toFixed(1)}</b>
        <div><Stars value={avg} /><small>{num.format(reviews.count)} reviews{reviews.inPeriod ? ` · ${num.format(reviews.inPeriod)} new` : ''}</small></div>
      </div>
      {([5, 4, 3, 2, 1] as const).map((n) => (
        <div className="va-dist" key={n}>
          <span>{n}</span>
          <span className="t"><i style={{ width: `${(reviews.distribution[n] / reviews.count) * 100}%` }} /></span>
          <span className="n">{reviews.distribution[n]}</span>
        </div>
      ))}
    </>
  );
}

export function PlanPayments({ payments }: { payments: PlanPayment[] }) {
  if (!payments.length) return <div className="va-empty">No payments yet</div>;
  return (
    <div className="va-scroll">
      <table>
        <thead><tr><th scope="col">Date</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col" className="num">Amount</th></tr></thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.paidAt ? fmtDate(p.paidAt) : '—'}</th>
              <td>{p.plan}</td>
              <td><span className="va-pill"><i className={`st-${statusTone(p.status)}`} />{label(p.status)}</span></td>
              <td className="num">{kes.format(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The page's shape with no data: used while loading and behind the lock. */
export function GhostBento() {
  const block = (cls: string, h: number) => <div className={`va-skel ${cls}`} style={{ height: h }} />;
  return (
    <div className="va-bento" aria-hidden="true">
      <div className="va-skel va-hero" style={{ minHeight: 268, background: undefined }} />
      <div className="va-tiles">{Array.from({ length: 6 }, (_, i) => <div key={i} className="va-skel" style={{ height: 126 }} />)}</div>
      {block('s8', 340)}
      {block('s4', 340)}
      {block('s7', 300)}
      {block('s5', 300)}
    </div>
  );
}

export function LockedAnalytics({ niche }: { niche: HostNiche | null }) {
  const nicheLabel = niche ? NICHE_LABEL[niche] : null;
  return (
    <div className="va-locked">
      <GhostBento />
      <div className="va-lock">
        <section className="va-card" aria-labelledby="va-lock-title">
          <span className="va-ico"><Icon name="lock" size={22} /></span>
          <h2 id="va-lock-title">Unlock {nicheLabel ? `${nicheLabel} ` : ''}analytics</h2>
          <ul>{lockedFeatures(niche).map((feature) => <li key={feature}>{feature}</li>)}</ul>
          <Link className="va-cta" href="/pricing">See plans</Link>
        </section>
      </div>
    </div>
  );
}
