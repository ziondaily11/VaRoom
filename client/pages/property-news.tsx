import React, { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  PropertyNewsItem,
  getCachedNewsList,
  setCachedNewsList,
  getCachedArticle,
  getCachedPreview,
  setCachedArticle,
  saveScrollPosition,
  getScrollPosition,
} from '../lib/propertyNewsCache';
import { toExcerpt } from '../lib/propertyNewsExcerpt';
import {
  articleMedia,
  bodyRepeatsSummary,
  cardLocation,
  classifyParagraph,
  columnSplit,
  detailedLocation,
  formatDate,
  formatMastheadDate,
  formatMastheadShort,
  getRegulatoryStatus,
  moreStories,
  safeSourceUrl,
  splitArticleParagraphs,
} from '../lib/propertyNews/articleFormat';
import { fetchNewsArticle, fetchNewsList } from '../lib/propertyNews/newsRequests';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { errorMessage } from '../lib/errors';
import { loginUrl } from '../lib/safeRedirect';
import { PROPERTY_NEWS_STYLES } from '../components/propertyNews/propertyNewsStyles';
import MenuButton from '../components/shell/MenuButton';

function NewsCardImage({ src }: { src?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed || !src || !src.trim()) return null;

  return (
    <div className={`news-card-image-wrap ${loaded ? 'is-loaded' : ''}`}>
      <img
        className="news-card-image"
        src={src}
        alt=""
        decoding="async"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// Fills the lead story's right trail; reports failure so the trail can be dropped.
function LeadImage({ src, onFailed }: { src: string; onFailed: () => void }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`lead-image-frame ${loaded ? 'is-loaded' : ''}`}>
      <img
        className="lead-image"
        src={src}
        alt=""
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={onFailed}
      />
    </div>
  );
}

function DetailImage({
  src,
  alt,
  caption,
  credit,
  onFailed,
}: {
  src?: string;
  alt?: string;
  caption?: string;
  credit?: string;
  onFailed?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed || !src || !src.trim()) return null;

  return (
    <figure className={`detail-image-wrap ${loaded ? 'is-loaded' : ''}`}>
      <img
        className="detail-image"
        src={src}
        alt={alt || ''}
        decoding="async"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          if (onFailed) onFailed();
        }}
      />
      {(caption || credit) && (
        <figcaption className="detail-image-caption">
          {caption && <span className="caption-text">{caption}</span>}
          {credit && <span className="caption-credit"> Photo: {credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

const NewsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2-2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
    <path d="M18 14h-8" />
    <path d="M15 18h-5" />
    <path d="M10 6h8v4h-8V6Z" />
  </svg>
);

/** Only when the news loaded and there is really nothing to show. */
function EmptyState() {
  return (
    <div className="state">
      <div className="state-icon-wrap"><NewsIcon /></div>
      <div className="state-title">All caught up</div>
      <p className="state-desc">There are no property updates right now. New stories appear here as soon as they are published.</p>
    </div>
  );
}

/** The news or an article could not load: say so, and offer a way forward. */
function ErrorState({ title, onRetry, retrying, backToFront = false }: { title: string; onRetry: () => void; retrying: boolean; backToFront?: boolean }) {
  return (
    <div className="state" role="alert">
      <div className="state-icon-wrap"><NewsIcon /></div>
      <div className="state-title">{title}</div>
      <p className="state-desc">Please check your connection and try again.</p>
      <div className="state-actions">
        <button type="button" className="news-btn primary" onClick={onRetry} disabled={retrying}>{retrying ? 'Trying again…' : 'Try again'}</button>
        {backToFront && <Link href="/property-news" className="news-btn">Front page</Link>}
      </div>
    </div>
  );
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);

/** Phones open the share sheet; elsewhere the article link is copied. */
function ShareButton({ title }: { title: string }) {
  const [status, setStatus] = useState('');
  const share = async () => {
    const url = window.location.href;
    const nav = navigator as Navigator & { share?: (data: { title?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === 'function' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      try { await nav.share({ title, url }); } catch { /* closed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied');
    } catch {
      setStatus('Copy the link from the address bar');
    }
    window.setTimeout(() => setStatus(''), 2200);
  };
  return (
    <span className="article-share">
      <button type="button" className="news-btn" onClick={() => { void share(); }}><ShareIcon />Share</button>
      <span className="share-status" role="status" aria-live="polite">{status}</span>
    </span>
  );
}

// Place on one line, date (and source on articles) on the next.
function Dateline({ news, detailed = false }: { news: PropertyNewsItem; detailed?: boolean }) {
  const source = detailed ? news.source?.name : undefined;
  return (
    <div className="dateline">
      <span className="dateline-place">{detailed ? detailedLocation(news) : cardLocation(news)}</span>
      <span className="dateline-date">
        {formatDate(news.source?.published_at || news.published_at)}
        {source && <> · via {source}</>}
      </span>
    </div>
  );
}

// Character-equivalent heights that balance the two newspaper columns.
const MEDIA_WEIGHT = 700;
const STANDFIRST_WEIGHT = 1.4;
// Without media, shorter stories read better as one column.
const MIN_TWO_COLUMN_CHARS = 1400;

function ArticleBlock({ paragraph, lead }: { paragraph: string; lead: boolean }) {
  const block = classifyParagraph(paragraph);
  if (block.kind === 'subhead') return <h2 className="editorial-subhead">{block.text}</h2>;
  if (block.kind === 'quote') return <blockquote className="editorial-pullquote"><p>{block.text}</p></blockquote>;
  return <p className={lead ? 'detail-lead' : 'detail-p'}>{block.text}</p>;
}

/**
 * The article as a newspaper page: standfirst and the opening paragraphs in
 * the first column; media at the top of the second, with the story
 * continuing beneath it so neither column leaves a blank trail.
 */
function ArticleColumns({ item, loading, media, mediaWeight }: {
  item: PropertyNewsItem;
  loading: boolean;
  media: ReactNode;
  mediaWeight: number;
}) {
  const bodyText = (item.body || '').trim();
  const summaryText = (item.summary || '').trim();
  const paragraphs = bodyText ? splitArticleParagraphs(bodyText) : [];
  const showSummary = Boolean(summaryText) && !(paragraphs.length && bodyRepeatsSummary(summaryText, paragraphs[0]));
  const standfirst = showSummary || (!bodyText && !loading)
    ? <p className="detail-summary">{summaryText || 'Read the full update at the source below.'}</p>
    : null;

  let left: ReactNode;
  let right: ReactNode[] = [];
  if (!bodyText) {
    left = loading
      ? [100, 94, 97, 82].map((width) => <div key={width} className="newspaper-skeleton-line" style={{ width: `${width}%`, marginBottom: '14px' }} />)
      : <div className="detail-notice">Full report not syndicated. Please refer to the official publication source below.</div>;
  } else {
    const blocks = paragraphs.map((p, i) => <ArticleBlock key={i} paragraph={p} lead={i === 0 && !showSummary} />);
    const chars = paragraphs.reduce((n, p) => n + p.length, 0);
    const split = media || chars >= MIN_TWO_COLUMN_CHARS
      ? columnSplit(paragraphs, showSummary ? summaryText.length * STANDFIRST_WEIGHT : 0, mediaWeight)
      : paragraphs.length;
    left = blocks.slice(0, split);
    right = blocks.slice(split);
  }

  const twoColumns = Boolean(media) || right.length > 0;
  return (
    <div className={`article-columns${twoColumns ? '' : ' single'}`}>
      <div className="article-col">
        {standfirst}
        <div className="detail-body">{left}</div>
      </div>
      {twoColumns && (
        <div className="article-col">
          {media}
          {right.length > 0 && <div className="detail-body">{right}</div>}
        </div>
      )}
    </div>
  );
}

export default function PropertyNewsPage() {
  const router = useRouter();
  const articleId = router.isReady && router.query.id ? String(router.query.id) : null;

  const [revealing, setRevealing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [newsItems, setNewsItems] = useState<PropertyNewsItem[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);

  const [detailItem, setDetailItem] = useState<PropertyNewsItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const [failedImageUrls, setFailedImageUrls] = useState<Record<string, boolean>>({});

  const scrollRestoredRef = useRef(false);


  // The way back: signed in, the account's own home (from the verified
  // profile); visitors go to the VaRoom site and can log in.
  const auth = useAuth();
  const verifiedRole = accountRole(auth.profile);
  const signedIn = auth.status === 'signed-in';
  const homeHref = signedIn ? (verifiedRole === 'client' ? '/client-home' : '/host-home') : '/';

  // Fetch or restore news index
  const loadIndexNews = useCallback(async (signal?: AbortSignal, force = false) => {
    const cached = getCachedNewsList();
    if (cached && cached.items.length > 0) {
      setNewsItems(cached.items);
      setListLoading(false);
      if (cached.isFresh && !force) {
        return;
      }
    }

    const firstShow = !cached || cached.items.length === 0;
    if (force || firstShow) {
      setListLoading(true);
    }
    setListError(false);
    try {
      const validItems = await fetchNewsList(signal, force);
      if (!signal?.aborted) {
        // Stories fade in only the first time they arrive (not from the saved copy).
        if (firstShow) setRevealing(true);
        setNewsItems(validItems);
        setCachedNewsList(validItems);
        setListLoading(false);
        setListError(false);
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.warn('Property news fetch notice:', errorMessage(err) || err);
      setListError(true);
      setListLoading(false);
    }
  }, []);

  // Fetch or restore article detail
  const loadDetail = useCallback(async (id: string, signal?: AbortSignal) => {
    setFailedImageUrls({});
    // 1. Check if we already have the complete article in cache
    const completeCached = getCachedArticle(id);
    if (completeCached && completeCached.body && completeCached.body.trim()) {
      setDetailItem(completeCached);
      setDetailLoading(false);
      setDetailError(false);
      return;
    }

    // 2. If no complete cached article, check if we have a listing preview
    // to display headline, hero image, and location immediately
    const preview = getCachedPreview(id);
    if (preview) {
      setDetailItem(preview);
      setDetailLoading(true); // body is still loading
      setDetailError(false);
    } else {
      setDetailLoading(true);
      setDetailError(false);
    }

    // 3. Fetch the full article from /api/news/:id
    try {
      const fullItem = await fetchNewsArticle(id, signal);
      if (!signal?.aborted) {
        setDetailItem(fullItem);
        setCachedArticle(id, fullItem);
        setDetailLoading(false);
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.warn('Property news article detail notice:', errorMessage(err) || err);
      if (!preview) {
        setDetailError(true);
      }
      setDetailLoading(false);
    }
  }, []);

  // React to route changes between Index and Detail
  useEffect(() => {
    if (!router.isReady) return;
    const controller = new AbortController();

    if (articleId) {
      void loadDetail(articleId, controller.signal);
    } else {
      void loadIndexNews(controller.signal);
    }

    return () => {
      controller.abort();
    };
  }, [router.isReady, articleId, loadDetail, loadIndexNews]);

  // Restore scroll position when returning to the index view
  useEffect(() => {
    if (!articleId && newsItems && newsItems.length > 0 && !scrollRestoredRef.current) {
      const savedY = getScrollPosition();
      if (savedY > 0) {
        scrollRestoredRef.current = true;
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedY, behavior: 'auto' });
        });
      }
    }
    if (articleId) {
      scrollRestoredRef.current = false;
    }
  }, [articleId, newsItems]);

  // Track scroll position before navigating away from index
  const handleArticleClick = () => {
    if (typeof window !== 'undefined') {
      saveScrollPosition(window.scrollY);
    }
  };

  // The reveal plays once.
  useEffect(() => {
    if (!revealing) return undefined;
    const timer = window.setTimeout(() => setRevealing(false), 700);
    return () => window.clearTimeout(timer);
  }, [revealing]);

  // An article ends with other stories: the saved front page, else fetched quietly.
  useEffect(() => {
    if (!articleId || newsItems) return undefined;
    const controller = new AbortController();
    const cached = getCachedNewsList();
    if (cached && cached.items.length) setNewsItems(cached.items);
    else fetchNewsList(controller.signal).then((items) => { setNewsItems(items); setCachedNewsList(items); }, () => { /* the article stands alone */ });
    return () => controller.abort();
  }, [articleId, newsItems]);

  const retryList = async () => {
    setRetrying(true);
    await loadIndexNews(undefined, true);
    setRetrying(false);
  };
  const retryArticle = async () => {
    if (!articleId) return;
    setRetrying(true);
    await loadDetail(articleId);
    setRetrying(false);
  };

  const handleImageFail = (url: string) => {
    setFailedImageUrls((prev) => ({ ...prev, [url]: true }));
  };

  // Compile available images and check conditional layout state
  const { activeImages, hasVideo, hasMedia } = articleMedia(detailItem, failedImageUrls);

  const pageTitle = detailItem && articleId
    ? `${detailItem.title} — VaRoom Property News`
    : 'Property News on VaRoom';

  const mastheadDate = detailItem?.source?.published_at || detailItem?.published_at;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <style dangerouslySetInnerHTML={{ __html: PROPERTY_NEWS_STYLES }} />
      <div className="property-news-root">
        {/* NEWSPAPER MASTHEAD */}
        <header className="newspaper-masthead-container">
          <div className="masthead-topbar">
            <div className="masthead-brand-row">
              <MenuButton />
              <Link href={homeHref} className="masthead-brand" aria-label={signedIn ? 'VaRoom home' : 'VaRoom'}><span className="masthead-badge-va">Va</span>Room</Link>
            </div>
            <div className="masthead-date-nav">
              <span className="masthead-date-text">
                <span className="masthead-date-long">{formatMastheadDate(mastheadDate)}</span>
                <span className="masthead-date-short">{formatMastheadShort(mastheadDate)}</span>
              </span>
              {articleId ? (
                <Link href="/property-news" className="newspaper-nav-link" aria-label="Return to all property news">
                  ← Front Page
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    className="newspaper-nav-link"
                    onClick={() => { void loadIndexNews(undefined, true); }}
                    disabled={listLoading}
                  >
                    Refresh
                  </button>
                  {signedIn ? (
                    <Link href={homeHref} className="newspaper-nav-link" aria-label="Back to your VaRoom home">
                      ← Home
                    </Link>
                  ) : (
                    <Link href={loginUrl('/property-news')} className="newspaper-nav-link">
                      Log in
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="masthead-rule-thick" />
          <div className="masthead-rule-thin" />

          <div className="masthead-center">
            <Link href="/property-news" className="masthead-title-link">
              <h1 className="masthead-title">DAILY NEWS</h1>
            </Link>
          </div>

          <div className="masthead-rule-thin" />
          <div className="masthead-rule-thick" />
        </header>

        <main className="newspaper-main">
          {articleId ? (
            /* =================== ARTICLE DETAIL VIEW =================== */
            <article className="detail" id="news-detail" aria-live="polite">
              {detailError && !detailItem ? (
                <ErrorState title="This story could not load" onRetry={() => { void retryArticle(); }} retrying={retrying} backToFront />
              ) : !detailItem ? (
                <div className="newspaper-skeleton-box">
                  <div className="newspaper-skeleton-line" style={{ height: '36px', width: '80%', marginBottom: '1.2rem' }}></div>
                  <div className="newspaper-skeleton-line" style={{ height: '20px', width: '40%', marginBottom: '2rem' }}></div>
                  <div className="newspaper-skeleton-line" style={{ height: '240px', width: '100%' }}></div>
                </div>
              ) : (
                <div className="newspaper-article-container">
                  {/* ARTICLE HEADER */}
                  <header className="article-header">
                    <div className="article-category-row">
                      <p className="eyebrow">{detailItem.category ? detailItem.category.toUpperCase() : 'Property Intelligence'}</p>
                    </div>

                    <h1 className="article-headline">{detailItem.title}</h1>

                    <div className="article-tools">
                      <Dateline news={detailItem} detailed />
                      <ShareButton title={detailItem.title} />
                    </div>
                  </header>

                  <div className="editorial-divider" />

                  <ArticleColumns
                    item={detailItem}
                    loading={detailLoading}
                    mediaWeight={hasMedia ? MEDIA_WEIGHT * Math.max(1, activeImages.length + (hasVideo ? 1 : 0)) : 0}
                    media={hasMedia && (
                      <aside className="article-media" aria-label="Article Media">
                        {hasVideo && (
                          <div className="newspaper-video-box">
                            <video
                              className="newspaper-video"
                              controls
                              preload="metadata"
                              src={detailItem.video_url}
                              poster={detailItem.video_thumbnail || detailItem.poster || detailItem.image_url || undefined}
                            >
                              Your browser does not support video playback.
                            </video>
                            {(detailItem.video_caption || detailItem.source?.name) && (
                              <figcaption className="detail-image-caption">
                                {detailItem.video_caption || 'Video Coverage'}
                                {detailItem.source?.name && <span className="caption-credit"> — {detailItem.source.name}</span>}
                              </figcaption>
                            )}
                          </div>
                        )}

                        {activeImages.map((img, i) => (
                          <DetailImage
                            key={img.url + i}
                            src={img.url}
                            alt={detailItem.title}
                            caption={img.caption}
                            credit={img.credit}
                            onFailed={() => handleImageFail(img.url)}
                          />
                        ))}
                      </aside>
                    )}
                  />

                  {/* FACT GRID AND SOURCE VERIFICATION */}
                  <div className="editorial-divider" />

                  <div className="fact-grid">
                    <div>
                      <span className="fact-label">Location</span>
                      <span className="fact-value">{detailedLocation(detailItem)}</span>
                    </div>
                    <div>
                      <span className="fact-label">Current status</span>
                      <span className="fact-value">
                        {getRegulatoryStatus(detailItem)?.label || 'Reported update'}
                      </span>
                    </div>
                    <div>
                      <span className="fact-label">Published</span>
                      <span className="fact-value">
                        {formatDate(detailItem.source?.published_at || detailItem.published_at)}
                      </span>
                    </div>
                  </div>

                  {detailItem.source?.name && (
                    <div className="source-box">
                      {safeSourceUrl(detailItem.source.url) ? (
                        <a
                          className="source-link"
                          href={safeSourceUrl(detailItem.source.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Source · {detailItem.source.name}
                        </a>
                      ) : (
                        <strong>Source · {detailItem.source.name}</strong>
                      )}
                      <br />
                      This VaRoom summary is based on the linked source. Regulatory status reflects
                      the published record and is not legal advice.
                    </div>
                  )}

                  {/* More stories: the next headlines, so readers don't have to go back first. */}
                  {moreStories(newsItems, articleId).length > 0 && (
                    <section className="more-stories" aria-labelledby="more-stories-title">
                      <h2 className="more-stories-title" id="more-stories-title">More stories</h2>
                      <ul className="more-stories-list">
                        {moreStories(newsItems, articleId).map((story) => (
                          <li key={story.id}>
                            <Link className="more-story-link" href={`/property-news?id=${encodeURIComponent(String(story.id))}`}>
                              <h3>{story.title}</h3>
                              <Dateline news={story} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="back-front"><Link href="/property-news" className="news-btn">← Front page</Link></div>
                </div>
              )}
            </article>
          ) : (
            /* =================== NEWS INDEX VIEW =================== */
            <section id="news-index" aria-live="polite">
              {listLoading && !newsItems ? (
                <div className="index-loading-grid">
                  <div className="newspaper-skeleton-box" style={{ height: '220px' }}></div>
                  <div className="newspaper-skeleton-box" style={{ height: '220px' }}></div>
                  <div className="newspaper-skeleton-box" style={{ height: '220px' }}></div>
                </div>
              ) : listError && (!newsItems || newsItems.length === 0) ? (
                <ErrorState title="News could not load" onRetry={() => { void retryList(); }} retrying={retrying} />
              ) : !newsItems || newsItems.length === 0 ? (
                <EmptyState />
              ) : (
                <div className={`newspaper-front-page${revealing ? ' is-revealing' : ''}`}>
                  {listError && (
                    <p className="news-refresh-error" role="status">
                      Property News could not be refreshed. Showing previously loaded articles.
                    </p>
                  )}
                  {/* Lead Featured Article (Newspaper Top Headline) */}
                  {newsItems.length > 0 && (() => {
                    const lead = newsItems[0];
                    const leadSource = lead.source || {};
                    const leadSourceUrl = safeSourceUrl(leadSource.url);
                    const leadImageUrl = (lead.image_url || '').trim();
                    const leadHasImage = Boolean(leadImageUrl) && !failedImageUrls[leadImageUrl];

                    return (
                      <article className={`frontpage-lead-article ${leadHasImage ? 'has-image' : 'no-image'}`}>
                        <div className="lead-text-trail">
                          {lead.category && <span className="lead-kicker">{lead.category}</span>}
                          <Link
                            className="lead-headline-link"
                            href={`/property-news?id=${encodeURIComponent(lead.id)}`}
                            onClick={handleArticleClick}
                          >
                            <h2 className="lead-headline">{lead.title}</h2>
                          </Link>
                          <p className="lead-excerpt">
                            {toExcerpt(lead.summary) || 'Read the lead Kenyan property and regulatory update on VaRoom.'}
                          </p>
                          <Dateline news={lead} />
                          {leadSource.name && (
                            <div className="news-card-source">
                              {leadSourceUrl ? (
                                <a
                                  className="news-card-source-link"
                                  href={leadSourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Source · {leadSource.name}
                                </a>
                              ) : (
                                `Source · ${leadSource.name}`
                              )}
                            </div>
                          )}
                        </div>

                        {leadHasImage && (
                          <div className="lead-image-trail">
                            <Link
                              href={`/property-news?id=${encodeURIComponent(lead.id)}`}
                              onClick={handleArticleClick}
                              className="lead-image-link"
                            >
                              <LeadImage src={leadImageUrl} onFailed={() => handleImageFail(leadImageUrl)} />
                            </Link>
                            <p className="frontpage-image-caption">
                              {leadSource.name ? `Reported by ${leadSource.name}` : 'Kenya Property Report'}
                            </p>
                          </div>
                        )}
                      </article>
                    );
                  })()}

                  <div className="editorial-divider" />

                  {/* Multi-Column Newspaper Article Grid */}
                  <div className="news-list" id="news-list">
                    {newsItems.slice(1).map((news) => {
                      const source = news.source || {};
                      const sourceUrl = safeSourceUrl(source.url);

                      return (
                        <article className="news-card" key={news.id}>
                          <Link
                            className="news-card-main"
                            href={`/property-news?id=${encodeURIComponent(news.id)}`}
                            onClick={handleArticleClick}
                          >
                            <h2>{news.title}</h2>
                            <p>
                              {toExcerpt(news.summary) || 'Read the latest property update from VaRoom.'}
                            </p>
                            <Dateline news={news} />
                            {news.image_url && <NewsCardImage src={news.image_url} />}
                          </Link>

                          {source.name && (
                            <div className="news-card-source">
                              {sourceUrl ? (
                                <a
                                  className="news-card-source-link"
                                  href={sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Source · {source.name}
                                </a>
                              ) : (
                                `Source · ${source.name}`
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </main>
      </div>


    </>
  );
}

PropertyNewsPage.getLayout = (page: React.ReactElement) => page;
// Phones: the hamburger opens the account's sidebar as a drawer (_app mounts it).
PropertyNewsPage.phoneMenu = true;
