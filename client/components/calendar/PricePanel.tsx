import React, { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dayLabel, ksh } from '../../lib/booking/bookingListing';
import {
  calendarErrorText, parsePrice, priceOn, setDatePrice, setWeekendPrice,
  type CalendarListing, type DatePrice,
} from '../../lib/calendar/hostCalendar';

// Prices for one stay, hotel or venue listing. DayPrice sits in the day panel:
// the day's price, why, and a special price for it. WeekendPrice sits in the
// place's settings. The database prices bookings the same way.

interface Common {
  client: SupabaseClient; listing: CalendarListing;
  onChanged: (message: string) => void; onError: (message: string) => void;
}

const unitOf = (listing: CalendarListing) => (listing.price_unit === 'hour' ? 'hour' : listing.price_unit === 'day' ? 'day' : 'night');

/** Runs a change, reports it, and keeps the buttons busy meanwhile. */
function useSave({ onChanged, onError }: Pick<Common, 'onChanged' | 'onError'>) {
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>, message: string) => {
    setBusy(true);
    try {
      await work();
      onChanged(message);
      return true;
    } catch (error) {
      onError(calendarErrorText(error, 'That didn’t save. Please try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function DayPrice({ client, listing, prices, day, today, onChanged, onError }: Common & { prices: DatePrice[]; day: string; today: string }) {
  const current = priceOn(listing, prices, day);
  const [price, setPrice] = useState('');
  const [label, setLabel] = useState('');
  const { busy, run } = useSave({ onChanged, onError });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = parsePrice(price);
    if (!amount) { onError('Enter a price in KSh.'); return; }
    void run(() => setDatePrice(client, listing.id, day, day, amount, label.trim() || null), `${dayLabel(day)} is now ${ksh(amount)}.`)
      .then((ok) => { if (ok) { setPrice(''); setLabel(''); } });
  };

  return (
    <section className="vc-section" aria-label="Price">
      <h3>Price</h3>
      <p className="vc-muted"><strong className="vc-strong">{ksh(current.price)}</strong> a {unitOf(listing)} · {current.label || 'normal price'}</p>
      {day >= today && (
        <form className="vc-form" onSubmit={save}>
          <div className="vc-row">
            <label className="vc-field">Special price (KSh)<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={String(current.price || '')} /></label>
            <label className="vc-field">Label (optional)<input maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Christmas" /></label>
          </div>
          <div className="vc-actions">
            <button type="submit" className="vc-btn" disabled={busy}>Set price</button>
            {current.special && current.label !== 'Weekend' && (
              <button type="button" className="vc-btn" disabled={busy} onClick={() => { void run(() => setDatePrice(client, listing.id, day, day, null), 'Back to the usual price.'); }}>Usual price</button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

export function WeekendPrice({ client, listing, onChanged, onError }: Common) {
  const [weekend, setWeekend] = useState(listing.weekend_price != null ? String(Number(listing.weekend_price)) : '');
  const { busy, run } = useSave({ onChanged, onError });
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = weekend.trim() ? parsePrice(weekend) : null;
    if (weekend.trim() && !amount) { onError('Enter a price in KSh, or leave it empty.'); return; }
    void run(() => setWeekendPrice(client, listing.id, amount), amount ? `Weekend price set to ${ksh(amount)}.` : 'Weekend price removed.');
  };
  return (
    <form className="vc-form" onSubmit={save}>
      <p className="vc-muted">Normal price: <strong className="vc-strong">{ksh(Number(listing.price) || 0)}</strong> a {unitOf(listing)}. Change it by editing the listing.</p>
      <label className="vc-field">Weekend price (KSh, {unitOf(listing) === 'night' ? 'Friday and Saturday nights' : 'Saturdays and Sundays'})
        <input inputMode="numeric" value={weekend} onChange={(e) => setWeekend(e.target.value)} placeholder="Same as the normal price" />
      </label>
      <div className="vc-actions"><button type="submit" className="vc-btn" disabled={busy}>Save weekend price</button></div>
      <p className="vc-muted">For special dates (Christmas, school holidays), use Select days on the calendar, then Set price.</p>
    </form>
  );
}
