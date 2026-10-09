/**
 * HostAnalytics.tsx: VaRoom host analytics, front end only.
 * Wire-up: implement HostAnalyticsApi and render <HostAnalytics api={yourApi} />.
 * Without an api prop it shows clearly labelled sample data. Only dependency: react.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/* ---------- Data contract (shape your real API must return) ---------- */
export type RangeKey = '30d' | '90d' | '12m';
export type Granularity = 'day' | 'week' | 'month';
export interface DateRange { from: string; to: string } // yyyy-mm-dd, inclusive
export interface StatusCount { status: string; count: number }
export interface BookingSummary {
  requests: number;
  byStatus: StatusCount[];
  approvedCount: number;
  approvedValue: number; // sum of quoted total_price for approved bookings
  averageApprovedValue: number | null; // null when nothing approved
  completedStays: number; // approved bookings whose end date has passed
}
export interface TrendPoint { bucket: string; requests: number; approvedValue: number } // bucket = yyyy-mm-dd
export interface ListingRow { listingId: string; title: string; requests: number; approved: number; approvedValue: number }
export interface ReservationSummary {
  total: number; guests: number; tables: number;
  byStatus: StatusCount[];
  byWeekday: number[]; // length 7, Monday first
}
export interface ReviewSummary { average: number | null; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> }
export interface PlanPayment { id: string; paidAt: string; plan: string; amount: number; status: string }

export interface HostAnalyticsApi {
  isMock?: boolean;
  getBookingSummary(range: DateRange, signal: AbortSignal): Promise<BookingSummary>;
  getBookingTrend(range: DateRange, granularity: Granularity, signal: AbortSignal): Promise<TrendPoint[]>;
  getListingRanking(range: DateRange, signal: AbortSignal): Promise<ListingRow[]>;
  /** Resolve null when the host has no hotel listings; the dining section is then hidden. */
  getReservationSummary(range: DateRange, signal: AbortSignal): Promise<ReservationSummary | null>;
  getReviewSummary(signal: AbortSignal): Promise<ReviewSummary>;
  getPlanPayments(signal: AbortSignal): Promise<PlanPayment[]>;
}

/* ---------- Sample data (swap for your real api) ---------- */
export type Section = 'summary' | 'trend' | 'listings' | 'reservations' | 'reviews' | 'plan';
const DAY = 86400000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Options let you preview the empty state and per-section errors. */
export function createMockApi(o: { delayMs?: number; empty?: boolean; failing?: Section[] } = {}): HostAnalyticsApi {
  const { delayMs = 500, empty = false, failing = [] } = o;
  const run = <T,>(s: Section, make: () => T): Promise<T> =>
    new Promise((res, rej) =>
      setTimeout(() => (failing.includes(s) ? rej(new Error(`Sample failure in "${s}".`)) : res(make())), delayMs));
  const span = (r: DateRange) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / DAY) + 1;

  return {
    isMock: true,
    getBookingSummary: (range) => run('summary', () => {
      if (empty) return { requests: 0, byStatus: [], approvedCount: 0, approvedValue: 0, averageApprovedValue: null, completedStays: 0 };
      const requests = Math.round((40 * span(range)) / 30);
      const approved = Math.round(requests * 0.55), declined = Math.round(requests * 0.2), expired = Math.round(requests * 0.1);
      return {
        requests, approvedCount: approved, approvedValue: approved * 21500, averageApprovedValue: 21500,
        completedStays: Math.round(approved * 0.7),
        byStatus: [
          { status: 'approved', count: approved }, { status: 'pending', count: requests - approved - declined - expired },
          { status: 'declined', count: declined }, { status: 'expired', count: expired },
        ],
      };
    }),
    getBookingTrend: (range, g) => run('trend', () => {
      if (empty) return [];
      const step = g === 'day' ? 1 : g === 'week' ? 7 : 30;
      const r = seeded(step * 7 + 1);
      const out: TrendPoint[] = [];
      for (let t = Date.parse(range.from); t <= Date.parse(range.to); t += step * DAY) {
        const requests = Math.round((g === 'day' ? 1 : step / 2) * (1 + r() * 3));
        out.push({ bucket: new Date(t).toISOString().slice(0, 10), requests, approvedValue: Math.round(requests * 0.55 * (15000 + r() * 12000)) });
      }
      return out;
    }),
    getListingRanking: (range) => run('listings', () => {
      if (empty) return [];
      const f = span(range) / 30;
      return [
        { listingId: 'l1', title: 'Karen garden cottage', requests: 18, approved: 11, approvedValue: 264000 },
        { listingId: 'l2', title: 'Westlands studio', requests: 14, approved: 7, approvedValue: 119000 },
        { listingId: 'l3', title: 'Diani beach villa', requests: 9, approved: 3, approvedValue: 141000 },
        { listingId: 'l4', title: 'Nakuru conference hall', requests: 4, approved: 1, approvedValue: 30000 },
      ].map((l) => ({ ...l, requests: Math.round(l.requests * f), approved: Math.round(l.approved * f), approvedValue: Math.round(l.approvedValue * f) }));
    }),
    getReservationSummary: (range) => run('reservations', () => {
      if (empty) return null;
      const f = span(range) / 30;
      return {
        total: Math.round(26 * f), guests: Math.round(88 * f), tables: Math.round(31 * f),
        byStatus: [{ status: 'requested', count: Math.round(9 * f) }, { status: 'contacted', count: Math.round(6 * f) }, { status: 'closed', count: Math.round(11 * f) }],
        byWeekday: [2, 3, 4, 3, 7, 9, 6].map((n) => Math.round(n * f)),
      };
    }),
    getReviewSummary: () => run('reviews', () =>
      empty ? { average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }
        : { average: 4.6, count: 37, distribution: { 1: 0, 2: 1, 3: 3, 4: 8, 5: 25 } }),
    getPlanPayments: () => run('plan', () =>
      empty ? [] : [
        { id: 'p2', paidAt: '2026-09-01', plan: 'Pro', amount: 2500, status: 'paid' },
        { id: 'p1', paidAt: '2026-08-01', plan: 'Pro', amount: 2500, status: 'paid' },
      ]),
  };
}

/* ---------- Helpers ---------- */
type AsyncState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

function useSection<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    setState({ status: 'loading' });
    load(ac.signal).then(
      (data) => { if (!ac.signal.aborted) setState({ status: 'ready', data }); },
      (e: unknown) => { if (!ac.signal.aborted) setState({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error.' }); },
    );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return [state, () => setTick((t) => t + 1)];
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const kes = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-KE');
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDate = (iso: string, g: Granularity = 'day') =>
  new Date(iso).toLocaleDateString('en-KE', { timeZone: 'UTC', ...(g === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }) });
const tone = (s: string) =>
  (({ approved: 'good', paid: 'good', pending: 'warn', requested: 'warn', contacted: 'info', declined: 'bad', failed: 'bad' }) as Record<string, string>)[s.toLowerCase()] ?? 'mute';

function rangeFor(k: RangeKey): DateRange {
  const days = k === '30d' ? 30 : k === '90d' ? 90 : 365;
  const to = new Date();
  return { from: ymd(new Date(to.getTime() - (days - 1) * DAY)), to: ymd(to) };
}

/* ---------- Building blocks ---------- */
function Async<T>({ state, retry, isEmpty, emptyText, children }: {
  state: AsyncState<T>; retry: () => void; isEmpty?: (d: T) => boolean; emptyText: string; children: (d: T) => ReactNode;
}) {
  if (state.status === 'loading') return <div className="va-skel" aria-busy="true" aria-label="Loading" />;
  if (state.status === 'error')
    return (
      <div className="va-msg" role="alert">
        <p>Couldn&apos;t load this section. {state.message}</p>
        <button type="button" onClick={retry}>Try again</button>
      </div>
    );
  if (isEmpty?.(state.data)) return <p className="va-msg">{emptyText}</p>;
  return <>{children(state.data)}</>;
}

const Block = ({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) => (
  <section className={`va-block ${className}`}>
    <h2>{title}</h2>
    {note && <p className="va-note">{note}</p>}
    {children}
  </section>
);

function StatusBar({ items }: { items: StatusCount[] }) {
  const shown = items.filter((i) => i.count > 0);
  return (
    <>
      <div className="va-seg" role="img" aria-label={shown.map((i) => `${label(i.status)} ${i.count}`).join(', ')}>
        {shown.map((i) => <span key={i.status} className={`t-${tone(i.status)}`} style={{ flex: `${i.count} 1 0` }} />)}
      </div>
      <ul className="va-legend">
        {items.map((i) => (
          <li key={i.status}><i className={`t-${tone(i.status)}`} />{label(i.status)} <b>{num.format(i.count)}</b></li>
        ))}
      </ul>
    </>
  );
}

function TrendChart({ points, g }: { points: TrendPoint[]; g: Granularity }) {
  const [metric, setMetric] = useState<'approvedValue' | 'requests'>('approvedValue');
  const [hover, setHover] = useState<number | null>(null);
  const [ref, w] = useWidth();
  const H = 220, m = { t: 12, r: 12, b: 26, l: 46 };
  const vals = points.map((p) => p[metric]);
  const max = Math.max(1, ...vals), iw = w - m.l - m.r, ih = H - m.t - m.b;
  const x = (i: number) => m.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(vals.length - 1).toFixed(1)},${m.t + ih}L${x(0).toFixed(1)},${m.t + ih}Z`;
  const fmt = (n: number) => (metric === 'requests' ? num.format(n) : kes.format(n));
  const every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 72)));
  const total = vals.reduce((s, v) => s + v, 0);
  const readout = hover !== null ? `${fmtDate(points[hover].bucket, g)}: ${fmt(vals[hover])}` : `Total ${fmt(total)}`;

  return (
    <div>
      <div className="va-row">
        <div className="va-tabs" role="group" aria-label="Chart metric">
          <button type="button" aria-pressed={metric === 'approvedValue'} onClick={() => setMetric('approvedValue')}>Approved booking value</button>
          <button type="button" aria-pressed={metric === 'requests'} onClick={() => setMetric('requests')}>Requests</button>
        </div>
        <p className="va-readout" aria-live="polite">{readout}</p>
      </div>
      <div ref={ref}>
        <svg
          width={w} height={H} role="img" aria-label={`${metric === 'requests' ? 'Requests' : 'Approved booking value'} over time. ${readout}`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - m.l) / iw) * (points.length - 1));
            setHover(Math.min(points.length - 1, Math.max(0, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line className="va-grid" x1={m.l} x2={w - m.r} y1={y(t * max)} y2={y(t * max)} />
              <text className="va-axis" x={m.l - 8} y={y(t * max) + 4} textAnchor="end">{short(t * max)}</text>
            </g>
          ))}
          <path className="va-area" d={area} />
          <path className="va-line" d={line} />
          {points.map((p, i) => i % every === 0 && (
            <text key={p.bucket} className="va-axis" x={x(i)} y={H - 6} textAnchor="middle">{fmtDate(p.bucket, g)}</text>
          ))}
          {hover !== null && (
            <g>
              <line className="va-grid" x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} />
              <circle className="va-dot" cx={x(hover)} cy={y(vals[hover])} r={4.5} />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

function ListingTable({ rows }: { rows: ListingRow[] }) {
  type K = 'approvedValue' | 'requests' | 'approved';
  const [key, setKey] = useState<K>('approvedValue');
  const sorted = useMemo(() => [...rows].sort((a, b) => b[key] - a[key]), [rows, key]);
  const top = Math.max(1, ...rows.map((r) => r.approvedValue));
  const th = (k: K, text: string) => (
    <th scope="col" className="num" aria-sort={key === k ? 'descending' : undefined}>
      <button type="button" className={key === k ? 'on' : ''} onClick={() => setKey(k)}>{text}</button>
    </th>
  );
  return (
    <div className="va-scroll">
      <table>
        <thead><tr><th scope="col">Listing</th>{th('requests', 'Requests')}{th('approved', 'Approved')}{th('approvedValue', 'Booking value')}</tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.listingId}>
              <th scope="row">{r.title}</th>
              <td className="num">{num.format(r.requests)}</td>
              <td className="num">{num.format(r.approved)}</td>
              <td className="num"><span className="va-bar" style={{ width: `${(r.approvedValue / top) * 100}%` }} />{kes.format(r.approvedValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Page ---------- */
export default function HostAnalytics({ api }: { api?: HostAnalyticsApi }) {
  const client = useMemo(() => api ?? createMockApi(), [api]);
  const [rk, setRk] = useState<RangeKey>('30d');
  const range = useMemo(() => rangeFor(rk), [rk]);
  const g: Granularity = rk === '30d' ? 'day' : rk === '90d' ? 'week' : 'month';

  const [summary, reSummary] = useSection((s) => client.getBookingSummary(range, s), [client, range]);
  const [trend, reTrend] = useSection((s) => client.getBookingTrend(range, g, s), [client, range, g]);
  const [listings, reListings] = useSection((s) => client.getListingRanking(range, s), [client, range]);
  const [dining, reDining] = useSection((s) => client.getReservationSummary(range, s), [client, range]);
  const [reviews, reReviews] = useSection((s) => client.getReviewSummary(s), [client]);
  const [plan, rePlan] = useSection((s) => client.getPlanPayments(s), [client]);

  const ranges: [RangeKey, string][] = [['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['12m', 'Last 12 months']];
  const hideDining = dining.status === 'ready' && dining.data === null;

  return (
    <main className="va-analytics">
      <style>{css}</style>
      <div className="va-wrap">
      <header className="va-head">
        <div>
          <h1>Analytics</h1>
          <p className="va-note">Your bookings, dining reservations, and reviews on VaRoom.</p>
          {client.isMock && <p className="va-badge">Sample data. These are not your real results.</p>}
        </div>
        <div className="va-tabs" role="group" aria-label="Date range">
          {ranges.map(([k, text]) => <button key={k} type="button" aria-pressed={rk === k} onClick={() => setRk(k)}>{text}</button>)}
        </div>
      </header>

      <div className="va-grid">
      <Block title="Bookings">
        <Async state={summary} retry={reSummary} isEmpty={(d) => d.requests === 0}
          emptyText="No booking requests in this period. They will appear here as guests request your listings.">
          {(d) => (
            <>
              <dl className="va-kpis">
                <div><dt>Booking requests</dt><dd>{num.format(d.requests)}</dd><small>Created in this period</small></div>
                <div><dt>Approved bookings</dt><dd>{num.format(d.approvedCount)}</dd><small>Requests you approved</small></div>
                <div><dt>Approved booking value</dt><dd>{kes.format(d.approvedValue)}</dd><small>Quoted price. Not money collected or a payout.</small></div>
                <div><dt>Average booking value</dt><dd>{d.averageApprovedValue === null ? 'None yet' : kes.format(d.averageApprovedValue)}</dd><small>Per approved booking</small></div>
              </dl>
              <StatusBar items={d.byStatus} />
              <p className="va-note">Completed stays: <b>{num.format(d.completedStays)}</b>, counted as approved bookings whose end date has passed.</p>
            </>
          )}
        </Async>
      </Block>

      <Block title="Over time" className="va-s7" note={`Grouped by ${g}, using the date each request was created.`}>
        <Async state={trend} retry={reTrend} isEmpty={(d) => d.length === 0} emptyText="Nothing to chart yet for this period.">
          {(d) => <TrendChart points={d} g={g} />}
        </Async>
      </Block>

      <Block title="Listings" className="va-s5" note="Ranked by recorded bookings. Views and conversion are not tracked yet.">
        <Async state={listings} retry={reListings} isEmpty={(d) => d.length === 0} emptyText="Publish a listing and its bookings will be ranked here.">
          {(d) => <ListingTable rows={d} />}
        </Async>
      </Block>

      <div className="va-row3">
        {!hideDining && (
          <Block title="Table reservations" note="Requests only. Payments for dining are not recorded.">
            <Async state={dining} retry={reDining} isEmpty={(d) => !d || d.total === 0} emptyText="No table reservation requests in this period.">
              {(d) => d && (
                <>
                  <dl className="va-kpis small">
                    <div><dt>Requests</dt><dd>{num.format(d.total)}</dd></div>
                    <div><dt>Guests</dt><dd>{num.format(d.guests)}</dd></div>
                    <div><dt>Tables</dt><dd>{num.format(d.tables)}</dd></div>
                  </dl>
                  <StatusBar items={d.byStatus} />
                  <div className="va-days" role="img" aria-label={`Requests by weekday: ${d.byWeekday.join(', ')} (Monday first)`}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                      <div key={day}><span style={{ height: `${(d.byWeekday[i] / Math.max(1, ...d.byWeekday)) * 100}%` }} /><small>{day}</small></div>
                    ))}
                  </div>
                </>
              )}
            </Async>
          </Block>
        )}
        <Block title="Reviews" note="Published reviews only.">
          <Async state={reviews} retry={reReviews} isEmpty={(d) => d.count === 0} emptyText="No reviews yet. Ratings appear after guests review a completed stay.">
            {(d) => (
              <div className="va-reviews">
                <p className="va-avg"><b>{d.average?.toFixed(1)}</b> out of 5 <small>from {num.format(d.count)} reviews</small></p>
                {([5, 4, 3, 2, 1] as const).map((n) => (
                  <div className="va-dist" key={n}>
                    <span>{n} star</span>
                    <span className="va-track"><i style={{ width: `${(d.distribution[n] / d.count) * 100}%` }} /></span>
                    <span className="num">{d.distribution[n]}</span>
                  </div>
                ))}
              </div>
            )}
          </Async>
        </Block>

      <Block title="What you pay VaRoom" className="va-plan" note="Your subscription payments to VaRoom. These are not guest payments or income.">
        <Async state={plan} retry={rePlan} isEmpty={(d) => d.length === 0} emptyText="No subscription payments recorded.">
          {(d) => (
            <div className="va-scroll">
              <table>
                <thead><tr><th scope="col">Date</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col" className="num">Amount</th></tr></thead>
                <tbody>
                  {d.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">{fmtDate(p.paidAt)}</th>
                      <td>{p.plan}</td>
                      <td><span className={`va-pill t-${tone(p.status)}`}>{label(p.status)}</span></td>
                      <td className="num">{kes.format(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Block>
      </div>
      </div>
      </div>
    </main>
  );
}

/* ---------- Styles (scoped to .va-analytics; dark via OS setting, [data-theme="dark"] or .dark) ---------- */
const css = `
.va-analytics{--bg:#fff;--fg:#000;--mute:#5c5c5c;--line:#dcdcdc;--soft:#f3f3f3;--accent:#C41E3A;--good:#1f7a4d;--warn:#a66300;--bad:#C41E3A;--info:#2a5db0;--dim:#8a8a8a;
  width:100%;min-height:100vh;background:var(--bg);color:var(--fg);font-family:inherit;line-height:1.5;font-variant-numeric:tabular-nums}
:root:has(.va-analytics) body{margin:0}
.va-wrap{max-width:1680px;margin:0 auto;padding:clamp(16px,3.5vw,56px)}
.va-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:48px}
.va-grid>.va-block{grid-column:1/-1}
@media (min-width:1100px){.va-grid>.va-s7{grid-column:span 7}.va-grid>.va-s5{grid-column:span 5}}
.va-row3{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));column-gap:48px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .va-analytics{--bg:#000;--fg:#fff;--mute:#a6a6a6;--line:#2e2e2e;--soft:#151515;--accent:#e0425e;--good:#4cc38a;--warn:#e0a23b;--bad:#ef6a80;--info:#7aa5f2;--dim:#6d6d6d}}
:root[data-theme="dark"] .va-analytics,.dark .va-analytics{--bg:#000;--fg:#fff;--mute:#a6a6a6;--line:#2e2e2e;--soft:#151515;--accent:#e0425e;--good:#4cc38a;--warn:#e0a23b;--bad:#ef6a80;--info:#7aa5f2;--dim:#6d6d6d}
.va-analytics *{box-sizing:border-box}
.va-analytics h1{font-size:clamp(1.6rem,4vw,2.2rem);line-height:1.15;margin:0;font-weight:700;letter-spacing:-.02em}
.va-analytics h2{font-size:1.15rem;margin:0 0 4px;font-weight:650}
.va-analytics p{margin:0}
.va-analytics button{font:inherit;color:inherit;cursor:pointer}
.va-analytics :is(button,svg):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.va-head{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-end;padding-bottom:20px}
.va-note{color:var(--mute);font-size:.9rem;max-width:62ch}
.va-badge{display:inline-block;margin-top:10px;padding:2px 10px;border:1px solid var(--accent);color:var(--accent);border-radius:999px;font-size:.85rem}
.va-block{border-top:1px solid var(--line);padding:24px 0}
.va-block>.va-note{margin-bottom:14px}
.va-tabs{display:inline-flex;flex-wrap:wrap;gap:4px}
.va-tabs button{padding:6px 12px;border:1px solid var(--line);background:transparent;border-radius:999px;font-size:.88rem}
.va-tabs button[aria-pressed="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.va-row{display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:space-between;align-items:center;margin-bottom:8px}
.va-readout{font-weight:600}
.va-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:0 0 20px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.va-kpis>div{padding:16px 16px 16px 0}
.va-kpis dt{color:var(--mute);font-size:.88rem}
.va-kpis dd{margin:2px 0;font-size:clamp(1.4rem,3.4vw,1.95rem);font-weight:700;letter-spacing:-.02em}
.va-kpis small{color:var(--mute);font-size:.8rem;display:block}
.va-kpis.small{grid-template-columns:repeat(3,1fr)}
.va-kpis.small dd{font-size:1.4rem}
.va-seg{display:flex;gap:2px;height:12px;margin-bottom:10px}
.va-seg span{border-radius:2px;background:var(--c,var(--dim))}
.va-legend{display:flex;flex-wrap:wrap;gap:6px 18px;list-style:none;margin:0 0 12px;padding:0;font-size:.9rem}
.va-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:var(--c,var(--dim))}
.t-good{--c:var(--good)}.t-warn{--c:var(--warn)}.t-bad{--c:var(--bad)}.t-info{--c:var(--info)}.t-mute{--c:var(--dim)}
.va-grid{stroke:var(--line);stroke-width:1}
.va-axis{fill:var(--mute);font-size:11px}
.va-line{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.va-area{fill:var(--accent);opacity:.1}
.va-dot{fill:var(--bg);stroke:var(--accent);stroke-width:2.5}
.va-scroll{overflow-x:auto}
.va-analytics .va-plan table{min-width:340px}
.va-analytics table{width:100%;border-collapse:collapse;font-size:.92rem;min-width:460px}
.va-analytics th,.va-analytics td{padding:10px 8px 10px 0;border-bottom:1px solid var(--line);text-align:left;font-weight:400}
.va-analytics thead th{color:var(--mute);font-weight:500}
.va-analytics tbody th{font-weight:600}
.va-analytics .num{text-align:right;padding-right:0;padding-left:8px}
.va-analytics th button{background:none;border:0;padding:0;color:inherit}
.va-analytics th button.on{color:var(--fg);font-weight:700;text-decoration:underline;text-underline-offset:4px;text-decoration-color:var(--accent)}
td .va-bar{display:block;height:4px;margin:0 0 4px auto;background:var(--accent);border-radius:2px;opacity:.8}
.va-pill{padding:2px 10px;border-radius:999px;font-size:.82rem;border:1px solid var(--c,var(--dim));color:var(--c,var(--mute))}
.va-days{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;height:110px;align-items:end;margin-top:12px}
.va-days div{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px}
.va-days span{width:100%;background:var(--accent);border-radius:3px 3px 0 0;min-height:2px}
.va-days small{color:var(--mute);font-size:.78rem}
.va-avg b{font-size:2.3rem;letter-spacing:-.02em;margin-right:4px}
.va-avg small{color:var(--mute);margin-left:6px}
.va-dist{display:grid;grid-template-columns:52px 1fr 28px;gap:10px;align-items:center;font-size:.88rem;margin-top:6px}
.va-track{height:8px;background:var(--soft);border-radius:4px;overflow:hidden}
.va-track i{display:block;height:100%;background:var(--accent)}
.va-skel{height:120px;border-radius:6px;background:linear-gradient(90deg,var(--soft),var(--line),var(--soft));background-size:200% 100%;animation:va-sh 1.4s linear infinite}
@keyframes va-sh{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.va-skel{animation:none}}
.va-msg{padding:16px;border:1px dashed var(--line);border-radius:6px;color:var(--mute)}
.va-msg button{margin-top:10px;padding:6px 14px;border:1px solid var(--fg);background:transparent;border-radius:999px}
`;
