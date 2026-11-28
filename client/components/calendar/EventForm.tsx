import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { nextDay } from '../../lib/booking/bookingListing';
import {
  EVENT_COLORS, calendarErrorText, deleteEvent, saveEvent,
  type CalendarEvent, type CalendarListing, type EventColor, type EventFields,
} from '../../lib/calendar/hostCalendar';
import ToggleRow from './ToggleRow';

// Add or change an event on the host's calendar. "Booked offline" takes the
// days (guests can't book them; on a hotel, the rooms entered); a viewing (a
// time and the client's details) and a note never do. Property, office and
// shop listings are planned, not booked by the night: they offer viewings and
// notes only. For a nightly listing an offline booking is entered as check-in and
// check-out and stored as the nights it takes. A repeating event is changed
// or deleted as a whole series.
//
// Laid out as a card (the "Create Schedule" reference): an icon and a label on
// each line. Opened from an empty hour in Week or Day, it starts at that hour
// and sits beside the click (a bottom sheet on phones).

const previousDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const nightly = (listing: CalendarListing | undefined) => Boolean(listing && listing.price_unit !== 'day' && listing.price_unit !== 'hour');
const text = (value: string) => (value.trim() ? value.trim() : null);
const plusHour = (time: string) => {
  const m = Math.min(Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + 60, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const KIND_HINT = { offline: 'Phone, walk-in or another site. Guests can’t book it.', viewing: 'Someone coming to see the place.', note: 'A reminder for you. Bookings stay open.' } as const;
const PATHS: Record<string, string> = {
  title: 'M4 7V5h16v2M12 5v14M9 19h6', notes: 'M5 6h14M5 12h14M5 18h9', place: 'M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  date: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', time: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', client: 'M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  guests: 'M17 21a5 5 0 0 0-10 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19a4 4 0 0 0-3-3.9M3 19a4 4 0 0 1 3-3.9', repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  colour: 'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1 3.7A1.5 1.5 0 0 1 12 21Z', bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
};
export const Icon = ({ name }: { name: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>;
/** One line of the card: an icon, a label, the fields. */
export const Line = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
  <div className="vc-line"><span className="vc-line-icon"><Icon name={icon} /></span><span className="vc-line-label">{label}</span><div className="vc-line-field">{children}</div></div>
);
const count = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Number(value) : null);

interface Props {
  client: SupabaseClient; hostId: string; listings: CalendarListing[];
  event: CalendarEvent | null; day: string; listingId: string | null;
  /** A new entry's starting values, e.g. "Close rooms…" on a hotel. */
  preset?: { title: string; listingId: string; color: EventColor } | null;
  /** Playing its exit (the dialog stays on screen until it ends). */
  closing?: boolean;
  /** Opened from an empty hour: it starts then, beside the click (screen coordinates). */
  time?: string | null;
  anchor?: { x: number; y: number } | null;
  onClose: () => void; onSaved: (message: string) => void;
}

export default function EventForm({ client, hostId, listings, event, day, listingId, preset = null, closing = false, time = null, anchor = null, onClose, onSaved }: Props) {
  const first = useRef<HTMLInputElement>(null);
  const stayListings = listings.filter((l) => !l.planner);
  const plannerOnly = stayListings.length === 0;
  const startListing = event ? event.listing_id || '' : preset?.listingId || listingId || (listings.length === 1 ? listings[0].id : '');
  const startsPlanner = Boolean(listings.find((l) => l.id === startListing)?.planner) || plannerOnly;
  const [kind, setKind] = useState<'offline' | 'viewing' | 'note'>(event ? (event.blocks ? 'offline' : event.viewing ? 'viewing' : 'note')
    : preset ? 'offline' : startsPlanner ? 'viewing' : listingId ? 'offline' : 'note');
  const blocks = kind === 'offline';
  const viewing = kind === 'viewing';
  const [listing, setListing] = useState(startListing);
  const chosen = listings.find((l) => l.id === listing);
  const choices = blocks ? stayListings : listings;
  const stay = blocks && nightly(chosen);
  const [title, setTitle] = useState(event?.title || preset?.title || '');
  const [start, setStart] = useState(event ? event.series_start : day);
  // A nightly offline booking shows its check-out (the day after its last night).
  const [end, setEnd] = useState(event ? (event.blocks && nightly(listings.find((l) => l.id === event.listing_id)) ? nextDay(event.series_end) : event.series_end) : day);
  const [timed, setTimed] = useState(Boolean(event?.start_time) || (!event && (startsPlanner || Boolean(time))));
  const [startTime, setStartTime] = useState(event?.start_time || time || '09:00');
  const [endTime, setEndTime] = useState(event?.end_time || (time ? plusHour(time) : '17:00'));
  const [color, setColor] = useState<EventColor | null>(event?.color || (event ? null : preset?.color || 'blue'));
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
  // Beside the clicked hour when there is room (desktop and tablets); centred otherwise.
  const card = useRef<HTMLFormElement>(null);
  const [place, setPlace] = useState<React.CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    if (!anchor || !card.current || window.innerWidth <= 760) return;
    const width = Math.min(460, window.innerWidth - 32);
    const height = card.current.offsetHeight;
    const right = anchor.x + 16 + width <= window.innerWidth - 16;
    const left = right ? anchor.x + 16 : Math.max(16, anchor.x - 16 - width);
    const top = Math.min(Math.max(16, anchor.y - 90), Math.max(16, window.innerHeight - height - 16));
    setPlace({ position: 'fixed', left, top, width, maxHeight: window.innerHeight - top - 16, transformOrigin: `${right ? 'left' : 'right'} ${anchor.y - top}px` });
  }, [anchor]);
  // A nightly stay needs a check-out after check-in.
  useEffect(() => { if (stay && end <= start) setEnd(nextDay(start)); }, [stay, start, end]);

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (blocks && !listing) { setError('Choose the place this booking is for.'); return; }
    const lastDay = stay ? previousDay(end) : end;
    if (lastDay < start) { setError(stay ? 'Check-out must be after check-in.' : 'The last day can’t be before the first day.'); return; }
    const fields: EventFields = {
      listing_id: listing || null, title: title.trim(), notes: text(notes), color, start_date: start, end_date: lastDay,
      start_time: timed ? startTime : null, end_time: timed ? endTime : null, blocks, viewing,
      client_name: blocks || viewing ? text(clientName) : null, client_phone: blocks || viewing ? text(clientPhone) : null,
      guest_count: blocks ? count(guests) : null, amount: blocks ? count(amount) : null,
      units: blocks && chosen?.category === 'hotel' ? Math.max(1, Math.min(Number(rooms) || 1, chosen.units || 1)) : 1,
      repeat, repeat_until: repeat && until ? until : null,
    };
    setSaving(true);
    setError(null);
    try {
      await saveEvent(client, hostId, fields, event?.id);
      onSaved(event ? 'Saved.' : blocks ? 'Added. Guests can’t book those days.' : viewing ? 'Viewing added.' : 'Note added.');
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
    <div className={`vc-dialog-backdrop${anchor ? ' is-anchored' : ''}${closing ? ' is-closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form ref={card} className="vc-dialog vc-card-form" style={place} role="dialog" aria-modal="true" aria-labelledby="vc-event-title" onSubmit={submit}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="vc-form-head">
          <span className="vc-form-icon"><Icon name="date" /></span>
          <div>
            <h2 id="vc-event-title">{event ? 'Edit' : 'Add to calendar'}</h2>
            <p className="vc-muted">{event ? 'Change the details below.' : 'Fill in the details to add it to your calendar.'}</p>
          </div>
          <button type="button" className="vc-close is-shown" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <ToggleRow label="Kind" activeKey={kind} className="vc-kind-switch">
          {!plannerOnly && (
            <button type="button" role="tab" aria-selected={blocks} onClick={() => { setKind('offline'); if (chosen?.planner) setListing(''); }}>Booked offline</button>
          )}
          <button type="button" role="tab" aria-selected={viewing} onClick={() => { setKind('viewing'); setTimed(true); }}>Viewing</button>
          <button type="button" role="tab" aria-selected={kind === 'note'} onClick={() => setKind('note')}>Note</button>
        </ToggleRow>
        <p className="vc-muted vc-kind-hint">{KIND_HINT[kind]}</p>
        <div className="vc-lines">
          <Line icon="title" label="Title">
            <input ref={first} required maxLength={120} aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={blocks ? 'e.g. Wanjiku & Otieno wedding' : viewing ? 'e.g. Viewing with Otieno' : 'e.g. Deep clean'} />
          </Line>
          <Line icon="notes" label="Notes">
            <textarea maxLength={2000} rows={2} aria-label="Notes" placeholder="Add a description" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Line>
          <Line icon="place" label="Place">
            <select aria-label="Place" value={listing} onChange={(e) => setListing(e.target.value)} required={blocks}>
              {!blocks && <option value="">Not tied to a place</option>}
              {blocks && !listing && <option value="">Choose a place</option>}
              {choices.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </Line>
          <Line icon="date" label={stay ? 'Check-in, out' : 'Date'}>
            <div className="vc-span">
              <input type="date" required aria-label={stay ? 'Check-in' : 'First day'} value={start} onChange={(e) => setStart(e.target.value)} />
              <span aria-hidden="true">→</span>
              <input type="date" required aria-label={stay ? 'Check-out' : 'Last day'} min={stay ? nextDay(start) : start} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </Line>
          <Line icon="time" label="Time">
            {timed ? (
              <div className="vc-span">
                <input type="time" required aria-label="Starts" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                <span aria-hidden="true">→</span>
                <input type="time" required aria-label="Ends" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                <button type="button" className="vc-textbtn" onClick={() => setTimed(false)}>All day</button>
              </div>
            ) : <button type="button" className="vc-textbtn" onClick={() => setTimed(true)}>All day · add a time</button>}
          </Line>
          {(blocks || viewing) && (
            <Line icon="client" label="Client">
              <div className="vc-span">
                <input maxLength={120} aria-label="Client name" placeholder="Name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                <input type="tel" maxLength={30} aria-label="Phone" placeholder="Phone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </div>
            </Line>
          )}
          {blocks && (
            <Line icon="guests" label={chosen?.category === 'hotel' ? 'Guests, rooms' : 'Guests, amount'}>
              <div className="vc-span">
                <input type="number" min={1} inputMode="numeric" aria-label="Guests" placeholder="Guests" value={guests} onChange={(e) => setGuests(e.target.value)} />
                <input type="number" min={0} inputMode="numeric" aria-label="Amount agreed (KES)" placeholder="KES agreed" value={amount} onChange={(e) => setAmount(e.target.value)} />
                {chosen?.category === 'hotel' && (
                  <input type="number" min={1} max={chosen.units || 1} inputMode="numeric" aria-label="Rooms" placeholder="Rooms" value={rooms} onChange={(e) => setRooms(e.target.value)} />
                )}
              </div>
            </Line>
          )}
          <Line icon="repeat" label="Repeat">
            <div className="vc-span">
              <select aria-label="Repeat" value={repeat || ''} onChange={(e) => setRepeat((e.target.value || null) as EventFields['repeat'])}>
                <option value="">Doesn’t repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
              </select>
              {repeat && <input type="date" aria-label="Until (optional)" min={start} value={until} onChange={(e) => setUntil(e.target.value)} />}
            </div>
          </Line>
          <Line icon="colour" label="Colour">
            <div className="vc-colors" role="radiogroup" aria-label="Colour">
              {EVENT_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={`vc-color is-${c}`} onClick={() => setColor(c)} />)}
            </div>
          </Line>
          <Line icon="bell" label="Reminder"><span className="vc-muted">The evening before, in your notifications</span></Line>
        </div>
        {event?.repeat && <p className="vc-muted">This repeats. Changes apply to every {event.repeat === 'weekly' ? 'week' : 'month'}.</p>}
        {error && <p className="vc-error" role="alert">{error}</p>}
        <div className="vc-actions vc-form-foot">
          {event && <button type="button" className="vc-btn is-danger" disabled={saving} onClick={() => { void remove(); }}>Delete</button>}
          <button type="button" className="vc-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="vc-btn is-dark" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
