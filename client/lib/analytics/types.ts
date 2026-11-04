// The host analytics data contract: what host_analytics_overview and
// host_plan_payments return, after parsing (server/migrations/
// 20261104_000057_host_analytics_v2.sql).

export type RangeKey = '30d' | '90d' | '12m';
export type Granularity = 'day' | 'week' | 'month';
/** yyyy-mm-dd, inclusive, in Africa/Nairobi. */
export interface DateRange { from: string; to: string }

/** A host's niche (profiles.listing_categories[0]); null when not chosen yet. */
export type HostNiche = 'airbnb' | 'hotel' | 'venue' | 'property' | 'office' | 'shop';

export interface StatusCount { status: string; count: number }

/** Totals for one period. Bookings, enquiries and events are counted by the day they were created. */
export interface PeriodMetrics {
  views: number;
  uniqueViewers: number;
  contactWhatsapp: number;
  contactPhone: number;
  contactEmail: number;
  shares: number;
  /** Chats opened about a listing: one per guest per listing. */
  enquiries: number;
  likes: number;
  saves: number;
  requests: number;
  byStatus: StatusCount[];
  approved: number;
  /** Quoted total_price of approved bookings. Not money collected. */
  approvedValue: number;
  averageValue: number | null;
  /** Approved bookings whose stay, day or lease has ended. */
  completed: number;
  nights: number;
  stays: number;
  stayValue: number;
  hours: number;
  hourlyBookings: number;
  leaseRequests: number;
  leaseApproved: number;
  leaseMonths: number;
  /** Approved monthly leases only; null when there are none. */
  leaseMonthlyValue: number | null;
  /** Average days from request to check-in or move-in, for approved bookings. */
  leadDays: number | null;
  bookingResponseMinutes: number | null;
  bookingResponses: number;
  /** Listing-days booked within the period, by stay date. */
  occupiedDays: number;
  /** Listing-days the host's short-stay listings were live in the period. */
  capacityDays: number;
  chatThreads: number;
  chatReplied: number;
  chatRepliedWithinHour: number;
  chatResponseMinutes: number | null;
}

export interface Portfolio {
  listings: number;
  published: number;
  categories: string[];
  hasStays: boolean;
  hasDining: boolean;
  hasRent: boolean;
  hasSale: boolean;
  hasHourly: boolean;
}

export interface TrendPoint {
  /** yyyy-mm-dd start of the bucket. */
  bucket: string;
  views: number;
  contacts: number;
  enquiries: number;
  requests: number;
  approved: number;
  approvedValue: number;
}

export interface ListingRow {
  listingId: string;
  title: string;
  category: string | null;
  listingPurpose: string | null;
  publicationState: string | null;
  availabilityStatus: string | null;
  views: number;
  contacts: number;
  enquiries: number;
  likes: number;
  saves: number;
  requests: number;
  approved: number;
  approvedValue: number;
}

export interface DiningSummary {
  total: number;
  previousTotal: number;
  guests: number;
  tables: number;
  occasions: number;
  byStatus: StatusCount[];
  /** Length 7, Monday first. */
  byWeekday: number[];
  byHour: { hour: number; count: number }[];
}

export type StarRating = 1 | 2 | 3 | 4 | 5;

export interface ReviewSummary {
  average: number | null;
  count: number;
  inPeriod: number;
  distribution: Record<StarRating, number>;
}

export interface LockedOverview {
  access: false;
  niche: HostNiche | null;
}

export interface AnalyticsOverview {
  access: true;
  niche: HostNiche | null;
  portfolio: Portfolio;
  /** When the first listing view or contact tap was recorded for this host. */
  trackingSince: string | null;
  current: PeriodMetrics;
  /** The same-length period immediately before. */
  previous: PeriodMetrics;
  trend: TrendPoint[];
  listings: ListingRow[];
  dining: DiningSummary | null;
  reviews: ReviewSummary;
}

export type OverviewResult = AnalyticsOverview | LockedOverview;

export interface PlanPayment { id: string; paidAt: string; plan: string; amount: number; status: string }

export interface ListingOption { id: string; title: string }
