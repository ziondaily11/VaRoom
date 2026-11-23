import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { accountRole } from '../lib/types/profile';
import { toggleBookmark } from '../lib/bookmarks/bookmarks';
import { useSavedListingIds } from '../lib/bookmarks/useSavedListingIds';
import {
  CATEGORIES, CATEGORY_LABELS, emptyMessage, fetchListingPage, getCachedPage, getListSnapshot, orderListings, preferredCategories,
  searchFromQuery, searchPath, searchSummary, setCachedPage, setListSnapshot, type MarketplaceListing, type MarketplaceSearch,
} from '../lib/marketplace/marketplace';
import { choose, crumbs, currentStep, encodeTrail, pathQuery } from '../lib/marketplace/drilldown';
import TrailNav, { TRAIL_STYLES } from '../components/marketplace/TrailNav';
import MarketplaceCard from '../components/marketplace/MarketplaceCard';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { MARKETPLACE_STYLES } from '../components/marketplace/marketplaceStyles';
import { useCardGrid } from '../components/marketplace/useCardGrid';

// Marketplace (migrated from legacy-pages/marketplace.html): every publicly
// listed space, searchable and by category, for visitors, clients and
// hosts. Signed in, it sits in the account's shell (the role's own sidebar,
// as an icon-only rail on laptops and desktops) with the app's mobile
// navigation on phones; visitors get the page alone, with a bar to log in or
// sign up.
//
// One search box for every width: results follow the typing (after a short
// pause) and Enter searches at once. A summary line names the search, the
// category and any guests filter, each removable. More places load as the
// list nears its end (the button stays as a fallback). Back from a listing
// shows the same list at the same scroll position.
//
// Property, Offices and Shops narrow step by step: choosing one swaps the
// category tabs for its next step (Property: Buy/Rent → type → bedrooms), and
// a breadcrumb (Marketplace › Property › Buy › Apartment) leads back to any
// step. Each step is in the page address, so Back, Forward and shared links
// keep it; a listing opened from a step carries the trail to its page.

type LoadState = 'idle' | 'loading' | 'error';

const SEARCH_DELAY_MS = 350;
/** How long the first-load card reveal runs (rows arriving later appear at once). */
const REVEAL_MS = 800;

const chipLabel = (category: string) => (category === 'all' ? 'All' : CATEGORY_LABELS[category]);

function SkeletonCard() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="card-media skeleton" />
      <div className="card-body">
        <div className="card-text">
          <div className="skeleton skeleton-line title" />
          <div className="skeleton skeleton-line host" />
          <div className="skeleton skeleton-line price" />
        </div>
      </div>
    </div>
  );
}

const sameSearch = (a: MarketplaceSearch, b: MarketplaceSearch) => a.q === b.q && a.category === b.category && a.guests === b.guests
  && searchPath(a).join('.') === searchPath(b).join('.');

/** The element that scrolls the list: Marketplace's own body on laptops, the page (or the shell) on phones. */
function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element ? element.parentElement : null; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return (typeof document !== 'undefined' ? (document.scrollingElement as HTMLElement | null) : null);
}

const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4.5 4.5" /></svg>
);
const ClearIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
);

export default function MarketplacePage() {
  const router = useRouter();
  const { status, user, session, profile } = useAuth();
  const userId = user?.id || null;
  const token = session?.access_token || null;
  const preferred = useMemo(() => preferredCategories(profile), [profile]);

  const [search, setSearch] = useState<MarketplaceSearch | null>(null);
  const [draft, setDraft] = useState('');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  // Saved listings for this account, shared with the rest of the app.
  const saved = useSavedListingIds(userId);
  const requestRef = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useCardGrid(gridRef);

  // The search starts from the URL (client home's "Browse as Marketplace", the 404 page, the landing page).
  useEffect(() => {
    if (!router.isReady || search) return;
    const initial = searchFromQuery(router.query);
    setSearch(initial);
    setDraft(initial.q);
  }, [router.isReady, router.query, search]);

  /**
   * Runs a search and writes it to the page address. Typing replaces the
   * address; a category or step choice is a new history entry, so Back
   * returns to the step before.
   */
  const runSearch = useCallback((next: MarketplaceSearch, { step = false }: { step?: boolean } = {}) => {
    setSearch((current) => (current && sameSearch(current, next) ? { ...next } : next));
    const query: Record<string, string> = {};
    if (next.q) query.q = next.q;
    if (next.category !== 'all') query.category = next.category;
    if (next.guests) query.guests = next.guests;
    Object.assign(query, pathQuery(next.category, searchPath(next)));
    const go = step ? router.push : router.replace;
    void go({ pathname: '/marketplace', query }, undefined, { shallow: true, scroll: false });
  }, [router]);

  // Back and Forward (and a breadcrumb link opened in this tab) change the
  // address without a choice here: the search follows the address.
  useEffect(() => {
    if (!router.isReady || !search) return;
    const fromAddress = searchFromQuery(router.query);
    if (sameSearch(fromAddress, search)) return;
    setSearch(fromAddress);
    setDraft(fromAddress.q);
    // Only an address change re-reads it; the search's own changes write the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.asPath]);

  // First page for each search. Coming back: the list as it was left (every
  // page, the scroll position); else a recent first page renders at once.
  useEffect(() => {
    if (!search) return undefined;
    const client = getSupabaseClient();
    if (!client) return undefined;
    const request = ++requestRef.current;
    setMoreFailed(false);
    const snapshot = getListSnapshot(search);
    if (snapshot) {
      setListings(snapshot.listings);
      setHasMore(snapshot.hasMore);
      setOffset(snapshot.offset);
      setLoadState('idle');
      const top = snapshot.scrollTop;
      scrollTopRef.current = top;
      if (top > 0) {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          const scroller = scrollParent(gridRef.current);
          if (scroller) scroller.scrollTop = top;
        }));
      }
      return undefined;
    }
    // A new search starts at the top of the list (its summary line in view).
    const scroller = scrollParent(gridRef.current);
    if (scroller && scroller.scrollTop > 0) scroller.scrollTop = 0;
    scrollTopRef.current = 0;
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
      setRevealing(true);
    }, (error) => {
      if (request !== requestRef.current) return;
      console.error('Marketplace listings query failed:', error);
      setLoadState('error');
    });
    return undefined;
  }, [search]);

  // The reveal plays once per network load.
  useEffect(() => {
    if (!revealing) return undefined;
    const timer = window.setTimeout(() => setRevealing(false), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealing]);

  // Where the list is scrolled, kept as it changes: when the page closes, the
  // grid and its scroll box may already be gone, so it can't be read then.
  const scrollTopRef = useRef(0);
  useEffect(() => {
    if (loadState !== 'idle') return undefined;
    const scroller = scrollParent(gridRef.current);
    if (!scroller) return undefined;
    const target: HTMLElement | Window = scroller === document.scrollingElement ? window : scroller;
    const onScroll = () => { scrollTopRef.current = scroller.scrollTop; };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [loadState, listings.length]);

  // Remember the list (and where it was scrolled) when leaving the page.
  const latest = useRef({ search, listings, hasMore, offset });
  latest.current = { search, listings, hasMore, offset };
  useEffect(() => () => {
    const { search: left, listings: list, hasMore: more, offset: rows } = latest.current;
    if (!left || !list.length) return;
    setListSnapshot(left, { listings: list, hasMore: more, offset: rows, scrollTop: scrollTopRef.current });
  }, []);

  // Typing searches after a short pause.
  useEffect(() => {
    if (!search) return undefined;
    const q = draft.trim();
    if (q === search.q) return undefined;
    const timer = window.setTimeout(() => runSearch({ ...search, q }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, search, runSearch]);

  const loadMore = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !search || loadingMore || !hasMore) return;
    const request = requestRef.current;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = getCachedPage(search, offset) || await fetchListingPage(client, search, offset);
      setCachedPage(search, offset, page);
      if (request !== requestRef.current) return;
      setListings((current) => [...current, ...page.listings]);
      setHasMore(page.hasMore);
      setOffset((current) => current + page.rows);
    } catch (error) {
      console.error('Marketplace listings query failed:', error);
      if (request === requestRef.current) setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [search, loadingMore, hasMore, offset]);

  // More places load when the end of the list comes near (the button stays as a fallback).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loadState !== 'idle' || !hasMore || moreFailed || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadState, hasMore, moreFailed, loadMore]);

  const openListing = (href: string) => {
    // Opened from a category or step, the listing's page shows the trail back.
    const trail = search ? encodeTrail(search.category, searchPath(search)) : '';
    const target = trail ? `${href}${href.includes('?') ? '&' : '?'}trail=${encodeURIComponent(trail)}` : href;
    router.push(userId ? target : loginUrl(target));
  };
  const save = (listingId: string) => {
    const client = getSupabaseClient();
    if (!userId || !client) { router.push(loginUrl(router.asPath || '/marketplace')); return; }
    toggleBookmark(client, userId, listingId).catch((error) => console.error('Listing bookmark could not be updated:', error));
  };

  const active = useMemo<MarketplaceSearch>(() => search || { q: '', category: 'all', guests: '', path: [] }, [search]);
  const chooseCategory = (category: string) => runSearch({ ...active, category, path: [] }, { step: true });
  const path = searchPath(active);
  const stepRow = currentStep(active.category, path);
  const chooseStep = (index: number, value: string) => runSearch({ ...active, path: choose(path, index, value) }, { step: true });
  const words: Record<string, string> = { q: active.q, guests: active.guests };
  const trail = crumbs(active.category, CATEGORY_LABELS[active.category] || active.category, path, words);
  /** A breadcrumb part goes back to that step here (Marketplace, the category, then each step). */
  const backTo = (index: number) => {
    if (index === 0) runSearch({ ...active, category: 'all', path: [] }, { step: true });
    else runSearch({ ...active, path: path.slice(0, index - 1) }, { step: true });
  };
  const submit = () => runSearch({ ...active, q: draft.trim() });
  const clearSearch = () => { setDraft(''); runSearch({ ...active, q: '' }); };
  const removePart = (key: 'q' | 'guests') => {
    if (key === 'q') { clearSearch(); return; }
    runSearch({ ...active, guests: '' });
  };
  const clearAll = () => { setDraft(''); runSearch({ q: '', category: 'all', guests: '', path: [] }, { step: true }); };
  const ordered = useMemo(() => orderListings(listings, active, preferred), [listings, active, preferred]);
  const summary = searchSummary(active);
  const isPublic = status === 'signed-out';

  let grid: React.ReactNode;
  if (loadState === 'loading') grid = Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />);
  else if (loadState === 'error') {
    grid = (
      <div className="empty-state is-error" role="alert">
        <h2>Listings could not load</h2>
        <p>Please check your connection and try again.</p>
        <button type="button" className="pill-btn primary" onClick={() => runSearch({ ...active })}>Try again</button>
      </div>
    );
  } else if (!ordered.length) {
    const empty = emptyMessage(active);
    grid = (
      <div className="empty-state">
        <h2>{empty.title}</h2>
        <p>{empty.text}</p>
        {(summary.length > 0 || active.category !== 'all') && <button type="button" className="pill-btn" onClick={clearAll}>Clear search</button>}
      </div>
    );
  } else {
    grid = ordered.map((listing) => (
      <MarketplaceCard key={listing.id} listing={listing} saved={saved.has(listing.id)} token={token} onOpen={openListing} onSave={save} />
    ));
  }

  return (
    <>
      <Head>
        <title>Marketplace · VaRoom</title>
      </Head>
      <style dangerouslySetInnerHTML={{ __html: MARKETPLACE_STYLES + TRAIL_STYLES }} />
      <div className={`marketplace-page${isPublic ? ' public-marketplace' : ''}`}>
        {isPublic && (
          <div className="mkt-visitor">
            <Link href="/" className="logo" aria-label="VaRoom home"><span className="va">Va</span><span className="room">Room</span></Link>
            <div className="mkt-visitor-actions">
              <Link href={loginUrl('/marketplace')} className="pill-btn">Log in</Link>
              <Link href="/?auth=signup" className="pill-btn primary">Sign up</Link>
            </div>
          </div>
        )}
        <header className="mkt-header">
          <div className="mkt-title-row">
            <h1>Marketplace</h1>
            <form className="mkt-search" role="search" onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <SearchIcon />
              <input
                type="search"
                id="q-dest"
                placeholder="Search by area, city or name"
                aria-label="Search places by area, city or name"
                enterKeyHint="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape' && draft) { event.preventDefault(); clearSearch(); } }}
              />
              {draft && <button type="button" className="mkt-search-clear" aria-label="Clear search" onClick={clearSearch}><ClearIcon /></button>}
            </form>
          </div>
          <div className="category-strip">
            {stepRow ? (
              // The category's next step replaces the category tabs (key: a new row starts at its own first tab).
              <SegmentedTabs key={`${active.category}-${stepRow.index}`} label={stepRow.step.label} activeKey={path[stepRow.index] || ''}>
                {stepRow.step.options.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={path[stepRow.index] === value}
                    aria-controls="results-grid"
                    data-step={stepRow.step.key}
                    data-value={value}
                    onClick={() => chooseStep(stepRow.index, value)}
                  >{label}</button>
                ))}
              </SegmentedTabs>
            ) : (
              <SegmentedTabs label="Property categories" activeKey={active.category}>
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={active.category === category}
                    aria-controls="results-grid"
                    data-category={category}
                    onClick={() => chooseCategory(category)}
                  >{chipLabel(category)}</button>
                ))}
              </SegmentedTabs>
            )}
          </div>
        </header>

        <div className="mkt-body">
          <main className="results-col">
            <TrailNav crumbs={trail} onBack={backTo} />
            {summary.length > 0 && (
              <div className="mkt-summary" aria-live="polite">
                <span className="mkt-summary-label">Showing</span>
                {summary.map((part) => (
                  <button key={part.key} type="button" className="mkt-summary-chip" aria-label={`Remove ${part.label}`} onClick={() => removePart(part.key)}>
                    {part.label}<ClearIcon />
                  </button>
                ))}
                {summary.length > 1 && <button type="button" className="mkt-summary-clear" onClick={clearAll}>Clear all</button>}
              </div>
            )}
            <div id="grid-view">
              <div className={`grid${revealing ? ' is-revealing' : ''}`} id="results-grid" ref={gridRef} aria-busy={loadState === 'loading'}>{grid}</div>
              <div ref={sentinelRef} className="mkt-sentinel" aria-hidden="true" />
              <div className="pagination" id="pagination">
                {loadState === 'idle' && hasMore && !moreFailed && (
                  <button type="button" className="pill-btn load-more" disabled={loadingMore} onClick={() => { void loadMore(); }}>
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
                {moreFailed && (
                  <div className="mkt-more-error" role="alert">
                    <span>More places could not load.</span>
                    <button type="button" className="pill-btn" onClick={() => { void loadMore(); }}>Try again</button>
                  </div>
                )}
                {loadState === 'idle' && !hasMore && ordered.length > 0 && <p className="mkt-end">You have seen every place.</p>}
              </div>
            </div>
          </main>
        </div>

      </div>
    </>
  );
}

// The app's mobile navigation shows here, as it did on the legacy page.
(MarketplacePage as unknown as { appNavigation: boolean }).appNavigation = true;
