import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { nextDay } from '../../lib/booking/bookingListing';
import {
  EVENT_COLORS, calendarErrorText, deleteEvent, saveEvent,
  type CalendarEvent, type CalendarListing, type EventColor, type EventFields,
} from '../../lib/calendar/hostCalendar';

// Add or change an event on the host's calendar. "Booked offline" takes the
// days (guests can't book them; on a hotel, the rooms entered); a note never
// does. For a nightly listing an offline booking is entered as check-in and
// check-out and stored as the nights it takes. A repeating event is changed
// or deleted as a whole series.

const previousDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const nightly = (listing: CalendarListing | undefined) => Boolean(listing && listing.price_unit !== 'day' && listing.price_unit !== 'hour');
const text = (value: string) => (value.trim() ? value.trim() : null);
const count = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Number(value) : null);

interface Props {
  client: SupabaseClient; hostId: string; listings: CalendarListing[];
  event: CalendarEvent | null; day: string; listingId: string | null;
  onClose: () => void; onSaved: (message: string) => void;
}

export default function EventForm({ client, hostId, listings, event, day, listingId, onClose, onSaved }: Props) {
  const first = useRef<HTMLInputElement>(null);
  const [blocks, setBlocks] = useState(event ? event.blocks : Boolean(listingId));
  const [listing, setListing] = useState(event ? event.listing_id || '' : listingId || (listings.length === 1 ? listings[0].id : ''));
  const chosen = listings.find((l) => l.id === listing);
  const stay = blocks && nightly(chosen);
  const [title, setTitle] = useState(event?.title || '');
  const [start, setStart] = useState(event ? event.series_start : day);
  // A nightly offline booking shows its check-out (the day after its last night).
  const [end, setEnd] = useState(event ? (event.blocks && nightly(listings.find((l) => l.id === event.listing_id)) ? nextDay(event.series_end) : event.series_end) : day);
  const [timed, setTimed] = useState(Boolean(event?.start_time));
  const [startTime, setStartTime] = useState(event?.start_time || '09:00');
  const [endTime, setEndTime] = useState(event?.end_time || '17:00');
  const [color, setColor] = useState<EventColor | null>(event?.color || (event ? null : 'blue'));
  const [clientName, setClientName] = useState(event?.client_name || '');
  const [clientPhone, setClientPhone] = useState(event?.client_phone || '');
  const [guests, setGuests] = useState(event?.guest_count ? String(event.guest_count) : '');
  const [amount, setAmount] = useState(event?.amount != null ? String(event.amount) : '');
  const [rooms, setRooms] = useState(String(event?.units || 1));
  const [repeat, setRepeat] = useState<EventFields['repeat']>(event?.repeat || null);
  const [until, setUntil] = useState(event?.repeat_until || '');
  const [notes, setNotes] = useState(event?.notes || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { first.current?.focus(); }, []);
  // A nightly stay needs a check-out after check-in.
  useEffect(() => { if (stay && end <= start) setEnd(nextDay(start)); }, [stay, start, end]);

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (blocks && !listing) { setError('Choose the place this booking is for.'); return; }
    const lastDay = stay ? previousDay(end) : end;
    if (lastDay < start) { setError(stay ? 'Check-out must be after check-in.' : 'The last day can’t be before the first day.'); return; }
    const fields: EventFields = {
      listing_id: listing || null, title: title.trim(), notes: text(notes), color, start_date: start, end_date: lastDay,
      start_time: timed ? startTime : null, end_time: timed ? endTime : null, blocks,
      client_name: text(clientName), client_phone: text(clientPhone), guest_count: count(guests), amount: count(amount),
      units: blocks && chosen?.category === 'hotel' ? Math.max(1, Math.min(Number(rooms) || 1, chosen.units || 1)) : 1,
      repeat, repeat_until: repeat && until ? until : null,
    };
    setSaving(true);
    setError(null);
    try {
      await saveEvent(client, hostId, fields, event?.id);
      onSaved(event ? 'Saved.' : blocks ? 'Added. Guests can’t book those days.' : 'Note added.');
    } catch (failure) {
      console.error('Calendar: the event could not be saved:', failure);
      setError(calendarErrorText(failure, 'That didn’t save. Please try again.'));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setSaving(true);
    try {
      await deleteEvent(client, event.id);
      onSaved(event.repeat ? 'Deleted every repeat.' : 'Deleted.');
    } catch (failure) {
      console.error('Calendar: the event could not be deleted:', failure);
      setError(calendarErrorText(failure, 'That didn’t delete. Please try again.'));
      setSaving(false);
    }
  };

  return (
    <div className="vc-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="vc-dialog" role="dialog" aria-modal="true" aria-labelledby="vc-event-title" onSubmit={submit}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="vc-panel-head">
          <h2 id="vc-event-title">{event ? 'Edit' : 'Add to calendar'}</h2>
          <button type="button" className="vc-close is-shown" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="vc-kinds" role="radiogroup" aria-label="Type">
          <button type="button" role="radio" aria-checked={blocks} onClick={() => setBlocks(true)}><strong>Booked offline</strong><span>Phone, walk-in or another site. Guests can’t book it.</span></button>
          <button type="button" role="radio" aria-checked={!blocks} onClick={() => setBlocks(false)}><strong>Note</strong><span>A reminder for you. Bookings stay open.</span></button>
        </div>
        <label className="vc-field">What’s happening
          <input ref={first} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={blocks ? 'e.g. Wanjiku & Otieno wedding' : 'e.g. Deep clean'} />
        </label>
        <label className="vc-field">Place
          <select value={listing} onChange={(e) => setListing(e.target.value)} required={blocks}>
            {!blocks && <option value="">Not tied to a place</option>}
            {blocks && !listing && <option value="">Choose a place</option>}
            {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </label>
        <div className="vc-row">
          <label className="vc-field">{stay ? 'Check-in' : 'First day'}<input type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="vc-field">{stay ? 'Check-out' : 'Last day'}<input type="date" required min={stay ? nextDay(start) : start} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <label className="vc-check"><input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />Set a time</label>
        {timed && (
          <div className="vc-row">
            <label className="vc-field">Starts<input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
            <label className="vc-field">Ends<input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
          </div>
        )}
        <div className="vc-field">Colour
          <div className="vc-colors" role="radiogroup" aria-label="Colour">
            {EVENT_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={`vc-color is-${c}`} onClick={() => setColor(c)} />)}
          </div>
        </div>
        {blocks && (
          <>
            <div className="vc-row">
              <label className="vc-field">Client name<input maxLength={120} value={clientName} onChange={(e) => setClientName(e.target.value)} /></label>
              <label className="vc-field">Phone<input type="tel" maxLength={30} value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} /></label>
            </div>
            <div className="vc-row">
              <label className="vc-field">Guests<input type="number" min={1} inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value)} /></label>
              <label className="vc-field">Amount agreed (KES)<input type="number" min={0} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              {chosen?.category === 'hotel' && (
                <label className="vc-field">Rooms<input type="number" min={1} max={chosen.units || 1} inputMode="numeric" value={rooms} onChange={(e) => setRooms(e.target.value)} /></label>
              )}
            </div>
          </>
        )}
        <div className="vc-row">
          <label className="vc-field">Repeat
            <select value={repeat || ''} onChange={(e) => setRepeat((e.target.value || null) as EventFields['repeat'])}>
              <option value="">Doesn’t repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
            </select>
          </label>
          {repeat && <label className="vc-field">Until (optional)<input type="date" min={start} value={until} onChange={(e) => setUntil(e.target.value)} /></label>}
        </div>
        <label className="vc-field">Notes<textarea maxLength={2000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {event?.repeat && <p className="vc-muted">This repeats. Changes apply to every {event.repeat === 'weekly' ? 'week' : 'month'}.</p>}
        {error && <p className="vc-error" role="alert">{error}</p>}
        <div className="vc-actions">
          {event && <button type="button" className="vc-btn is-danger" disabled={saving} onClick={() => { void remove(); }}>Delete</button>}
          <button type="button" className="vc-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="vc-btn is-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
