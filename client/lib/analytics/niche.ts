import type { AnalyticsOverview, HostNiche, ListingRow, PeriodMetrics, Portfolio, TrendPoint } from './types';

// What the analytics page shows for each niche. Pure: the page passes the
// overview in and renders the result, so every niche's choices live here and
// are unit-tested. A host has one niche (profiles.listing_categories[0]), but
// what they actually list (the portfolio) decides finer choices: a hotel with
// only a restaurant, a property host with only homes for sale, hourly venues.

export type MetricFormat = 'count' | 'kes' | 'percent' | 'duration' | 'days' | 'nights' | 'months' | 'decimal';

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  format: MetricFormat;
  note: string;
  /** Which direction is good, for colouring the change against last period. */
  better: 'up' | 'down';
}

export interface FunnelStep { key: string; label: string; value: number; previous: number }

export type TrendKey = Exclude<keyof TrendPoint, 'bucket'>;
export interface TrendMetric { key: TrendKey; label: string; format: MetricFormat }

export type ListingKey = 'views' | 'contacts' | 'enquiries' | 'likes' | 'saves' | 'requests' | 'approved' | 'approvedValue';
export interface ListingColumn { key: ListingKey; label: string; format: MetricFormat }

/** Which booking model the page reports on. */
export type Mode = 'stays' | 'venue' | 'dining' | 'leases' | 'sale' | 'commercial' | 'general';

export interface NicheView {
  mode: Mode;
  bookingsTitle: string;
  /** The one number the page leads with (headline[0]). */
  hero: Kpi;
  /** Up to six supporting tiles beside the hero. */
  tiles: Kpi[];
  /** Whether bookings or lease requests are part of this niche's story. */
  showRequests: boolean;
  headline: Kpi[];
  secondary: Kpi[];
  funnel: FunnelStep[];
  trendMetrics: TrendMetric[];
  listingColumns: ListingColumn[];
  listingSort: ListingKey;
  showStatusBar: boolean;
  showDining: boolean;
}

export const NICHE_LABEL: Record<HostNiche, string> = {
  airbnb: 'Airbnb',
  hotel: 'Hotel',
  venue: 'Event venue',
  property: 'Property',
  office: 'Shops & offices',
  shop: 'Shops & offices',
};

export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export const contactTaps = (m: PeriodMetrics) => m.contactWhatsapp + m.contactPhone + m.contactEmail;
const cancelled = (m: PeriodMetrics) => m.byStatus.filter((s) => s.status === 'cancelled').reduce((sum, s) => sum + s.count, 0);
const avgNightly = (m: PeriodMetrics) => ratio(m.stayValue, m.nights);
const avgStay = (m: PeriodMetrics) => ratio(m.nights, m.stays);
const occupancy = (m: PeriodMetrics) => ratio(m.occupiedDays, m.capacityDays);
const avgLease = (m: PeriodMetrics) => ratio(m.leaseMonths, m.leaseApproved);

/** The booking model, from the niche and what the host actually lists. */
export function modeFor(niche: HostNiche | null, portfolio: Portfolio): Mode {
  switch (niche) {
    case 'airbnb': return 'stays';
    case 'hotel': return portfolio.hasStays || !portfolio.hasDining ? 'stays' : 'dining';
    case 'venue': return 'venue';
    case 'property': return portfolio.hasSale && !portfolio.hasRent ? 'sale' : 'leases';
    case 'office':
    case 'shop': return 'commercial';
    default: return 'general';
  }
}

function kpi(key: string, label: string, current: PeriodMetrics, previous: PeriodMetrics, pick: (m: PeriodMetrics) => number | null, format: MetricFormat, note: string, better: 'up' | 'down' = 'up'): Kpi {
  return { key, label, value: pick(current), previous: pick(previous), format, note, better };
}

type KpiFactory = (c: PeriodMetrics, p: PeriodMetrics) => Kpi;

const K: Record<string, KpiFactory> = {
  value: (c, p) => kpi('value', 'Approved booking value', c, p, (m) => m.approvedValue, 'kes', 'Quoted price. Not money collected or a payout.'),
  requests: (c, p) => kpi('requests', 'Booking requests', c, p, (m) => m.requests, 'count', 'Created in this period'),
  approved: (c, p) => kpi('approved', 'Approved bookings', c, p, (m) => m.approved, 'count', 'Requests you approved'),
  average: (c, p) => kpi('average', 'Average booking value', c, p, (m) => m.averageValue, 'kes', 'Per approved booking'),
  nights: (c, p) => kpi('nights', 'Nights booked', c, p, (m) => m.nights, 'nights', 'In approved bookings requested this period'),
  occupancy: (c, p) => kpi('occupancy', 'Occupancy', c, p, occupancy, 'percent', 'Booked nights out of nights your stays were listed'),
  utilisation: (c, p) => kpi('utilisation', 'Utilisation', c, p, occupancy, 'percent', 'Booked days out of days your spaces were listed'),
  daysBooked: (c, p) => kpi('daysBooked', 'Days booked', c, p, (m) => m.occupiedDays, 'days', 'Calendar days with an approved booking'),
  nightly: (c, p) => kpi('nightly', 'Average nightly rate', c, p, avgNightly, 'kes', 'Booking value per night booked'),
  stayLength: (c, p) => kpi('stayLength', 'Average stay', c, p, avgStay, 'nights', 'Nights per approved booking'),
  lead: (c, p) => kpi('lead', 'Booking lead time', c, p, (m) => m.leadDays, 'days', 'From request to arrival'),
  moveInLead: (c, p) => kpi('lead', 'Time to move-in', c, p, (m) => m.leadDays, 'days', 'From request to lease start'),
  cancellation: (c, p) => kpi('cancellation', 'Cancellation rate', c, p, (m) => ratio(cancelled(m), m.requests), 'percent', 'Requests guests cancelled', 'down'),
  bookingResponse: (c, p) => kpi('bookingResponse', 'Booking response time', c, p, (m) => m.bookingResponseMinutes, 'duration', 'Median time to approve or decline', 'down'),
  chatResponse: (c, p) => kpi('chatResponse', 'Chat response time', c, p, (m) => m.chatResponseMinutes, 'duration', 'Median time to your first reply', 'down'),
  hours: (c, p) => kpi('hours', 'Hours booked', c, p, (m) => m.hours, 'count', 'In approved hourly bookings'),
  views: (c, p) => kpi('views', 'Listing views', c, p, (m) => m.views, 'count', 'Times guests opened your listings'),
  viewers: (c, p) => kpi('viewers', 'People who viewed', c, p, (m) => m.uniqueViewers, 'count', 'Unique signed-in guests'),
  enquiries: (c, p) => kpi('enquiries', 'Enquiries', c, p, (m) => m.enquiries, 'count', 'New chats about your listings'),
  contacts: (c, p) => kpi('contacts', 'Contact taps', c, p, contactTaps, 'count', 'WhatsApp, call and email taps'),
  shares: (c, p) => kpi('shares', 'Shares', c, p, (m) => m.shares, 'count', 'Times guests shared a listing'),
  interest: (c, p) => kpi('interest', 'Saves and likes', c, p, (m) => m.saves + m.likes, 'count', 'Guests who saved or liked a listing'),
  enquiryRate: (c, p) => kpi('enquiryRate', 'Enquiry rate', c, p, (m) => ratio(m.enquiries + contactTaps(m), m.views), 'percent', 'Enquiries and contact taps per view'),
  leaseRequests: (c, p) => kpi('leaseRequests', 'Lease requests', c, p, (m) => m.leaseRequests, 'count', 'Created in this period'),
  leaseApproved: (c, p) => kpi('leaseApproved', 'Approved leases', c, p, (m) => m.leaseApproved, 'count', 'Lease requests you approved'),
  monthlyRent: (c, p) => kpi('monthlyRent', 'Average monthly rent', c, p, (m) => m.leaseMonthlyValue, 'kes', 'Across approved monthly leases'),
  leaseLength: (c, p) => kpi('leaseLength', 'Average lease length', c, p, avgLease, 'months', 'Months per approved lease'),
  leaseValue: (c, p) => kpi('leaseValue', 'Approved lease value', c, p, (m) => m.approvedValue, 'kes', 'Quoted total for the lease term. Not money collected.'),
};

const pick = (c: PeriodMetrics, p: PeriodMetrics, keys: string[]) => keys.map((key) => K[key](c, p));

function funnelFor(mode: Mode, c: PeriodMetrics, p: PeriodMetrics): FunnelStep[] {
  const step = (key: string, label: string, f: (m: PeriodMetrics) => number): FunnelStep => ({ key, label, value: f(c), previous: f(p) });
  if (mode === 'sale') {
    return [
      step('views', 'Listing views', (m) => m.views),
      step('viewers', 'People who viewed', (m) => m.uniqueViewers),
      step('contact', 'Enquiries and contact taps', (m) => m.enquiries + contactTaps(m)),
    ];
  }
  const lease = mode === 'leases' || mode === 'commercial';
  return [
    step('views', 'Listing views', (m) => m.views),
    step('contact', 'Enquiries and contact taps', (m) => m.enquiries + contactTaps(m)),
    step('requests', lease ? 'Lease requests' : 'Booking requests', (m) => m.requests),
    step('approved', lease ? 'Approved leases' : 'Approved bookings', (m) => m.approved),
  ];
}

const TREND = {
  value: { key: 'approvedValue', label: 'Approved booking value', format: 'kes' },
  requests: { key: 'requests', label: 'Requests', format: 'count' },
  views: { key: 'views', label: 'Views', format: 'count' },
  enquiries: { key: 'enquiries', label: 'Enquiries', format: 'count' },
  contacts: { key: 'contacts', label: 'Contact taps', format: 'count' },
} as const satisfies Record<string, TrendMetric>;

const COL = {
  views: { key: 'views', label: 'Views', format: 'count' },
  contacts: { key: 'contacts', label: 'Contact taps', format: 'count' },
  enquiries: { key: 'enquiries', label: 'Enquiries', format: 'count' },
  likes: { key: 'likes', label: 'Likes', format: 'count' },
  saves: { key: 'saves', label: 'Saves', format: 'count' },
  requests: { key: 'requests', label: 'Requests', format: 'count' },
  approved: { key: 'approved', label: 'Approved', format: 'count' },
  value: { key: 'approvedValue', label: 'Booking value', format: 'kes' },
  leaseValue: { key: 'approvedValue', label: 'Lease value', format: 'kes' },
} as const satisfies Record<string, ListingColumn>;

type NicheConfig = Omit<NicheView, 'hero' | 'tiles' | 'showRequests'>;

function nicheConfig(overview: AnalyticsOverview): NicheConfig {
  const { niche, portfolio, current: c, previous: p } = overview;
  const mode = modeFor(niche, portfolio);
  const base = {
    mode,
    funnel: funnelFor(mode, c, p),
    showStatusBar: mode !== 'sale' && mode !== 'dining',
    showDining: Boolean(overview.dining),
  };

  switch (mode) {
    case 'stays':
      return {
        ...base,
        bookingsTitle: niche === 'hotel' ? 'Room bookings' : 'Bookings',
        headline: pick(c, p, ['value', 'nights', 'occupancy', 'nightly']),
        secondary: pick(c, p, ['stayLength', 'lead', 'cancellation', 'bookingResponse']),
        trendMetrics: [TREND.value, TREND.requests, TREND.views, TREND.enquiries],
        listingColumns: [COL.views, COL.enquiries, COL.requests, COL.approved, COL.value],
        listingSort: 'approvedValue',
      };
    case 'dining':
      return {
        ...base,
        bookingsTitle: 'Interest',
        headline: pick(c, p, ['views', 'enquiries', 'contacts', 'interest']),
        secondary: pick(c, p, ['viewers', 'enquiryRate', 'chatResponse']),
        trendMetrics: [TREND.views, TREND.enquiries, TREND.contacts],
        listingColumns: [COL.views, COL.contacts, COL.enquiries, COL.likes, COL.saves],
        listingSort: 'views',
      };
    case 'venue':
      return {
        ...base,
        bookingsTitle: 'Bookings',
        headline: pick(c, p, ['value', 'daysBooked', 'utilisation', 'average']),
        secondary: pick(c, p, portfolio.hasHourly ? ['hours', 'lead', 'cancellation', 'bookingResponse'] : ['lead', 'cancellation', 'bookingResponse', 'enquiries']),
        trendMetrics: [TREND.value, TREND.requests, TREND.views, TREND.enquiries],
        listingColumns: [COL.views, COL.enquiries, COL.requests, COL.approved, COL.value],
        listingSort: 'approvedValue',
      };
    case 'leases':
      return {
        ...base,
        bookingsTitle: 'Lease requests',
        headline: pick(c, p, ['enquiries', 'leaseRequests', 'leaseApproved', 'monthlyRent']),
        secondary: pick(c, p, ['leaseLength', 'moveInLead', 'enquiryRate', 'chatResponse']),
        trendMetrics: [TREND.enquiries, TREND.requests, TREND.views, TREND.contacts],
        listingColumns: [COL.views, COL.enquiries, COL.saves, COL.requests, COL.approved],
        listingSort: 'enquiries',
      };
    case 'sale':
      return {
        ...base,
        bookingsTitle: 'Buyer interest',
        headline: pick(c, p, ['views', 'enquiries', 'contacts', 'interest']),
        secondary: pick(c, p, ['viewers', 'enquiryRate', 'chatResponse']),
        trendMetrics: [TREND.views, TREND.enquiries, TREND.contacts],
        listingColumns: [COL.views, COL.contacts, COL.enquiries, COL.likes, COL.saves],
        listingSort: 'enquiries',
      };
    case 'commercial':
      return {
        ...base,
        bookingsTitle: 'Lease requests',
        headline: pick(c, p, ['enquiries', 'leaseRequests', 'leaseApproved', 'leaseValue']),
        secondary: pick(c, p, ['leaseLength', 'moveInLead', 'enquiryRate', 'chatResponse']),
        trendMetrics: [TREND.enquiries, TREND.requests, TREND.views, TREND.value],
        listingColumns: [COL.views, COL.enquiries, COL.requests, COL.approved, COL.leaseValue],
        listingSort: 'enquiries',
      };
    default:
      return {
        ...base,
        bookingsTitle: 'Bookings',
        headline: pick(c, p, ['requests', 'approved', 'value', 'average']),
        secondary: pick(c, p, ['enquiries', 'views', 'lead', 'bookingResponse']),
        trendMetrics: [TREND.value, TREND.requests, TREND.views, TREND.enquiries],
        listingColumns: [COL.views, COL.enquiries, COL.requests, COL.approved, COL.value],
        listingSort: 'approvedValue',
      };
  }
}

const RESPONSE_KEYS = new Set(['bookingResponse', 'chatResponse']);

export function buildNicheView(overview: AnalyticsOverview): NicheView {
  const config = nicheConfig(overview);
  const [hero, ...rest] = config.headline;
  const tiles = [...rest, ...config.secondary.filter((k) => !RESPONSE_KEYS.has(k.key))];
  if (tiles.length < 6) tiles.push(K.shares(overview.current, overview.previous));
  return { ...config, hero, tiles: tiles.slice(0, 6), showRequests: config.showStatusBar };
}

/** The trend series a metric follows, for its sparkline; null when there is none. */
export function trendKeyFor(kpiKey: string): TrendKey | null {
  const map: Record<string, TrendKey> = {
    value: 'approvedValue', leaseValue: 'approvedValue', requests: 'requests', leaseRequests: 'requests',
    approved: 'approved', leaseApproved: 'approved', views: 'views', enquiries: 'enquiries', contacts: 'contacts',
  };
  return map[kpiKey] ?? null;
}

/** What a host's plan unlocks, shown on the locked preview. */
export function lockedFeatures(niche: HostNiche | null): string[] {
  const shared = ['Listing views and contact taps', 'Views to enquiries to bookings funnel', 'How fast you reply to guests', 'Per-listing performance and CSV export'];
  switch (niche) {
    case 'airbnb': return ['Nights booked and occupancy', 'Average nightly rate and length of stay', 'Booking lead time and cancellations', ...shared];
    case 'hotel': return ['Room nights, occupancy and nightly rate', 'Table reservations: covers, peak days and times', 'Special occasions', ...shared];
    case 'venue': return ['Days and hours booked', 'Utilisation of your spaces', 'Lead time and cancellations', ...shared];
    case 'property': return ['Enquiries and lease requests', 'Average monthly rent and lease length', 'Buyer interest in homes for sale', ...shared];
    case 'office':
    case 'shop': return ['Enquiries and lease requests', 'Lease value and lease length', 'Time to move-in', ...shared];
    default: return ['Booking requests and value', 'Reviews and ratings', ...shared];
  }
}

export function sortListings(rows: ListingRow[], key: ListingKey): ListingRow[] {
  return [...rows].sort((a, b) => b[key] - a[key] || b.requests - a.requests || a.title.localeCompare(b.title));
}

/** Change against the previous period: a fraction, 'new' when it rose from zero, null when unknown. */
export function change(current: number | null, previous: number | null): number | 'new' | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : 'new';
  return (current - previous) / Math.abs(previous);
}

/** Whether view and tap counts cover the whole range (tracking started on or before it). */
export function trackingCovers(trackingSince: string | null, rangeFrom: string): boolean {
  if (!trackingSince) return false;
  return trackingSince.slice(0, 10) <= rangeFrom;
}
