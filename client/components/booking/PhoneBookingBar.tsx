import React, { useEffect, useState } from 'react';
import type { BookingKind, BookingListing } from '../../lib/booking/bookingListing';

// Phones only (CSS hides it from 960 px): the booking widget sits at the end
// of a long page, so a bar at the bottom shows the price and a button that
// scrolls to the widget. The bar slides away while the widget itself is on
// screen (animation.md §8.5); with reduced motion it simply hides.

function priceText(kind: BookingKind): string {
  const { details } = kind;
  const money = (value: unknown) => `KSh ${Number(value).toLocaleString()}`;
  const hasRent = details.price_amount != null && details.price_amount !== '' && Number.isFinite(Number(details.price_amount));
  const hasSale = details.sale_price_amount != null && details.sale_price_amount !== '' && Number.isFinite(Number(details.sale_price_amount));
  if (kind.isProperty) {
    if (kind.propertyPurpose === 'sale') return hasSale ? money(details.sale_price_amount) : 'Price on request';
    return hasRent ? `${money(details.price_amount)} / month` : 'Price on request';
  }
  if (!kind.supportsStay && kind.supportsTableReservation) return 'Table reservations';
  return hasRent ? `${money(details.price_amount)} / ${details.price_unit || 'night'}` : 'Price on request';
}

function actionText(kind: BookingKind): string {
  if (!kind.supportsStay && kind.supportsTableReservation) return 'Reserve a table';
  if (kind.isShortStay) return kind.isHourly ? 'Choose a date' : 'Choose dates';
  if (kind.isProperty) return kind.propertyPurpose === 'sale' ? 'See details' : 'See options';
  return 'Choose a start date';
}

export default function PhoneBookingBar({ listing, kind }: { listing: BookingListing; kind: BookingKind }) {
  const [widgetInView, setWidgetInView] = useState(false);

  useEffect(() => {
    const widget = document.getElementById('col-side');
    if (!widget || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => setWidgetInView(entries.some((entry) => entry.isIntersecting)), { threshold: 0.15 });
    observer.observe(widget);
    return () => observer.disconnect();
  }, [listing.id]);

  const goToWidget = () => {
    const widget = document.getElementById('col-side');
    if (!widget) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    widget.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    // Keyboard and screen-reader users land in the widget too.
    window.setTimeout(() => widget.querySelector<HTMLElement>('button:not(:disabled), input, [tabindex]')?.focus({ preventScroll: true }), reduced ? 0 : 450);
  };

  return (
    <div className={`phone-bar${widgetInView ? ' is-hidden' : ''}`} aria-hidden={widgetInView} inert={widgetInView}>
      <div className="phone-bar-price">
        <strong>{priceText(kind)}</strong>
        {kind.listingUnavailable ? <span>Not taking bookings</span> : <span>{listing.title}</span>}
      </div>
      <button type="button" className="phone-bar-btn" onClick={goToWidget}>{actionText(kind)}</button>
    </div>
  );
}
