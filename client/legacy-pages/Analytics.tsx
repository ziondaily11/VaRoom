import Head from 'next/head';
import Script from 'next/script';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SupabaseClient } from '@supabase/supabase-js';
import styles from './Analytics.module.css';
import { supabaseHostAnalyticsApi } from './analyticsApi';

export interface StatusCount {
  status: string;
  count: number;
}

export interface HostBookingSummary {
  requests: number;
  byStatus: StatusCount[];
  approvedCount: number;
  approvedValue: number;
  averageApprovedValue: number | null;
  completedStays: number;
}

export interface HostBookingTrendPoint {
  bucket: string;
  requests: number;
  approvedValue: number;
}

export interface HostListingRanking {
  listingId: string;
  title: string;
  requests: number;
  approved: number;
  approvedValue: number;
}

export interface HostReservationSummary {
  total: number;
  guests: number;
  tables: number;
  byStatus: StatusCount[];
  byWeekday: number[];
}

export interface HostReviewSummary {
  average: number | null;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface HostPlanPayment {
  id: string;
  paidAt: string | null;
  plan: string;
  amount: number;
  status: string;
}

export interface HostAnalyticsApi {
  getBookingSummary(from: string, to: string, signal: AbortSignal): Promise<HostBookingSummary>;
  getBookingTrend(
    from: string,
    to: string,
    granularity: 'day' | 'week' | 'month',
    signal: AbortSignal
  ): Promise<HostBookingTrendPoint[]>;
  getListingRanking(from: string, to: string, signal: AbortSignal): Promise<HostListingRanking[]>;
  getReservationSummary(from: string, to: string, signal: AbortSignal): Promise<HostReservationSummary | null>;
  getReviewSummary(signal: AbortSignal): Promise<HostReviewSummary>;
  getPlanPayments(signal: AbortSignal): Promise<HostPlanPayment[]>;
}

interface AuthenticatedProfile {
  role: string;
  verified: boolean;
}

interface AnalyticsWindow extends Window {
  supabaseClient?: SupabaseClient;
  VaroomSidebar?: {
    mount(options: {
      container: HTMLElement;
      role: 'host';
      activeNav: 'analytics';
      profile: AuthenticatedProfile;
      supabaseClient: SupabaseClient;
    }): void;
    initCounts(options: { supabaseClient: SupabaseClient }): Promise<void>;
  };
}

function analyticsWindow(): AnalyticsWindow {
  return window as AnalyticsWindow;
}

interface AnalyticsData {
  summary: HostBookingSummary;
  trend: HostBookingTrendPoint[];
  rankings: HostListingRanking[];
  reservations: HostReservationSummary | null;
  reviews: HostReviewSummary;
  payments: HostPlanPayment[];
}

const ranges = [7, 30, 90] as const;
const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const nairobiDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Nairobi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateRange(days: number) {
  const parts = nairobiDateFormatter.formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const today = Date.UTC(value('year'), value('month') - 1, value('day'));
  return {
    from: new Date(today - (days - 1) * 86400000).toISOString().slice(0, 10),
    to: new Date(today).toISOString().slice(0, 10),
  };
}

function money(amount: number | null) {
  if (amount === null || !Number.isFinite(amount)) return '—';
  return `KSh ${amount.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function loadSharedSupabaseClient(): Promise<SupabaseClient> {
  const browserWindow = analyticsWindow();
  if (browserWindow.supabaseClient) return Promise.resolve(browserWindow.supabaseClient);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-analytics-shared-client]');
    const script = existing || document.createElement('script');
    const onLoad = () => {
      if (browserWindow.supabaseClient) resolve(browserWindow.supabaseClient);
      else reject(new Error('The shared Supabase client did not initialize.'));
    };
    const onError = () => reject(new Error('Unable to load the shared Supabase client.'));

    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', onError, { once: true });
      return;
    }

    script.src = '/js/supabase-client.js';
    script.dataset.analyticsSharedClient = 'true';
    script.async = false;
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    document.head.appendChild(script);
  });
}

export default function Analytics() {
  const sidebarRef = useRef<HTMLElement>(null);
  const [sharedClient, setSharedClient] = useState<SupabaseClient | null>(null);
  const [profile, setProfile] = useState<AuthenticatedProfile | null>(null);
  const [supabaseSdkReady, setSupabaseSdkReady] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [rangeDays, setRangeDays] = useState<(typeof ranges)[number]>(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRange = useMemo(() => dateRange(rangeDays), [rangeDays]);
  const granularity = rangeDays === 90 ? 'week' : 'day';

  useEffect(() => {
    if (!supabaseSdkReady) return;
    let cancelled = false;
    async function authenticate() {
      try {
        const client = await loadSharedSupabaseClient();
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        const session = sessionData.session;
        if (!session) {
          window.location.assign('/login');
          return;
        }

        const { data: userProfile, error: profileError } = await client
          .from('profiles')
          .select('role,verified')
          .eq('id', session.user.id)
          .single();
        if (profileError) throw profileError;
        if (!userProfile || userProfile.role !== 'host') {
          window.location.assign('/');
          return;
        }
        if (!cancelled) {
          setSharedClient(client);
          setProfile({ role: userProfile.role, verified: Boolean(userProfile.verified) });
        }
      } catch (authError) {
        if (!cancelled) {
          setError(authError instanceof Error ? authError.message : 'Unable to verify your host account.');
        }
      }
    }
    authenticate();
    return () => {
      cancelled = true;
    };
  }, [supabaseSdkReady]);

  useEffect(() => {
    const sidebar = analyticsWindow().VaroomSidebar;
    if (!sharedClient || !profile || !sidebarReady || !sidebarRef.current || !sidebar) return;
    sidebar.mount({
      container: sidebarRef.current,
      role: 'host',
      activeNav: 'analytics',
      profile,
      supabaseClient: sharedClient,
    });
    void sidebar.initCounts({ supabaseClient: sharedClient });
  }, [profile, sharedClient, sidebarReady]);

  useEffect(() => {
    if (!sharedClient || !profile) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      supabaseHostAnalyticsApi.getBookingSummary(selectedRange.from, selectedRange.to, controller.signal),
      supabaseHostAnalyticsApi.getBookingTrend(
        selectedRange.from,
        selectedRange.to,
        granularity,
        controller.signal
      ),
      supabaseHostAnalyticsApi.getListingRanking(selectedRange.from, selectedRange.to, controller.signal),
      supabaseHostAnalyticsApi.getReservationSummary(
        selectedRange.from,
        selectedRange.to,
        controller.signal
      ),
      supabaseHostAnalyticsApi.getReviewSummary(controller.signal),
      supabaseHostAnalyticsApi.getPlanPayments(controller.signal),
    ])
      .then(([summary, trend, rankings, reservations, reviews, payments]) => {
        setData({ summary, trend, rankings, reservations, reviews, payments });
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load host analytics.');
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [granularity, profile, rangeDays, selectedRange.from, selectedRange.to, sharedClient]);

  const maxReviewCount = data
    ? Math.max(1, ...Object.values(data.reviews.distribution))
    : 1;

  return (
    <>
      <Head>
        <title>Analytics — VaRoom</title>
        <link rel="stylesheet" href="/js/varoom-sidebar.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700;900&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Script
        src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
        strategy="afterInteractive"
        onReady={() => setSupabaseSdkReady(true)}
      />
      <Script
        src="/js/varoom-sidebar.js"
        strategy="afterInteractive"
        onReady={() => setSidebarReady(true)}
      />
      <div className={styles.appShell}>
        <aside id="sidebar" ref={sidebarRef} className={`sidebar sidebar-host ${styles.sidebar}`} />
        <button id="menu-toggle" className={styles.menuToggle} type="button" aria-label="Open navigation">
          Menu
        </button>
        <div id="sidebar-backdrop" className="sidebar-backdrop" />
        <main className={styles.main}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Host workspace</p>
              <h1>Analytics</h1>
            </div>
            <div className={styles.rangeSelect} aria-label="Analytics date range">
              {ranges.map((days) => (
                <button
                  aria-pressed={rangeDays === days}
                  className={rangeDays === days ? styles.rangeActive : ''}
                  key={days}
                  onClick={() => setRangeDays(days)}
                  type="button"
                >
                  {days}d
                </button>
              ))}
            </div>
          </header>
          <p className={styles.subheading}>
            {selectedRange.from} – {selectedRange.to}. All dates use Africa/Nairobi.
          </p>

          {error && <p className={styles.error} role="alert">{error}</p>}
          {loading && <p className={styles.loading} aria-live="polite">Loading analytics…</p>}
          {!data && !loading && !error && <p className={styles.loading}>Preparing your analytics…</p>}

          {data && (
            <>
              <section className={styles.statGrid} aria-label="Booking summary">
                <Stat label="Requests" value={data.summary.requests.toLocaleString()} />
                <Stat label="Approved bookings" value={data.summary.approvedCount.toLocaleString()} />
                <Stat label="Approved value" value={money(data.summary.approvedValue)} />
                <Stat label="Average approved value" value={money(data.summary.averageApprovedValue)} />
                <Stat label="Completed stays" value={data.summary.completedStays.toLocaleString()} />
              </section>

              <Section title="Bookings over time">
                {data.trend.length ? (
                  <div className={styles.chart}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.trend} margin={{ top: 12, right: 12, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="bucket" tickFormatter={dateLabel} minTickGap={20} />
                        <YAxis yAxisId="value" tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
                        <YAxis yAxisId="requests" orientation="right" allowDecimals={false} />
                        <Tooltip
                          labelFormatter={(label) => dateLabel(String(label))}
                          formatter={(value, name) => [
                            name === 'approvedValue' ? money(Number(value)) : Number(value),
                            name === 'approvedValue' ? 'Approved value' : 'Requests',
                          ]}
                        />
                        <Bar yAxisId="value" dataKey="approvedValue" fill="#C41E3A" radius={[5, 5, 0, 0]} />
                        <Line yAxisId="requests" dataKey="requests" stroke="#51483F" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : <Empty>No booking activity in this date range.</Empty>}
              </Section>

              <Section title="Booking request status">
                {data.summary.byStatus.length ? (
                  data.summary.byStatus.map((item) => (
                    <p className={styles.statusRow} key={item.status}>
                      <span>{item.status}</span><strong>{item.count.toLocaleString()}</strong>
                    </p>
                  ))
                ) : <Empty>No booking requests in this date range.</Empty>}
              </Section>

              <Section title="Top-performing listings">
                {data.rankings.length ? (
                  <div className={styles.tableWrap}>
                    <table>
                      <thead><tr><th>Listing</th><th>Requests</th><th>Approved</th><th>Approved value</th></tr></thead>
                      <tbody>
                        {data.rankings.map((listing) => (
                          <tr key={listing.listingId}>
                            <th scope="row">{listing.title}</th>
                            <td>{listing.requests.toLocaleString()}</td>
                            <td>{listing.approved.toLocaleString()}</td>
                            <td>{money(listing.approvedValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <Empty>You have no listings yet.</Empty>}
              </Section>

              {data.reservations && (
                <Section title="Hotel table reservations">
                  <div className={styles.statGrid}>
                    <Stat label="Reservations" value={data.reservations.total.toLocaleString()} />
                    <Stat label="Guests requested" value={data.reservations.guests.toLocaleString()} />
                    <Stat label="Tables requested" value={data.reservations.tables.toLocaleString()} />
                  </div>
                  <div className={styles.splitPanels}>
                    <div className={styles.panel}>
                      <h3>Reservation status</h3>
                      {data.reservations.byStatus.length
                        ? data.reservations.byStatus.map((item) => (
                          <p className={styles.statusRow} key={item.status}>
                            <span>{item.status}</span><strong>{item.count.toLocaleString()}</strong>
                          </p>
                        ))
                        : <Empty>No reservations in this date range.</Empty>}
                    </div>
                    <div className={styles.panel}>
                      <h3>Requested day of week</h3>
                      {weekdayLabels.map((day, index) => (
                        <p className={styles.statusRow} key={day}>
                          <span>{day}</span><strong>{(data.reservations?.byWeekday[index] || 0).toLocaleString()}</strong>
                        </p>
                      ))}
                    </div>
                  </div>
                </Section>
              )}

              <Section title="Published reviews">
                <div className={styles.reviewPanel}>
                  <div className={styles.reviewAverage}>
                    <strong>{data.reviews.average === null ? '—' : data.reviews.average.toFixed(1)}</strong>
                    <span>{data.reviews.count.toLocaleString()} reviews</span>
                  </div>
                  <div className={styles.distribution}>
                    {(['5', '4', '3', '2', '1'] as const).map((rating) => (
                      <div className={styles.ratingRow} key={rating}>
                        <span>{rating} star</span>
                        <div className={styles.ratingTrack}>
                          <span style={{ width: `${(data.reviews.distribution[rating] / maxReviewCount) * 100}%` }} />
                        </div>
                        <strong>{data.reviews.distribution[rating].toLocaleString()}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="VaRoom plan payments">
                {data.payments.length ? (
                  <div className={styles.tableWrap}>
                    <table>
                      <thead><tr><th>Paid at</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
                      <tbody>
                        {data.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td>{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('en-KE') : 'Not paid'}</td>
                            <td>{payment.plan}</td>
                            <td>{money(payment.amount)}</td>
                            <td><span className={styles.paymentStatus}>{payment.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <Empty>No VaRoom plan payments found.</Empty>}
              </Section>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className={styles.stat}><span>{label}</span><strong>{value}</strong></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
