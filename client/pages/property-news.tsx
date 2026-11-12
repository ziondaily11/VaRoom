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
  getRegulatoryStatus,
  safeSourceUrl,
  splitArticleParagraphs,
} from '../lib/propertyNews/articleFormat';
import { fetchNewsArticle, fetchNewsList } from '../lib/propertyNews/newsRequests';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { errorMessage } from '../lib/errors';

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

function EmptyState() {
  return (
    <div className="state">
      <div className="state-icon-wrap">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2-2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
          <path d="M18 14h-8" />
          <path d="M15 18h-5" />
          <path d="M10 6h8v4h-8V6Z" />
        </svg>
      </div>
      <div className="state-title">All Caught Up</div>
      <p className="state-desc">
        There are no new property updates right now. We continuously monitor official land registries,
        gazettes, and verified news in Kenya.
      </p>
      <div className="state-badge">
        <span className="state-dot"></span> 24/7 Source Monitoring Active
      </div>
    </div>
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

  const [dashboardHref, setDashboardHref] = useState('/host-home');
  const [newsItems, setNewsItems] = useState<PropertyNewsItem[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);

  const [detailItem, setDetailItem] = useState<PropertyNewsItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const [failedImageUrls, setFailedImageUrls] = useState<Record<string, boolean>>({});

  const scrollRestoredRef = useRef(false);

  // Stage 1: Enforce light theme while Property News is the active page.
  // Route transitions to other pages are handled authoritatively by _app.js on routeChangeComplete.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.colorScheme = 'light';
  }, []);

  // Determine user dashboard link without altering layout. The verified
  // account's role wins; the non-private last-role hint covers signed-out views.
  const verifiedRole = accountRole(useAuth().profile);
  useEffect(() => {
    if (verifiedRole) {
      setDashboardHref(verifiedRole === 'client' ? '/client-home' : '/host-home');
      return;
    }
    try {
      const lastRole = localStorage.getItem('varoom_last_role') || localStorage.getItem('varoom_user_role');
      setDashboardHref(lastRole === 'client' ? '/client-home' : '/host-home');
    } catch {
      setDashboardHref('/host-home');
    }
  }, [verifiedRole]);

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

    if (force || !cached || cached.items.length === 0) {
      setListLoading(true);
    }
    setListError(false);
    try {
      const validItems = await fetchNewsList(signal, force);
      if (!signal?.aborted) {
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

      <div className="property-news-root">
        {/* NEWSPAPER MASTHEAD */}
        <header className="newspaper-masthead-container">
          <div className="masthead-topbar">
            <span className="masthead-brand"><span className="masthead-badge-va">Va</span>Room</span>
            <div className="masthead-date-nav">
              <span className="masthead-date-text">{formatMastheadDate(mastheadDate)}</span>
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
                  <Link href={dashboardHref} className="newspaper-nav-link" aria-label="Return to VaRoom dashboard">
                    ← Dashboard
                  </Link>
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
                <EmptyState />
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

                    <Dateline news={detailItem} detailed />
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
              ) : !newsItems || newsItems.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="newspaper-front-page">
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

      <style jsx global>{`
        :root {
          --newspaper-white: #ffffff;
          --newspaper-ink: #111111;
          --newspaper-body: #1c1c1c;
          --newspaper-muted: #555555;
          --newspaper-border: #111111;
          --newspaper-rule-light: #dedede;
          --newspaper-accent: #c41e3a;
          --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
          --font-serif-body: 'Newsreader', Georgia, 'Times New Roman', serif;
          --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .property-news-root {
          margin: 0;
          min-height: 100vh;
          background: var(--newspaper-white);
          color: var(--newspaper-ink);
          font-family: var(--font-sans);
          -webkit-font-smoothing: antialiased;
        }

        .property-news-root a {
          color: inherit;
          text-decoration: none;
        }

        .property-news-root :focus-visible {
          outline: 2px solid var(--newspaper-ink);
          outline-offset: 3px;
        }

        /* =================== DARK-MODE ISOLATION (Stage 1) =================== */
        /* Prevent varoom-dark-theme.css rules from inverting Property News.
           Scoped strictly to .property-news-root and descendants. */
        html[data-theme="dark"] .property-news-root,
        html[data-theme="dark"] .property-news-root .newspaper-main {
          background: #ffffff !important;
          color: #111111 !important;
          color-scheme: light !important;
        }

        html[data-theme="dark"] .newspaper-masthead-container,
        html[data-theme="dark"] .newspaper-article-container,
        html[data-theme="dark"] .frontpage-lead-article,
        html[data-theme="dark"] .news-card,
        html[data-theme="dark"] .article-header,
        html[data-theme="dark"] .article-columns,
        html[data-theme="dark"] .article-col,
        html[data-theme="dark"] .article-media,
        html[data-theme="dark"] .fact-grid,
        html[data-theme="dark"] .fact-item,
        html[data-theme="dark"] .source-box {
          background: transparent !important;
          color: inherit !important;
        }

        html[data-theme="dark"] .masthead-rule-thick,
        html[data-theme="dark"] .masthead-rule-thin,
        html[data-theme="dark"] .editorial-divider {
          background: #111111 !important;
          border-color: #111111 !important;
        }

        html[data-theme="dark"] .masthead-topbar,
        html[data-theme="dark"] .masthead-date-nav,
        html[data-theme="dark"] .detail-image-caption,
        html[data-theme="dark"] .caption-text,
        html[data-theme="dark"] .caption-credit,
        html[data-theme="dark"] .dateline-date,
        html[data-theme="dark"] .eyebrow {
          color: #555555 !important;
        }

        /* =================== NEWSPAPER MASTHEAD =================== */
        .newspaper-masthead-container {
          max-width: 1140px;
          margin: 0 auto;
          padding: 1.25rem 1.5rem 0;
          background: var(--newspaper-white);
        }

        .masthead-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--newspaper-muted);
          padding-bottom: 0.5rem;
        }

        .masthead-brand {
          font-weight: 900;
          letter-spacing: 0.04em;
          color: var(--newspaper-ink);
        }

        .masthead-date-nav {
          display: flex;
          align-items: center;
          gap: 1.2rem;
        }

        .newspaper-nav-link {
          color: var(--newspaper-ink);
          font-weight: 700;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.15s ease;
        }

        button.newspaper-nav-link {
          padding: 0;
          border: 0;
          background: none;
          font: inherit;
          text-transform: inherit;
          cursor: pointer;
        }

        button.newspaper-nav-link:disabled {
          cursor: wait;
          opacity: 0.6;
        }

        .newspaper-nav-link:hover {
          color: var(--newspaper-accent);
        }

        .news-refresh-error {
          grid-column: 1 / -1;
          color: #8b1e2d;
          font-size: 0.9rem;
        }

        .masthead-rule-thick {
          height: 3px;
          background: var(--newspaper-border);
          width: 100%;
        }

        .masthead-rule-thin {
          height: 1px;
          background: var(--newspaper-border);
          width: 100%;
          margin: 2px 0;
        }

        .masthead-center {
          text-align: center;
          padding: 1rem 0 0.85rem;
        }

        .masthead-title-link {
          display: inline-block;
        }

        .masthead-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(2.8rem, 7.8vw, 5.2rem);
          font-weight: 900;
          line-height: 0.95;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          color: var(--newspaper-ink);
        }

        .masthead-badge-va {
          color: var(--newspaper-accent);
        }

        /* =================== MAIN EDITORIAL WRAPPER =================== */
        .newspaper-main {
          max-width: 1140px;
          margin: 0 auto;
          padding: 2rem 1.5rem 5rem;
        }

        .editorial-divider {
          height: 1px;
          background: var(--newspaper-border);
          margin: 1.5rem 0 2rem;
          border: none;
        }

        .eyebrow {
          font-size: 0.78rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 800;
          color: var(--newspaper-ink);
          margin: 0;
        }

        /* =================== ARTICLE DETAIL VIEW =================== */
        .article-header {
          padding-bottom: 0.5rem;
        }

        .article-category-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.8rem;
        }

        .article-headline {
          margin: 0 0 1rem;
          font-family: var(--font-display);
          font-size: clamp(2.1rem, 5vw, 3.5rem);
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -0.02em;
          color: var(--newspaper-ink);
        }

        /* Dateline: the place in small tracked capitals, the date beneath it
           in the body face, so neither runs into the other. */
        .dateline {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .dateline-place {
          font-family: var(--font-sans);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          line-height: 1.45;
          text-transform: uppercase;
          color: var(--newspaper-ink);
        }

        .dateline-date {
          font-family: var(--font-serif-body);
          font-size: 0.92rem;
          font-style: italic;
          line-height: 1.4;
          color: var(--newspaper-muted);
        }

        .article-header .dateline-place {
          font-size: 0.78rem;
        }

        .article-header .dateline-date {
          font-size: 1.02rem;
        }

        /* Newspaper columns: text in the first, media then text in the second. */
        .article-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          margin-bottom: 2.5rem;
        }

        .article-columns.single {
          grid-template-columns: minmax(0, 720px);
          justify-content: center;
        }

        .article-col {
          min-width: 0;
        }

        .article-col:first-child {
          padding-right: 2.25rem;
        }

        .article-col + .article-col {
          padding-left: 2.25rem;
          border-left: 1px solid var(--newspaper-rule-light);
        }

        .article-columns.single .article-col:first-child {
          padding-right: 0;
        }

        .detail-summary {
          font-family: var(--font-serif-body);
          font-size: 1.25rem;
          line-height: 1.55;
          font-weight: 600;
          font-style: italic;
          color: var(--newspaper-ink);
          margin: 0 0 1.35rem;
          padding-bottom: 1.1rem;
          border-bottom: 1px solid var(--newspaper-rule-light);
        }

        .detail-body {
          font-family: var(--font-serif-body);
          font-size: 1.1rem;
          line-height: 1.65;
          color: var(--newspaper-body);
        }

        .detail-lead {
          font-size: 1.2rem;
          line-height: 1.6;
          font-weight: 600;
          color: var(--newspaper-ink);
          margin: 0 0 1rem;
        }

        .detail-lead::first-letter {
          font-size: 3.4em;
          float: left;
          line-height: 0.8;
          margin: 0.1em 0.12em 0 0;
          font-family: var(--font-display);
          font-weight: 900;
          color: var(--newspaper-ink);
        }

        .detail-p {
          margin: 0 0 0.95rem;
        }

        .detail-p:last-child {
          margin-bottom: 0;
        }

        .editorial-subhead {
          font-family: var(--font-display);
          font-size: 1.45rem;
          font-weight: 700;
          line-height: 1.28;
          color: var(--newspaper-ink);
          margin: 1.8rem 0 0.7rem;
        }

        .editorial-pullquote {
          margin: 1.5rem 0;
          padding: 1.2rem 1.6rem;
          border-left: 3px solid var(--newspaper-border);
          border-top: 1px solid var(--newspaper-rule-light);
          border-bottom: 1px solid var(--newspaper-rule-light);
          background: #fbfbfb;
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-style: italic;
          line-height: 1.55;
          color: var(--newspaper-ink);
        }

        .editorial-pullquote p {
          margin: 0;
        }

        .detail-notice {
          margin: 1.2rem 0;
          padding: 1rem 1.25rem;
          border-left: 3px solid var(--newspaper-border);
          background: #f8f8f8;
          font-size: 0.9rem;
          font-family: var(--font-sans);
          color: var(--newspaper-muted);
        }

        .article-media {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          margin-bottom: 1.6rem;
        }

        .detail-image-wrap {
          margin: 0;
          opacity: 0;
          transition: opacity 0.25s ease;
        }

        .detail-image-wrap.is-loaded {
          opacity: 1;
        }

        .detail-image {
          display: block;
          width: 100%;
          height: auto;
          max-height: 680px;
          object-fit: cover;
          border: 1px solid var(--newspaper-border);
        }

        .detail-image-caption {
          margin-top: 0.6rem;
          font-family: var(--font-serif-body);
          font-size: 0.88rem;
          line-height: 1.45;
          color: var(--newspaper-muted);
          border-bottom: 1px solid var(--newspaper-rule-light);
          padding-bottom: 0.5rem;
        }

        .caption-text {
          font-weight: 700;
          color: var(--newspaper-ink);
        }

        .caption-credit {
          font-style: italic;
          color: #777;
        }

        .newspaper-video-box {
          border: 1px solid var(--newspaper-border);
          padding: 4px;
          background: #fff;
        }

        .newspaper-video {
          display: block;
          width: 100%;
          max-height: 420px;
          background: #000;
        }

        /* Fact Grid */
        .fact-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin: 2rem 0;
          padding: 1.25rem 0;
          border-top: 2px solid var(--newspaper-border);
          border-bottom: 1px solid var(--newspaper-border);
        }

        .fact-label {
          display: block;
          margin-bottom: 0.25rem;
          color: var(--newspaper-muted);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .fact-value {
          font-family: var(--font-serif-body);
          font-size: 1.02rem;
          font-weight: 600;
          line-height: 1.35;
          color: var(--newspaper-ink);
        }

        .source-box {
          margin-top: 1.8rem;
          padding: 1.2rem 1.4rem;
          border: 1px solid var(--newspaper-border);
          background: var(--newspaper-white);
          font-size: 0.88rem;
          line-height: 1.6;
          color: #333;
        }

        .source-link {
          display: inline-block;
          font-weight: 700;
          color: var(--newspaper-ink);
          text-decoration: underline;
          text-underline-offset: 3px;
          margin-bottom: 0.3rem;
        }

        .source-link:hover {
          color: var(--newspaper-accent);
        }

        /* =================== NEWSPAPER INDEX VIEW =================== */
        .frontpage-lead-article {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
          gap: 2.8rem;
          align-items: stretch;
          padding-bottom: 1.5rem;
        }

        .frontpage-lead-article.no-image {
          grid-template-columns: minmax(0, 1fr);
        }

        .lead-text-trail {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        .lead-kicker {
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--newspaper-ink);
        }

        .lead-headline {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(1.8rem, 3.6vw, 2.65rem);
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: var(--newspaper-ink);
          transition: color 0.15s ease;
        }

        .lead-headline:hover {
          color: var(--newspaper-accent);
        }

        .lead-excerpt {
          font-family: var(--font-serif-body);
          font-size: 1.12rem;
          line-height: 1.65;
          color: var(--newspaper-body);
          margin: 0;
        }

        .lead-image-trail {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .lead-image-link {
          display: flex;
          flex: 1 1 auto;
        }

        /* The frame takes the full height of the lead row, so the image
           runs down to the divider; the img is absolute so its intrinsic
           size never stretches the row. */
        .lead-image-frame {
          position: relative;
          flex: 1 1 auto;
          width: 100%;
          min-height: 280px;
          overflow: hidden;
          border: 1px solid var(--newspaper-border);
          opacity: 0;
          transition: opacity 0.25s ease;
        }

        .lead-image-frame.is-loaded {
          opacity: 1;
        }

        .lead-image {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .frontpage-image-caption {
          margin-top: 0.45rem;
          margin-bottom: 0;
          font-family: var(--font-serif-body);
          font-size: 0.82rem;
          font-style: italic;
          color: var(--newspaper-muted);
          border-bottom: 1px solid var(--newspaper-rule-light);
          padding-bottom: 0.4rem;
        }

        /* Front Page Columns Grid */
        .news-list {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2.2rem;
        }

        .news-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding-right: 1.25rem;
          border-right: 1px solid var(--newspaper-rule-light);
          background: #fff;
          border-radius: 0;
        }

        .news-card:nth-child(3n) {
          border-right: none;
          padding-right: 0;
        }

        .news-card-main {
          display: block;
        }

        .news-card h2 {
          margin: 0 0 0.55rem;
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 700;
          line-height: 1.25;
          color: var(--newspaper-ink);
          transition: color 0.15s ease;
        }

        .news-card h2:hover {
          color: var(--newspaper-accent);
        }

        .news-card p {
          margin: 0 0 0.8rem;
          font-family: var(--font-serif-body);
          font-size: 0.96rem;
          line-height: 1.55;
          color: var(--newspaper-body);
        }

        .news-card .dateline {
          margin-bottom: 0.6rem;
        }

        .news-card-image-wrap {
          height: 0;
          overflow: hidden;
          margin: 0;
          opacity: 0;
          transition: opacity 0.25s ease;
        }

        .news-card-image-wrap.is-loaded {
          height: 180px;
          margin: 0.75rem 0 0.65rem;
          opacity: 1;
        }

        .news-card-image {
          display: block;
          width: 100%;
          height: 180px;
          object-fit: cover;
          border: 1px solid var(--newspaper-border);
        }

        .news-card-source {
          margin-top: 0.6rem;
          color: var(--newspaper-muted);
          font-size: 0.75rem;
          line-height: 1.35;
        }

        .news-card-source-link {
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .news-card-source-link:hover {
          color: var(--newspaper-accent);
        }

        /* =================== STATES & SKELETONS =================== */
        .state {
          padding: 3.5rem 1.5rem;
          text-align: center;
          border: 2px solid var(--newspaper-border);
          background: var(--newspaper-white);
          color: var(--newspaper-muted);
          line-height: 1.5;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.65rem;
          margin: 2rem 0;
        }

        .state-icon-wrap {
          width: 48px;
          height: 48px;
          border: 1px solid var(--newspaper-border);
          color: var(--newspaper-ink);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.3rem;
        }

        .state-title {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--newspaper-ink);
        }

        .state-desc {
          font-family: var(--font-serif-body);
          font-size: 0.98rem;
          color: var(--newspaper-muted);
          max-width: 460px;
          margin: 0;
          line-height: 1.6;
        }

        .state-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--newspaper-ink);
          border: 1px solid var(--newspaper-border);
          padding: 0.3rem 0.8rem;
          margin-top: 0.65rem;
        }

        .state-dot {
          width: 6px;
          height: 6px;
          background: #111;
        }

        .newspaper-skeleton-box {
          border: 1px solid var(--newspaper-rule-light);
          padding: 1.5rem;
          background: #fafafa;
        }

        .newspaper-skeleton-line {
          height: 14px;
          background: linear-gradient(
            90deg,
            #eaeaea 0%,
            #dfdfdf 50%,
            #eaeaea 100%
          );
          background-size: 200% 100%;
          animation: newspaperShimmer 1.5s ease-in-out infinite;
        }

        @keyframes newspaperShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        /* =================== RESPONSIVE DESIGN =================== */
        @media (max-width: 900px) {
          .news-list {
            grid-template-columns: repeat(2, 1fr);
            gap: 1.8rem;
          }
          .news-card:nth-child(3n) {
            border-right: 1px solid var(--newspaper-rule-light);
            padding-right: 1.25rem;
          }
          .news-card:nth-child(2n) {
            border-right: none;
            padding-right: 0;
          }
          .frontpage-lead-article {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
          .article-columns {
            grid-template-columns: minmax(0, 1fr);
          }
          .article-col:first-child,
          .article-col + .article-col {
            padding: 0;
            border-left: 0;
          }
          .article-col + .article-col {
            margin-top: 1.6rem;
          }
          .lead-image-frame {
            flex: none;
            min-height: 0;
            aspect-ratio: 16 / 10;
          }
        }

        @media (max-width: 768px) {
          .newspaper-masthead-container {
            padding: 1rem 1rem 0;
          }
          .masthead-topbar {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.4rem;
          }
          .masthead-date-nav {
            width: 100%;
            justify-content: space-between;
          }
          .newspaper-main {
            padding: 1.5rem 1rem 3.5rem;
          }
          .news-list {
            grid-template-columns: 1fr;
            gap: 1.6rem;
          }
          .news-card {
            border-right: none;
            border-bottom: 1px solid var(--newspaper-rule-light);
            padding-right: 0;
            padding-bottom: 1.5rem;
          }
          .fact-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
        }
      `}</style>
    </>
  );
}

PropertyNewsPage.getLayout = (page: React.ReactElement) => page;
