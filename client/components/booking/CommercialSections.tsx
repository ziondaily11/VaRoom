import React from 'react';
import type { CommercialDetails, GridItem } from '../../lib/booking/commercial';
import { ICON_GENERIC_AMENITY } from '../../lib/booking/bookingIcons';
import Svg from './Svg';

// Office and shop details on the booking page (markup unchanged).

function Grid({ items }: { items: GridItem[] }) {
  if (!items.length) return null;
  return (
    <dl className="commercial-grid">
      {items.map((item) => <div className="commercial-item" key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl>
  );
}

export default function CommercialSections({ details }: { details: CommercialDetails }) {
  return (
    <>
      <section className="commercial-section" aria-labelledby="commercial-location-heading">
        <h2 className="commercial-section-title" id="commercial-location-heading">Commercial location</h2>
        <Grid items={details.location} />
        {details.addressAfterInquiry && <p className="commercial-disclosure">The exact unit address is shared after an inquiry.</p>}
      </section>
      <section className="commercial-section" aria-labelledby="commercial-space-heading">
        <h2 className="commercial-section-title" id="commercial-space-heading">Space</h2>
        <Grid items={details.space} />
        {details.layout.length > 0 && <p className="commercial-note"><strong>Layout:</strong> {details.layout.join(', ')}</p>}
      </section>
      <section className="commercial-section" aria-labelledby="commercial-amenities-heading">
        <h2 className="commercial-section-title" id="commercial-amenities-heading">Amenities and building services</h2>
        {details.amenities.length
          ? <div className="amenity-grid">{details.amenities.map((label) => <div className="amenity-item" key={label}><Svg markup={ICON_GENERIC_AMENITY} /><span>{label}</span></div>)}</div>
          : <p className="commercial-note">No commercial amenities were listed.</p>}
        <Grid items={details.amenityNotes} />
        <Grid items={details.parking} />
      </section>
      <section className="commercial-section" aria-labelledby="commercial-pricing-heading">
        <h2 className="commercial-section-title" id="commercial-pricing-heading">Pricing and costs</h2>
        <Grid items={details.pricing} />
        <Grid items={details.costs} />
        {details.charges.length > 0 && (
          <>
            <p className="commercial-note"><strong>Other compulsory charges</strong></p>
            <ul className="commercial-list">{details.charges.map((charge, index) => <li key={index}>{charge}</li>)}</ul>
          </>
        )}
      </section>
      <section className="commercial-section" aria-labelledby="commercial-lease-heading">
        <h2 className="commercial-section-title" id="commercial-lease-heading">Lease and availability</h2>
        <Grid items={details.lease} />
      </section>
      {details.documentsOnRequest && (
        <section className="commercial-section" aria-labelledby="commercial-documents-heading">
          <h2 className="commercial-section-title" id="commercial-documents-heading">Documents</h2>
          <p className="commercial-note">Ownership or management documents can be provided on request.</p>
        </section>
      )}
    </>
  );
}
