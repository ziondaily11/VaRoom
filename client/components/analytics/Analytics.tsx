/** Host analytics dashboard, personalised to the host's niche. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CacheRead } from '../../lib/cache/createCache';
import {
  loadListingOptions, loadOverview, loadPlanPayments, overviewKey, peekListingOptions, peekOverview, peekPlanPayments,
} from '../../lib/analytics/analyticsCache';
import { analyticsCsv, fmtDate, granularityFor, isRangeKey, num, RANGE_DAYS, RANGE_LABEL, rangeFor } from '../../lib/analytics/format';
import { buildNicheView, NICHE_LABEL, trackingCovers } from '../../lib/analytics/niche';
import type { AnalyticsOverview, RangeKey } from '../../lib/analytics/types';
import { Funnel, StatusBar, TrendChart } from './AnalyticsCharts';
import {
  Block, DiningBlock, KpiList, ListingTable, LockedAnalytics, PlanPayments, Responsiveness, ReviewsBlock,
} from './AnalyticsSections';
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

/* ---------- Page ---------- */

export default function HostAnalytics({ client, userId, listingId, onListingChange }: {
  client: SupabaseClient;
  userId: string;
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
  const view = useMemo(() => (full ? buildNicheView(full) : null), [full]);
  const stale = overview.dataKey !== key;
  const nicheLabel = data?.niche ? NICHE_LABEL[data.niche] : null;
  const selected = listingId ? (options.data || []).find((o) => o.id === listingId) : null;
  const ranges = Object.keys(RANGE_LABEL) as RangeKey[];

  const exportCsv = () => {
    if (!full || !view) return;
    const name = `varoom-analytics-${range.from}-to-${range.to}${listingId ? '-listing' : ''}.csv`;
    downloadCsv(name, analyticsCsv(range, [...view.headline, ...view.secondary], view.listingColumns, full.listings));
  };

  // Hosts arriving from a listing's "View analytics" link for a listing that
  // isn't theirs (or was deleted) fall back to all listings.
  const listingMissing = Boolean(listingId && options.data && !options.data.some((o) => o.id === listingId));
  useEffect(() => {
    if (listingMissing) onListingChange(null);
  }, [listingMissing, onListingChange]);

  const trackingNote = full && !trackingCovers(full.trackingSince, range.from)
    ? (full.trackingSince
      ? `Views and contact taps are counted from ${fmtDate(full.trackingSince)}.`
      : 'Views and contact taps are counted from now on, as guests open your listings.')
    : null;

  return (
    <main className="va-analytics">
      <style>{ANALYTICS_CSS}</style>
      <div className="va-wrap">
        <header className="va-head">
          <div>
            {nicheLabel && <p className="va-eyebrow">{nicheLabel}</p>}
            <h1>Analytics</h1>
            <p className="va-note">
              {selected ? <>Showing <b>{selected.title}</b>. </> : null}
              {view ? view.intro : 'Your bookings, enquiries and reviews on VaRoom.'}
            </p>
          </div>
          {(!data || data.access) && (
            <div className="va-head-actions">
              {(options.data?.length ?? 0) > 1 && (
                <select
                  className="va-select"
                  aria-label="Listing"
                  value={listingId || ''}
                  onChange={(e) => onListingChange(e.target.value || null)}
                >
                  <option value="">All listings</option>
                  {(options.data || []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              )}
              <div className="va-tabs" role="group" aria-label="Date range">
                {ranges.map((k) => <button key={k} type="button" aria-pressed={rk === k} onClick={() => chooseRange(k)}>{RANGE_LABEL[k]}</button>)}
              </div>
              {full && <button type="button" className="va-link" onClick={exportCsv}>Export CSV</button>}
            </div>
          )}
        </header>

        <p className="va-status" aria-live="polite">
          {overview.loading && data ? 'Updating…' : full ? `Changes compare with the previous ${RANGE_DAYS[rk]} days.` : ''}
        </p>

        {overview.error && data && (
          <p className="va-banner" role="alert">
            Couldn&apos;t refresh these numbers. {overview.error}
            <button type="button" onClick={overview.retry}>Try again</button>
          </p>
        )}

        {!data && overview.error && (
          <div className="va-msg" role="alert">
            <p>Couldn&apos;t load your analytics. {overview.error}</p>
            <button type="button" onClick={overview.retry}>Try again</button>
          </div>
        )}

        {!data && !overview.error && <div className="va-skel" aria-busy="true" aria-label="Loading analytics" />}

        {data && !data.access && (
          <>
            <LockedAnalytics niche={data.niche} />
            {payments.data && payments.data.length > 0 && (
              <Block title="What you pay VaRoom" className="va-plan" note="Your subscription payments to VaRoom. These are not guest payments or income.">
                <PlanPayments payments={payments.data} />
              </Block>
            )}
          </>
        )}

        {full && view && (
          <div className={`va-grid${stale ? ' va-stale' : ''}`} aria-busy={stale}>
            <Block title={view.bookingsTitle} note={trackingNote}>
              <KpiList items={view.headline} />
              <KpiList items={view.secondary} secondary />
              {view.showStatusBar && <StatusBar items={full.current.byStatus} />}
              {view.showStatusBar && full.current.approved > 0 && (
                <p className="va-note">
                  Completed: <b>{num.format(full.current.completed)}</b>, counted as approved bookings whose stay, day or lease has ended.
                </p>
              )}
            </Block>

            <Block title="Over time" className="va-s7" note={`Grouped by ${g}, using the date each view, enquiry or request was made.`}>
              {full.trend.length === 0
                ? <p className="va-msg">Nothing to chart yet for this period.</p>
                : <TrendChart points={full.trend} g={g} metrics={view.trendMetrics} />}
            </Block>

            <Block
              title={view.mode === 'sale' ? 'From views to enquiries' : 'From views to bookings'}
              className="va-s5"
              note="Each step as a share of the one before it."
            >
              <Funnel steps={view.funnel} />
            </Block>

            {!listingId && (
              <Block title="Listings" note="Select a listing to see its numbers on their own.">
                {full.listings.length === 0
                  ? <p className="va-msg">Publish a listing and its performance will be ranked here.</p>
                  : <ListingTable rows={full.listings} columns={view.listingColumns} initialSort={view.listingSort} onSelect={onListingChange} />}
              </Block>
            )}

            <div className="va-row3">
              {view.showDining && full.dining && (
                <Block title="Table reservations" note="Requests only. Payments for dining are not recorded.">
                  <DiningBlock dining={full.dining} />
                </Block>
              )}
              <Block title="Responsiveness" note="Guests book hosts who reply fast. Elie auto-replies are not counted.">
                <Responsiveness current={full.current} previous={full.previous} />
              </Block>
              <Block title="Reviews" note="Published reviews, all time.">
                <ReviewsBlock reviews={full.reviews} />
              </Block>
              <Block title="What you pay VaRoom" className="va-plan" note="Your subscription payments to VaRoom. These are not guest payments or income.">
                {payments.data
                  ? <PlanPayments payments={payments.data} />
                  : payments.error
                    ? <div className="va-msg" role="alert"><p>Couldn&apos;t load this section. {payments.error}</p><button type="button" onClick={payments.retry}>Try again</button></div>
                    : <div className="va-skel" aria-busy="true" aria-label="Loading" />}
              </Block>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
