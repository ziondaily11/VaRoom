import type { SupabaseClient } from '@supabase/supabase-js';

// Settings → Bookings: a host's booking defaults. They pre-fill every new
// stay listing (the listing wizard), where each listing can change them. The
// database enforces the listing's rules when a guest books.

export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';

export interface BookingDefaults {
  instant_book: boolean;
  min_notice_days: number | null;
  max_advance_days: number | null;
  min_stay_nights: number | null;
  max_stay_nights: number | null;
  checkin_time: string | null;
  checkout_time: string | null;
  cancellation_policy: CancellationPolicy;
}

export const EMPTY_BOOKING_DEFAULTS: BookingDefaults = {
  instant_book: false,
  min_notice_days: null,
  max_advance_days: null,
  min_stay_nights: null,
  max_stay_nights: null,
  checkin_time: null,
  checkout_time: null,
  cancellation_policy: 'moderate',
};

const COLUMNS = 'instant_book,min_notice_days,max_advance_days,min_stay_nights,max_stay_nights,checkin_time,checkout_time,cancellation_policy';

/** Minimum notice: '' is "same day" (no notice). */
export const NOTICE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Same day' },
  { value: '1', label: '1 day' },
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
];

/** How far ahead guests can book: '' is "any time". */
export const ADVANCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Any time' },
  { value: '30', label: '1 month ahead' },
  { value: '90', label: '3 months ahead' },
  { value: '180', label: '6 months ahead' },
  { value: '365', label: '12 months ahead' },
];

export const CANCELLATION_OPTIONS: Array<{ value: CancellationPolicy; label: string }> = [
  { value: 'flexible', label: 'Flexible' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'strict', label: 'Strict' },
];

const TIME = /^\d{2}:\d{2}$/;
const POLICIES: CancellationPolicy[] = ['flexible', 'moderate', 'strict'];

const wholeOrNull = (value: unknown, min: number, max: number): number | null => {
  const number = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
};

/** A stored row (or anything) → defaults with every value in range. */
export function normaliseBookingDefaults(row: Partial<Record<keyof BookingDefaults, unknown>> | null | undefined): BookingDefaults {
  if (!row) return { ...EMPTY_BOOKING_DEFAULTS };
  const time = (value: unknown) => (typeof value === 'string' && TIME.test(value) ? value : null);
  return {
    instant_book: row.instant_book === true,
    min_notice_days: wholeOrNull(row.min_notice_days, 0, 365),
    max_advance_days: wholeOrNull(row.max_advance_days, 1, 1095),
    min_stay_nights: wholeOrNull(row.min_stay_nights, 1, 100000),
    max_stay_nights: wholeOrNull(row.max_stay_nights, 1, 100000),
    checkin_time: time(row.checkin_time),
    checkout_time: time(row.checkout_time),
    cancellation_policy: POLICIES.includes(row.cancellation_policy as CancellationPolicy) ? (row.cancellation_policy as CancellationPolicy) : 'moderate',
  };
}

/** Why these defaults can't be saved, or null. */
export function bookingDefaultsProblem(defaults: BookingDefaults): string | null {
  if (defaults.min_stay_nights != null && defaults.max_stay_nights != null && defaults.min_stay_nights > defaults.max_stay_nights) {
    return 'The maximum stay must be at least the minimum stay.';
  }
  return null;
}

export async function loadBookingDefaults(client: SupabaseClient, hostId: string): Promise<BookingDefaults | null> {
  const { data, error } = await client.from('host_booking_defaults').select(COLUMNS).eq('host_id', hostId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normaliseBookingDefaults(data as Partial<Record<keyof BookingDefaults, unknown>>) : null;
}

/** Saves the defaults; resolves the message to show, or null when saved. */
export async function saveBookingDefaults(client: SupabaseClient, hostId: string, defaults: BookingDefaults): Promise<string | null> {
  const problem = bookingDefaultsProblem(defaults);
  if (problem) return problem;
  const { error } = await client.from('host_booking_defaults')
    .upsert({ host_id: hostId, ...normaliseBookingDefaults(defaults), updated_at: new Date().toISOString() }, { onConflict: 'host_id' });
  return error ? 'Your booking defaults could not be saved. Please try again.' : null;
}

/** The wizard's fields for these defaults (a fresh listing starts from them). */
export function bookingDefaultFields(defaults: BookingDefaults): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {
    'instant-book': defaults.instant_book,
    'min-notice': defaults.min_notice_days == null ? '' : String(defaults.min_notice_days),
    'max-advance': defaults.max_advance_days == null ? '' : String(defaults.max_advance_days),
    'cancellation-policy': defaults.cancellation_policy,
  };
  if (defaults.min_stay_nights != null) fields['min-stay'] = String(defaults.min_stay_nights);
  if (defaults.max_stay_nights != null) fields['max-stay'] = String(defaults.max_stay_nights);
  if (defaults.checkin_time) fields['checkin-time'] = defaults.checkin_time;
  if (defaults.checkout_time) fields['checkout-time'] = defaults.checkout_time;
  return fields;
}
