import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import {
  hostProfilePath, invalidateHostProfile, isPrivateProfileError, isUuid, loadHostListings, loadHostProfile, loadHostReviews, loadListingDrafts, loadOwnProfile, loadProfileCategories, peek, primeHostProfile,
  type HostProfileRow, type HostReview, type ListingDraft, type ProfileCategory, type ProfileListing,
} from '../lib/profile/hostProfile';
import { deleteCategory, displayName, loadClientBookingsCached, profileShareUrl, type ProfileBooking } from '../lib/profile/profilePage';
import { resolveAvatarUrl, PHOTO_WIDTH } from '../components/resolveStoredPhotoUrl';
import ProfileTopbar from '../components/profile/ProfileTopbar';
import ProfileHeader from '../components/profile/ProfileHeader';
import { ClientTrips, EditProfileModal, SharePanel } from '../components/profile/ProfileSections';
import HostListings, { type Tab } from '../components/profile/HostListings';
import { CategoryContextMenu, CategoryManager, CategoryNameEditor, type ManagerState } from '../components/profile/CategoryManager';
import { ProfileSkeleton } from '../components/profile/ProfileSkeleton';
import { PROFILE_STYLES } from '../components/profile/profileStyles';

// The signed-in account's own profile (migrated from legacy-pages/profile.html),
// inside the app shell. Hosts see their listings, categories and reviews;
// clients their upcoming bookings and past trips. /profile?u=<host> opens
// that host's public page. Everything loads in parallel and is reused when
// navigating back; listing videos load as their cards near the screen.

export default function ProfilePage() {
  const router = useRouter();
  const { status, user, session, profile: authProfile, refreshProfile } = useAuth();
  const userId = user?.id || null;
  const token = session?.access_token || null;

  const [own, setOwn] = useState<HostProfileRow | null>(null);
  const [ownError, setOwnError] = useState(false);
  const [listings, setListings] = useState<ProfileListing[] | null>(null);
  const [listingsError, setListingsError] = useState(false);
  const [drafts, setDrafts] = useState<ListingDraft[]>([]);
  const [categories, setCategories] = useState<ProfileCategory[]>([]);
  const [reviews, setReviews] = useState<HostReview[] | null>(null);
  const [bookings, setBookings] = useState<{ upcoming: ProfileBooking[]; past: ProfileBooking[] } | null>(null);
  const [tab, setTab] = useState<Tab>({ kind: 'all' });
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [manager, setManager] = useState<ManagerState>(null);
  const [contextMenu, setContextMenu] = useState<{ category: ProfileCategory; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<ProfileCategory | null>(null);
  const [resolvingVisit, setResolvingVisit] = useState(false);
  const [toast, setToast] = useState({ text: '', shown: false });
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((text: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ text, shown: true });
    toastTimer.current = window.setTimeout(() => setToast((current) => ({ ...current, shown: false })), 2400);
  }, []);
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  useEffect(() => {
    if (status === 'signed-out') router.replace(loginUrl('/profile'));
  }, [status, router]);

  // /profile?u=<username or id>: someone else's profile is their public page.
  const visit = typeof router.query.u === 'string' ? router.query.u : null;
  useEffect(() => {
    if (!router.isReady || !visit || !userId) return;
    const client = getSupabaseClient();
    const toOwn = () => { void router.replace('/profile', undefined, { shallow: true }); };
    if (!client || visit === userId) { toOwn(); return; }
    let cancelled = false;
    setResolvingVisit(true);
    (async () => {
      let host: HostProfileRow | null = null;
      try {
        host = await loadHostProfile(token, userId, isUuid(visit) ? { id: visit } : { username: visit });
      } catch (error) {
        // A private profile: its page says so.
        if (!cancelled && isPrivateProfileError(error)) { void router.replace(hostProfilePath(visit)); return; }
        host = null;
      }
      if (cancelled) return;
      if (host && host.id !== userId) void router.replace(hostProfilePath(host.id, host.username));
      else { setResolvingVisit(false); toOwn(); }
    })();
    return () => { cancelled = true; };
  }, [router, router.isReady, visit, userId, token]);

  // The account's own profile row (the parts AuthProvider doesn't hold).
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !userId) return undefined;
    let cancelled = false;
    const cached = peek<HostProfileRow | null>(userId, userId, 'own-profile');
    if (cached) setOwn(cached);
    loadOwnProfile(client, userId).then((row) => {
      if (cancelled) return;
      if (row) { setOwn(row); setOwnError(false); } else setOwnError(true);
    }).catch((error) => {
      console.error('Your profile could not be loaded:', error);
      if (!cancelled && !cached) setOwnError(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const role = own?.role || authProfile?.role || null;
  const isHost = role === 'host';

  // Hosts: listings, drafts, categories and reviews, in parallel.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !userId || !isHost) return undefined;
    let cancelled = false;
    const published = (rows: ProfileListing[]) => rows.filter((listing) => listing.publication_state === 'published');
    const cachedListings = peek<ProfileListing[]>(userId, userId, 'listings:owner');
    if (cachedListings) setListings(published(cachedListings));
    loadHostListings(client, userId, userId, true).then((rows) => { if (!cancelled) { setListings(published(rows)); setListingsError(false); } }).catch((error) => {
      console.error('Could not load host listings:', error);
      if (!cancelled && !cachedListings) setListingsError(true);
    });
    loadListingDrafts(userId, token).then((rows) => { if (!cancelled) setDrafts(rows); }).catch((error) => console.warn('Could not load saved listing drafts:', error));
    loadProfileCategories(client, userId, userId).then((rows) => { if (!cancelled) setCategories(rows); }).catch((error) => console.warn('Profile categories are unavailable:', error));
    loadHostReviews(userId, userId).then((result) => { if (!cancelled) setReviews(result.reviews); }).catch((error) => console.warn('Host reviews could not be loaded.', error));
    return () => { cancelled = true; };
  }, [userId, isHost, token]);

  // Clients: the two upcoming and three most recent past bookings.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !userId || !own || isHost) return undefined;
    let cancelled = false;
    loadClientBookingsCached(client, userId).then((value) => { if (!cancelled) setBookings(value); }).catch((error) => {
      console.error('Your bookings could not be loaded:', error);
      if (!cancelled) setBookings({ upcoming: [], past: [] });
    });
    return () => { cancelled = true; };
  }, [userId, own, isHost]);

  const reloadCategories = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !userId) return;
    try { setCategories(await loadProfileCategories(client, userId, userId, true)); } catch (error) { console.warn('Profile categories are unavailable:', error); }
  }, [userId]);

  const changeOwn = useCallback((patch: Partial<HostProfileRow>) => {
    setOwn((current) => {
      if (!current || !userId) return current;
      const next = { ...current, ...patch };
      primeHostProfile(userId, userId, 'own-profile', next);
      return next;
    });
    if ('avatar_url' in patch || 'full_name' in patch || 'username' in patch) void refreshProfile();
  }, [userId, refreshProfile]);

  const onStatus = useCallback((id: string, nextStatus: string) => {
    setListings((current) => current && current.map((listing) => (listing.id === id ? { ...listing, availability_status: nextStatus } : listing)));
    if (userId) invalidateHostProfile(userId, userId, 'listings:owner');
  }, [userId]);

  const onDeleted = useCallback((id: string) => {
    setListings((current) => current && current.filter((listing) => listing.id !== id));
    setCategories((current) => current.map((category) => ({ ...category, listingIds: category.listingIds.filter((listingId) => listingId !== id) })));
    if (userId) { invalidateHostProfile(userId, userId, 'listings:owner'); invalidateHostProfile(userId, userId, 'categories'); }
  }, [userId]);

  const removeCategory = async (category: ProfileCategory) => {
    if (!window.confirm(`Delete “${category.name}”? Its listings will remain on VaRoom.`)) return;
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await deleteCategory(client, category.id);
      if (tab.kind === 'category' && tab.id === category.id) setTab({ kind: 'all' });
      await reloadCategories();
      notify('Category deleted.');
    } catch (error) {
      notify((error as Error).message);
    }
  };

  const share = async () => {
    if (!own) return;
    const url = profileShareUrl(window.location.origin, own.username);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${own.full_name || 'VaRoom profile'} — VaRoom`, text: 'Check out this VaRoom profile', url });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    }
    setSharing(true);
  };

  const avatarUrl = own && own.avatar_url ? resolveAvatarUrl(own.avatar_url, getSupabaseClient(), PHOTO_WIDTH.thumb) : null;
  const name = own ? displayName(own.full_name) : 'User';
  const videoDetails = useMemo(() => ({ avatarUrl, hostName: own ? (own.full_name || 'Host') : 'Host', username: own && own.username ? `@${own.username}` : '' }), [avatarUrl, own]);
  const shareUrl = own && typeof window !== 'undefined' ? profileShareUrl(window.location.origin, own.username) : '';
  const loading = !own && !ownError;

  return (
    <>
      <Head>
        <title>Profile — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: PROFILE_STYLES }} />
      <div className="profile-page">
        <div className={`toast${toast.shown ? ' show' : ''}`} id="toast" role="status" aria-live="polite">{toast.text}</div>
        {(loading || resolvingVisit) && <ProfileSkeleton />}
        {ownError && !own && !resolvingVisit && (
          <div className="profile-main" style={{ paddingTop: '2rem' }}>
            <p className="state-msg" style={{ color: 'var(--muted)' }}>Unable to load your profile. Check your connection and try again.</p>
          </div>
        )}
        {own && userId && !resolvingVisit && (
          <div id="profile-content">
            <div className="profile-desktop-shell">
              <main className="profile-main">
                <ProfileTopbar userId={userId} name={name} avatarUrl={avatarUrl} notify={notify} />
                <ProfileHeader
                  profile={own}
                  avatarUrl={avatarUrl}
                  token={token}
                  sessionUserId={userId}
                  notify={notify}
                  onEdit={() => setEditing(true)}
                  onShare={() => { void share(); }}
                  onChange={changeOwn}
                />
                {!isHost && <ClientTrips bookings={bookings} />}
                {sharing && <SharePanel url={shareUrl} />}
                {isHost && (
                  <HostListings
                    listings={listings}
                    listingsError={listingsError}
                    drafts={drafts}
                    categories={categories}
                    reviews={reviews}
                    tab={tab}
                    onTab={setTab}
                    token={token}
                    details={videoDetails}
                    notify={notify}
                    onStatus={onStatus}
                    onDeleted={onDeleted}
                    onManage={() => setManager({ view: 'create' })}
                    onSelectListings={(categoryId) => setManager({ view: 'select', categoryId, newName: null })}
                    onCategoryMenu={(category, x, y) => setContextMenu({ category, x, y })}
                  />
                )}
              </main>
            </div>
          </div>
        )}
        {own && userId && (
          <EditProfileModal
            open={editing}
            profile={own}
            isHost={isHost}
            userId={userId}
            onClose={() => setEditing(false)}
            onSaved={(update) => { changeOwn(update); setEditing(false); notify('Profile saved ✓'); }}
          />
        )}
        {isHost && (
          <>
            <CategoryManager
              state={manager}
              setState={setManager}
              categories={categories}
              listings={listings || []}
              notify={notify}
              onSaved={async (categoryId) => { await reloadCategories(); setTab({ kind: 'category', id: categoryId }); }}
            />
            <CategoryContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onEdit={setRenaming} onDelete={(category) => { void removeCategory(category); }} />
            <CategoryNameEditor category={renaming} onClose={() => setRenaming(null)} onSaved={async () => { await reloadCategories(); notify('Category renamed.'); }} />
          </>
        )}
      </div>
    </>
  );
}
