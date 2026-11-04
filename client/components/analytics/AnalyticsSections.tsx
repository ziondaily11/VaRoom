import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fmtDate, formatMetric, kes, label, num } from '../../lib/analytics/format';
import { change, lockedFeatures, NICHE_LABEL, sortListings, type Kpi, type ListingColumn, type ListingKey } from '../../lib/analytics/niche';
import type { DiningSummary, HostNiche, ListingRow, PeriodMetrics, PlanPayment, ReviewSummary } from '../../lib/analytics/types';
import { HourBars, StatusBar, tone, WeekdayBars } from './AnalyticsCharts';

// Sections of the analytics page. Each takes ready data; loading and errors
// are handled once by the page.

export const Block = ({ title, note, children, className = '' }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`va-block ${className}`}>
    <h2>{title}</h2>
    {note && <p className="va-note">{note}</p>}
    {children}
  </section>
);

export function Delta({ kpi }: { kpi: Pick<Kpi, 'value' | 'previous' | 'better'> }) {
  const ch = change(kpi.value, kpi.previous);
  if (ch === null) return null;
  if (ch === 'new') {
    return <span className={`va-delta ${kpi.better === 'up' ? 'up' : 'down'}`} aria-label="Up from none in the previous period">New</span>;
  }
  if (Math.abs(ch) < 0.005) return <span className="va-delta flat" aria-label="No change on the previous period">No change</span>;
  const rising = ch > 0;
  const good = rising === (kpi.better === 'up');
  const amount = formatMetric(Math.abs(ch), 'percent');
  return (
    <span className={`va-delta ${good ? 'up' : 'down'}`} aria-label={`${rising ? 'Up' : 'Down'} ${amount} on the previous period`}>
      {rising ? '▲' : '▼'} {amount}
    </span>
  );
}

export function KpiList({ items, secondary = false }: { items: Kpi[]; secondary?: boolean }) {
  return (
    <dl className={`va-kpis${secondary ? ' secondary' : ''}`}>
      {items.map((k) => (
        <div key={k.key}>
          <dt>{k.label}</dt>
          <dd>{formatMetric(k.value, k.format)}<Delta kpi={k} /></dd>
          <small>{k.note}</small>
        </div>
      ))}
    </dl>
  );
}

export function ListingTable({ rows, columns, initialSort, onSelect }: {
  rows: ListingRow[];
  columns: ListingColumn[];
  initialSort: ListingKey;
  onSelect: (listingId: string) => void;
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
          {sorted.map((r) => (
            <tr key={r.listingId} className="va-click" onClick={() => onSelect(r.listingId)}>
              <th scope="row">
                <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(r.listingId); }} aria-label={`Show analytics for ${r.title}`}>{r.title}</button>
                {r.publicationState && r.publicationState !== 'published' && <span className="va-tag">{label(r.publicationState)}</span>}
                {r.publicationState === 'published' && r.availabilityStatus && r.availabilityStatus !== 'available' && <span className="va-tag">{label(r.availabilityStatus)}</span>}
              </th>
              {columns.map((c) => (
                <td key={c.key} className="num">
                  {c.key === sortKey && <span className="va-bar" style={{ width: `${(r[c.key] / top) * 100}%` }} />}
                  {c.format === 'kes' ? kes.format(r[c.key]) : num.format(r[c.key])}
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
  const prevWithinHour = previous.chatThreads ? previous.chatRepliedWithinHour / previous.chatThreads : null;
  const replied = current.chatThreads ? current.chatReplied / current.chatThreads : null;
  const items: Kpi[] = [
    { key: 'chat', label: 'Chat reply time', value: current.chatResponseMinutes, previous: previous.chatResponseMinutes, format: 'duration', note: `Median, across ${num.format(current.chatThreads)} new chats`, better: 'down' },
    { key: 'hour', label: 'Replied within an hour', value: withinHour, previous: prevWithinHour, format: 'percent', note: replied === null ? 'No new chats yet' : `${formatMetric(replied, 'percent')} of chats answered at all`, better: 'up' },
    { key: 'booking', label: 'Booking response time', value: current.bookingResponseMinutes, previous: previous.bookingResponseMinutes, format: 'duration', note: `Median, across ${num.format(current.bookingResponses)} decisions`, better: 'down' },
  ];
  return <KpiList items={items} secondary />;
}

export function DiningBlock({ dining }: { dining: DiningSummary }) {
  if (dining.total === 0) return <p className="va-msg">No table reservation requests in this period.</p>;
  const party = dining.total ? dining.guests / dining.total : null;
  const items: Kpi[] = [
    { key: 'requests', label: 'Requests', value: dining.total, previous: dining.previousTotal, format: 'count', note: 'Table reservation requests', better: 'up' },
    { key: 'guests', label: 'Guests', value: dining.guests, previous: null, format: 'count', note: `${num.format(dining.tables)} tables requested`, better: 'up' },
    { key: 'party', label: 'Average party', value: party, previous: null, format: 'decimal', note: 'Guests per request', better: 'up' },
    { key: 'occasions', label: 'Special occasions', value: dining.occasions, previous: null, format: 'count', note: 'Birthdays, anniversaries and more', better: 'up' },
  ];
  return (
    <>
      <KpiList items={items} secondary />
      <StatusBar items={dining.byStatus} />
      <h3 className="va-sub">Requested days</h3>
      <WeekdayBars counts={dining.byWeekday} />
      {dining.byHour.length > 0 && (
        <>
          <h3 className="va-sub">Requested times</h3>
          <HourBars hours={dining.byHour} />
        </>
      )}
    </>
  );
}

export function ReviewsBlock({ reviews }: { reviews: ReviewSummary }) {
  if (reviews.count === 0) return <p className="va-msg">No reviews yet. Ratings appear after guests review a completed stay.</p>;
  return (
    <div className="va-reviews">
      <p className="va-avg">
        <b>{reviews.average?.toFixed(1)}</b> out of 5
        <small>from {num.format(reviews.count)} reviews{reviews.inPeriod ? `, ${num.format(reviews.inPeriod)} new in this period` : ''}</small>
      </p>
      {([5, 4, 3, 2, 1] as const).map((n) => (
        <div className="va-dist" key={n}>
          <span>{n} star</span>
          <span className="va-track"><i style={{ width: `${(reviews.distribution[n] / reviews.count) * 100}%` }} /></span>
          <span className="num">{reviews.distribution[n]}</span>
        </div>
      ))}
    </div>
  );
}

export function PlanPayments({ payments }: { payments: PlanPayment[] }) {
  if (!payments.length) return <p className="va-msg">No subscription payments recorded.</p>;
  return (
    <div className="va-scroll">
      <table>
        <thead><tr><th scope="col">Date</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col" className="num">Amount</th></tr></thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.paidAt ? fmtDate(p.paidAt) : 'Not paid'}</th>
              <td>{p.plan}</td>
              <td><span className={`va-pill t-${tone(p.status)}`}>{label(p.status)}</span></td>
              <td className="num">{kes.format(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LockedAnalytics({ niche }: { niche: HostNiche | null }) {
  const nicheLabel = niche ? NICHE_LABEL[niche] : null;
  return (
    <section className="va-lock" aria-labelledby="va-lock-title">
      <p className="va-eyebrow">Included with every VaRoom plan</p>
      <h2 id="va-lock-title">See how your {nicheLabel ? `${nicheLabel.toLowerCase()} ` : ''}listings perform</h2>
      <p className="va-note">Analytics is part of your VaRoom subscription. Choose a plan to unlock:</p>
      <ul>{lockedFeatures(niche).map((feature) => <li key={feature}>{feature}</li>)}</ul>
      <Link className="va-cta" href="/pricing">See plans</Link>
    </section>
  );
}
