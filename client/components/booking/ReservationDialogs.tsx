import React, { useEffect, useRef, useState } from 'react';
import { todayString, type DiningConfig, type TableRequest } from '../../lib/booking/bookingListing';
import SendingButton, { type SendingHandle } from './SendingButton';

// The hotel's Reserve a Table form, a sheet over the page. It closes with
// Done, the × button, Escape or a tap outside, and gives focus back to what
// opened it. (Hotels taking rooms and tables now choose with the Room / Table
// switch in the booking widget, so the old "What would you like to reserve?"
// dialog is gone.) The sheet rises in (animation.md §8.3); reduced motion
// shows it at once.

export function TableReservationDialog({ listingId, dining, clientName, clientPhone, onSend, onClose }: {
  listingId: string;
  dining: DiningConfig;
  clientName: string;
  clientPhone: string;
  /** Resolves an error message, or null when the hotel received the request. */
  onSend: (request: TableRequest) => Promise<string | null>;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState(clientPhone);
  const [guests, setGuests] = useState('2');
  const [tables, setTables] = useState('1');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [occasion, setOccasion] = useState(false);
  const [occasionDetails, setOccasionDetails] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const submitting = useRef(false);
  const button = useRef<SendingHandle>(null);
  const sheet = useRef<HTMLFormElement>(null);

  // Focus moves into the sheet, Escape closes it, and focus returns afterwards.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = sheet.current?.querySelector<HTMLElement>('input:not([readonly])') || sheet.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onClose]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!event.currentTarget.reportValidity()) return;
    submitting.current = true;
    setError('');
    button.current?.start();
    const failure = await onSend({
      listing_id: listingId, phone, guest_count: Number(guests), table_count: Number(tables),
      requested_date: date, requested_time: time, special_occasion: occasion, occasion_details: occasionDetails,
    });
    if (failure) {
      button.current?.error();
      submitting.current = false;
      setError(failure);
      return;
    }
    await button.current?.complete();
    setSent(true);
  };

  return (
    <div id="table-reservation-overlay" className="sheet-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="table-sheet-title" noValidate onSubmit={(event) => { void submit(event); }}>
        {sent ? (
          <div className="sheet-sent">
            <span className="sent-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path pathLength={1} d="m5 12.5 4.5 4.5L19 7" /></svg>
            </span>
            <h2 id="table-sheet-title">Request sent</h2>
            <p>The hotel has your contact details and will follow up about your table.</p>
            <button type="button" className="confirm-btn" data-close="" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="sheet-head">
              <div>
                <h2 id="table-sheet-title">Reserve a table</h2>
                <p>{dining.restaurant_name} · {dining.opening_hours}</p>
              </div>
              <button type="button" className="sheet-close" data-close="" aria-label="Close" onClick={onClose}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <label className="sheet-label" htmlFor="table-name">Your name</label>
            <input id="table-name" value={clientName} readOnly />
            <label className="sheet-label" htmlFor="table-phone">Phone number</label>
            <input id="table-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required placeholder="Phone number" autoComplete="tel" />
            <div className="sheet-pair">
              <div><label className="sheet-label" htmlFor="table-guests">Guests</label><input id="table-guests" type="number" min="1" inputMode="numeric" value={guests} onChange={(event) => setGuests(event.target.value)} required /></div>
              <div><label className="sheet-label" htmlFor="table-count">Tables</label><input id="table-count" type="number" min="1" max={Number(dining.tables_available)} inputMode="numeric" value={tables} onChange={(event) => setTables(event.target.value)} required /></div>
            </div>
            <div className="sheet-pair">
              <div><label className="sheet-label" htmlFor="table-date">Arrival date</label><input id="table-date" type="date" min={todayString()} value={date} onChange={(event) => setDate(event.target.value)} required /></div>
              <div><label className="sheet-label" htmlFor="table-time">Arrival time</label><input id="table-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></div>
            </div>
            <label className="sheet-check"><input id="table-occasion" type="checkbox" checked={occasion} onChange={(event) => setOccasion(event.target.checked)} /> Special occasion</label>
            {occasion && <textarea id="table-occasion-details" maxLength={500} placeholder="Birthday, anniversary, or other details" required value={occasionDetails} onChange={(event) => setOccasionDetails(event.target.value)} />}
            <p id="table-reservation-error" className="sheet-error" role="alert">{error}</p>
            <SendingButton ref={button} className="confirm-btn" type="submit" successText="Request sent">Send table request</SendingButton>
          </>
        )}
      </form>
    </div>
  );
}
