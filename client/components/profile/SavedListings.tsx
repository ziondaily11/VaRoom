import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  loadBookmarks, loadSavedListings, peekBookmarks, peekSavedListings, subscribeBookmarks, toggleBookmark, type SavedListing,
} from '../../lib/bookmarks/bookmarks';
import { CATEGORY_LABELS, listingPrice } from '../../lib/profile/profilePage';
import { resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import { BookmarkIcon } from './ProfileIcons';

// Profile → Saved: the listings this account saved (moved here from the
// sidebar's Saved item). Shown at once when returning within a couple of
// minutes; unsaving removes the card straight away and puts it back if the
// change fails.

const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] || null : value || null);

function price(listing: SavedListing): string {
  const details = first(listing.listing_booking_details);
  if (!details) return '';
  if (listing.category === 'property' && details.listing_purpose === 'sale' && details.sale_price_amount != null) {
    return `KSh ${Number(details.sale_price_amount).toLocaleString()}`;
  }
  return details.price_amount == null ? '' : listingPrice(Number(details.price_amount), details.price_unit);
}

function SavedCard({ listing, onUnsave }: { listing: SavedListing; onUnsave: (listing: SavedListing) => void }) {
  const path = (listing.listing_photos || []).map((photo) => photo.storage_path).find(Boolean) || null;
  const photo = path ? resolveStoredPhotoUrl(path, 'listing-photos', getSupabaseClient(), PHOTO_WIDTH.card) : null;
  const title = listing.title || 'Property';
  const amount = price(listing);
  return (
    <Link className="listing-card saved-card" href={`/booking?listing=${encodeURIComponent(listing.id)}`} data-saved-listing={listing.id}>
      <div className="listing-thumb">
        {photo && <img src={photo} alt={title} loading="lazy" />}
        <span className="listing-cat-pill">{(listing.category && CATEGORY_LABELS[listing.category]) || listing.category || 'Listing'}</span>
        <button
          type="button"
          className="saved-card-unsave"
          aria-label={`Remove ${title} from saved`}
          title="Remove from saved"
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); onUnsave(listing); }}
        >
          <BookmarkIcon filled />
        </button>
      </div>
      <div className="listing-card-body">
        <div className="listing-card-title">{title}</div>
        <div className="listing-card-loc">{listing.location_text || ''}</div>
        {amount && <div className="listing-card-footer"><span className="listing-card-price">{amount}</span></div>}
      </div>
    </Link>
  );
}

export const SavedSkeleton = () => (
  <div className="skeleton-listings-grid" aria-hidden="true">
    {[0, 1, 2, 3].map((index) => (
      <div className="skeleton-listing-card" key={index}>
        <div className="skel skeleton-listing-image" />
        <div className="skeleton-listing-body"><div className="skel" /><div className="skel" /><div className="skeleton-listing-footer"><div className="skel" /><div className="skel" /></div></div>
      </div>
    ))}
  </div>
);

export default function SavedListings({ userId, notify }: { userId: string; notify: (message: string) => void }) {
  const [rows, setRows] = useState<SavedListing[] | null>(() => peekSavedListings(userId));
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return undefined;
    let active = true;
    const cached = peekSavedListings(userId);
    if (cached) { setRows(cached); return undefined; }
    setFailed(false);
    loadSavedListings(client, userId).then((value) => { if (active) setRows(value); }, (error) => {
      console.error('Saved listings could not be loaded:', error);
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [userId, reload]);

  // Saves made elsewhere (another tab of the app, a listing page) keep this list in step.
  useEffect(() => {
    const client = getSupabaseClient();
    let known = peekBookmarks(userId);
    if (client && !known) loadBookmarks(client, userId).then((ids) => { known = ids; }, () => undefined);
    return subscribeBookmarks((owner, ids) => {
      if (owner !== userId) return;
      const added = Array.from(ids).some((id) => !known || !known.has(id));
      known = ids;
      if (added) setReload((value) => value + 1);
      else setRows((current) => (current ? current.filter((listing) => ids.has(listing.id)) : current));
    });
  }, [userId]);

  const unsave = (listing: SavedListing) => {
    const client = getSupabaseClient();
    if (!client) return;
    const before = rows;
    setRows((current) => (current ? current.filter((row) => row.id !== listing.id) : current));
    toggleBookmark(client, userId, listing.id).then(() => notify('Removed from saved.'), (error) => {
      console.error('Saved listing could not be removed:', error);
      setRows(before);
      notify('Could not update your saved listings.');
    });
  };

  if (failed && !rows) {
    return (
      <div className="listings-grid" id="saved-grid">
        <div className="listings-empty">
          Couldn&apos;t load your saved listings.{' '}
          <button type="button" className="saved-retry" onClick={() => setReload((value) => value + 1)}>Try again</button>
        </div>
      </div>
    );
  }
  if (!rows) return <SavedSkeleton />;
  return (
    <div className="listings-grid" id="saved-grid" aria-label="Saved listings">
      {rows.map((listing) => <SavedCard key={listing.id} listing={listing} onUnsave={unsave} />)}
      {!rows.length && (
        <div className="listings-empty">
          <div className="listings-empty-icon"><BookmarkIcon /></div>
          Nothing saved yet. Tap the bookmark on any listing to keep it here.{' '}
          <Link href="/marketplace" style={{ color: 'var(--red)', fontWeight: 600 }}>Browse the Marketplace →</Link>
        </div>
      )}
    </div>
  );
}

/** The bookmark tab that opens Saved (in the host's listing tabs and the client's profile tabs). */
export function SavedTab({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={selected} aria-label="Saved" title="Saved" className="saved-tab" onClick={onSelect}>
      <BookmarkIcon filled={selected} />
    </button>
  );
}
