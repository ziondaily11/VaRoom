import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { accountRole } from '../lib/types/profile';
import { loadBookmarks, peekBookmarks, subscribeBookmarks, toggleBookmark } from '../lib/bookmarks/bookmarks';
import {
  CATEGORIES, CATEGORY_LABELS, fetchListingPage, getCachedPage, orderListings, preferredCategories, searchFromQuery,
  setCachedPage, type MarketplaceListing, type MarketplaceSearch,
} from '../lib/marketplace/marketplace';
import MarketplaceCard from '../components/marketplace/MarketplaceCard';
import { MarketplaceBottomNav, RoleSidebarLinks } from '../components/marketplace/MarketplaceNav';
import { MARKETPLACE_STYLES } from '../components/marketplace/marketplaceStyles';

// Marketplace (migrated from legacy-pages/marketplace.html): every publicly
// listed space, searchable and by category, for visitors, clients and
// hosts. Its own icon sidebar on laptops and desktops; the app's mobile
// navigation on phones.

type LoadState = 'idle' | 'loading' | 'error';

const chipLabel = (category: string) => (category === 'all' ? 'All' : CATEGORY_LABELS[category]);

function SkeletonCard() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-media" />
      <div className="card-body">
        <div className="skeleton skeleton-line title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line host" />
        <div className="card-foot"><div className="skeleton skeleton-line price" /><div className="skeleton skeleton-line" style={{ width: '30%' }} /></div>
      </div>
    </div>
  );
}

const sameSearch = (a: MarketplaceSearch, b: MarketplaceSearch) => a.q === b.q && a.category === b.category && a.guests === b.guests;

export default function MarketplacePage() {
  const router = useRouter();
  const { status, user, session, profile } = useAuth();
  const role = accountRole(profile);
  const userId = user?.id || null;
  const token = session?.access_token || null;
  const homeHref = role === 'host' ? '/host-home' : '/client-home';
  const preferred = useMemo(() => preferredCategories(profile), [profile]);

  const [search, setSearch] = useState<MarketplaceSearch | null>(null);
  const [desktopDraft, setDesktopDraft] = useState('');
  const [mobileDraft, setMobileDraft] = useState('');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const requestRef = useRef(0);

  // The search starts from the URL (client home's "Browse as Marketplace").
  useEffect(() => {
    if (!router.isReady || search) return;
    const initial = searchFromQuery(router.query);
    setSearch(initial);
    setDesktopDraft(initial.q);
    setMobileDraft(initial.q);
  }, [router.isReady, router.query, search]);

  const runSearch = useCallback((next: MarketplaceSearch) => {
    setSearch((current) => (current && sameSearch(current, next) ? { ...next } : next));
    const query: Record<string, string> = {};
    if (next.q) query.q = next.q;
    if (next.category !== 'all') query.category = next.category;
    if (next.guests) query.guests = next.guests;
    router.replace({ pathname: '/marketplace', query }, undefined, { shallow: true, scroll: false });
  }, [router]);

  // First page for each search: a recent page renders at once.
  useEffect(() => {
    if (!search) return undefined;
    const client = getSupabaseClient();
    if (!client) return undefined;
    const request = ++requestRef.current;
    const cached = getCachedPage(search, 0);
    if (cached) {
      setListings(cached.listings);
      setHasMore(cached.hasMore);
      setOffset(cached.rows);
      setLoadState('idle');
      return undefined;
    }
    setListings([]);
    setLoadState('loading');
    fetchListingPage(client, search, 0).then((page) => {
      setCachedPage(search, 0, page);
      if (request !== requestRef.current) return;
      setListings(page.listings);
      setHasMore(page.hasMore);
      setOffset(page.rows);
      setLoadState('idle');
    }, (error) => {
      if (request !== requestRef.current) return;
      console.error('Marketplace listings query failed:', error);
      setLoadState('error');
    });
    return undefined;
  }, [search]);

  const loadMore = async () => {
    const client = getSupabaseClient();
    if (!client || !search || loadingMore || !hasMore) return;
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const page = getCachedPage(search, offset) || await fetchListingPage(client, search, offset);
      setCachedPage(search, offset, page);
      if (request !== requestRef.current) return;
      setListings((current) => [...current, ...page.listings]);
      setHasMore(page.hasMore);
      setOffset((current) => current + page.rows);
    } catch (error) {
      console.error('Marketplace listings query failed:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Saved listings for this account, shared with the rest of the app.
  useEffect(() => {
    if (!userId) { setSaved(new Set()); return undefined; }
    const cached = peekBookmarks(userId);
    if (cached) setSaved(cached);
    const unsubscribe = subscribeBookmarks((owner, ids) => { if (owner === userId) setSaved(ids); });
    const client = getSupabaseClient();
    if (client && !cached) loadBookmarks(client, userId).catch((error) => console.warn('Saved listings could not be loaded:', error));
    return unsubscribe;
  }, [userId]);

  const openListing = (href: string) => {
    router.push(userId ? href : loginUrl(href));
  };
  const save = (listingId: string) => {
    const client = getSupabaseClient();
    if (!userId || !client) { router.push(loginUrl(router.asPath || '/marketplace')); return; }
    toggleBookmark(client, userId, listingId).catch((error) => console.error('Listing bookmark could not be updated:', error));
  };

  const active = useMemo(() => search || { q: '', category: 'all', guests: '' }, [search]);
  const chooseCategory = (category: string) => runSearch({ ...active, category });
  const submitDesktop = () => { setMobileDraft(desktopDraft.trim()); runSearch({ ...active, q: desktopDraft.trim() }); };
  const submitMobile = () => { setDesktopDraft(mobileDraft.trim()); runSearch({ ...active, q: mobileDraft.trim() }); };
  const ordered = useMemo(() => orderListings(listings, active, preferred), [listings, active, preferred]);
  const isPublic = status === 'signed-out';

  let grid: React.ReactNode;
  if (loadState === 'loading') grid = Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />);
  else if (loadState === 'error') {
    grid = (
      <div className="empty-state" style={{ gridColumn: '1/-1' }}>
        <h2>Unable to load listings</h2>
        <p>Please try again in a moment.</p>
        <button type="button" className="load-more" onClick={() => runSearch({ ...active })}>Retry</button>
      </div>
    );
  } else if (!ordered.length) {
    grid = <div className="empty-state" style={{ gridColumn: '1/-1' }}><h2>No listings match yet</h2><p>Try widening your price range or clearing a filter.</p></div>;
  } else {
    grid = ordered.map((listing) => (
      <MarketplaceCard key={listing.id} listing={listing} saved={saved.has(listing.id)} token={token} onOpen={openListing} onSave={save} />
    ));
  }

  return (
    <>
      <Head>
        <title>Marketplace — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: MARKETPLACE_STYLES }} />
      <div className={`marketplace-page${isPublic ? ' public-marketplace' : ''}`}>
        <header className="mkt-header">
          <Link href={homeHref} className="logo"><span className="va">Va</span><span className="room">Room</span></Link>
          <div className="mode-switch">
            <Link href={homeHref}>Discover</Link>
            <Link href="/marketplace" className="active">Marketplace</Link>
          </div>

          <div className="search-bar">
            <div className="search-field">
              <label htmlFor="q-dest">Where</label>
              <input
                type="text"
                id="q-dest"
                placeholder="Search by location, property name, or keyword..."
                value={desktopDraft}
                onChange={(event) => setDesktopDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') submitDesktop(); }}
              />
            </div>
            <button type="button" className="search-submit" onClick={submitDesktop}>Search</button>
          </div>
          <div className="desktop-category-row" role="tablist" aria-label="Property categories">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                className={`desktop-category-chip${active.category === category ? ' active' : ''}`}
                aria-selected={active.category === category}
                onClick={() => chooseCategory(category)}
              >{chipLabel(category)}</button>
            ))}
          </div>

          <div className="mobile-marketplace-tools">
            <div className="mobile-search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
              <input
                type="text"
                placeholder="Search properties, locations..."
                aria-label="Search properties and locations"
                value={mobileDraft}
                onChange={(event) => setMobileDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') submitMobile(); }}
              />
              <button type="button" aria-label="Search" onClick={submitMobile}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              </button>
            </div>
            <div className="mobile-category-row" role="tablist" aria-label="Property categories">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  className={`mobile-category-chip${active.category === category ? ' active' : ''}`}
                  aria-selected={active.category === category}
                  onClick={() => chooseCategory(category)}
                >{chipLabel(category)}</button>
              ))}
            </div>
          </div>
        </header>

        <div className="mkt-body">
          <aside className="desktop-sidebar" aria-label="Marketplace navigation">
            <Link className="desktop-sidebar-brand" href={homeHref} aria-label="VaRoom home"><span className="va">Va</span><span className="room">Room</span></Link>
            {role && <RoleSidebarLinks role={role} />}
          </aside>

          <main className="results-col">
            <div id="grid-view">
              <div className="grid" id="results-grid" aria-busy={loadState === 'loading'}>{grid}</div>
              <div className="pagination" id="pagination">
                {loadState === 'idle' && hasMore && (
                  <button type="button" className="load-more" disabled={loadingMore} onClick={loadMore}>Load more</button>
                )}
              </div>
            </div>
          </main>
        </div>

        {userId && <MarketplaceBottomNav homeHref={homeHref} />}
      </div>
    </>
  );
}

// The app's mobile navigation shows here, as it did on the legacy page.
(MarketplacePage as unknown as { appNavigation: boolean }).appNavigation = true;
