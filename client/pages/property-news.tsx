import React, { useEffect, useState, useCallback, useRef } from 'react';
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

interface StatusResult {
  label: string;
  className: string;
}

interface ArticleImageItem {
  url: string;
  caption?: string;
  credit?: string;
}

function uniqueLocations(news: PropertyNewsItem): string[] {
  const values = ([] as string[]).concat(news.counties || [], news.towns || []).filter(Boolean);
  return values.filter((value, index) => {
    return (
      values.findIndex(
        (other) => String(other).toLowerCase() === String(value).toLowerCase()
      ) === index
    );
  });
}

function detailedLocation(news: PropertyNewsItem): string {
  return uniqueLocations(news).join(' · ') || 'Kenya';
}

function cardLocation(news: PropertyNewsItem): string {
  if (news.location_summary) return news.location_summary;
  const values = uniqueLocations(news);
  if (values.length > 5) return 'National · Kenya';
  return values.join(' · ') || 'Kenya';
}

function formatDate(value?: string): string {
  if (!value) return 'Publication date unavailable';
  const valueDate = new Date(value);
  return Number.isNaN(valueDate.getTime())
    ? 'Publication date unavailable'
    : valueDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
}

function formatMastheadDate(value?: string): string {
  const dateObj = value ? new Date(value) : new Date();
  const valid = !Number.isNaN(dateObj.getTime()) ? dateObj : new Date();
  return valid.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getRegulatoryStatus(news: PropertyNewsItem): StatusResult | null {
  const value = String(news.regulatory_status || '').toLowerCase();
  const labels: Record<string, string> = {
    proposed: 'PROPOSED',
    under_consideration: 'UNDER REVIEW',
    public_participation: 'PUBLIC INPUT',
    approved: 'APPROVED',
    enacted: 'ENACTED',
    effective: 'EFFECTIVE',
    suspended: 'SUSPENDED',
    rejected: 'REJECTED',
    amended: 'AMENDED',
    reported: 'UPDATE',
  };
  if (labels[value]) {
    return { label: labels[value], className: value };
  }
  if (news.category === 'market') {
    return { label: 'MARKET UPDATE', className: 'market' };
  }
  return null;
}

function safeSourceUrl(value?: string): string {
  return /^https?:\/\//i.test(String(value || '')) ? String(value) : '';
}

function extractImages(item: PropertyNewsItem): ArticleImageItem[] {
  const list: ArticleImageItem[] = [];
  const seen = new Set<string>();

  const add = (url?: string, caption?: string, credit?: string) => {
    if (!url || typeof url !== 'string' || !url.trim()) return;
    const cleanUrl = url.trim();
    if (seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    list.push({
      url: cleanUrl,
      caption: caption || item.caption,
      credit: credit || item.credit || (item.source?.name ? item.source.name : undefined),
    });
  };

  if (Array.isArray(item.images)) {
    for (const img of item.images) {
      if (typeof img === 'string') {
        add(img);
      } else if (img && typeof img === 'object' && (img as any).url) {
        add((img as any).url, (img as any).caption, (img as any).credit);
      }
    }
  }

  if (Array.isArray(item.image_urls)) {
    for (const url of item.image_urls) {
      add(url);
    }
  }

  if (item.image_url) {
    add(item.image_url);
  }

  return list;
}

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

  // Stage 1: Permanently enforce light theme on Property News regardless of global dark-mode.
  // Runs on mount to prevent any flash of dark styling. On unmount, restores
  // the user's saved preference so navigating away applies dark mode correctly.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.colorScheme = 'light';

    return () => {
      try {
        const savedTheme = localStorage.getItem('varoom_theme') || 'system';
        const resolvedTheme = savedTheme === 'system'
          ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : savedTheme;
        if (resolvedTheme !== 'light') {
          document.documentElement.setAttribute('data-theme', resolvedTheme);
          document.documentElement.style.colorScheme = resolvedTheme;
        }
      } catch { /* silently ignore */ }
    };
  }, []);

  // Determine user dashboard link without altering layout
  useEffect(() => {
    try {
      const cached = localStorage.getItem('varoom_cached_profile');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.role === 'client') {
          setDashboardHref('/client-home');
          return;
        }
      }
      const lastRole = localStorage.getItem('varoom_last_role') || localStorage.getItem('varoom_user_role');
      if (lastRole === 'client') {
        setDashboardHref('/client-home');
      } else {
        setDashboardHref('/host-home');
      }
    } catch {
      setDashboardHref('/host-home');
    }
  }, []);

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
      const response = await fetch('/api/news?limit=50', {
        headers: { Accept: 'application/json' },
        signal,
        cache: force ? 'no-store' : 'default',
      });
      if (!response.ok) {
        throw new Error(`Failed to load property news: ${response.status}`);
      }
      const data: PropertyNewsItem[] = await response.json();
      if (!signal?.aborted) {
        const validItems = Array.isArray(data) ? data : [];
        setNewsItems(validItems);
        setCachedNewsList(validItems);
        setListLoading(false);
        setListError(false);
      }
    } catch (err: any) {
      if (signal?.aborted) return;
      console.warn('Property news fetch notice:', err?.message || err);
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
      const response = await fetch(`/api/news/${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to load news article: ${response.status}`);
      }
      const fullItem: PropertyNewsItem = await response.json();
      if (!signal?.aborted) {
        setDetailItem(fullItem);
        setCachedArticle(id, fullItem);
        setDetailLoading(false);
      }
    } catch (err: any) {
      if (signal?.aborted) return;
      console.warn('Property news article detail notice:', err?.message || err);
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
  const candidateImages = detailItem ? extractImages(detailItem) : [];
  const activeImages = candidateImages.filter((img) => !failedImageUrls[img.url]);
  const hasVideo = Boolean(detailItem?.video_url);
  const hasMedia = activeImages.length > 0 || hasVideo;

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
            <div className="masthead-edition">
              <span>Original Country News Edition</span>
              <span className="edition-sep">·</span>
              <span>Nairobi, Kenya</span>
            </div>
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
            <div className="masthead-sub-identity">
              <span className="masthead-badge-va">Va</span>
              <span className="masthead-badge-room">Room</span>
              <span className="masthead-subtitle">Property Gazette · Official Kenyan Real Estate & Regulatory Intelligence</span>
            </div>
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
                      {(() => {
                        const statusObj = getRegulatoryStatus(detailItem);
                        return statusObj ? (
                          <span className={`status ${statusObj.className}`}>{statusObj.label}</span>
                        ) : null;
                      })()}
                    </div>

                    <h1 className="article-headline">{detailItem.title}</h1>

                    <div className="article-meta meta">
                      <span className="meta-location">{detailedLocation(detailItem).toUpperCase()}</span>
                      <span className="meta-bullet">•</span>
                      <span className="meta-date">
                        {formatDate(detailItem.source?.published_at || detailItem.published_at).toUpperCase()}
                      </span>
                      {detailItem.source?.name && (
                        <>
                          <span className="meta-bullet">•</span>
                          <span className="meta-source">VIA {detailItem.source.name.toUpperCase()}</span>
                        </>
                      )}
                    </div>
                  </header>

                  <div className="editorial-divider" />

                  {/* TWO-COLUMN EDITORIAL ARTICLE BODY */}
                  <div className={`editorial-columns ${hasMedia ? 'has-media' : 'no-media'}`}>
                    {/* Left Column — Text trail */}
                    <div className="text-trail">
                      {(() => {
                        const bodyText = (detailItem.body || '').trim();
                        const summaryText = (detailItem.summary || '').trim();

                        // If full body is actively loading while preview is shown
                        if (detailLoading && !bodyText) {
                          return (
                            <div className="detail-content-area">
                              {summaryText && <p className="detail-summary">{summaryText}</p>}
                              <div className="detail-body-loading">
                                <div className="newspaper-skeleton-line" style={{ width: '100%', marginBottom: '14px' }}></div>
                                <div className="newspaper-skeleton-line" style={{ width: '94%', marginBottom: '14px' }}></div>
                                <div className="newspaper-skeleton-line" style={{ width: '97%', marginBottom: '14px' }}></div>
                                <div className="newspaper-skeleton-line" style={{ width: '82%', marginBottom: '14px' }}></div>
                              </div>
                            </div>
                          );
                        }

                        // When full article body is available
                        if (bodyText) {
                          const paragraphs = bodyText
                            .split(/\n+/)
                            .map((p) => p.trim())
                            .filter(Boolean);

                          // Avoid repeating exact summary if body begins with the same text
                          const cleanSummaryPrefix = summaryText.replace(/[\.\s]+$/, '').slice(0, 50).toLowerCase();
                          const firstParaPrefix = (paragraphs[0] || '').slice(0, 50).toLowerCase();
                          const bodyStartsWithSummary = cleanSummaryPrefix && (
                            firstParaPrefix.startsWith(cleanSummaryPrefix) ||
                            cleanSummaryPrefix.startsWith(firstParaPrefix)
                          );

                          // If summary is distinct from body, display as editorial lead summary
                          const showDistinctSummary = summaryText && !bodyStartsWithSummary;

                          return (
                            <div className="detail-content-area">
                              {showDistinctSummary && (
                                <p className="detail-summary">{summaryText}</p>
                              )}
                              <div className="detail-body">
                                {paragraphs.map((paragraph, idx) => {
                                  const isSubhead = paragraph.startsWith('# ') || paragraph.startsWith('## ') || paragraph.startsWith('### ');
                                  const isQuote =
                                    (paragraph.startsWith('"') && paragraph.endsWith('"')) ||
                                    (paragraph.startsWith('“') && paragraph.endsWith('”')) ||
                                    (paragraph.startsWith("'") && paragraph.endsWith("'")) ||
                                    paragraph.startsWith('> ');

                                  if (isSubhead) {
                                    const clean = paragraph.replace(/^#+\s*/, '');
                                    return (
                                      <h2 key={idx} className="editorial-subhead">
                                        {clean}
                                      </h2>
                                    );
                                  }

                                  if (isQuote) {
                                    const clean = paragraph.replace(/^>\s*/, '');
                                    return (
                                      <blockquote key={idx} className="editorial-pullquote">
                                        <p>{clean}</p>
                                      </blockquote>
                                    );
                                  }

                                  return (
                                    <p
                                      key={idx}
                                      className={idx === 0 && !showDistinctSummary ? 'detail-lead' : 'detail-p'}
                                    >
                                      {paragraph}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        // Fallback when source genuinely provides only a summary excerpt
                        return (
                          <div className="detail-content-area">
                            <p className="detail-summary">
                              {summaryText || 'Read the full update at the source below.'}
                            </p>
                            <div className="detail-notice">
                              Full report not syndicated. Please refer to the official publication source below.
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Right Column — Image trail (conditional) */}
                    {hasMedia && (
                      <aside className="image-trail" aria-label="Article Media">
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
                  </div>

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
              <header className="index-newspaper-header">
                <p className="eyebrow">Property Intelligence</p>
                <h1>Property News on VaRoom</h1>
                <p className="intro">
                  Relevant Kenyan property updates, presented with their source and regulatory status.
                </p>
              </header>

              <div className="editorial-divider" />

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
                    const leadStatus = getRegulatoryStatus(lead);
                    const leadSourceUrl = safeSourceUrl(leadSource.url);

                    return (
                      <article className="frontpage-lead-article">
                        <div className="lead-text-trail">
                          <span className="lead-kicker">FRONT PAGE DISPATCH</span>
                          <Link
                            className="lead-headline-link"
                            href={`/property-news?id=${encodeURIComponent(lead.id)}`}
                            onClick={handleArticleClick}
                          >
                            <h2 className="lead-headline">{lead.title}</h2>
                          </Link>
                          <p className="lead-excerpt">
                            {lead.summary || 'Read the lead Kenyan property and regulatory update on VaRoom.'}
                          </p>
                          <div className="meta">
                            <span>{cardLocation(lead).toUpperCase()}</span>
                            <span>•</span>
                            <span>{formatDate(leadSource.published_at || lead.published_at)}</span>
                          </div>
                          {leadStatus && (
                            <span className={`status ${leadStatus.className}`}>
                              {leadStatus.label}
                            </span>
                          )}
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

                        {lead.image_url && (
                          <div className="lead-image-trail">
                            <Link
                              href={`/property-news?id=${encodeURIComponent(lead.id)}`}
                              onClick={handleArticleClick}
                              className="lead-image-link"
                            >
                              <NewsCardImage src={lead.image_url} />
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
                      const statusObj = getRegulatoryStatus(news);

                      return (
                        <article className="news-card" key={news.id}>
                          <Link
                            className="news-card-main"
                            href={`/property-news?id=${encodeURIComponent(news.id)}`}
                            onClick={handleArticleClick}
                          >
                            <h2>{news.title}</h2>
                            <p>
                              {news.summary || 'Read the latest property update from VaRoom.'}
                            </p>
                            <div className="meta">
                              <span>{cardLocation(news)}</span>
                              <span>•</span>
                              <span>
                                {formatDate(source.published_at || news.published_at)}
                              </span>
                            </div>
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

                          {statusObj && (
                            <span className={`status ${statusObj.className}`}>
                              {statusObj.label}
                            </span>
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
        html[data-theme="dark"] .index-newspaper-header,
        html[data-theme="dark"] .article-header,
        html[data-theme="dark"] .text-trail,
        html[data-theme="dark"] .image-trail,
        html[data-theme="dark"] .editorial-columns,
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
        html[data-theme="dark"] .masthead-edition,
        html[data-theme="dark"] .masthead-date-nav,
        html[data-theme="dark"] .detail-image-caption,
        html[data-theme="dark"] .caption-text,
        html[data-theme="dark"] .caption-credit,
        html[data-theme="dark"] .article-meta,
        html[data-theme="dark"] .eyebrow,
        html[data-theme="dark"] .meta {
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

        .masthead-edition {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .edition-sep {
          color: #999;
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

        .masthead-sub-identity {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          margin-top: 0.6rem;
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--newspaper-muted);
        }

        .masthead-badge-va {
          color: var(--newspaper-accent);
          font-weight: 900;
        }

        .masthead-badge-room {
          color: var(--newspaper-ink);
          font-weight: 900;
        }

        .masthead-subtitle {
          margin-left: 0.4rem;
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

        .article-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.84rem;
          font-weight: 600;
          color: var(--newspaper-muted);
          letter-spacing: 0.05em;
        }

        .meta-bullet {
          color: #999;
        }

        /* TWO-COLUMN EDITORIAL ARTICLE BODY */
        .editorial-columns {
          margin-bottom: 2.5rem;
        }

        .editorial-columns.has-media {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
          gap: 3rem;
          align-items: start;
        }

        .editorial-columns.no-media {
          display: block;
          max-width: 780px;
          margin: 0;
        }

        .text-trail {
          min-width: 0;
        }

        .detail-summary {
          font-family: var(--font-serif-body);
          font-size: 1.25rem;
          line-height: 1.65;
          font-weight: 600;
          font-style: italic;
          color: var(--newspaper-ink);
          margin: 0 0 1.6rem;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--newspaper-rule-light);
        }

        .detail-body {
          font-family: var(--font-serif-body);
          font-size: 1.1rem;
          line-height: 1.8;
          color: var(--newspaper-body);
        }

        .detail-lead {
          font-size: 1.2rem;
          line-height: 1.75;
          font-weight: 600;
          color: var(--newspaper-ink);
          margin: 0 0 1.4rem;
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
          margin: 0 0 1.35rem;
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
          margin: 2.2rem 0 0.85rem;
        }

        .editorial-pullquote {
          margin: 1.8rem 0;
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

        /* Image Trail */
        .image-trail {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          min-width: 0;
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
          max-height: 520px;
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

        /* Regulatory Status Tag */
        .status {
          display: inline-flex;
          align-items: center;
          padding: 0.2rem 0.6rem;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid var(--newspaper-border);
          background: #fff;
          color: var(--newspaper-ink);
          border-radius: 0;
        }

        .status.approved,
        .status.effective {
          border-color: #111;
          background: #f4f4f4;
          color: #111;
        }

        .status.market {
          border-color: #111;
          background: #fff;
          color: #111;
        }

        /* =================== NEWSPAPER INDEX VIEW =================== */
        .index-newspaper-header {
          padding-bottom: 0.5rem;
        }

        .index-newspaper-header h1 {
          margin: 0.35rem 0 0.65rem;
          font-family: var(--font-display);
          font-size: clamp(2rem, 4.5vw, 2.85rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--newspaper-ink);
        }

        .intro {
          max-width: 680px;
          margin: 0;
          color: var(--newspaper-muted);
          font-size: 1rem;
          line-height: 1.55;
          font-family: var(--font-serif-body);
        }

        .frontpage-lead-article {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
          gap: 2.8rem;
          align-items: start;
          padding-bottom: 1.5rem;
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
          min-width: 0;
        }

        .lead-image-link {
          display: block;
        }

        .frontpage-image-caption {
          margin-top: 0.45rem;
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

        .news-card .meta {
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
          .editorial-columns.has-media {
            display: flex;
            flex-direction: column;
            gap: 2rem;
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
