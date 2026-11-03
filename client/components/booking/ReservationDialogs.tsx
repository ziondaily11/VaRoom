import React, { useRef, useState } from 'react';
import type { DiningConfig, TableRequest } from '../../lib/booking/bookingListing';
import SendingButton, { type SendingHandle } from './SendingButton';

// The hotel dialogs, unchanged from legacy-pages/booking.html: "What would you
// like to reserve?" (a stay or a table) and the Reserve a Table form.

const overlayStyle = (alpha: number): React.CSSProperties => ({ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: '1rem', background: `rgba(25,20,18,${alpha})`, backdropFilter: 'blur(7px)' });
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '.82rem', fontWeight: 700, margin: '.65rem 0 .25rem' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.65rem', border: '1px solid #d7ccc7', borderRadius: 8 };
const pair: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' };

export function ReservationChoice({ onStay, onTable, onClose }: { onStay: () => void; onTable: () => void; onClose: () => void }) {
  return (
    <div style={overlayStyle(0.45)} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div style={{ width: 'min(100%,390px)', padding: '1.4rem', borderRadius: 18, background: 'rgba(255,250,247,.94)', boxShadow: '0 24px 70px rgba(0,0,0,.28)', color: '#29211f' }}>
        <h2 style={{ margin: 0 }}>What would you like to reserve?</h2>
        <p style={{ margin: '.45rem 0 1rem', color: '#746762' }}>Choose one reservation type to continue.</p>
        <button type="button" className="confirm-btn" data-stay="" style={{ width: '100%', margin: '.35rem 0' }} onClick={onStay}>Reserve a Stay</button>
        <button type="button" data-table="" style={{ width: '100%', padding: '.78rem', border: '1px solid #8f1229', borderRadius: 8, background: 'transparent', color: '#8f1229', fontWeight: 700, cursor: 'pointer' }} onClick={onTable}>Reserve a Table</button>
      </div>
    </div>
  );
}

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
    <div id="table-reservation-overlay" style={overlayStyle(0.48)} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form style={{ width: 'min(100%,460px)', maxHeight: '90vh', overflow: 'auto', padding: '1.35rem', border: '1px solid rgba(255,255,255,.5)', borderRadius: 18, background: 'rgba(255,250,247,.92)', boxShadow: '0 24px 70px rgba(0,0,0,.28)', color: '#29211f' }} noValidate onSubmit={(event) => { void submit(event); }}>
        {sent ? (
          <>
            <h2 style={{ margin: '0 0 .5rem' }}>Request sent</h2>
            <p style={{ margin: '0 0 .6rem', color: '#746762' }}>The hotel has your contact details and will follow up about your table reservation.</p>
            <button className="confirm-btn cta-sent" type="button" disabled aria-label="Booking request sent" style={{ width: '100%', pointerEvents: 'none' }}>Booking request sent</button>
            <button type="button" className="confirm-btn" style={{ width: '100%', marginTop: '.65rem', background: 'transparent', color: 'var(--red-deep)', border: '1px solid var(--red-deep)' }} data-close="" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Reserve a Table</h2>
                <p style={{ margin: '.3rem 0 1rem', color: '#746762', fontSize: '.88rem' }}>{dining.restaurant_name} · {dining.opening_hours}</p>
              </div>
              <button type="button" data-close="" style={{ border: 0, background: 'transparent', fontSize: '1.35rem', cursor: 'pointer' }} onClick={onClose}>×</button>
            </div>
            <label style={labelStyle}>Client name</label>
            <input value={clientName} readOnly style={{ ...inputStyle, background: '#f6f1ee' }} />
            <label style={labelStyle}>Phone number</label>
            <input id="table-phone" value={phone} onChange={(event) => setPhone(event.target.value)} required placeholder="Phone number" style={inputStyle} />
            <div style={pair}>
              <div><label style={labelStyle}>Guests</label><input id="table-guests" type="number" min="1" value={guests} onChange={(event) => setGuests(event.target.value)} required style={inputStyle} /></div>
              <div><label style={labelStyle}>Tables</label><input id="table-count" type="number" min="1" max={Number(dining.tables_available)} value={tables} onChange={(event) => setTables(event.target.value)} required style={inputStyle} /></div>
            </div>
            <div style={pair}>
              <div><label style={labelStyle}>Arrival date</label><input id="table-date" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} required style={inputStyle} /></div>
              <div><label style={labelStyle}>Arrival time</label><input id="table-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required style={inputStyle} /></div>
            </div>
            <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.86rem', margin: '1rem 0 .4rem' }}><input id="table-occasion" type="checkbox" checked={occasion} onChange={(event) => setOccasion(event.target.checked)} /> Special occasion</label>
            <textarea id="table-occasion-details" maxLength={500} placeholder="Birthday, anniversary, or other details" required={occasion} value={occasionDetails} onChange={(event) => setOccasionDetails(event.target.value)} style={{ display: occasion ? 'block' : 'none', ...inputStyle }} />
            <p id="table-reservation-error" style={{ minHeight: '1.1rem', margin: '.7rem 0', color: '#a01d31', fontSize: '.82rem' }}>{error}</p>
            <SendingButton ref={button} className="confirm-btn" type="submit" style={{ width: '100%', marginTop: '.1rem' }} successText="Booking request sent">Send Table Request</SendingButton>
          </>
        )}
      </form>
    </div>
  );
}
