import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { getListingFeedCache } from '../lib/listingFeedCache';
import { loadListingVideo, getCachedVideo, type ListingVideo } from '../lib/media/listingVideo';
import { useListingLike } from '../lib/listings/listingLikes';
import {
  bookingKind, bookingNotification, bookingPageError, bookingPayload, fetchCalendar, fetchDocuments, fetchReviews, forgetListingBundle,
  loadListingBundle, MESSAGES, openConversation, peekExtras, peekListingBundle, rememberExtras, sendTableRequest,
  type CalendarDates, type DocumentsResult, type ListingBundle, type ReviewsResult, type StayChoice, type TableRequest,
} from '../lib/booking/bookingListing';
import { resolveAvatarUrl, resolveStoredPhotoUrl } from '../components/resolveStoredPhotoUrl';
import BookingSidebar from '../components/booking/BookingSidebar';
import BookingGallery from '../components/booking/BookingGallery';
import ListingDetails, { ratingInfo } from '../components/booking/ListingDetails';
import BookingWidget from '../components/booking/BookingWidget';
import { TableReservationDialog } from '../components/booking/ReservationDialogs';
import { BOOKING_STYLES } from '../components/booking/bookingStyles';

// Booking (migrated from legacy-pages/booking.html): one listing's details
// and its booking widget. Identity comes from AuthProvider. The page shows
// as soon as the listing is loaded (kept for two minutes per account, so a
// revisit shows at once); reviews, documents, the video, likes and the open
// dates load alongside and fill in place. The open dates are always read again.

function Skeleton() {
  return (
    <div id="skeleton" className="skel-shell">
      <div>
        <div className="skel skel-gallery" />
        <div className="skel skel-line tall w-60" />
        <div className="skel skel-line w-40" style={{ marginBottom: '.6rem' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', marginBottom: '.7rem' }}>
          <div className="skel skel-avatar" />
          <div style={{ flex: 1 }}><div className="skel skel-line w-40" /></div>
        </div>
        <div className="skel skel-line w-100" />
        <div className="skel skel-line w-90" />
        <div className="skel skel-line w-60" />
      </div>
      <div className="skel-card">
        <div className="skel skel-line tall w-60" />
        <div className="skel-cal-grid">
          {Array.from({ length: 14 }, (_, index) => <div className="skel skel-cal-cell" key={index} />)}
        </div>
        <div className="skel skel-button" />
      </div>
    </div>
  );
}

export default function BookingPage() {
  const router = useRouter();
  const { status, user, session, profile } = useAuth();
  const client = getSupabaseClient();
  const userId = user?.id || null;
  const token = session?.access_token || null;
  const role: 'host' | 'client' | null = profile ? (profile.role === 'host' ? 'host' : 'client') : null;
  const listingId = typeof router.query.listing === 'string' && router.query.listing ? router.query.listing : null;

  const [bundle, setBundle] = useState<ListingBundle | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reviews, setReviews] = useState<ReviewsResult | null>(null);
  const [documents, setDocuments] = useState<DocumentsResult | null>(null);
  const [video, setVideo] = useState<ListingVideo | null>(null);
  const [calendar, setCalendar] = useState<CalendarDates | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  // The table form starts with the guest's phone, read when first opened.
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'signed-out') void router.replace(loginUrl(router.asPath));
  }, [status, router]);

  // The listing: from the cache when visited recently, else one load.
  useEffect(() => {
    if (!client || !userId || !listingId) return undefined;
    let active = true;
    setLoadFailed(false);
    setBundle(peekListingBundle(userId, listingId));
    loadListingBundle(client, userId, listingId).then((next) => { if (active) setBundle(next); }, (error: unknown) => {
      console.error('Booking: the listing could not be loaded:', error);
      if (active) setLoadFailed(true);
    });
    return () => { active = false; };
  }, [client, userId, listingId]);

  const listing = bundle ? bundle.listing : null;
  const pageError = !router.isReady || !userId || !role ? null
    : !listingId ? MESSAGES.noListing
    : loadFailed ? MESSAGES.loadFailed
    : bundle ? bookingPageError(bundle, userId, role) : null;
  const showable = Boolean(listing && !pageError);
  const kind = useMemo(() => (listing ? bookingKind(listing) : null), [listing]);

  // Everything else, in parallel once the listing can be shown.
  useEffect(() => {
    if (!showable || !client || !userId || !listingId || !kind) return undefined;
    let active = true;
    const cached = peekExtras(userId, listingId);
    setReviews(cached.reviews || null);
    setDocuments(cached.documents || null);
    setVideo(getCachedVideo(listingId) || null);
    setCalendar(null);
    if (!cached.reviews) {
      void fetchReviews(listingId).then((result) => { if (active) { setReviews(result); rememberExtras(userId, listingId, { reviews: result }); } });
    }
    if (!cached.documents) {
      void fetchDocuments(listingId, token).then((result) => { if (active) { setDocuments(result); rememberExtras(userId, listingId, { documents: result }); } });
    }
    void loadListingVideo(listingId, token).then((result) => { if (active) setVideo(result); });
    if (kind.isShortStay) {
      fetchCalendar(client, listingId).then((dates) => { if (active) setCalendar(dates); }, (error: unknown) => {
        console.error('Booking: open dates could not be loaded:', error);
        if (active) setCalendar({ open: new Set(), unavailable: new Set() });
      });
    }
    return () => { active = false; };
    // Once per listing; the token refreshing doesn't reload anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showable, client, userId, listingId, kind]);

  const like = useListingLike(showable ? client : null, showable ? listingId : null);

  const messageHost = useCallback(async () => {
    if (!client || !listing || !userId) return;
    setMessaging(true);
    try {
      const conversationId = await openConversation(client, listing, userId);
      void router.push(`/chats?c=${conversationId}`);
    } catch (error) {
      window.alert(`Couldn't start that chat: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setMessaging(false);
    }
  }, [client, listing, userId, router]);

  const book = useCallback(async (choice: StayChoice, total: number): Promise<string | null> => {
    if (!client || !listing || !kind || !userId) return 'Not signed in.';
    const { data, error } = await client.from('bookings').insert(bookingPayload(listing, kind, userId, total, choice)).select('id').single();
    if (error) return error.message;
    const bookingId = data ? (data as { id: string }).id : null;
    // Booking availability is reflected by the next feed revalidation.
    const feed = getListingFeedCache();
    if (feed) feed.invalidateAll();
    forgetListingBundle(userId, listing.id);
    try {
      if (window.VaRoomNotificationAPI) {
        await window.VaRoomNotificationAPI.create(bookingNotification(listing, bookingId, { id: userId, name: profile?.full_name || null, email: user?.email || null }));
      }
    } catch (notificationError) {
      console.error('Booking notification failed:', notificationError);
    }
    return null;
  }, [client, listing, kind, userId, profile, user]);

  const openTable = useCallback(async () => {
    if (phone === null && client && userId) {
      const { data } = await client.from('profiles').select('phone').eq('id', userId).maybeSingle();
      setPhone(((data as { phone?: string | null } | null) && (data as { phone?: string | null }).phone) || '');
    }
    setTableOpen(true);
  }, [phone, client, userId]);

  const closeGallery = useCallback(() => {
    if (window.history.length > 1 && document.referrer) window.history.back();
    else void router.push('/marketplace');
  }, [router]);

  const photoUrls = useMemo(() => (listing && listing.listing_photos || [])
    .map((photo) => resolveStoredPhotoUrl(photo.storage_path, 'listing-photos', client))
    .filter((url): url is string => Boolean(url)), [listing, client]);
  const resolveAvatar = useCallback((value: string | null | undefined) => resolveAvatarUrl(value, client), [client]);
  const galleryVideo = video && video.videoUrl ? { videoUrl: video.videoUrl, thumbnailUrl: video.thumbnailUrl } : null;

  return (
    <>
      <Head>
        <title>Book — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: BOOKING_STYLES }} />
      <div className="page-shell">
        {role ? <BookingSidebar role={role} /> : <aside className="client-sidebar" id="booking-sidebar" aria-label="Account navigation" aria-hidden="true" />}
        <div className="main-shell">
          {!showable && !pageError && <Skeleton />}
          <div id="booking-page" style={{ display: showable ? 'block' : 'none', height: '100%' }}>
            {showable && listing && kind && (
              <div className="content-grid">
                <div className="col-main" id="col-main">
                  <BookingGallery title={listing.title} photoUrls={photoUrls} video={galleryVideo} like={like} onToggleLike={like.toggle} onClose={closeGallery} />
                  <ListingDetails
                    listing={listing}
                    kind={kind}
                    reviews={reviews}
                    hostAvatarUrl={resolveAvatar(listing.host.avatar_url)}
                    resolveAvatar={resolveAvatar}
                    messaging={messaging}
                    onMessageHost={() => { void messageHost(); }}
                  />
                </div>
                <div className="col-side" id="col-side">
                  <BookingWidget
                    listing={listing}
                    kind={kind}
                    rating={ratingInfo(reviews)}
                    calendar={calendar}
                    documents={documents}
                    dining={bundle ? bundle.diningConfig : null}
                    onBook={book}
                    onOpenTable={() => { void openTable(); }}
                    onMessageHost={() => { void messageHost(); }}
                  />
                </div>
              </div>
            )}
          </div>
          <p id="page-error" className="page-error" style={{ display: pageError ? 'block' : 'none' }}>{pageError}</p>
        </div>
      </div>
      {tableOpen && listing && bundle && bundle.diningConfig && (
        <TableReservationDialog
          listingId={listing.id}
          dining={bundle.diningConfig}
          clientName={profile?.full_name || ''}
          clientPhone={phone || ''}
          onSend={(request: TableRequest) => (token ? sendTableRequest(request, token) : Promise.resolve('Network error — please try again.'))}
          onClose={() => setTableOpen(false)}
        />
      )}
    </>
  );
}

(BookingPage as unknown as { appNavigation: boolean }).appNavigation = true;
