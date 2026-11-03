import React, { useMemo, useRef, useState } from 'react';
import {
  ksh, nightsBetween, pickStayDay, plural, priceLine,
  type BookingKind, type BookingListing, type CalendarDates, type DiningConfig, type DocumentsResult, type PriceLine, type StayChoice,
} from '../../lib/booking/bookingListing';
import { commercialDocuments, listingPolicy } from '../../lib/booking/bookingPolicy';
import {
  ICON_FOR_RENT, ICON_FOR_SALE, ICON_RENT_PRICE, ICON_SALE_PRICE, ICON_STAR, ICON_UNIT_TYPES, ICON_UNITS,
} from '../../lib/booking/bookingIcons';
import BookingCalendar from './BookingCalendar';
import { CommercialDocuments, PropertyPolicy } from './PolicySections';
import { ReservationChoice } from './ReservationDialogs';
import SendingButton, { type SendingHandle } from './SendingButton';
import Svg from './Svg';
import type { RatingInfo } from './ListingDetails';

// The booking widget beside the listing, unchanged from legacy-pages/booking.html.
// Nightly stays pick check-in then check-out on the calendar; hourly spaces a
// date and hours; rentals a move-in date and months; properties show sale
// and rent prices (and "Contact host about purchase"); hotels taking only
// tables show Reserve a Table, and hotels taking both ask which to reserve.

interface Props {
  listing: BookingListing;
  kind: BookingKind;
  rating: RatingInfo | null;
  /** null while the open dates load (nightly and hourly stays). */
  calendar: CalendarDates | null;
  /** null while the listing's documents load. */
  documents: DocumentsResult | null;
  dining: DiningConfig | null;
  onBook: (choice: StayChoice, total: number) => Promise<string | null>;
  onOpenTable: () => void;
  onMessageHost: () => void;
}

function DetailsBox({ line, isHotel }: { line: PriceLine | null; isHotel: boolean }) {
  return (
    <div className="details-box" id="details-box" hidden={!line}>
      {line && (
        <>
          <div className="details-row"><span className="details-label">{line.label}</span><span>{ksh(line.base)}</span></div>
          {line.fee ? <div className="details-row"><span className="details-label">{isHotel ? 'Service fee' : 'Cleaning fee'}</span><span>{ksh(line.fee)}</span></div> : null}
          <div className="details-row total"><span>Total</span><span>{ksh(line.total)}</span></div>
        </>
      )}
    </div>
  );
}

const LEGEND = (
  <div className="cal-legend">
    <span><span className="dot dot-open" />Open</span>
    <span><span className="dot dot-selected" />Selected</span>
  </div>
);

export default function BookingWidget({ listing, kind, rating, calendar, documents, dining, onBook, onOpenTable, onMessageHost }: Props) {
  const { details, isShortStay, isHourly, isHotel, isProperty, usesRentalBooking, supportsBoth, propertyPurpose, listingUnavailable, availabilityMessage } = kind;
  const minLeaseDate = details.available_from || new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [hours, setHours] = useState('1');
  const [leaseStart, setLeaseStart] = useState(minLeaseDate);
  const [leasePicked, setLeasePicked] = useState(false);
  const [leaseMonths, setLeaseMonths] = useState(String(details.min_lease_months || 1));
  const intent = useRef<'stay' | null>(supportsBoth ? null : 'stay');
  const [choosing, setChoosing] = useState(false);
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);
  const submitting = useRef(false);
  const confirm = useRef<SendingHandle>(null);

  const policy = useMemo(() => listingPolicy(listing.category, details, documents ? documents.documents : [], Boolean(documents && documents.loaded)), [listing.category, details, documents]);
  const extraDocuments = useMemo(() => commercialDocuments(listing.category, documents ? documents.documents : []), [listing.category, documents]);

  // What the guest has chosen, priced.
  let line: PriceLine | null = null;
  if (isShortStay && isHourly) {
    const count = parseInt(hours, 10) || 0;
    if (start && count > 0) line = priceLine(details.price_amount, count, plural(count, 'hour'), null);
  } else if (isShortStay) {
    if (start && end) {
      const nights = nightsBetween(start, end);
      line = priceLine(details.price_amount, nights, plural(nights, 'night'), details.cleaning_fee || null);
    }
  } else if (!kind.isPropertySaleOnly) {
    const months = parseInt(leaseMonths, 10) || 0;
    if (leasePicked && months >= 1) line = priceLine(details.price_amount, months, plural(months, 'month'), null);
  }

  const book = async () => {
    if (submitting.current) return;
    if (supportsBoth && !intent.current) { setChoosing(true); return; }
    if (supportsBoth && intent.current === 'stay' && (!start || (!isHourly && !end))) {
      intent.current = null;
      window.alert('Choose your stay dates before reserving a room.');
      return;
    }
    submitting.current = true;
    confirm.current?.start();
    const failure = await onBook({ start, end, hours: parseInt(hours, 10), leaseStart, leaseMonths: parseInt(leaseMonths, 10) }, line ? line.total : 0);
    if (failure) {
      confirm.current?.error();
      submitting.current = false;
      setResult({ text: `Something went wrong: ${failure}`, error: true });
      return;
    }
    await confirm.current?.complete();
    setResult({ text: 'Request sent! The host has 48 hours to respond — you\'ll be notified either way.', error: false });
  };

  const rangeSummary = !calendar ? 'Loading open dates…'
    : start && end ? `${start} → ${end} (${plural(nightsBetween(start, end), 'night')})`
    : start ? `Check-in: ${start} — now pick a check-out date.`
    : 'No dates selected yet.';

  let picker: React.ReactNode = null;
  if (isShortStay && isHourly) {
    picker = (
      <>
        <p className="picker-title">Pick a date &amp; duration</p>
        <p className="picker-sub">Choose an open date and how many hours you need.</p>
        <BookingCalendar dates={calendar} dayClass={(day) => (day === start ? ' range-end' : '')} onPick={(day) => setStart(day)} />
        {LEGEND}
        <div className="field">
          <label htmlFor="hours-input">Hours</label>
          <input type="number" id="hours-input" min="1" value={hours} onChange={(event) => setHours(event.target.value)} />
        </div>
      </>
    );
  } else if (isShortStay) {
    picker = (
      <>
        <p className="picker-title">{isHotel ? 'Choose your stay' : 'Pick your dates'}</p>
        <p className="picker-sub">Tap a check-in date, then a check-out date. Only open dates can be selected.</p>
        <BookingCalendar
          dates={calendar}
          dayClass={(day) => `${day === start || day === end ? ' range-end' : ''}${start && end && day > start && day < end ? ' in-range' : ''}`}
          onPick={(day) => {
            if (!calendar) return;
            const next = pickStayDay(calendar, start, end, day);
            setStart(next.start);
            // A range over closed days restarts at the tapped day (the old
            // "aren't open" note was overwritten at once, so it never showed).
            setEnd(next.end);
          }}
        />
        {LEGEND}
        <p className="range-summary" id="range-summary">{rangeSummary}</p>
      </>
    );
  } else if (usesRentalBooking) {
    picker = (
      <>
        <p className="picker-title">Move-in details</p>
        <p className="picker-sub">{details.available_from ? `Available from ${details.available_from}.` : 'Choose your desired start date.'}</p>
        <div className="field">
          <label htmlFor="lease-start">{isProperty ? 'Desired move-in date' : 'Desired start date'}</label>
          <input type="date" id="lease-start" min={minLeaseDate} value={leaseStart} onChange={(event) => { setLeaseStart(event.target.value); setLeasePicked(true); }} />
        </div>
        <div className="field">
          <label htmlFor="lease-months">Lease length (months)</label>
          <input type="number" id="lease-months" min="1" value={leaseMonths} onChange={(event) => setLeaseMonths(event.target.value)} />
        </div>
      </>
    );
  }

  const confirmButton = (text: string) => (
    <SendingButton ref={confirm} type="button" className="confirm-btn" id="confirm-btn" disabled={!line} aria-disabled={listingUnavailable ? true : undefined} successText="Reservation request sent" onClick={() => { void book(); }}>
      {text}
    </SendingButton>
  );
  const successMessage = <div className={`success-msg${result ? ' show' : ''}${result && result.error ? ' error' : ''}`} id="success-msg">{result ? result.text : ''}</div>;
  const choice = choosing && (
    <ReservationChoice
      onClose={() => setChoosing(false)}
      onTable={() => { setChoosing(false); onOpenTable(); }}
      onStay={() => {
        setChoosing(false);
        intent.current = 'stay';
        // As before, choosing a stay sends it at once when dates are already picked.
        if (line) setTimeout(() => { void book(); }, 0);
      }}
    />
  );

  if (!kind.supportsStay && kind.supportsTableReservation && dining) {
    return (
      <div className="booking-widget">
        <p className="picker-title">Reserve a table</p>
        <p className="picker-sub">{dining.restaurant_name} · {dining.opening_hours}</p>
        <button type="button" className="confirm-btn" id="table-reserve-btn" onClick={onOpenTable}>Reserve a Table</button>
        <p className="form-note">Send a reservation request directly to the hotel.</p>
      </div>
    );
  }

  if (isProperty) {
    const salePrice = Number(details.sale_price_amount);
    const rentPrice = Number(details.price_amount);
    const hasSalePrice = details.sale_price_amount != null && Number.isFinite(salePrice) && salePrice >= 0;
    const hasRentPrice = details.price_amount != null && Number.isFinite(rentPrice) && rentPrice >= 0;
    const offersSale = propertyPurpose === 'sale' || propertyPurpose === 'both';
    const offersRent = propertyPurpose === 'rent' || propertyPurpose === 'both';
    const showUnits = details.units_available != null || Boolean(details.size_or_type);
    return (
      <div className="booking-widget property-booking-widget">
        <div className="property-purpose-selector" aria-label={propertyPurpose === 'both' ? 'Listed for sale and rent' : propertyPurpose === 'sale' ? 'Listed for sale' : 'Listed for rent'}>
          <span className={`property-purpose-option${offersSale ? ' active' : ''}`} aria-label={`For sale${offersSale ? '' : ', not offered'}`}><Svg markup={ICON_FOR_SALE} />For sale</span>
          <span className={`property-purpose-option${offersRent ? ' active' : ''}`} aria-label={`For rent${offersRent ? '' : ', not offered'}`}><Svg markup={ICON_FOR_RENT} />For rent</span>
        </div>
        {offersSale && (
          <div className="property-price-section">
            <div className="property-price-label"><Svg markup={ICON_SALE_PRICE} />Sale price{details.sale_price_mode === 'starting' && <> <span className="property-price-missing">Starting from</span></>}</div>
            <div className="property-price-value">{hasSalePrice ? `${details.sale_price_mode === 'starting' ? 'From ' : ''}KES ${salePrice.toLocaleString()}` : <span className="property-price-missing">Sale price not provided.</span>}</div>
          </div>
        )}
        {offersRent && (
          <div className="property-price-section">
            <div className="property-price-label"><Svg markup={ICON_RENT_PRICE} />Monthly rent</div>
            <div className="property-price-value">{hasRentPrice ? <>KES {rentPrice.toLocaleString()} <span>/ month</span></> : <span className="property-price-missing">Monthly rent not provided.</span>}</div>
          </div>
        )}
        {showUnits && (
          <div className="property-units">
            {details.units_available != null && <div className="property-unit-item"><Svg markup={ICON_UNITS} /><div><strong>{String(details.units_available)} {Number(details.units_available) === 1 ? 'unit' : 'units'} available</strong><span>Total units</span></div></div>}
            {details.size_or_type && <div className="property-unit-item"><Svg markup={ICON_UNIT_TYPES} /><div><strong>{details.size_or_type}</strong><span>Unit types</span></div></div>}
          </div>
        )}
        {picker}
        <DetailsBox line={line} isHotel={isHotel} />
        {policy && <PropertyPolicy policy={policy} loading={!documents} />}
        {kind.propertyHasRentalPurpose && confirmButton(propertyPurpose === 'both' ? 'Request to rent' : 'Send inquiry')}
        {offersSale && <button type="button" className={`property-purchase-btn${propertyPurpose === 'sale' ? ' property-purchase-primary' : ''}`} id="property-purchase-btn" onClick={onMessageHost}>Contact host about purchase</button>}
        <p className="form-note">{kind.propertyHasRentalPurpose ? (availabilityMessage || 'This creates a rental request — the host needs to approve it before it\'s confirmed.') : 'Contact the host to discuss purchasing this property.'}</p>
        {successMessage}
      </div>
    );
  }

  return (
    <div className="booking-widget">
      <div className="widget-price-row">
        <div className="widget-price">KSh {Number(details.price_amount).toLocaleString()} <span>/ {details.price_unit}</span></div>
        <div className="widget-rating">
          {rating && rating.count
            ? <><Svg markup={ICON_STAR} /> {rating.text} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({rating.count})</span></>
            : <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{rating ? 'No reviews yet' : ''}</span>}
        </div>
      </div>
      {picker}
      {isShortStay && (
        <div className="field">
          <label htmlFor="guests-input">{isHotel ? 'Guests in this room' : 'Guests'}</label>
          <select id="guests-input" defaultValue="2 Guests"><option>1 Guest</option><option>2 Guests</option><option>3 Guests</option><option>4 Guests</option><option>5+ Guests</option></select>
        </div>
      )}
      {isHotel && (
        <div className="picker-sub" style={{ margin: '.8rem 0 0', lineHeight: 1.7 }}>
          {details.checkin_time && <>Check-in from {details.checkin_time}<br /></>}
          {details.checkout_time && <>Check-out by {details.checkout_time}<br /></>}
          {details.cancellation_policy && `${details.cancellation_policy.charAt(0).toUpperCase()}${details.cancellation_policy.slice(1)} cancellation policy`}
        </div>
      )}
      <DetailsBox line={line} isHotel={isHotel} />
      {policy && <PropertyPolicy policy={policy} loading={!documents} />}
      <CommercialDocuments documents={extraDocuments} />
      {confirmButton(supportsBoth ? 'Choose reservation' : (isHotel ? 'Reserve room' : 'Book now'))}
      {supportsBoth && <button type="button" id="choose-reservation-btn" style={{ width: '100%', marginTop: '.65rem', padding: '.78rem', border: '1px solid var(--red)', borderRadius: 8, background: 'transparent', color: 'var(--red)', fontWeight: 700, cursor: 'pointer' }} onClick={() => setChoosing(true)}>Choose reservation type</button>}
      <p className="form-note">{availabilityMessage || (isHotel ? 'This sends a reservation request to the hotel for confirmation.' : 'This creates a request — the host needs to approve it before it\'s confirmed.')}</p>
      {successMessage}
      {choice}
    </div>
  );
}
