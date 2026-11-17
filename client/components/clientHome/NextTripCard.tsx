import React from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../lib/supabase/client';
import { bookingDates } from '../../lib/profile/profilePage';
import { startsIn, type NextTripView } from '../../lib/clientHome/nextTrip';
import { resolveStoredPhotoUrl, PHOTO_WIDTH, type PhotoWidth } from '../resolveStoredPhotoUrl';
import styles from './NextTripCard.module.css';

// The body of Client Home's "Your next trip" rail card (the page draws the
// card frame and heading, as for its other rail cards).

const photo = (path: string | null | undefined, width: PhotoWidth) =>
  (path ? resolveStoredPhotoUrl(path, 'listing-photos', getSupabaseClient(), width) : null);

export default function NextTripCard({ view }: { view: NextTripView }) {
  if (view.kind === 'loading') {
    return <div className={styles.loader} role="status" aria-label="Loading your next trip"><span className={styles.spinner} /></div>;
  }

  if (view.kind === 'trip') {
    const { booking } = view;
    const image = photo(booking.photo, PHOTO_WIDTH.card);
    const when = startsIn(booking.start_date);
    return (
      <div className={styles.trip}>
        <Link href={`/bookings?booking=${encodeURIComponent(booking.id)}`} className={styles.tripMedia} aria-label={`View your booking at ${booking.title || 'this stay'}`}>
          {image ? <img src={image} alt="" /> : <span className={styles.tripMediaEmpty} aria-hidden="true" />}
          <span className={`${styles.status} ${booking.status === 'pending' ? styles.statusPending : styles.statusConfirmed}`}>
            {booking.status === 'pending' ? 'Waiting for host' : 'Confirmed'}
          </span>
        </Link>
        <div className={styles.tripText}>
          <strong>{booking.title || 'Your stay'}</strong>
          {booking.location && <small>{booking.location}</small>}
          <small>{[when, bookingDates(booking)].filter(Boolean).join(' · ')}</small>
        </div>
        <Link href={`/bookings?booking=${encodeURIComponent(booking.id)}`} className={styles.primary}>View booking</Link>
      </div>
    );
  }

  if (view.kind === 'saved') {
    return (
      <div>
        <p className={styles.lead}>No trip booked yet. Pick up where you left off:</p>
        <div className={styles.savedGrid}>
          {view.listings.map((listing) => {
            const path = (listing.listing_photos || []).map((item) => item.storage_path).find(Boolean) || null;
            const image = photo(path, PHOTO_WIDTH.thumb);
            return (
              <Link key={listing.id} href={`/booking?listing=${encodeURIComponent(listing.id)}`} className={styles.savedTile}>
                {image ? <img src={image} alt="" loading="lazy" /> : <span className={styles.tripMediaEmpty} aria-hidden="true" />}
                <span className={styles.savedTitle}>{listing.title || 'Listing'}</span>
              </Link>
            );
          })}
        </div>
        <Link href="/profile?tab=saved" className={styles.more}>See all saved →</Link>
      </div>
    );
  }

  return (
    <div className={styles.explore}>
      <p className={styles.lead}>No trips or saved listings yet. Save spaces you like and they&apos;ll show up here.</p>
      <Link href="/marketplace" className={styles.primary}>Find your next space</Link>
    </div>
  );
}
