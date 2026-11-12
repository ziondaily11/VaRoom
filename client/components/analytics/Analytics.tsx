/** Host analytics dashboard, personalised to the host's niche. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CacheRead } from '../../lib/cache/createCache';
import {
  loadListingOptions, loadOverview, loadPlanPayments, overviewKey, peekListingOptions, peekOverview, peekPlanPayments,
} from '../../lib/analytics/analyticsCache';
import { analyticsCsv, fmtDate, formatMetric, granularityFor, isRangeKey, num, RANGE_LABEL, rangeFor } from '../../lib/analytics/format';
import { buildNicheView, NICHE_LABEL, trackingCovers, trendKeyFor } from '../../lib/analytics/niche';
import type { AnalyticsOverview, RangeKey } from '../../lib/analytics/types';
import { AreaChart, Funnel, RequestColumns, StatusStrip } from './AnalyticsCharts';
import {
  Card, DiningPanel, GhostBento, GuestInterest, Hero, ListingTable, LockedAnalytics, PlanPayments, Responsiveness, Reviews, Tile,
} from './AnalyticsSections';
import { Icon } from './analyticsIcons';
import ListingPicker from './ListingPicker';
import { ANALYTICS_CSS } from './analyticsStyles';

/* ---------- Cached loading ---------- */

interface Loaded<T> {
  data: T | null;
  /** The cache key `data` belongs to; differs from the requested key while a new one loads. */
  dataKey: string | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
}

type Loader<T> = (key: string, options: { force?: boolean; signal?: AbortSignal }) => Promise<T>;

/**
 * Render the cached value at once (even if stale), load only when it is
 * missing or stale, and keep showing the previous value while a new key loads.
 * Loads are shared through the cache, so remounts don't repeat requests.
 */
function useCachedLoad<T>(key: string | null, peek: (key: string) => CacheRead<T> | null, load: Loader<T>): Loaded<T> {
  const initial = key ? peek(key) : null;
  const [state, setState] = useState<{ data: T | null; dataKey: string | null; error: string | null; loading: boolean }>(() => ({
    data: initial ? initial.value : null,
    dataKey: initial ? key : null,
    error: null,
    loading: Boolean(key) && !(initial && initial.isFresh),
  }));
  const [attempt, setAttempt] = useState(0);
  const forceRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const peekRef = useRef(peek);
  peekRef.current = peek;

  useEffect(() => {
    if (!key) return undefined;
    const force = forceRef.current;
    forceRef.current = false;
    const cached = peekRef.current(key);
    if (cached && cached.isFresh && !force) {
      setState({ data: cached.value, dataKey: key, error: null, loading: false });
      return undefined;
    }
    setState((prev) => (cached
      ? { data: cached.value, dataKey: key, error: null, loading: true }
      : { ...prev, error: null, loading: true }));
    const controller = new AbortController();
    loadRef.current(key, { force, signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ data, dataKey: key, error: null, loading: false }); },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : 'Something went wrong.', loading: false }));
      },
    );
    return () => controller.abort();
  }, [key, attempt]);

  const retry = useCallback(() => { forceRef.current = true; setAttempt((n) => n + 1); }, []);
  return { ...state, retry };
}

const RANGE_STORAGE_KEY = 'varoom:analytics:range';
const RANGE_SHORT: Record<RangeKey, string> = { '30d': '30 days', '90d': '90 days', '12m': '12 months' };
const RANGE_VS: Record<RangeKey, string> = { '30d': 'vs prev 30d', '90d': 'vs prev 90d', '12m': 'vs prev year' };

function storedRange(): RangeKey {
  try {
    const value = window.sessionStorage.getItem(RANGE_STORAGE_KEY);
    return isRangeKey(value) ? value : '30d';
  } catch {
    return '30d';
  }
}

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Nairobi' }).format(now));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/* ---------- Dashboard ---------- */

function Dashboard({ data, rk, listingId, onListingChange, paymentsBody }: {
  data: AnalyticsOverview; rk: RangeKey; listingId: string | null; onListingChange: (id: string | null) => void; paymentsBody: ReactNode;
}) {
  const view = useMemo(() => buildNicheView(data), [data]);
  const g = granularityFor(rk);
  const vs = RANGE_VS[rk];
  const [metricKey, setMetricKey] = useState(view.trendMetrics[0].key);
  const metric = view.trendMetrics.find((m) => m.key === metricKey) || view.trendMetrics[0];
  const series = (kpiKey: string) => {
    const key = trendKeyFor(kpiKey);
    return key ? data.trend.map((p) => p[key]) : null;
  };
  const total = data.trend.reduce((s, p) => s + p[metric.key], 0);
  const hasRequests = data.trend.some((p) => p.requests > 0);
  const covered = trackingCovers(data.trackingSince, data.trend[0]?.bucket ?? '');

  const performance = (
    <Card
      key="performance" className="s8" title="Performance" icon="bolt"
      action={(
        <div className="va-tabs" role="group" aria-label="Chart metric">
          {view.trendMetrics.map((m) => (
            <button key={m.key} type="button" aria-pressed={metric.key === m.key} onClick={() => setMetricKey(m.key)}>{m.label}</button>
          ))}
        </div>
      )}
    >
      <p className="va-readout" style={{ marginBottom: 6 }}>{formatMetric(total, metric.format)}<small>{metric.label.toLowerCase()} · {RANGE_SHORT[rk]}</small></p>
      {data.trend.length ? <AreaChart points={data.trend} g={g} metric={metric} /> : <div className="va-empty">No activity yet</div>}
    </Card>
  );

  const funnel = (
    <Card
      key="funnel" className="s4" title={view.mode === 'sale' ? 'Views to enquiries' : 'Views to bookings'} icon="percent"
      action={!covered ? <span className="va-kicker" title="Listing views and contact taps are recorded from this date">{data.trackingSince ? `Since ${fmtDate(data.trackingSince)}` : 'Tracking started'}</span> : null}
    >
      <Funnel steps={view.funnel} />
    </Card>
  );

  const requests = (
    <Card className="s7" title={view.bookingsTitle} icon="inbox"
      action={<ul className="va-legend"><li><i className="sw-approved" />Approved</li><li><i className="sw-rest" />Other requests</li></ul>}>
      {hasRequests ? <RequestColumns points={data.trend} g={g} /> : <div className="va-empty">No requests yet</div>}
      <StatusStrip items={data.current.byStatus} />
    </Card>
  );
  const responsiveness = (span: string) => (
    <Card className={span} title="Reply speed" icon="clock"><Responsiveness current={data.current} previous={data.previous} /></Card>
  );
  const interest = (span: string) => (
    <Card className={span} title="Guest interest" icon="heart"><GuestInterest current={data.current} /></Card>
  );
  const listings = (
    <Card className="s8" title="Listings" icon="table" action={<span className="va-kicker">{num.format(data.listings.length)}</span>}>
      {data.listings.length
        ? <ListingTable rows={data.listings} columns={view.listingColumns} initialSort={view.listingSort} onSelect={onListingChange} />
        : <div className="va-empty">No listings yet</div>}
    </Card>
  );
  const reviews = (span: string) => (
    <Card className={span} title="Reviews" icon="star"><Reviews reviews={data.reviews} /></Card>
  );
  const payments = (span: string) => <Card className={span} title="What you pay VaRoom" icon="receipt">{paymentsBody}</Card>;
  const dining = view.showDining && data.dining
    ? <Card className="s12" title="Table reservations" icon="table"><DiningPanel dining={data.dining} /></Card>
    : null;
  const all = !listingId;

  // Rows are laid out explicitly so each one fills the 12 columns.
  return (
    <div className="va-bento">
      <Hero kpi={view.hero} spark={series(view.hero.key) || []} vs={vs} />
      <div className="va-tiles">
        {view.tiles.map((k) => <Tile key={k.key} kpi={k} spark={series(k.key)} vs={vs} />)}
      </div>
      {performance}
      {funnel}
      {view.showRequests ? (
        <>
          {requests}
          {interest('s5')}
          {all ? <>{listings}{responsiveness('s4')}</> : <>{responsiveness('s6')}{reviews('s6')}</>}
          {dining}
          {all ? <>{reviews('s4')}{payments('s8')}</> : payments('s12')}
        </>
      ) : (
        <>
          {interest('s7')}
          {responsiveness('s5')}
          {all ? <>{listings}{reviews('s4')}</> : null}
          {dining}
          {all ? payments('s12') : <>{reviews('s5')}{payments('s7')}</>}
        </>
      )}
    </div>
  );
}

/** The page's shape while the account or its analytics load. */
export function AnalyticsSkeleton() {
  return (
    <main className="va-analytics" aria-busy="true" aria-label="Loading analytics">
      <style dangerouslySetInnerHTML={{ __html: ANALYTICS_CSS }} />
      <div className="va-wrap">
        <header className="va-top">
          <div className="va-skel" style={{ width: 280, height: 40, borderRadius: 14 }} />
          <div className="va-skel" style={{ width: 260, height: 44, borderRadius: 999 }} />
        </header>
        <GhostBento />
      </div>
    </main>
  );
}

/* ---------- Page ---------- */

export default function HostAnalytics({ client, userId, firstName, listingId, onListingChange }: {
  client: SupabaseClient;
  userId: string;
  firstName: string | null;
  listingId: string | null;
  onListingChange: (listingId: string | null) => void;
}) {
  const [rk, setRk] = useState<RangeKey>(storedRange);
  const range = useMemo(() => rangeFor(rk), [rk]);
  const g = granularityFor(rk);
  const key = overviewKey(userId, range, g, listingId);

  const overview = useCachedLoad(key, peekOverview, (k, o) => loadOverview(client, k, range, g, listingId, o));
  const payments = useCachedLoad(userId, peekPlanPayments, (k, o) => loadPlanPayments(client, k, o));
  const options = useCachedLoad(userId, peekListingOptions, (k, o) => loadListingOptions(client, k, o));

  const chooseRange = (next: RangeKey) => {
    setRk(next);
    try { window.sessionStorage.setItem(RANGE_STORAGE_KEY, next); } catch { /* Storage unavailable. */ }
  };

  const data = overview.data;
  const full: AnalyticsOverview | null = data && data.access ? data : null;
  const stale = overview.dataKey !== key;
  const nicheLabel = data?.niche ? NICHE_LABEL[data.niche] : null;
  const ranges = Object.keys(RANGE_LABEL) as RangeKey[];

  const exportCsv = () => {
    if (!full) return;
    const view = buildNicheView(full);
    const name = `varoom-analytics-${range.from}-to-${range.to}${listingId ? '-listing' : ''}.csv`;
    downloadCsv(name, analyticsCsv(range, [...view.headline, ...view.secondary], view.listingColumns, full.listings));
  };

  // A listing that isn't on this account (or was deleted) falls back to all listings.
  const listingMissing = Boolean(listingId && options.data && !options.data.some((o) => o.id === listingId));
  useEffect(() => {
    if (listingMissing) onListingChange(null);
  }, [listingMissing, onListingChange]);

  return (
    <main className="va-analytics">
      <style dangerouslySetInnerHTML={{ __html: ANALYTICS_CSS }} />
      <div className="va-wrap">
        <header className="va-top">
          <div className="va-hello">
            {nicheLabel && <span className="va-chip">{nicheLabel}</span>}
            <h1>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          </div>
          {(!data || data.access) && (
            <div className="va-controls">
              {(options.data?.length ?? 0) > 1 && (
                <ListingPicker options={options.data || []} value={listingId} onChange={onListingChange} />
              )}
              <div className="va-segctl" role="group" aria-label="Date range">
                {ranges.map((k) => <button key={k} type="button" aria-pressed={rk === k} onClick={() => chooseRange(k)}>{RANGE_SHORT[k]}</button>)}
              </div>
              {full && (
                <button type="button" className="va-iconbtn" onClick={exportCsv} aria-label="Export CSV" title="Export CSV">
                  <Icon name="download" />
                </button>
              )}
            </div>
          )}
        </header>

        {overview.error && data && (
          <p className="va-banner" role="alert">
            Couldn&apos;t refresh. <button type="button" onClick={overview.retry}>Retry</button>
          </p>
        )}

        {!data && overview.error && (
          <div className="va-card va-empty" role="alert" style={{ gap: 12 }}>
            <p>Couldn&apos;t load your analytics.</p>
            <button type="button" className="va-retry" onClick={overview.retry}>Retry</button>
          </div>
        )}

        {!data && !overview.error && <div aria-busy="true" aria-label="Loading analytics"><GhostBento /></div>}

        {data && !data.access && <LockedAnalytics niche={data.niche} />}

        {full && (
          <div className={stale ? 'va-stale' : undefined} aria-busy={stale}>
            <Dashboard
              key={`${full.niche}:${listingId || 'all'}`} data={full} rk={rk} listingId={listingId} onListingChange={onListingChange}
              paymentsBody={payments.data
                ? <PlanPayments payments={payments.data} />
                : payments.error
                  ? <div className="va-empty"><button type="button" className="va-retry" onClick={payments.retry}>Retry</button></div>
                  : <div className="va-skel" style={{ height: 80 }} />}
            />
          </div>
        )}
      </div>
    </main>
  );
}
