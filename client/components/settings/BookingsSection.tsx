import React, { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  ADVANCE_OPTIONS, bookingDefaultsProblem, CANCELLATION_OPTIONS, EMPTY_BOOKING_DEFAULTS, loadBookingDefaults, NOTICE_OPTIONS, saveBookingDefaults,
  type BookingDefaults, type CancellationPolicy,
} from '../../lib/settings/bookingDefaults';
import { DetailHead } from './SettingsIcons';

// Settings → Bookings (hosts): the booking rules every new stay listing starts with.

type Msg = { text: string; kind: '' | 'success' | 'error' };

const toNumber = (value: string): number | null => (value.trim() === '' ? null : Math.max(0, Math.floor(Number(value))) || null);

export default function BookingsSection({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [values, setValues] = useState<BookingDefaults>(EMPTY_BOOKING_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>({ text: '', kind: '' });

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setLoading(false); return undefined; }
    let active = true;
    loadBookingDefaults(client, userId)
      .then((saved) => { if (active && saved) setValues(saved); })
      .catch(() => { if (active) setMsg({ text: 'Your booking defaults could not be loaded.', kind: 'error' }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const set = <K extends keyof BookingDefaults>(key: K, value: BookingDefaults[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setMsg({ text: '', kind: '' });
  };

  const save = async () => {
    const client = getSupabaseClient();
    if (!client || saving) return;
    const problem = bookingDefaultsProblem(values);
    if (problem) { setMsg({ text: problem, kind: 'error' }); return; }
    setSaving(true);
    const error = await saveBookingDefaults(client, userId, values);
    setSaving(false);
    setMsg(error ? { text: error, kind: 'error' } : { text: 'Saved. New listings will start with these rules.', kind: 'success' });
  };

  return (
    <div id="view-bookings">
      <DetailHead title="Bookings" onBack={onBack} />
      <p className="detail-sub">Set the booking rules every new stay listing starts with. You can still change them on each listing.</p>
      <div className="settings-section">
        <p className="section-title">How guests book</p>
        <div className="card">
          <div className="toggle-row">
            <div>
              <div className="toggle-label">Instant book</div>
              <div className="toggle-desc">Guests are confirmed straight away for open dates, without waiting for you to approve.</div>
            </div>
            <label className="switch">
              <input type="checkbox" id="booking-instant" checked={values.instant_book} disabled={loading} onChange={(event) => set('instant_book', event.target.checked)} />
              <span className="switch-track" />
            </label>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <p className="section-title">When guests can book</p>
        <div className="card" style={{ padding: '1.2rem' }}>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="booking-notice">Minimum notice</label>
              <select id="booking-notice" disabled={loading} value={values.min_notice_days == null ? '' : String(values.min_notice_days)} onChange={(event) => set('min_notice_days', toNumber(event.target.value))}>
                {NOTICE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="booking-advance">How far ahead</label>
              <select id="booking-advance" disabled={loading} value={values.max_advance_days == null ? '' : String(values.max_advance_days)} onChange={(event) => set('max_advance_days', toNumber(event.target.value))}>
                {ADVANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="booking-min-stay">Minimum stay (nights)</label>
              <input type="number" id="booking-min-stay" min={1} inputMode="numeric" placeholder="No minimum" disabled={loading} value={values.min_stay_nights ?? ''} onChange={(event) => set('min_stay_nights', toNumber(event.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="booking-max-stay">Maximum stay (nights)</label>
              <input type="number" id="booking-max-stay" min={1} inputMode="numeric" placeholder="No maximum" disabled={loading} value={values.max_stay_nights ?? ''} onChange={(event) => set('max_stay_nights', toNumber(event.target.value))} />
            </div>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <p className="section-title">House times &amp; cancellations</p>
        <div className="card" style={{ padding: '1.2rem' }}>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="booking-checkin">Check-in from</label>
              <input type="time" id="booking-checkin" disabled={loading} value={values.checkin_time || ''} onChange={(event) => set('checkin_time', event.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="booking-checkout">Check-out by</label>
              <input type="time" id="booking-checkout" disabled={loading} value={values.checkout_time || ''} onChange={(event) => set('checkout_time', event.target.value || null)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="booking-cancellation">Cancellation policy</label>
            <select id="booking-cancellation" disabled={loading} value={values.cancellation_policy} onChange={(event) => set('cancellation_policy', event.target.value as CancellationPolicy)}>
              {CANCELLATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn" id="booking-defaults-save" disabled={loading || saving} onClick={() => { void save(); }}>
            {saving ? 'Saving…' : 'Save booking defaults'}
          </button>
          <p className={`inline-msg${msg.kind ? ` ${msg.kind}` : ''}`} role="status" aria-live="polite">{msg.text}</p>
        </div>
        <div className="note-box">These rules apply to short stays, hotels and venues. Listings you already have keep their own rules; change them by editing the listing.</div>
      </div>
    </div>
  );
}
