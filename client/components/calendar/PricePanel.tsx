import React, { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dayLabel, ksh } from '../../lib/booking/bookingListing';
import {
  calendarErrorText, parsePrice, priceOn, setDatePrice, setTurnover, setWeekendPrice,
  type CalendarListing, type DatePrice,
} from '../../lib/calendar/hostCalendar';

// Prices and cleaning days for one stay, hotel or venue listing: the selected
// day's price (and a special price for it), the weekend price, and the days
// kept free after each stay. The database prices bookings the same way.

interface Props {
  client: SupabaseClient; listing: CalendarListing; prices: DatePrice[]; day: string; today: string;
  onChanged: (message: string) => void; onError: (message: string) => void;
}

export default function PricePanel({ client, listing, prices, day, today, onChanged, onError }: Props) {
  const current = priceOn(listing, prices, day);
  const [dayPrice, setDayPrice] = useState('');
  const [label, setLabel] = useState('');
  const [weekend, setWeekend] = useState(listing.weekend_price != null ? String(Number(listing.weekend_price)) : '');
  const [busy, setBusy] = useState(false);
  const unit = listing.price_unit === 'hour' ? 'hour' : listing.price_unit === 'day' ? 'day' : 'night';

  const run = async (work: () => Promise<void>, message: string) => {
    setBusy(true);
    try {
      await work();
      onChanged(message);
    } catch (error) {
      onError(calendarErrorText(error, 'That didn’t save. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const saveDay = (event: React.FormEvent) => {
    event.preventDefault();
    const price = parsePrice(dayPrice);
    if (!price) { onError('Enter a price in KSh.'); return; }
    void run(() => setDatePrice(client, listing.id, day, day, price, label.trim() || null), `${dayLabel(day)} is now ${ksh(price)}.`).then(() => { setDayPrice(''); setLabel(''); });
  };

  const saveWeekend = (event: React.FormEvent) => {
    event.preventDefault();
    const price = weekend.trim() ? parsePrice(weekend) : null;
    if (weekend.trim() && !price) { onError('Enter a price in KSh, or leave it empty.'); return; }
    void run(() => setWeekendPrice(client, listing.id, price), price ? `Weekend price set to ${ksh(price)}.` : 'Weekend price removed.');
  };

  return (
    <section className="vc-weekly vc-prices" aria-label="Prices">
      <h3>Price on {dayLabel(day)}</h3>
      <p className="vc-muted"><strong>{ksh(current.price)}</strong> a {unit}{current.label ? ` · ${current.label}` : ' · normal price'}</p>
      {day >= today && (
        <form className="vc-feed-form" onSubmit={saveDay}>
          <div className="vc-row">
            <label className="vc-field">Special price (KSh)<input inputMode="numeric" value={dayPrice} onChange={(e) => setDayPrice(e.target.value)} placeholder={String(current.price || '')} /></label>
            <label className="vc-field">Label (optional)<input maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Christmas" /></label>
          </div>
          <div className="vc-place-actions">
            <button type="submit" className="vc-btn" disabled={busy}>Set price</button>
            {current.special && current.label !== 'Weekend' && (
              <button type="button" className="vc-btn" disabled={busy} onClick={() => { void run(() => setDatePrice(client, listing.id, day, day, null), 'Back to the usual price.'); }}>Use the usual price</button>
            )}
          </div>
          <p className="vc-muted">For several days, use Select days, then Set price.</p>
        </form>
      )}
      <form className="vc-feed-form" onSubmit={saveWeekend}>
        <label className="vc-field">Weekend price (KSh, {unit === 'night' ? 'Friday and Saturday nights' : 'Saturdays and Sundays'})
          <input inputMode="numeric" value={weekend} onChange={(e) => setWeekend(e.target.value)} placeholder="Same as the normal price" />
        </label>
        <button type="submit" className="vc-btn" disabled={busy}>Save weekend price</button>
      </form>
      {listing.category !== 'hotel' && listing.price_unit !== 'hour' && (
        <label className="vc-field">Days kept free after each stay (cleaning)
          <select value={listing.turnover_days || 0} disabled={busy}
            onChange={(e) => { const days = Number(e.target.value); void run(() => setTurnover(client, listing.id, days), days ? `${days} day${days === 1 ? '' : 's'} kept free after each stay.` : 'No days kept free between stays.'); }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n ? `${n} day${n === 1 ? '' : 's'}` : 'None'}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}
