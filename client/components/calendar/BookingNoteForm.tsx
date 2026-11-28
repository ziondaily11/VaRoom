import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_COLORS, calendarErrorText, saveBookingNote, type CalendarBooking, type EventColor } from '../../lib/calendar/hostCalendar';
import { Icon, Line } from './EventForm';

// The host's own title, notes and colour on a VaRoom booking: arrangements
// made with the guest outside VaRoom ("Decor by Zawadi, arrive 7am"). Only
// the host (and their Managers) see them; the booking itself (dates, guests,
// price) is unchanged. Clearing everything removes the note.

interface Props {
  client: SupabaseClient;
  hostId: string;
  booking: CalendarBooking;
  closing: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function BookingNoteForm({ client, hostId, booking, closing, onClose, onSaved }: Props) {
  const first = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(booking.host_title || '');
  const [notes, setNotes] = useState(booking.host_notes || '');
  const [color, setColor] = useState<EventColor | null>(booking.host_color || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { first.current?.focus(); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveBookingNote(client, hostId, booking.id, { title, notes, color });
      onSaved(title.trim() || notes.trim() || color ? 'Saved. Only you see these notes.' : 'Your notes were removed.');
    } catch (failure) {
      console.error('Calendar: the booking note could not be saved:', failure);
      setError(calendarErrorText(failure, 'That didn’t save. Please try again.'));
      setSaving(false);
    }
  };

  return (
    <div className={`vc-dialog-backdrop${closing ? ' is-closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="vc-dialog vc-card-form" role="dialog" aria-modal="true" aria-labelledby="vc-note-title" onSubmit={save}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="vc-form-head">
          <span className="vc-form-icon"><Icon name="notes" /></span>
          <div>
            <h2 id="vc-note-title">Your notes on this booking</h2>
            <p className="vc-muted">Arrangements made with {booking.guest || 'the guest'}. Only you see them.</p>
          </div>
          <button type="button" className="vc-close is-shown" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="vc-lines">
          <Line icon="title" label="Title">
            <input ref={first} maxLength={120} aria-label="Title" placeholder={booking.guest || 'e.g. Kamau & Njeri wedding'} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Line>
          <Line icon="notes" label="Notes">
            <textarea maxLength={2000} rows={4} aria-label="Notes" placeholder="e.g. Decor by Zawadi, arrive 7am. Balance paid in cash." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Line>
          <Line icon="colour" label="Colour">
            <div className="vc-colors" role="radiogroup" aria-label="Colour">
              <button type="button" role="radio" aria-checked={color === null} aria-label="The place's colour" className="vc-color is-none" onClick={() => setColor(null)} />
              {EVENT_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={`vc-color is-${c}`} onClick={() => setColor(c)} />)}
            </div>
          </Line>
        </div>
        {error && <p className="vc-error" role="alert">{error}</p>}
        <div className="vc-actions vc-form-foot">
          <button type="button" className="vc-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="vc-btn is-dark" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
