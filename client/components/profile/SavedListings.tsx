import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { RefreshCw } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { MarketplaceListing } from '../../lib/marketplace/marketplace';
import {
  loadBookmarks, loadSavedListings, peekBookmarks, peekSavedListings, subscribeBookmarks, toggleBookmark, type SavedListing,
} from '../../lib/bookmarks/bookmarks';
import MarketplaceCard from '../marketplace/MarketplaceCard';
import { CardGrid, CardSkeletons, EmptyState } from './ProfileCards';
import { BookmarkIcon } from './ProfileIcons';

// Profile → Saved: the listings this account saved (moved here from the
// sidebar's Saved item). Shown at once when returning within a couple of
// minutes; unsaving removes the card straight away and puts it back if the
// change fails. Cards are the shared listing card (as on the public profile).

/** A saved listing as the shared listing card reads it. */
function asCard(listing: SavedListing): MarketplaceListing {
  return {
    id: listing.id,
    title: listing.title,
    location_text: listing.location_text,
    category: listing.category,
    verified: null,
    created_at: '',
    host_id: '',
    listing_photos: listing.listing_photos,
    listing_booking_details: listing.listing_booking_details as MarketplaceListing['listing_booking_details'],
    availability_status: listing.availability_status,
    under_offer: listing.under_offer,
  };
}

export default function SavedListings({ userId, notify }: { userId: string; notify: (message: string) => void }) {
  const router = useRouter();
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
      <CardGrid id="saved-grid">
        <EmptyState icon={<RefreshCw />} title="Couldn’t load your saved listings" text="Check your connection, then try again."
          action={{ label: 'Try again', onClick: () => setReload((value) => value + 1), secondary: true }} />
      </CardGrid>
    );
  }
  if (!rows) return <CardSkeletons />;
  return (
    <CardGrid id="saved-grid" label="Saved listings">
      {rows.map((listing) => (
        <MarketplaceCard key={listing.id} listing={asCard(listing)} saved token={null}
          onOpen={(href) => { void router.push(href); }} onSave={() => unsave(listing)} />
      ))}
      {!rows.length && (
        <EmptyState icon={<BookmarkIcon />} title="Nothing saved yet"
          text="Tap the bookmark on any listing to keep it here, so you can find it again quickly."
          action={{ label: 'Explore spaces', href: '/marketplace' }} />
      )}
    </CardGrid>
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
