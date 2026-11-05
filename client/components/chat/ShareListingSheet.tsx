import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChatListingSummary } from '../../lib/chatCache';
import { cachedImageUrl, listingVideo, type ChatApi, type ListingVideo } from '../../lib/chat/chatMedia';
import { getSupabaseClient } from '../../lib/supabase/client';
import { filterShareListings, hostListings, submitThenClose } from '../../lib/chat/sheets';

// Host "Share listings" dialog, centred over the conversation: the host's
// listings as tiles (photo or video, title and location over it), picked
// like files in an explorer, then one listing message per selection.
// The listings load once per account (lib/chat/sheets hostListings).

export function ListingTile({ listing, selected, api, onToggle }: {
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (photo && fallbackUrl) cachedImageUrl(`listing-photo:${photo.storage_path}`, fallbackUrl).then((url) => { if (!cancelled) setPhotoUrl(url); });
    listingVideo(listing.id, api)
      .then((found) => { if (!cancelled) setVideo(found); })
      .catch((error) => console.error('Listing video unavailable:', error));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  const title = listing.title || 'Untitled listing';
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`chat-share-tile${selected ? ' is-selected' : ''}`}
      onClick={onToggle}
      // A listing's video plays, muted, while the pointer rests on it.
      onMouseEnter={() => { void videoRef.current?.play().catch(() => {}); }}
      onMouseLeave={() => { videoRef.current?.pause(); }}
    >
      <span className="chat-share-media">
        {video ? (
          <video ref={videoRef} src={video.url} poster={video.thumbnailUrl || photoUrl || undefined} muted loop playsInline preload="none" />
        ) : photoUrl ? (
          <img src={photoUrl} alt="" loading="lazy" />
        ) : (
          <span className="chat-share-empty" aria-hidden="true"><svg className="icon"><use href="#i-store" /></svg></span>
        )}
      </span>
      <span className="chat-share-check" aria-hidden="true"><svg className="icon"><use href="#i-check" /></svg></span>
      {video && <span className="chat-share-badge" aria-hidden="true">Video</span>}
      <span className="chat-share-info">
        <strong>{title}</strong>
        {listing.location_text && <small>{listing.location_text}</small>}
      </span>
    </button>
  );
}

export default function ShareListingSheet({ open, userId, api, onClose, onShare }: {
  open: boolean;
  userId: string | null;
  api: ChatApi;
  onClose: () => void;
  /** Sends the selected listings; the dialog closes when it resolves and stays open if it rejects. */
  onShare: (listings: ChatListingSummary[]) => Promise<void>;
}) {
  const [listings, setListings] = useState<ChatListingSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [query, setQuery] = useState('');
  const titleId = useId();

  useEffect(() => {
    if (!open || !userId) return undefined;
    setSelected(new Set());
    setQuery('');
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

  const visible = useMemo(() => filterShareListings(listings, query), [listings, query]);

  const share = async () => {
    if (!listings || !selected.size || sharing) return;
    setSharing(true);
    try {
      // Closes once shared; on failure it stays open to retry.
      await submitThenClose(() => onShare(listings.filter((listing) => selected.has(listing.id))), onClose);
    } finally {
      setSharing(false);
    }
  };

  if (!open) return null;
  const count = selected.size;
  return (
    <div className="chat-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section id="chatShareSheet" className="chat-modal-card chat-share" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="chat-modal-head">
          <div>
            <h2 id={titleId}>Share listings</h2>
            <p>Choose one or more of your listings to send in this chat.</p>
          </div>
          <button className="chat-modal-close" type="button" aria-label="Close" onClick={onClose}>
            <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
          </button>
        </header>
        <div className="chat-share-toolbar">
          <label className="chat-share-search">
            <svg className="icon" aria-hidden="true"><use href="#i-search" /></svg>
            <input type="search" placeholder="Search your listings" aria-label="Search your listings" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {listings && <span className="chat-share-total">{listings.length} {listings.length === 1 ? 'listing' : 'listings'}</span>}
        </div>
        <div className="chat-share-grid" role="listbox" aria-multiselectable="true" aria-label="Your listings">
          {error ? (
            <p className="chat-share-note">Unable to load your listings. Please try again.</p>
          ) : listings === null ? (
            <span className="chat-media-loader" aria-label="Loading listings" style={{ position: 'relative' }} />
          ) : listings.length === 0 ? (
            <p className="chat-share-note">You have no listings to share yet.</p>
          ) : visible.length === 0 ? (
            <p className="chat-share-note">No listings match “{query.trim()}”.</p>
          ) : visible.map((listing) => (
            <ListingTile key={listing.id} listing={listing} api={api} selected={selected.has(listing.id)} onToggle={() => toggle(listing.id)} />
          ))}
        </div>
        <footer className="chat-modal-actions">
          <span className="chat-share-selected" aria-live="polite">{count ? `${count} selected` : 'Nothing selected'}</span>
          <button className="chat-btn chat-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="chat-btn chat-btn-primary" type="button" disabled={!count || sharing} onClick={() => { void share(); }}>
            {sharing ? 'Sharing…' : count > 1 ? `Share ${count} listings` : 'Share listing'}
          </button>
        </footer>
      </section>
    </div>
  );
}
