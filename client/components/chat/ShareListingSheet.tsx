import React, { useEffect, useState } from 'react';
import type { ChatListingSummary } from '../../lib/chatCache';
import { cachedImageUrl, listingVideo, type ChatApi, type ListingVideo } from '../../lib/chat/chatMedia';
import { getSupabaseClient } from '../../lib/supabase/client';

// Host "Share listing" sheet (ported from public/js/chat-data.js
// openShareSheet): the host's listings with photo or video, multi-select,
// then one listing message per selection.

// Each host's listings, loaded once per page session (legacy kept them in
// state). Keyed by account so another sign-in never sees them.
const listingsByUser = new Map<string, Promise<ChatListingSummary[]>>();

function hostListings(userId: string, api: ChatApi): Promise<ChatListingSummary[]> {
  let promise = listingsByUser.get(userId);
  if (!promise) {
    promise = api<{ listings?: ChatListingSummary[] }>('/api/chat/listings')
      .then((result) => (result && result.listings) || [])
      .catch((error) => {
        listingsByUser.delete(userId);
        throw error;
      });
    listingsByUser.set(userId, promise);
  }
  return promise;
}

function ListingOption({ listing, selected, api, onToggle }: {
  listing: ChatListingSummary;
  selected: boolean;
  api: ChatApi;
  onToggle: () => void;
}) {
  const photo = listing.listing_photos && listing.listing_photos[0];
  const client = getSupabaseClient();
  const fallbackUrl = photo && client ? client.storage.from('listing-photos').getPublicUrl(photo.storage_path).data.publicUrl : '';
  const [photoUrl, setPhotoUrl] = useState(fallbackUrl);
  const [video, setVideo] = useState<ListingVideo | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (photo && fallbackUrl) cachedImageUrl(`listing-photo:${photo.storage_path}`, fallbackUrl).then((url) => { if (!cancelled) setPhotoUrl(url); });
    listingVideo(listing.id, api)
      .then((found) => { if (!cancelled) setVideo(found); })
      .catch((error) => console.error('Listing video unavailable:', error));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  return (
    <button type="button" className={`chat-listing-option${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onToggle}>
      {video ? (
        <video
          src={video.url}
          poster={video.thumbnailUrl || undefined}
          muted
          playsInline
          controls
          style={{ width: '100%', height: 82, objectFit: 'cover', display: 'block', background: '#f6f7f9' }}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <img src={photoUrl || undefined} alt={listing.title || ''} />
      )}
      <div>
        <strong>{listing.title || ''}</strong>
        <small>{listing.location_text || ''}</small>
      </div>
    </button>
  );
}

export default function ShareListingSheet({ open, userId, api, onClose, onShare }: {
  open: boolean;
  userId: string | null;
  api: ChatApi;
  onClose: () => void;
  /** Sends the selected listings; the sheet closes when it resolves and stays open if it rejects. */
  onShare: (listings: ChatListingSummary[]) => Promise<void>;
}) {
  const [listings, setListings] = useState<ChatListingSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!open || !userId) return undefined;
    setSelected(new Set());
    let cancelled = false;
    setError(false);
    setListings(null);
    hostListings(userId, api)
      .then((list) => { if (!cancelled) setListings(list); })
      .catch((err) => {
        console.error('Unable to load listings to share:', err);
        if (!cancelled) setError(true);
      });
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const toggle = (id: string) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const share = async () => {
    if (!listings || !selected.size || sharing) return;
    setSharing(true);
    try {
      await onShare(listings.filter((listing) => selected.has(listing.id)));
      onClose();
    } catch {
      // The page reports the failure; the sheet stays open to retry.
    } finally {
      setSharing(false);
    }
  };

  return (
    <section
      id="chatShareSheet"
      className={`chat-sheet${open ? ' open' : ''}`}
      aria-hidden={!open}
      aria-label="Share listing"
      role="dialog"
    >
      {open && (
        <>
          <div className="chat-sheet-head">
            <span>Share listing</span>
            <button className="chat-sheet-close" type="button" aria-label="Close" onClick={onClose}>×</button>
          </div>
          <div className="chat-sheet-list">
            {error ? (
              <div>Unable to load your listings. Please try again.</div>
            ) : listings === null ? (
              <span className="chat-media-loader" aria-label="Loading listings" style={{ position: 'relative' }} />
            ) : listings.length === 0 ? (
              <div>No listings available</div>
            ) : listings.map((listing) => (
              <ListingOption key={listing.id} listing={listing} api={api} selected={selected.has(listing.id)} onToggle={() => toggle(listing.id)} />
            ))}
          </div>
          <button className="chat-sheet-action" type="button" disabled={!selected.size || sharing} onClick={() => { void share(); }}>
            Share selected listing
          </button>
        </>
      )}
    </section>
  );
}
