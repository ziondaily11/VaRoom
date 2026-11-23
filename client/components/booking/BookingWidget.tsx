import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  bookingWindow, dayLabel, guestLimit, isInstantBooking, ksh, MESSAGES, nightsBetween, pickStayDay, plural, priceLine, propertyOptions, rentalLine, reviewsOptional, stayProblem, windowedCalendar,
  type BookingKind, type PropertyOption, type BookingListing, type CalendarDates, type DiningConfig, type DocumentsResult, type PriceLine, type StayChoice,
} from '../../lib/booking/bookingListing';
import { commercialDocuments, listingPolicy } from '../../lib/booking/bookingPolicy';
import {
  ICON_FOR_RENT, ICON_FOR_SALE, ICON_RENT_PRICE, ICON_SALE_PRICE, ICON_STAR, ICON_UNIT_TYPES, ICON_UNITS,
} from '../../lib/booking/bookingIcons';
import BookingCalendar from './BookingCalendar';
import { CommercialDocuments, PropertyPolicy } from './PolicySections';
import SendingButton, { type SendingHandle } from './SendingButton';
import Svg from './Svg';
import { useAuth } from '../../lib/auth/AuthProvider';
import { ownBookingHref } from '../../lib/bookings/links';
import type { RatingInfo } from './ListingDetails';

// The booking widget beside the listing. Nightly stays pick check-in then
// check-out on the calendar; hourly spaces a date and hours; rentals a move-in
// date and months; properties show sale and rent prices (and "Contact host
// about purchase"); hotels taking only tables show Reserve a Table, and hotels
// taking both show a Room / Table switch at the top. Stays and venues say how
// many guests (up to the listing's maximum); the count is saved with the
// booking. The listing's owner sees the same widget with a note in place of
// the actions. A property offered for sale and for rent shows both until the
// guest picks Buy or Rent; then only that option's details. The price summary
// opens smoothly once there is something to price (animation.md C5), and a
// sent request turns into a confirmation card with a link to Bookings.

interface Props {
  listing: BookingListing;
  kind: BookingKind;
  rating: RatingInfo | null;
  /** null while the open dates load (nightly and hourly stays). */
  calendar: CalendarDates | null;
  /** null while the listing's documents load. */
  documents: DocumentsResult | null;
  dining: DiningConfig | null;
  /** The signed-in account owns this listing: no booking, a note instead. */
  isOwner: boolean;
  onBook: (choice: StayChoice, total: number) => Promise<string | null>;
  onOpenTable: () => void;
  onMessageHost: () => void;
}

function DetailsBox({ line: current, isHotel }: { line: PriceLine | null; isHotel: boolean }) {
  // The last priced line stays inside while the box closes, so it shrinks with its content.
  const last = useRef<PriceLine | null>(current);
  if (current) last.current = current;
  const line = current || last.current;
  return (
    <div className={`details-wrap${current ? ' open' : ''}`} aria-hidden={!current} inert={!current}>
    <div className="details-box" id="details-box">
      {line && (
        <>
          {line.onRequest ? (
            <>
              <div className="details-row"><span className="details-label">{line.label}</span><span /></div>
              <div className="details-row total"><span>Total</span><span>The host confirms the price</span></div>
            </>
          ) : (
            <>
              <div className="details-row"><span className="details-label">{line.label}</span><span>{ksh(line.base)}</span></div>
              {line.fee ? <div className="details-row"><span className="details-label">{isHotel ? 'Service fee' : 'Cleaning fee'}</span><span>{ksh(line.fee)}</span></div> : null}
              <div className="details-row total"><span>Total</span><span>{ksh(line.total)}</span></div>
            </>
          )}
        </>
      )}
    </div>
    </div>
  );
}

/** How many guests: a − / + stepper, from 1 to the listing's maximum. */
function GuestStepper({ value, max, isHotel, onChange }: { value: number; max: number; isHotel: boolean; onChange: (value: number) => void }) {
  return (
    <div className="guest-field">
      <div>
        <span className="guest-label" id="guests-label">{isHotel ? 'Guests in this room' : 'Guests'}</span>
        <span className="guest-hint">Up to {plural(max, 'guest')}</span>
      </div>
      <div className="stepper" role="group" aria-labelledby="guests-label">
        <button type="button" aria-label="One guest fewer" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
        <output id="guests-input" aria-live="polite" aria-label={plural(value, 'guest')}>{value}</output>
        <button type="button" aria-label="One more guest" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

/** A sent request or a confirmed booking: what happens next, and a way to Bookings. */
function SentCard({ text }: { text: string }) {
  // A host's own stays are under Bookings → My trips.
  const { profile } = useAuth();
  return (
    <div className="sent-card" role="status">
      <span className="sent-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path pathLength={1} d="m5 12.5 4.5 4.5L19 7" /></svg>
      </span>
      <p>{text}</p>
      <Link href={ownBookingHref(null, profile?.role === 'host')} className="sent-link">View my bookings</Link>
    </div>
  );
}

/** In place of the actions on the owner's own listing. */
function OwnerNote({ listingId }: { listingId: string }) {
  return (
    <div className="owner-note" role="note">
      <p>{MESSAGES.ownListing}</p>
      <Link className="owner-note-link" href={`/list?edit=${encodeURIComponent(listingId)}`}>Edit listing</Link>
    </div>
  );
}

const LEGEND = (
  <div className="cal-legend" aria-hidden="true">
    <span><span className="dot dot-open" />Open</span>
    <span><span className="dot dot-selected" />Your dates</span>
    <span><span className="dot dot-closed" />Not available</span>
  </div>
);

export default function BookingWidget({ listing, kind, rating, calendar, documents, dining, isOwner, onBook, onOpenTable, onMessageHost }: Props) {
  const { details, isShortStay, isHourly, isHotel, isProperty, usesRentalBooking, supportsBoth, propertyPurpose, listingUnavailable, availabilityMessage } = kind;
  const bookable = useMemo(() => bookingWindow(details), [details]);
  const instant = isInstantBooking(kind);
  // Only days inside the host's booking window can be picked.
  const dates = useMemo(() => (calendar ? windowedCalendar(calendar, bookable) : null), [calendar, bookable]);
  const minLeaseDate = details.available_from && details.available_from > bookable.first ? details.available_from : bookable.first;
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [hours, setHours] = useState('1');
  const [leaseStart, setLeaseStart] = useState(minLeaseDate);
  const minMonths = Math.max(1, Number(details.min_lease_months) || 1);
  const [leaseMonths, setLeaseMonths] = useState(String(minMonths));
  const maxGuests = guestLimit(details);
  const [guests, setGuests] = useState(() => Math.min(2, maxGuests));
  // Hotels taking rooms and tables: which one the guest is reserving.
  const tablesToo = supportsBoth && Boolean(dining);
  const [mode, setMode] = useState<'stay' | 'table'>('stay');
  const [blockedNote, setBlockedNote] = useState(false);
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);
  const submitting = useRef(false);
  const confirm = useRef<SendingHandle>(null);
  // Property: which option the guest is looking at (null: every option the host offers).
  const options = useMemo(() => propertyOptions(kind), [kind]);
  const [propertyView, setPropertyView] = useState<PropertyOption | null>(null);
  const showsSale = options.includes('sale') && (propertyView === null || propertyView === 'sale');
  const showsRent = options.includes('rent') && (propertyView === null || propertyView === 'rent');

  const policy = useMemo(() => listingPolicy(listing.category, details, documents ? documents.documents : [], Boolean(documents && documents.loaded)), [listing.category, details, documents]);
  const extraDocuments = useMemo(() => commercialDocuments(listing.category, documents ? documents.documents : []), [listing.category, documents]);

  // What the guest has chosen, priced.
  let line: PriceLine | null = null;
  if (isShortStay && isHourly) {
    const count = parseInt(hours, 10) || 0;
    if (start && count > 0) line = priceLine(details.price_amount, count, plural(count, 'hour'), null);
  } else if (isShortStay) {
    if (start && end && !stayProblem(details, nightsBetween(start, end))) {
      const nights = nightsBetween(start, end);
      line = priceLine(details.price_amount, nights, plural(nights, 'night'), details.cleaning_fee || null);
    }
  } else if (!kind.isPropertySaleOnly && (!isProperty || showsRent)) {
    // The move-in date starts filled in (the first day it can be), so a price shows at once.
    const months = parseInt(leaseMonths, 10) || 0;
    if (leaseStart && months >= minMonths) line = rentalLine(details, months);
  }

  const book = async () => {
    if (submitting.current || isOwner || !line) return;
    submitting.current = true;
    setResult(null);
    confirm.current?.start();
    const failure = await onBook({ start, end, hours: parseInt(hours, 10), leaseStart, leaseMonths: parseInt(leaseMonths, 10), guests: isShortStay ? guests : undefined }, line.total);
    if (failure) {
      confirm.current?.error();
      submitting.current = false;
      setResult({ text: failure, error: true });
      return;
    }
    await confirm.current?.complete();
    setResult(instant
      ? { text: 'Booked! Your stay is confirmed. You can find it in your bookings.', error: false }
      : { text: 'Request sent. The host has 48 hours to answer, and we will tell you either way.', error: false });
  };

  const problem = start && end ? stayProblem(details, nightsBetween(start, end)) : null;
  const rangeSummary = !calendar ? 'Loading open dates…'
    : start && end ? `${dayLabel(start)} → ${dayLabel(end)} · ${plural(nightsBetween(start, end), 'night')}`
    : start ? `Check-in ${dayLabel(start)}. Now pick your check-out day.`
    : 'Pick your check-in day.';
  const sent = Boolean(result && !result.error);

  let picker: React.ReactNode = null;
  if (isShortStay && isHourly) {
    picker = (
      <>
        <p className="picker-title">Pick a date &amp; duration</p>
        <p className="picker-sub">Choose an open date and how many hours you need.</p>
        <BookingCalendar dates={dates} start={start} end={null} lastDay={bookable.last} onPick={(day) => setStart(day)} />
        {LEGEND}
        <p className="range-summary" aria-live="polite">{!calendar ? 'Loading open dates…' : start ? dayLabel(start, true) : 'Pick a date.'}</p>
        <div className="field">
          <label htmlFor="hours-input">Hours</label>
          <input type="number" id="hours-input" min="1" inputMode="numeric" value={hours} onChange={(event) => setHours(event.target.value)} />
        </div>
      </>
    );
  } else if (isShortStay) {
    picker = (
      <>
        <p className="picker-title">{isHotel ? 'Choose your stay' : 'Pick your dates'}</p>
        <p className="picker-sub">Tap your check-in day, then your check-out day.</p>
        <BookingCalendar
          dates={dates}
          start={start}
          end={end}
          lastDay={bookable.last}
          onPick={(day) => {
            if (!dates) return;
            const next = pickStayDay(dates, start, end, day);
            setStart(next.start);
            // A range over closed days restarts at the tapped day, and says why.
            setEnd(next.end);
            setBlockedNote(next.blocked);
          }}
        />
        {LEGEND}
        <p className="range-summary" id="range-summary" aria-live="polite">{rangeSummary}</p>
        {blockedNote && <p className="range-note">Some nights in between are not open, so that day is your new check-in.</p>}
        {problem && <p className="range-note">{problem}</p>}
      </>
    );
  } else if (usesRentalBooking) {
    picker = (
      <>
        <p className="picker-title">Move-in details</p>
        <p className="picker-sub">{details.available_from ? `Available from ${dayLabel(details.available_from, true)}.` : 'Choose when you would like to start.'}</p>
        <div className="field">
          <label htmlFor="lease-start">{isProperty ? 'Move-in date' : 'Start date'}</label>
          <input type="date" id="lease-start" min={minLeaseDate} value={leaseStart} onChange={(event) => setLeaseStart(event.target.value)} />
          {leaseStart && <span className="field-hint">{dayLabel(leaseStart, true)}</span>}
        </div>
        <div className="field">
          <label htmlFor="lease-months">Lease length (months)</label>
          <input type="number" id="lease-months" min={minMonths} inputMode="numeric" value={leaseMonths} onChange={(event) => setLeaseMonths(event.target.value)} />
          {minMonths > 1 && <span className="field-hint">At least {plural(minMonths, 'month')}.</span>}
        </div>
      </>
    );
  }

  const confirmButton = (text: string) => (
    <SendingButton ref={confirm} type="button" className="confirm-btn" id="confirm-btn" disabled={!line} aria-disabled={listingUnavailable ? true : undefined} successText={instant ? 'Booked' : 'Request sent'} onClick={() => { void book(); }}>
      {text}
    </SendingButton>
  );
  // A failure says what went wrong; success becomes the confirmation card.
  const successMessage = result && (result.error
    ? <div className="success-msg show error" id="success-msg" role="alert">{result.text}</div>
    : <SentCard text={result.text} />);

  if (!kind.supportsStay && kind.supportsTableReservation && dining) {
    return (
      <div className="booking-widget">
        <p className="picker-title">Reserve a table</p>
        <p className="picker-sub">{dining.restaurant_name} · {dining.opening_hours}</p>
        {isOwner
          ? <OwnerNote listingId={listing.id} />
          : <><button type="button" className="confirm-btn" id="table-reserve-btn" onClick={onOpenTable}>Reserve a Table</button>
            <p className="form-note">Send a reservation request directly to the hotel.</p></>}
      </div>
    );
  }

  if (isProperty) {
    const salePrice = Number(details.sale_price_amount);
    const rentPrice = Number(details.price_amount);
    const hasSalePrice = details.sale_price_amount != null && Number.isFinite(salePrice) && salePrice >= 0;
    const hasRentPrice = details.price_amount != null && Number.isFinite(rentPrice) && rentPrice >= 0;
    const showUnits = details.units_available != null || Boolean(details.size_or_type);
    const rentAction = showsRent && kind.propertyHasRentalPurpose;
    const label = (option: PropertyOption) => (option === 'sale' ? 'For sale' : 'For rent');
    const icon = (option: PropertyOption) => (option === 'sale' ? ICON_FOR_SALE : ICON_FOR_RENT);
    const note = rentAction && showsSale
      ? (availabilityMessage || 'Request to rent sends a rental request for the host to approve. To buy, contact the host about the purchase.')
      : rentAction
        ? (availabilityMessage || 'This creates a rental request — the host needs to approve it before it\'s confirmed.')
        : 'Contact the host to discuss purchasing this property.';
    return (
      <div className="booking-widget property-booking-widget">
        {options.length > 1 ? (
          <div className="property-purpose-selector" role="group" aria-label="Show the details for buying or renting" data-view={propertyView || 'all'}>
            <span className="property-purpose-pill" aria-hidden="true" />
            {options.map((option) => (
              <button key={option} type="button" className={`property-purpose-option${propertyView === option ? ' active' : ''}`} aria-pressed={propertyView === option}
                onClick={() => setPropertyView((current) => (current === option ? null : option))}>
                <Svg markup={icon(option)} />{label(option)}
              </button>
            ))}
          </div>
        ) : options.length === 1 && (
          <div className="property-purpose-selector is-single" aria-label={options[0] === 'sale' ? 'Listed for sale' : 'Listed for rent'}>
            <span className="property-purpose-option active"><Svg markup={icon(options[0])} />{label(options[0])}</span>
          </div>
        )}
        <div className="property-view" key={propertyView || 'all'}>
          {showsSale && (
            <div className="property-price-section">
              <div className="property-price-label"><Svg markup={ICON_SALE_PRICE} />Sale price{details.sale_price_mode === 'starting' && <> <span className="property-price-missing">Starting from</span></>}</div>
              <div className="property-price-value">{hasSalePrice ? `${details.sale_price_mode === 'starting' ? 'From ' : ''}KES ${salePrice.toLocaleString()}` : <span className="property-price-missing">Sale price not provided.</span>}</div>
            </div>
          )}
          {showsRent && (
            <div className="property-price-section">
              <div className="property-price-label"><Svg markup={ICON_RENT_PRICE} />Monthly rent</div>
              <div className="property-price-value">{hasRentPrice ? <>KES {rentPrice.toLocaleString()} <span>/ month</span></> : <span className="property-price-missing">Monthly rent not provided.</span>}</div>
              {(Number(details.deposit_amount) > 0 || details.utilities_included === true) && (
                <p className="property-rent-terms">
                  {[Number(details.deposit_amount) > 0 ? `Deposit KES ${Number(details.deposit_amount).toLocaleString()}` : null,
                    details.utilities_included === true ? 'Utilities included' : null].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          )}
          {showUnits && (
            <div className="property-units">
              {details.units_available != null && <div className="property-unit-item"><Svg markup={ICON_UNITS} /><div><strong>{String(details.units_available)} {Number(details.units_available) === 1 ? 'unit' : 'units'} available</strong><span>Total units</span></div></div>}
              {details.size_or_type && <div className="property-unit-item"><Svg markup={ICON_UNIT_TYPES} /><div><strong>{details.size_or_type}</strong><span>Unit types</span></div></div>}
            </div>
          )}
          {showsRent && picker}
          {showsRent && <DetailsBox line={line} isHotel={isHotel} />}
          {policy && <PropertyPolicy policy={policy} loading={!documents} />}
          {isOwner ? <OwnerNote listingId={listing.id} /> : (
            <>
              {rentAction && confirmButton(propertyPurpose === 'both' ? 'Request to rent' : 'Send inquiry')}
              {showsSale && <button type="button" className={`property-purchase-btn${rentAction ? '' : ' property-purchase-primary'}`} id="property-purchase-btn" onClick={onMessageHost}>Contact host about purchase</button>}
              <p className="form-note">{note}</p>
            </>
          )}
        </div>
        {successMessage}
      </div>
    );
  }

  const cancellation = details.cancellation_policy ? `${details.cancellation_policy.charAt(0).toUpperCase()}${details.cancellation_policy.slice(1)} cancellation` : null;
  const reserveTable = !isOwner && (
    <>
      <p className="picker-title">Reserve a table</p>
      <p className="picker-sub">{dining ? `${dining.restaurant_name} · ${dining.opening_hours}` : ''}</p>
      <button type="button" className="confirm-btn" id="table-reserve-btn" onClick={onOpenTable}>Reserve a table</button>
      <p className="form-note">Send a reservation request directly to the hotel.</p>
    </>
  );

  return (
    <div className="booking-widget">
      <div className="widget-price-row">
        <div className="widget-price">KSh {Number(details.price_amount).toLocaleString()} <span>/ {details.price_unit}</span></div>
        <div className="widget-rating">
          {rating && rating.count
            ? <><Svg markup={ICON_STAR} /> {rating.text} <span className="widget-rating-count">({rating.count})</span></>
            // No reviews: offices and shops show nothing; places guests stay in are new.
            : rating && !reviewsOptional(kind) && <span className="new-badge">✦ New on VaRoom</span>}
        </div>
      </div>
      {tablesToo && (
        <div className="mode-switch" role="tablist" aria-label="What to reserve" data-mode={mode}>
          <span className="mode-pill" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={mode === 'stay'} onClick={() => setMode('stay')}>Room</button>
          <button type="button" role="tab" aria-selected={mode === 'table'} onClick={() => setMode('table')}>Table</button>
        </div>
      )}
      {mode === 'table' && tablesToo ? (
        <div className="mode-view" key="table">{isOwner ? <OwnerNote listingId={listing.id} /> : reserveTable}</div>
      ) : (
        <div className="mode-view" key="stay">
          {picker}
          {isShortStay && !sent && <GuestStepper value={guests} max={maxGuests} isHotel={isHotel} onChange={setGuests} />}
          {isHotel && (details.checkin_time || details.checkout_time || cancellation) && (
            <ul className="stay-facts">
              {details.checkin_time && <li><span>Check-in</span><span>from {details.checkin_time}</span></li>}
              {details.checkout_time && <li><span>Check-out</span><span>by {details.checkout_time}</span></li>}
              {cancellation && <li><span>Cancellation</span><span>{cancellation.replace(' cancellation', '')}</span></li>}
            </ul>
          )}
          <DetailsBox line={line} isHotel={isHotel} />
          {policy && <PropertyPolicy policy={policy} loading={!documents} />}
          <CommercialDocuments documents={extraDocuments} />
          {isOwner ? <OwnerNote listingId={listing.id} /> : !sent && (
            <>
              {confirmButton(isHotel ? 'Reserve room' : 'Book now')}
              <p className="form-note">{availabilityMessage || (instant ? 'Instant book: your stay is confirmed as soon as you book.' : isHotel ? 'This sends a reservation request to the hotel. You pay only after it is confirmed.' : 'This sends a request. The host approves it before it is confirmed, and you pay only after that.')}</p>
            </>
          )}
          {successMessage}
        </div>
      )}
    </div>
  );
}
