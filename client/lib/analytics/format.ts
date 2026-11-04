import type { Kpi, ListingColumn, MetricFormat } from './niche';
import type { DateRange, Granularity, ListingRow, RangeKey } from './types';

// Formatting, date ranges and CSV export for host analytics.

const DAY = 86400000;

export const kes = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
export const num = new Intl.NumberFormat('en-KE');
const oneDecimal = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 });

export const plural = (n: number, word: string) => `${oneDecimal.format(n)} ${word}${n === 1 ? '' : 's'}`;

export function duration(minutes: number): string {
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return plural(Math.round((minutes / 60) * 10) / 10, 'hour');
  return plural(Math.round((minutes / 1440) * 10) / 10, 'day');
}

export function formatMetric(value: number | null, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) return 'None yet';
  switch (format) {
    case 'kes': return kes.format(value);
    case 'percent': return `${oneDecimal.format(value * 100)}%`;
    case 'duration': return duration(value);
    case 'days': return plural(Math.round(value * 10) / 10, 'day');
    case 'nights': return plural(Math.round(value * 10) / 10, 'night');
    case 'months': return plural(Math.round(value * 10) / 10, 'month');
    case 'decimal': return oneDecimal.format(value);
    default: return num.format(Math.round(value));
  }
}

export const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
export const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

const nairobiDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' });

export function ymd(d: Date): string {
  const parts = nairobiDate.formatToParts(d);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export const fmtDate = (iso: string, g: Granularity = 'day') =>
  new Date(iso).toLocaleDateString('en-KE', { timeZone: g === 'day' && iso.length > 10 ? 'Africa/Nairobi' : 'UTC', ...(g === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }) });

export const RANGE_DAYS: Record<RangeKey, number> = { '30d': 30, '90d': 90, '12m': 365 };
export const RANGE_LABEL: Record<RangeKey, string> = { '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months' };
export const granularityFor = (k: RangeKey): Granularity => (k === '30d' ? 'day' : k === '90d' ? 'week' : 'month');

export function rangeFor(k: RangeKey, now: Date = new Date()): DateRange {
  const days = RANGE_DAYS[k];
  return { from: ymd(new Date(now.getTime() - (days - 1) * DAY)), to: ymd(now) };
}

export const isRangeKey = (value: unknown): value is RangeKey => value === '30d' || value === '90d' || value === '12m';

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  // Quote, and neutralise spreadsheet formulas in listing titles.
  const safe = /^[=+\-@]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function analyticsCsv(range: DateRange, kpis: Kpi[], columns: ListingColumn[], rows: ListingRow[]): string {
  const lines: (string | number | null)[][] = [
    ['VaRoom analytics', `${range.from} to ${range.to}`],
    [],
    ['Metric', 'This period', 'Previous period'],
    ...kpis.map((k) => [k.label, k.value === null ? null : Math.round(k.value * 100) / 100, k.previous === null ? null : Math.round(k.previous * 100) / 100]),
    [],
    ['Listing', ...columns.map((c) => c.label)],
    ...rows.map((r) => [r.title, ...columns.map((c) => r[c.key])]),
  ];
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
}
