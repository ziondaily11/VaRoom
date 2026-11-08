import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { getListingFeedCache, type FeedSnapshot } from '../lib/listingFeedCache';
import { loadBookmarks, peekBookmarks, subscribeBookmarks, toggleBookmark } from '../lib/bookmarks/bookmarks';
import { useFeedLikes } from '../lib/listings/listingLikes';
import { getCachedNewsPreview, setCachedNewsPreview, type PropertyNewsItem } from '../lib/propertyNewsCache';
import { fetchClientHomeWidget, readClientHomeWidgetCache, writeClientHomeWidgetCache } from '../lib/clientHomeWidgetCache';
import { fetchClientHomeVideoMetadata, resolveClientHomePlayback } from '../lib/clientHomeVideoMetadataCache';
import {
  CATEGORY_TABS, feedFetcher, feedKey, fetchHostListings, fetchLatestNews, fetchSavedListings, fetchSuspended, fetchUpdates,
  openChat, PROPERTY_NEWS_REFRESH_MS, saveNiche, scrollKey, submitReport, viewFromQuery,
  type FeedListing, type GlanceListing, type NewsItem, type VaroomUpdate,
} from '../lib/hostHome/hostHome';
import { MOBILE_QUERY } from '../lib/hostHome/mediaStage';
import { resolveAvatarUrl, resolveStoredPhotoUrl, PHOTO_WIDTH, type PhotoWidth } from '../components/resolveStoredPhotoUrl';
import FeedCard, { type CardVideo, type MediaState } from '../components/hostHome/FeedCard';
import HostRail, { NewsRefreshButton, PropertyNewsList, VaroomUpdatesContent, type Loadable } from '../components/hostHome/HostRail';
import { NichePrompt, ReportDialog } from '../components/hostHome/HostHomeDialogs';
import { ICONS, Svg } from '../components/hostHome/hostHomeIcons';
import { HOST_HOME_STYLES } from '../components/hostHome/hostHomeStyles';
import { profileWithNiche } from '../lib/auth/session';
import { useFeedScrollRoot, useFeedWindow, useLoadMore } from '../lib/discover/feedWindow';
import { afterFeedSettles } from '../lib/discover/deferredWork';
import { preloadVideoPlayer } from '../components/media/lazyVideoPlayer';
import { releaseRetainedPlayers } from '../lib/media/videoPlayback';

// Host home (migrated from legacy-pages/host-home.html), inside the persistent
// host shell: the Discover feed (or Saved, or My Listings, from ?view=), the
// host's listings at a glance, Property News and VaRoom Updates. Identity
// comes from AuthProvider; the feed is the shared listing-feed cache (same
// keys and scroll positions), so a return shows the cards at once and
// refreshes them in the background when stale.

type Mode = 'home' | 'mine' | 'saved';
type FeedState = { status: 'loading' | 'ready' | 'error'; message?: string };
type VideoEntry = { state: MediaState; video: CardVideo | null };

const SUSPENSION = (
  <section className="suspension-notice" role="status">
    <p className="suspension-notice-title">Your account has been suspended</p>
    <p className="suspension-notice-copy">You can still browse Varoom and view listings. Posting, booking, messaging, and other account activity are unavailable while your account is suspended. If you think this is a mistake, you can submit an appeal.</p>
    <Link className="suspension-notice-action" href="/support">Go to Support / Submit Appeal →</Link>
  </section>
);

function SkeletonCard() {
  return (
    <div className="skel-card">
      <div className="skel-card-head">
        <div className="skel skel-avatar" />
        <div className="skel-card-head-body"><div className="skel skel-name" /><div className="skel skel-loc" /></div>
        <div className="skel skel-menu" />
      </div>
      <div className="skel skel-line" />
      <div className="skel skel-line short" />
      <div className="skel skel-media" />
      <div className="skel-actions"><div className="skel skel-pill" /><div className="skel skel-pill" /></div>
    </div>
  );
}

const sessionStorageSafe = () => { try { return window.sessionStorage; } catch { return null; } };

export default function HostHomePage() {
  const router = useRouter();
  const { status, user, session, profile } = useAuth();
  const client = getSupabaseClient();
  const userId = user?.id || null;
  const token = session?.access_token || null;
  const ready = Boolean(userId && profile && profile.role === 'host' && profile.onboarding_completed);
  const view = viewFromQuery(router.query.view);

  const [mode, setMode] = useState<Mode>(view === 'saved' ? 'saved' : view === 'my-listings' ? 'mine' : 'home');
  const [category, setCategory] = useState('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [snapshot, setSnapshot] = useState<FeedSnapshot<FeedListing> | null>(null);
  const [visible, setVisible] = useState(0);
  const [feedState, setFeedState] = useState<FeedState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [savedListings, setSavedListings] = useState<FeedListing[] | null>(null);
  const [saved, setSaved] = useState<ReadonlySet<string> | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [glance, setGlance] = useState<Loadable<GlanceListing[]>>(null);
  const [news, setNews] = useState<Loadable<NewsItem[]>>(null);
  const [updates, setUpdates] = useState<Loadable<VaroomUpdate[]>>(null);
  const [videos, setVideos] = useState<Record<string, VideoEntry>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ listingId: string; hostId: string } | null>(null);
  const [nicheOpen, setNicheOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [mobile, setMobile] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [newsRefreshing, setNewsRefreshing] = useState(false);

  const feedList = useRef<HTMLDivElement>(null);
  const dashMain = useRef<HTMLDivElement>(null);
  // The feed scrolls in .dash-main on wide screens and as the document on phones.
  const scrollRoot = useFeedScrollRoot(dashMain);
  const activeKey = useRef<string | null>(null);
  const loadVersion = useRef(0);
  const lastScroll = useRef(-1);
  const lastLoadScroll = useRef(-1);
  const revalidateNext = useRef(false);
  const toastTimer = useRef<number | null>(null);
  const reloadNews = useRef<(() => Promise<void>) | null>(null);

  // What this browser already has (read after hydration, so the first render matches the page's HTML).
  useLayoutEffect(() => {
    const cachedNews = getCachedNewsPreview();
    if (cachedNews) setNews(cachedNews.items as unknown as NewsItem[]);
    const cachedUpdates = readClientHomeWidgetCache<VaroomUpdate[]>('updates');
    if (cachedUpdates) setUpdates(cachedUpdates.value);
  }, []);
  useLayoutEffect(() => { if (userId) setSaved(peekBookmarks(userId)); }, [userId]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }, []);
  const likes = useFeedLikes(client, notify);
  const photoUrl = useCallback((path: string, width: PhotoWidth = PHOTO_WIDTH.feed) => resolveStoredPhotoUrl(path, 'listing-photos', client, width), [client]);
  const avatarUrl = useCallback((value: string | null | undefined) => resolveAvatarUrl(value, client), [client]);

  // ---------- Who may be here ----------
  useEffect(() => {
    if (status === 'signed-out') { void router.replace(loginUrl('/host-home')); return; }
    if (!profile) return;
    if (profile.role === 'client') void router.replace('/client-home');
    else if (!profile.onboarding_completed) void router.replace('/onboarding');
  }, [status, profile, router]);

  // ---------- The view (from the shell sidebar's ?view=) ----------
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    setMode(view === 'saved' ? 'saved' : view === 'my-listings' ? 'mine' : 'home');
    if (view !== 'saved') {
      // Home and My Listings start from all categories and no search; Home refreshes.
      setCategory('all');
      setSearchDraft('');
      setSearchTerm('');
      if (view === 'home') revalidateNext.current = true;
    }
    if (dashMain.current) dashMain.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => { setMobile(query.matches); setLayoutVersion((v) => v + 1); };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // ---------- Feed ----------
  const scrollArea = () => dashMain.current;
  // The last position seen while scrolling. On leaving the page the scroll
  // area is already out of the document (its scrollTop reads 0) when the
  // cleanup saves, so the save falls back to this instead of the element.
  const position = useRef({ windowY: 0, areaY: 0 });
  const restoring = useRef(0);
  const readPosition = useCallback(() => {
    const area = dashMain.current;
    if (area && area.isConnected) position.current = { windowY: window.scrollY, areaY: area.scrollTop };
    return position.current;
  }, []);
  const saveScroll = useCallback(() => {
    if (!activeKey.current) return;
    try {
      sessionStorage.setItem(scrollKey(activeKey.current), JSON.stringify(readPosition()));
    } catch { /* storage unavailable */ }
  }, [readPosition]);

  const showSnapshot = useCallback((key: string, count?: number) => {
    const cache = getListingFeedCache();
    if (!cache || activeKey.current !== key) return;
    const next = cache.snapshot<FeedListing>(key);
    setSnapshot(next);
    if (count !== undefined) setVisible(count);
    setFeedState({ status: 'ready' });
  }, []);

  useEffect(() => {
    const cache = getListingFeedCache();
    if (!ready || !client || !userId || !cache || mode === 'saved') return undefined;
    const term = searchTerm.trim();
    const key = feedKey(userId, mode === 'mine', category, term);
    const fetcher = feedFetcher(client, userId, mode === 'mine', category, term);
    const version = ++loadVersion.current;
    const current = () => activeKey.current === key && version === loadVersion.current;
    saveScroll();
    activeKey.current = key;
    setLoadingMore(false);
    lastScroll.current = -1;
    lastLoadScroll.current = -1;
    const revalidate = revalidateNext.current;
    revalidateNext.current = false;

    const cached = cache.snapshot<FeedListing>(key);
    if (cached.hasCachedPage) {
      showSnapshot(key, cached.items.length);
      // The saved scroll position for this feed, once its cards are on screen:
      // retried for a few frames while the cards lay out, until it holds.
      let stored: { windowY?: number; areaY?: number } | null = null;
      try { stored = JSON.parse(sessionStorage.getItem(scrollKey(key)) || 'null'); } catch { /* storage unavailable */ }
      const targetArea = stored ? stored.areaY || 0 : 0;
      const targetWindow = stored ? stored.windowY || 0 : 0;
      position.current = { windowY: targetWindow, areaY: targetArea };
      cancelAnimationFrame(restoring.current);
      if (targetArea > 0 || targetWindow > 0) {
        let frames = 0;
        const restore = () => {
          if (activeKey.current !== key) return;
          const area = dashMain.current;
          if (area) area.scrollTop = targetArea;
          if (targetWindow) window.scrollTo(0, targetWindow);
          const settled = (!area || Math.abs(area.scrollTop - targetArea) < 2) && Math.abs(window.scrollY - targetWindow) < 2;
          if (!settled && ++frames < 40) restoring.current = requestAnimationFrame(restore);
        };
        restoring.current = requestAnimationFrame(restore);
      }
      if (cached.isStale || revalidate) {
        cache.revalidate(key, fetcher).then((refreshed) => {
          if (!current()) return;
          setVisible((count) => Math.min(Math.max(count, cache.pageSize), refreshed.items.length));
          showSnapshot(key);
        }).catch(() => {});
      }
      return undefined;
    }
    setSnapshot(null);
    setFeedState({ status: 'loading' });
    cache.fetchPage<FeedListing>(key, 0, fetcher).then((next) => {
      if (!current()) return;
      showSnapshot(key, Math.min(cache.pageSize, next.items.length));
    }, (error: unknown) => {
      if (current()) setFeedState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    });
    return undefined;
  }, [ready, client, userId, mode, category, searchTerm, showSnapshot, saveScroll]);

  const loadMore = useCallback(async (): Promise<boolean> => {
    const cache = getListingFeedCache();
    const key = activeKey.current;
    if (!cache || !key || loadingMore || !client || !userId || mode === 'saved') return true;
    const current = cache.snapshot<FeedListing>(key);
    if (visible < current.items.length) {
      setVisible(Math.min(visible + cache.pageSize, current.items.length));
      return true;
    }
    if (!current.hasMore) return true;
    setLoadingMore(true);
    try {
      const next = await cache.prefetchNext<FeedListing>(key, feedFetcher(client, userId, mode === 'mine', category, searchTerm.trim()));
      if (activeKey.current !== key) return true;
      setVisible((count) => Math.min(count + cache.pageSize, next.items.length));
      showSnapshot(key);
      return true;
    } catch {
      return false; // retried by the sentinel (lib/discover/feedWindow.ts useLoadMore)
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, client, userId, mode, category, searchTerm, visible, showSnapshot]);

  const items = useMemo(() => (snapshot ? snapshot.items.slice(0, visible) : []), [snapshot, visible]);
  const cards = mode === 'saved' ? (savedListings || []) : items;

  // Load more only after the reader has scrolled towards the end: the
  // sentinel's observer (lib/discover/feedWindow.ts) says when the end is in
  // range, and each scroll further down may ask again. A failed page is
  // retried while the reader is still at the end.
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const pageTrigger = useLoadMore({
    root: scrollRoot,
    enabled: ready && mode !== 'saved' && !loadingMore,
    canLoad: () => lastScroll.current >= 0 && lastScroll.current > lastLoadScroll.current,
    onLoadMore: async () => {
      lastLoadScroll.current = lastScroll.current;
      const ok = await loadMoreRef.current();
      if (!ok) lastLoadScroll.current = -1;
      return ok;
    },
    itemCount: items.length,
  });
  const checkNextPage = pageTrigger.check;
  useEffect(() => {
    const area = scrollArea();
    const furthest = () => Math.max(window.scrollY || 0, area ? area.scrollTop : 0);
    const onScroll = () => {
      readPosition();
      lastScroll.current = furthest();
      checkNextPage();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    if (area) area.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', saveScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (area) area.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', saveScroll);
      saveScroll();
    };
  }, [ready, saveScroll, readPosition, checkNextPage]);

  useEffect(() => () => cancelAnimationFrame(restoring.current), []);

  // ---------- Saved (waits for the account's saves; it used to show "Nothing saved" first) ----------
  useEffect(() => {
    if (!client || !userId || !ready) return undefined;
    let active = true;
    const unsubscribe = subscribeBookmarks(() => { if (active) setSaved(peekBookmarks(userId)); });
    loadBookmarks(client, userId).then((ids) => { if (active) setSaved(ids); }, () => { if (active) setSaved(new Set()); });
    return () => { active = false; unsubscribe(); };
  }, [client, userId, ready]);

  useEffect(() => {
    if (mode !== 'saved' || !client || !saved) return undefined;
    let active = true;
    setSavedListings(null);
    fetchSavedListings(client, Array.from(saved)).then((rows) => { if (active) setSavedListings(rows); }, () => { if (active) setSavedListings([]); });
    return () => { active = false; };
    // The saved list loads when Saved opens, not on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, client, saved === null]);

  // ---------- Likes and videos for the cards on screen ----------
  const cardIds = useMemo(() => cards.map((listing) => String(listing.id)), [cards]);
  useEffect(() => { if (cardIds.length) void likes.load(cardIds); }, [cardIds, likes]);

  const pendingVideos = useRef(new Set<string>());
  const videoTimer = useRef<number | null>(null);
  const videosRef = useRef(videos);
  videosRef.current = videos;

  const loadVideos = useCallback(async (ids: string[]) => {
    if (!userId) return;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const settle = (id: string, entry: VideoEntry) => setVideos((current) => ({ ...current, [id]: entry }));
    let metadata: Record<string, { mediaId: string | null; width?: number | null; height?: number | null } | null>;
    try {
      metadata = await fetchClientHomeVideoMetadata(sessionStorageSafe(), userId, ids, async (missing) => {
        const response = await fetch(`/api/discover/video-media?listingIds=${encodeURIComponent(missing.join(','))}`, { headers });
        if (!response.ok) throw new Error('media lookup failed');
        const payload = await response.json() as { videoMedia?: Record<string, string>; videoDimensions?: Record<string, { width?: number; height?: number }> };
        const found = payload.videoMedia || {};
        const dimensions = payload.videoDimensions || {};
        return Object.fromEntries(missing.map((id) => [id, found[id] ? { mediaId: found[id], ...(dimensions[id] || {}) } : { mediaId: null }]));
      });
    } catch {
      // As before: look each listing's media up directly.
      metadata = Object.fromEntries(await Promise.all(ids.map(async (id) => {
        try {
          const response = await fetch(`/api/properties/${encodeURIComponent(id)}/media`, { headers });
          if (!response.ok) return [id, { mediaId: null }];
          const video = ((await response.json()).media || []).find((item: { type?: string; id?: string }) => item && item.type === 'video' && item.id);
          return [id, video ? { mediaId: video.id, width: video.width, height: video.height } : { mediaId: null }];
        } catch { return [id, { mediaId: null }]; }
      })));
    }
    // The player's code, as soon as the feed has a video to show.
    if (ids.some((id) => Boolean(metadata[id] && metadata[id]?.mediaId))) void preloadVideoPlayer().catch(() => {});
    await Promise.all(ids.map(async (id) => {
      const entry = metadata[id];
      if (!entry || !entry.mediaId) { settle(id, { state: 'no-media', video: null }); return; }
      try {
        const playback = await resolveClientHomePlayback(userId, entry.mediaId, async () => {
          const response = await fetch(`/api/media/${encodeURIComponent(entry.mediaId as string)}/playback`, { headers });
          if (!response.ok) throw new Error(`Video playback lookup returned ${response.status}.`);
          return response.json();
        });
        settle(id, { state: 'ready', video: { url: playback.url, thumbnailUrl: playback.thumbnailUrl || null, width: entry.width || null, height: entry.height || null } });
      } catch {
        settle(id, { state: 'unavailable', video: null });
      }
    }));
  }, [userId, token]);

  const queueVideo = useCallback((id: string) => {
    const current = videosRef.current[id];
    if (current && current.state !== 'unknown') return;
    setVideos((all) => ({ ...all, [id]: { state: 'loading', video: null } }));
    pendingVideos.current.add(id);
    if (videoTimer.current) return;
    videoTimer.current = window.setTimeout(() => {
      const ids = Array.from(pendingVideos.current);
      pendingVideos.current.clear();
      videoTimer.current = null;
      void loadVideos(ids);
    }, 60);
  }, [loadVideos]);

  // The feed window: one observer keeps only the cards near the screen
  // mounted and asks for a card's video as it comes near.
  const queueVideoRef = useRef(queueVideo);
  queueVideoRef.current = queueVideo;
  const onCardNear = useCallback((id: string) => queueVideoRef.current(id), []);
  const feedWindow = useFeedWindow({ root: scrollRoot, onNear: onCardNear });

  // The phone viewer lists this feed's videos, also those of unmounted cards; not once the feed changes.
  useEffect(() => { releaseRetainedPlayers(); }, [mode, category, searchTerm, userId]);
  useEffect(() => () => releaseRetainedPlayers(), []);

  const refreshVideo = useCallback((id: string) => async () => {
    setVideos((all) => { const next = { ...all }; delete next[id]; return next; });
    await loadVideos([id]);
    const entry = videosRef.current[id];
    return entry && entry.video ? entry.video.url : null;
  }, [loadVideos]);

  // Width and breakpoint changes resize the card media.
  useEffect(() => {
    const list = feedList.current;
    if (!list || typeof ResizeObserver === 'undefined') return undefined;
    let width = list.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (list.clientWidth === width) return;
        width = list.clientWidth;
        setLayoutVersion((v) => v + 1);
      });
    });
    observer.observe(list);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [ready]);

  // Back from the browser's page cache: likes may have changed.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) likes.reload(cardIds); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [likes, cardIds]);

  // ---------- Dashboard side ----------
  // After the feed has had its turn (lib/discover/deferredWork.ts); cached
  // Property News and Updates are already on screen.
  const [secondaryReady, setSecondaryReady] = useState(false);
  const feedSettled = mode === 'saved' ? savedListings !== null : feedState.status !== 'loading';
  useEffect(() => {
    if (secondaryReady || !ready) return undefined;
    return afterFeedSettles(feedSettled, () => setSecondaryReady(true));
  }, [feedSettled, secondaryReady, ready]);

  useEffect(() => {
    if (!ready || !client || !userId || !secondaryReady) return undefined;
    let active = true;
    fetchHostListings(client, userId).then((rows) => { if (active) setGlance(rows); }, () => { if (active) setGlance('error'); });
    void fetchSuspended(token).then((value) => { if (active) setSuspended(value); });
    profileWithNiche(userId).then((result) => {
      if (!active || result.error || !result.data) return;
      const niches = Array.isArray(result.data.listing_categories) ? result.data.listing_categories : [];
      setNicheOpen(niches.length !== 1);
    }, () => {});
    const cachedUpdates = readClientHomeWidgetCache<VaroomUpdate[]>('updates');
    if (!cachedUpdates || !cachedUpdates.isFresh) {
      fetchClientHomeWidget<VaroomUpdate[]>('updates', () => fetchUpdates(client)).then((rows) => {
        writeClientHomeWidgetCache('updates', rows);
        if (active) setUpdates(rows);
      }, (error: unknown) => {
        console.error('VaRoom Updates could not be loaded:', error);
        if (active) setUpdates((current) => (Array.isArray(current) ? current : 'error'));
      });
    }
    const loadNews = (force = false) => fetchLatestNews(fetch, force).then((rows) => {
      if (!active) return;
      if (rows.length) setCachedNewsPreview(rows as unknown as PropertyNewsItem[]);
      setNews((current) => (rows.length ? rows.slice(0, 5) : (Array.isArray(current) && current.length ? current : [])));
    }, (error: unknown) => {
      console.warn('Property news notice:', error instanceof Error ? error.message : error);
      if (active) setNews((current) => (Array.isArray(current) && current.length ? current : 'error'));
    });
    const cachedNews = getCachedNewsPreview();
    if (!cachedNews || !cachedNews.isFresh) void loadNews();
    const timer = window.setInterval(() => { void loadNews(); }, PROPERTY_NEWS_REFRESH_MS);
    reloadNews.current = () => loadNews(true);
    return () => { active = false; window.clearInterval(timer); reloadNews.current = null; };
    // Once per account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, client, userId, secondaryReady]);

  // Refresh shows the spinner for at least a moment, then the list again.
  const refreshNews = useCallback(() => {
    const reload = reloadNews.current;
    if (!reload || newsRefreshing) return;
    setNewsRefreshing(true);
    const minimum = new Promise((resolve) => { window.setTimeout(resolve, 450); });
    void Promise.all([reload(), minimum]).finally(() => setNewsRefreshing(false));
  }, [newsRefreshing]);

  // Owner menu results: the card and its glance tile follow.
  const onStatus = useCallback((id: string, nextStatus: string) => {
    setGlance((current) => (Array.isArray(current) ? current.map((listing) => (listing.id === id ? { ...listing, availability_status: nextStatus } : listing)) : current));
    if (activeKey.current) showSnapshot(activeKey.current);
  }, [showSnapshot]);
  const onDeleted = useCallback((id: string) => {
    setGlance((current) => (Array.isArray(current) ? current.filter((listing) => listing.id !== id) : current));
    setSavedListings((current) => (current ? current.filter((listing) => listing.id !== id) : current));
    if (activeKey.current) showSnapshot(activeKey.current);
  }, [showSnapshot]);

  // Any click elsewhere closes an open Report menu.
  useEffect(() => {
    if (!openMenu) return undefined;
    const close = () => setOpenMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenu]);

  const startChat = useCallback(async (listing: FeedListing) => {
    if (!client || !userId) return;
    try {
      void router.push(await openChat(listing.id));
    } catch (error) {
      notify(`Couldn't start that chat: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [client, userId, router, notify]);

  const showMyListings = useCallback(() => {
    void router.push('/host-home?view=my-listings', undefined, { shallow: true });
    document.querySelector('.feed-area')?.scrollIntoView({ behavior: 'smooth' });
  }, [router]);

  const onSearch = (value: string) => setSearchDraft(value);
  useEffect(() => {
    if (searchDraft === searchTerm) return undefined;
    const timer = window.setTimeout(() => setSearchTerm(searchDraft), 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, searchTerm]);

  const pickCategory = (value: string) => {
    setCategory(value);
    // A tab shows the Discover feed (as before, also from Saved).
    if (mode === 'saved') setMode('home');
  };

  const showMobileUpdates = mode !== 'mine' && mode !== 'saved' && category === 'all' && !searchTerm.trim() && mobile;

  let feed: React.ReactNode;
  // Until the account is known only the feed waits; the shell, tabs and rail are already drawn.
  if (!ready) feed = <><SkeletonCard /><SkeletonCard /></>;
  else if (mode === 'saved' && savedListings === null) feed = <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>;
  else if (mode === 'saved' && savedListings && savedListings.length === 0) feed = <p className="state-msg">Nothing saved yet — tap the bookmark icon on a listing to save it here.</p>;
  else if (mode !== 'saved' && feedState.status === 'loading') {
    feed = (
      <>
        <SkeletonCard />
        {showMobileUpdates && <MobileUpdates updates={updates} />}
        <SkeletonCard /><SkeletonCard />
      </>
    );
  } else if (mode !== 'saved' && feedState.status === 'error') feed = <p className="state-msg">Couldn&apos;t load listings: {feedState.message}</p>;
  else if (cards.length === 0) {
    feed = <>{suspended && SUSPENSION}<p className="state-msg">{mode === 'mine' ? 'You haven\'t listed a space yet.' : 'No listings match yet — try a different category, location, or @username.'}</p></>;
  } else {
    feed = (
      <>
        {suspended && mode !== 'saved' && SUSPENSION}
        {/* Each listing keeps a wrapper; only those near the screen hold the card. */}
        {cards.map((listing, index) => (
          <div key={listing.id} data-feed-item={listing.id} {...feedWindow.itemProps(listing.id, index)}>
            {feedWindow.isMounted(listing.id, index) && <>
            <FeedCard
              listing={listing}
              index={index}
              userId={userId as string}
              photoUrl={photoUrl}
              avatarUrl={avatarUrl}
              like={likes.stateOf(String(listing.id))}
              saved={Boolean(saved && saved.has(listing.id))}
              video={videos[listing.id] ? videos[listing.id].video : null}
              mediaState={videos[listing.id] ? videos[listing.id].state : 'unknown'}
              layoutVersion={layoutVersion}
              menuOpen={openMenu === listing.id}
              onMenu={(open) => setOpenMenu(open ? listing.id : null)}
              onLike={() => { void likes.toggle(String(listing.id)); }}
              onSave={() => { if (client && userId) void toggleBookmark(client, userId, listing.id).catch(() => notify('Could not update your saved listings.')); }}
              onChat={() => { void startChat(listing); }}
              onReport={() => setReportTarget({ listingId: listing.id, hostId: listing.host_id })}
              notify={notify}
              onStatus={onStatus}
              onDeleted={onDeleted}
              refreshVideo={refreshVideo(listing.id)}
            />
            {index === 0 && showMobileUpdates && <MobileUpdates updates={updates} />}
            </>}
          </div>
        ))}
        {mode !== 'saved' && (loadingMore
          ? <p className="state-msg" id="listing-feed-sentinel" ref={pageTrigger.ref}>Loading more listings…</p>
          : <div id="listing-feed-sentinel" aria-hidden="true" ref={pageTrigger.ref} />)}
      </>
    );
  }

  return (
    <>
      <Head>
        <title>VaRoom — Host dashboard</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: HOST_HOME_STYLES }} />
      <div className={`toast${toast ? ' show' : ''}`} id="toast">{toast}</div>
      <ReportDialog
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        onSubmit={(reason, details) => (client && userId && reportTarget
          ? submitReport(client, { reporterId: userId, hostId: reportTarget.hostId, listingId: reportTarget.listingId, reason, details })
          : Promise.resolve('Please sign in again.'))}
      />
      <NichePrompt open={nicheOpen} onChoose={async (niche) => {
        if (!client || !userId) return false;
        try { await saveNiche(client, userId, niche); setNicheOpen(false); return true; } catch { return false; }
      }} />
      <div className="app-shell">
        <div className="main-col">
          <header className="topbar">
            <button type="button" className="topbar-avatar-btn" id="topbar-avatar-btn" aria-label="Open menu">
              <div className="avatar-circle" id="user-avatar" aria-hidden="true"><Svg markup={ICONS.menu} /></div>
            </button>
            <div className="search-wrap">
              <button type="button" className="search-btn" id="search-btn" aria-label="Search"><Svg markup={ICONS.search} /></button>
              <input type="text" id="search-input" placeholder="Search by location or @username" value={searchDraft} onChange={(event) => onSearch(event.target.value)} />
            </div>
            <Link href="/list" className="list-btn-primary topbar-list-btn" aria-label="List a new space">
              <Svg markup={ICONS.plus16} /><span className="btn-label">List a new space</span>
            </Link>
          </header>

          <div className="col-divider" aria-hidden="true" />

          <div className="dash-body">
            <div className="dash-main" ref={dashMain}>
              <div className="dash-header">
                <div className="tabs" id="tabs">
                  {CATEGORY_TABS.map((tab) => (
                    <button key={tab.value} className={`tab${category === tab.value ? ' active' : ''}`} data-category={tab.value} onClick={() => pickCategory(tab.value)}>{tab.label}</button>
                  ))}
                </div>
              </div>
              <div className="feed-area">
                <div id="feed-list" className="discover-media-feed" ref={feedList}>{feed}</div>
                <div className="property-news-mobile-slot">
                  <section className="property-news-card" id="property-news-mobile-card" aria-labelledby="property-news-mobile-title">
                    <div className="stats-head"><h2 id="property-news-mobile-title">Your Property News on VaRoom</h2><NewsRefreshButton onRefresh={refreshNews} busy={newsRefreshing} /></div>
                    <PropertyNewsList news={newsRefreshing ? null : news} idSuffix="-mobile" />
                    <Link className="property-news-view-all" href="/property-news">View all news →</Link>
                  </section>
                </div>
              </div>
            </div>
            <HostRail listings={glance} photoUrl={photoUrl} news={newsRefreshing ? null : news} onRefreshNews={refreshNews} newsRefreshing={newsRefreshing} updates={updates} notify={notify} onStatus={onStatus} onDeleted={onDeleted} onViewAll={showMyListings} />
          </div>
        </div>
      </div>
    </>
  );
}

function MobileUpdates({ updates }: { updates: Loadable<VaroomUpdate[]> }) {
  return (
    <div className="mobile-widget-slot">
      <div className="varoom-updates-card mobile-varoom-updates-card">
        <div className="stats-head"><h2>VaRoom Updates</h2></div>
        <VaroomUpdatesContent updates={updates} id="varoom-updates-mobile" />
      </div>
    </div>
  );
}
