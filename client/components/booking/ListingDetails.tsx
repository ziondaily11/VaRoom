import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { BookingKind, BookingListing, ReviewsResult } from '../../lib/booking/bookingListing';
import { listingUrl, mailtoHref, telHref, whatsappHref, type ListingContact } from '../../lib/reachOut/reachOut';
import { recordListingEvent, type ListingEventType } from '../../lib/analytics/listingEvents';
import { getSupabaseClient } from '../../lib/supabase/client';
import { commercialDetails, commercialLabel, SUBTYPE_LABELS } from '../../lib/booking/commercial';
import { descriptionPreviewChars, getCleanTruncatedDescription, visibleParagraphs } from '../../lib/booking/description';
import {
  AMENITY_ICON, AMENITY_LABEL, HOTEL_AMENITY_ICON, HOTEL_AMENITY_LABEL, ICON_GENERIC_AMENITY, ICON_LOCATION, ICON_MESSAGE,
  ICON_PHONE, ICON_SHARE, ICON_STAR, ICON_VERIFIED,
} from '../../lib/booking/bookingIcons';
import CommercialSections from './CommercialSections';
import Svg from './Svg';

// The booking page's main column under the gallery: title and Share, rating,
// location, host phone, badges and chips, the host card, the description,
// amenities (or the commercial sections) and reviews. Markup unchanged from
// legacy-pages/booking.html. `reviews` is null while they load. The phone line
// and the WhatsApp / email / phone controls follow the host's Reach Out
// settings: a channel that is off or has no value isn't shown.

export interface RatingInfo { count: number; text: string; countText: string }

export function ratingInfo(reviews: ReviewsResult | null): RatingInfo | null {
  if (!reviews) return null;
  const count = Number(reviews.summary.review_count || reviews.reviews.length);
  const average = Number(reviews.summary.average_rating);
  return {
    count,
    text: reviews.error ? 'Reviews unavailable' : count && Number.isFinite(average) ? average.toFixed(1) : 'No reviews yet',
    countText: count ? `(${count} ${count === 1 ? 'review' : 'reviews'})` : '',
  };
}

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

function Stars({ rating }: { rating: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return <>{Array.from({ length: rounded }, (_, index) => <Svg key={index} markup={ICON_STAR} />)}</>;
}

function Description({ text, isHotel }: { text: string; isHotel: boolean }) {
  const [preview] = useState(() => getCleanTruncatedDescription(text, descriptionPreviewChars(typeof window !== 'undefined' ? window.innerWidth : null), 3));
  const [expanded, setExpanded] = useState(false);
  const block = useRef<HTMLDivElement>(null);
  const collapsed = useRef(false);

  // Showing less: bring the description back into view if it scrolled above.
  useEffect(() => {
    if (!collapsed.current) return;
    collapsed.current = false;
    const aboutBlock = block.current && block.current.closest('.about-block');
    if (aboutBlock && aboutBlock.getBoundingClientRect().top < 0) aboutBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [expanded]);

  if (!text) {
    return <div className="about-text"><span style={{ color: 'var(--muted)' }}>{isHotel ? "The hotel hasn't added room details yet." : "The host hasn't added details about this place yet."}</span></div>;
  }
  const paragraphs = visibleParagraphs(text, preview, expanded);
  return (
    <div className="about-text" id="about-desc-container" ref={block}>
      {paragraphs.map((paragraph, index) => (
        <p className="about-paragraph" key={index}>
          {paragraph}
          {index === paragraphs.length - 1 && preview.hasOverflow && (
            <>
              {' '}
              <button type="button" className="about-toggle-btn" id="about-desc-toggle" aria-expanded={expanded} onClick={(event) => {
                event.preventDefault();
                if (expanded) collapsed.current = true;
                setExpanded(!expanded);
              }}>{expanded ? 'Show less' : 'Read more'}</button>
            </>
          )}
        </p>
      ))}
    </div>
  );
}

interface Props {
  listing: BookingListing;
  kind: BookingKind;
  reviews: ReviewsResult | null;
  hostAvatarUrl: string | null;
  resolveAvatar: (value: string | null | undefined) => string | null;
  contact: ListingContact;
  messaging: boolean;
  onMessageHost: () => void;
}

export default function ListingDetails({ listing, kind, reviews, hostAvatarUrl, resolveAvatar, contact, messaging, onMessageHost }: Props) {
  const { details, isHotel, isOfficeShop, officeShop, propertyPurpose } = kind;
  const [copied, setCopied] = useState(false);
  const rating = ratingInfo(reviews);

  const badges: string[] = [];
  if (listing.verified) badges.push('GPS verified');
  if (listing.host.verified) badges.push('Verified host');

  const chips: string[] = [];
  if (listing.category) chips.push(listing.category.charAt(0).toUpperCase() + listing.category.slice(1));
  if (listing.category === 'property') {
    chips.push(propertyPurpose === 'rent' ? 'For rent' : (propertyPurpose === 'sale' ? 'For sale' : 'Rent & sale'));
    if (details.units_available) chips.push(`${details.units_available} unit${details.units_available === 1 ? '' : 's'} available`);
    if (details.bathrooms != null) chips.push(`${details.bathrooms} bathroom${Number(details.bathrooms) === 1 ? '' : 's'}`);
  }
  if (officeShop && officeShop.subtype) chips.push(commercialLabel(officeShop.subtype, SUBTYPE_LABELS) as string);
  if (details.size_or_type) chips.push(details.size_or_type);

  const hostName = listing.host.full_name || 'Host';
  const hostPhone = String(contact.phone || '').trim();
  const enquiry = { title: listing.title, url: listingUrl(typeof window === 'undefined' ? '' : window.location.origin, listing.id), forSale: propertyPurpose === 'sale' };
  const locationText = (isOfficeShop ? [listing.neighborhood, listing.city].filter(Boolean).join(', ') : '') || listing.location_text || '';
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText || listing.title)}`;
  const amenities = Array.isArray(details.amenities) ? details.amenities : [];

  // Contact taps and shares count toward the host's analytics; the links
  // themselves behave exactly as before.
  const track = (type: ListingEventType) => recordListingEvent(getSupabaseClient(), listing.id, type);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      track('share');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <>
      <div className="title-row">
        <h1 className="listing-title">{listing.title}</h1>
        <div className="title-actions">
          <button type="button" className="action-btn" id="share-btn" aria-label="Share listing" onClick={() => { void share(); }}>
            <Svg markup={ICON_SHARE} />
            <span>{copied ? 'Copied!' : 'Share'}</span>
          </button>
        </div>
      </div>
      <div className="rating-row">
        {!rating ? <span>Loading reviews…</span> : rating.count ? <><Svg markup={ICON_STAR} /><span>{rating.text}</span><span>{rating.countText}</span></> : <span>{rating.text}</span>}
      </div>
      <p className="listing-loc"><Svg markup={ICON_LOCATION} /><span>{locationText}</span><a className="map-link-inline" href={mapUrl} target="_blank" rel="noopener">View on map</a></p>
      {hostPhone && <p className="host-phone"><Svg markup={ICON_PHONE} /><a href={telHref(hostPhone)} onClick={() => track('contact_phone')}>{hostPhone}</a></p>}
      {badges.length > 0 && <div className="badge-row">{badges.map((badge) => <span className="mini-badge" key={badge}><Svg markup={ICON_VERIFIED} />{badge}</span>)}</div>}
      {chips.length > 0 && <div className="info-chip-row">{chips.map((chip, index) => <span className="info-chip" key={index}>{chip}</span>)}</div>}
      <hr className="divider" />
      <div className="host-about-row">
        <div className="host-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem' }}>
            <div className="host-avatar">{hostAvatarUrl ? <img src={hostAvatarUrl} alt="" /> : initialsOf(hostName)}</div>
            <Link className="host-name" href={`/host/${encodeURIComponent((listing.host && listing.host.username) || listing.host_id)}`}>
              {isHotel ? 'Managed by ' : 'Hosted by '}{hostName}{listing.host.verified && <Svg markup={ICON_VERIFIED} />}
            </Link>
          </div>
          <div className="contact-controls" role="group" aria-label="Contact host options">
            {contact.whatsapp && <a className="contact-control" href={whatsappHref(contact.whatsapp, enquiry)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp the host" title="WhatsApp" onClick={() => track('contact_whatsapp')}><img src="/assets/whatsapp.svg" alt="" aria-hidden="true" /></a>}
            {contact.email && <a className="contact-control" href={mailtoHref(contact.email, enquiry)} aria-label="Email the host" title="Email" onClick={() => track('contact_email')}><img src="/assets/gmail.svg" alt="" aria-hidden="true" /></a>}
            {hostPhone && <a className="contact-control" href={telHref(hostPhone)} aria-label="Call the host" title="Call" onClick={() => track('contact_phone')}><Svg markup={ICON_PHONE} /></a>}
            <button type="button" className="contact-control" id="contact-host-btn" aria-label="Message host" title={isHotel ? 'Message hotel' : 'Message host'} disabled={messaging} onClick={onMessageHost}><Svg markup={ICON_MESSAGE} /></button>
          </div>
        </div>
        <div className="about-block">
          <h2 className="about-title">{isHotel ? 'About this room' : (isOfficeShop ? 'About this commercial space' : 'About this place')}</h2>
          <Description text={listing.property_description || listing.description || ''} isHotel={isHotel} />
          {isOfficeShop
            ? (officeShop ? <CommercialSections details={commercialDetails(listing, officeShop)} /> : null)
            : (
              <>
                <h2 className="section-title" style={{ marginTop: '.8rem' }}>{isHotel ? 'Room & hotel amenities' : 'Top amenities'}</h2>
                {amenities.length ? (
                  <div className="amenity-grid">
                    {amenities.map((key) => {
                      const icon = (isHotel ? (HOTEL_AMENITY_ICON[key] || AMENITY_ICON[key]) : AMENITY_ICON[key]) || ICON_GENERIC_AMENITY;
                      const label = (isHotel ? (HOTEL_AMENITY_LABEL[key] || AMENITY_LABEL[key]) : AMENITY_LABEL[key]) || (key.charAt(0).toUpperCase() + key.slice(1));
                      return <div className="amenity-item" key={key}><Svg markup={icon} /><span>{label}</span></div>;
                    })}
                  </div>
                ) : <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>No amenities have been listed for {isHotel ? 'this hotel room' : 'this space'} yet.</p>}
              </>
            )}
        </div>
      </div>
      <hr className="divider" />
      <div className="reviews-header">
        <h2 className="section-title">
          What guests say
          {rating && !reviews?.error && (rating.count ? <>{' · '}<Svg markup={ICON_STAR} />{` ${rating.text} ${rating.countText}`}</> : ' · No reviews yet')}
        </h2>
        <a href="#" className="see-all-link">See all reviews</a>
      </div>
      <div className="review-strip">
        {!reviews ? <p className="reviews-state">Loading reviews…</p>
          : reviews.error ? <p className="reviews-state" role="alert">{reviews.error}</p>
          : reviews.reviews.length ? reviews.reviews.map((review, index) => {
            const client = review.client || {};
            const name = client.full_name || 'Anonymous guest';
            const avatar = resolveAvatar(client.avatar_url);
            return (
              <div className="review-card" key={review.id || index}>
                <div className="review-top">
                  <span className="review-avatar">{avatar ? <img src={avatar} alt="" /> : (name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?')}</span>
                  <div><div className="review-name">{name}</div><div className="review-time">{(() => { const date = new Date(review.created_at); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(); })()}</div></div>
                </div>
                <div className="review-stars"><Stars rating={review.rating} /></div>
                <div className="review-text">{review.comment}</div>
              </div>
            );
          }) : <p className="reviews-state">No reviews yet for this listing.</p>}
      </div>
    </>
  );
}
