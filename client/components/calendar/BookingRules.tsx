import React, { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ADVANCE_OPTIONS, NOTICE_OPTIONS } from '../../lib/settings/bookingDefaults';
import { calendarErrorText, loadPlaceRules, ruleFields, savePlaceRules, type CalendarListing, type PlaceRules } from '../../lib/calendar/hostCalendar';

// Place settings → Rules: how guests book this place (instant book, minimum
// notice, how far ahead, minimum and maximum stay, check-in and check-out).
// The same rules as the listing wizard and Settings → Bookings (which only
// pre-fills new listings); the database applies them to every new booking.

const toNumber = (value: string): number | null => (value.trim() === '' ? null : Math.max(0, Math.floor(Number(value))) || null);

interface Props {
  client: SupabaseClient;
  listing: CalendarListing;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}

export default function BookingRules({ client, listing, onChanged, onError }: Props) {
  const [rules, setRules] = useState<PlaceRules | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const fields = ruleFields(listing);

  useEffect(() => {
    let active = true;
    loadPlaceRules(client, listing.id).then((loaded) => { if (active) setRules(loaded); }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [client, listing.id]);

  if (failed) return <p className="vc-error" role="alert">The booking rules couldn’t load. Close and try again.</p>;
  if (!rules) return <p className="vc-muted" aria-busy="true">Loading…</p>;
  const set = <K extends keyof PlaceRules>(key: K, value: PlaceRules[K]) => setRules({ ...rules, [key]: value });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await savePlaceRules(client, listing, rules);
      onChanged('Booking rules saved.');
    } catch (error) {
      onError(calendarErrorText(error, 'That didn’t save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="vc-form" onSubmit={(event) => { void save(event); }}>
      {fields.instant && (
        <label className="vc-check"><input type="checkbox" checked={rules.instant_book} onChange={(e) => set('instant_book', e.target.checked)} />
          Instant book: confirm guests without waiting for your approval
        </label>
      )}
      <div className="vc-row">
        <label className="vc-field">Minimum notice
          <select value={rules.min_notice_days == null ? '' : String(rules.min_notice_days)} onChange={(e) => set('min_notice_days', toNumber(e.target.value))}>
            {NOTICE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="vc-field">How far ahead
          <select value={rules.max_advance_days == null ? '' : String(rules.max_advance_days)} onChange={(e) => set('max_advance_days', toNumber(e.target.value))}>
            {ADVANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      {fields.nights && (
        <div className="vc-row">
          <label className="vc-field">Minimum stay (nights)
            <input type="number" min={1} inputMode="numeric" placeholder="No minimum" value={rules.min_stay_nights ?? ''} onChange={(e) => set('min_stay_nights', toNumber(e.target.value))} />
          </label>
          <label className="vc-field">Maximum stay (nights)
            <input type="number" min={1} inputMode="numeric" placeholder="No maximum" value={rules.max_stay_nights ?? ''} onChange={(e) => set('max_stay_nights', toNumber(e.target.value))} />
          </label>
        </div>
      )}
      {fields.times && (
        <div className="vc-row">
          <label className="vc-field">Check-in from<input type="time" value={rules.checkin_time || ''} onChange={(e) => set('checkin_time', e.target.value || null)} /></label>
          <label className="vc-field">Check-out by<input type="time" value={rules.checkout_time || ''} onChange={(e) => set('checkout_time', e.target.value || null)} /></label>
        </div>
      )}
      <p className="vc-muted">New bookings follow these rules. Bookings already made stay as they are.</p>
      <div className="vc-actions"><button type="submit" className="vc-btn is-primary" disabled={saving} aria-busy={saving}>{saving ? 'Saving…' : 'Save rules'}</button></div>
    </form>
  );
}
