import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calendarErrorText, setTurnover, type CalendarListing } from '../../lib/calendar/hostCalendar';
import { WeekendPrice } from './PricePanel';
import SyncPanel from './SyncPanel';
import ToggleRow from './ToggleRow';
import BookingRules from './BookingRules';

// A place's settings, in a drawer from the right (a sheet on phones), opened
// from ⚙ beside the place: Prices (weekend price), Availability (closed every
// week, cleaning days, hire hours), Rules (instant book, notice, how far ahead,
// stay lengths, house times) and Sync (calendar links). They used to sit
// under the day in one long panel.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BUFFERS = [0, 15, 30, 45, 60, 90, 120];
type Tab = 'prices' | 'availability' | 'rules' | 'sync';
const TAB_LABEL: Record<Tab, string> = { prices: 'Prices', availability: 'Availability', rules: 'Rules', sync: 'Sync' };

interface Props {
  client: SupabaseClient;
  hostId: string;
  listing: CalendarListing;
  color: string;
  busy: boolean;
  /** Playing its exit (the drawer stays on screen until it ends). */
  closing: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
  /** Reload the month without a message (the sync panel reports its own). */
  onRefresh: () => void;
  onToggleWeekday: (listing: CalendarListing, dow: number) => void;
  onSaveHours: (listing: CalendarListing, start: string | null, end: string | null, buffer: number) => void;
}

export default function PlaceSettings({ client, hostId, listing, color, busy, closing, onClose, onChanged, onError, onRefresh, onToggleWeekday, onSaveHours }: Props) {
  const [tab, setTab] = useState<Tab>('prices');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  const hourly = listing.price_unit === 'hour';
  const cleaning = listing.category !== 'hotel' && !hourly;

  const turnover = async (days: number) => {
    try {
      await setTurnover(client, listing.id, days);
      onChanged(days ? `${days} day${days === 1 ? '' : 's'} kept free after each stay.` : 'No days kept free between stays.');
    } catch (error) {
      onError(calendarErrorText(error, 'That didn’t save. Please try again.'));
    }
  };

  return (
    <div className={`vc-drawer-backdrop${closing ? ' is-closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} tabIndex={-1} className="vc-drawer" role="dialog" aria-modal="true" aria-labelledby="vc-settings-title"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="vc-panel-head">
          <h2 id="vc-settings-title"><i className="vc-swatch" style={{ background: color }} aria-hidden="true" />{listing.title}</h2>
          <button type="button" className="vc-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <ToggleRow label="Settings" activeKey={tab} className="vc-tabs">
          {(['prices', 'availability', 'rules', 'sync'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
          ))}
        </ToggleRow>

        {tab === 'prices' && <WeekendPrice client={client} listing={listing} onChanged={onChanged} onError={onError} />}

        {tab === 'availability' && (
          <div className="vc-form">
            <section className="vc-section">
              <h3>Closed every week</h3>
              <div className="vc-weekdays" role="group" aria-label={`Days ${listing.title} is closed every week`}>
                {WEEKDAYS.map((name, dow) => (
                  <button key={name} type="button" aria-pressed={Boolean(listing.closed_weekdays?.includes(dow))} disabled={busy}
                    onClick={() => onToggleWeekday(listing, dow)}>{name.slice(0, 2)}</button>
                ))}
              </div>
            </section>
            {cleaning && (
              <label className="vc-field">Days kept free after each stay (cleaning)
                <select value={listing.turnover_days || 0} disabled={busy} onChange={(e) => { void turnover(Number(e.target.value)); }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n ? `${n} day${n === 1 ? '' : 's'}` : 'None'}</option>)}
                </select>
              </label>
            )}
            {hourly && <HireHours listing={listing} busy={busy} onSave={(start, end, buffer) => onSaveHours(listing, start, end, buffer)} />}
          </div>
        )}

        {tab === 'rules' && <BookingRules client={client} listing={listing} onChanged={onChanged} onError={onError} />}

        {tab === 'sync' && <SyncPanel client={client} hostId={hostId} listing={listing} showToast={onError} onChanged={onRefresh} />}
      </div>
    </div>
  );
}

/** Hire hours and the gap kept between bookings, for a venue hired by the hour. */
function HireHours({ listing, busy, onSave }: { listing: CalendarListing; busy: boolean; onSave: (start: string | null, end: string | null, buffer: number) => void }) {
  const [anyTime, setAnyTime] = useState(!listing.hire_start);
  const [start, setStart] = useState(listing.hire_start || '08:00');
  const [end, setEnd] = useState(listing.hire_end || '22:00');
  const [buffer, setBuffer] = useState(listing.buffer_minutes || 0);
  return (
    <form className="vc-section vc-form" onSubmit={(event) => { event.preventDefault(); onSave(anyTime ? null : start, anyTime ? null : end, buffer); }}>
      <h3>Hire hours</h3>
      <label className="vc-check"><input type="checkbox" checked={anyTime} onChange={(event) => setAnyTime(event.target.checked)} />Any time of day</label>
      {!anyTime && (
        <div className="vc-row">
          <label className="vc-field">Opens<input type="time" required value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="vc-field">Closes<input type="time" required value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
      )}
      <label className="vc-field">Gap between bookings (set-up and clean-up)
        <select value={buffer} onChange={(event) => setBuffer(Number(event.target.value))}>
          {BUFFERS.map((m) => <option key={m} value={m}>{m ? `${m} minutes` : 'None'}</option>)}
        </select>
      </label>
      <div className="vc-actions"><button type="submit" className="vc-btn" disabled={busy}>Save hours</button></div>
    </form>
  );
}
