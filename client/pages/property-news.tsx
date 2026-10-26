import React, { useEffect, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  PropertyNewsItem,
  getCachedNewsList,
  setCachedNewsList,
  getCachedArticle,
  setCachedArticle,
  saveScrollPosition,
  getScrollPosition,
} from '../lib/propertyNewsCache';

interface StatusResult {
  label: string;
  className: string;
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

function DetailImage({ src }: { src?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed || !src || !src.trim()) return null;

  return (
    <div className={`detail-image-wrap ${loaded ? 'is-loaded' : ''}`}>
      <img
        className="detail-image"
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

  const scrollRestoredRef = useRef(false);

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
  const loadIndexNews = useCallback(async (signal?: AbortSignal) => {
    const cached = getCachedNewsList();
    if (cached && cached.items.length > 0) {
      setNewsItems(cached.items);
      setListLoading(false);
      if (cached.isFresh) {
        return;
      }
    }

    try {
      const response = await fetch('/api/news?limit=50', {
        headers: { Accept: 'application/json' },
        signal,
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
      if (!cached || !cached.items || cached.items.length === 0) {
        setListError(true);
      }
      setListLoading(false);
    }
  }, []);

  // Fetch or restore article detail
  const loadDetail = useCallback(async (id: string, signal?: AbortSignal) => {
    const cachedArticle = getCachedArticle(id);
    if (cachedArticle) {
      setDetailItem(cachedArticle);
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    setDetailError(false);

    try {
      const response = await fetch(`/api/news/${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to load news article: ${response.status}`);
      }
      const item: PropertyNewsItem = await response.json();
      if (!signal?.aborted) {
        setDetailItem(item);
        setCachedArticle(id, item);
        setDetailLoading(false);
      }
    } catch (err: any) {
      if (signal?.aborted) return;
      console.warn('Property news article detail notice:', err?.message || err);
      setDetailError(true);
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

  const pageTitle = detailItem && articleId
    ? `${detailItem.title} — Property News on VaRoom`
    : 'Property News on VaRoom';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="property-news-root">
        <header className="topbar">
          <Link href={dashboardHref} className="brand" aria-label="VaRoom dashboard">
            <span className="va">Va</span>
            <span className="room">Room</span>
          </Link>
          {articleId ? (
            <Link
              href="/property-news"
              className="back-link"
              onClick={() => {
                // Return to index view with preserved scroll
              }}
            >
              ← Back to all news
            </Link>
          ) : (
            <Link
              href={dashboardHref}
              className="back-link"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  saveScrollPosition(window.scrollY);
                }
              }}
            >
              ← Back to dashboard
            </Link>
          )}
        </header>

        <main>
          {articleId ? (
            /* =================== ARTICLE DETAIL VIEW =================== */
            <article className="detail" id="news-detail" aria-live="polite">
              {detailLoading ? (
                <div className="skeleton"></div>
              ) : detailError || !detailItem ? (
                <EmptyState />
              ) : (
                <div className="detail-card">
                  <p className="eyebrow">Property Intelligence</p>
                  <h1>{detailItem.title}</h1>
                  <div className="article-meta meta">
                    <span>{detailedLocation(detailItem)}</span>
                    <span>•</span>
                    <span>
                      {formatDate(detailItem.source?.published_at || detailItem.published_at)}
                    </span>
                  </div>

                  {detailItem.image_url && <DetailImage src={detailItem.image_url} />}

                  {(() => {
                    const statusObj = getRegulatoryStatus(detailItem);
                    return statusObj ? (
                      <span className={`status ${statusObj.className}`}>{statusObj.label}</span>
                    ) : null;
                  })()}

                  <p className="detail-summary">{detailItem.summary || ''}</p>

                  {detailItem.body && <div className="detail-body">{detailItem.body}</div>}

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
              <p className="eyebrow">Property Intelligence</p>
              <h1>Property News on VaRoom</h1>
              <p className="intro">
                Relevant Kenyan property updates, presented with their source and regulatory status.
              </p>

              <div className="news-list" id="news-list">
                {listLoading && !newsItems ? (
                  <>
                    <div className="skeleton"></div>
                    <div className="skeleton"></div>
                    <div className="skeleton"></div>
                  </>
                ) : listError || !newsItems || newsItems.length === 0 ? (
                  <EmptyState />
                ) : (
                  newsItems.map((news) => {
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
                  })
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      <style jsx global>{`
        :root {
          --red: #c41e3a;
          --red-deep: #8f1229;
          --white: #fff;
          --ink: #24211e;
          --paper: #f7f6f3;
          --muted: #5c584f;
          --font-display: 'Helvetica Neue', Arial, sans-serif;
          --font-body: 'Helvetica Neue', Arial, sans-serif;
          --font-brand: 'Fraunces', Georgia, serif;
        }
        .property-news-root {
          margin: 0;
          min-height: 100vh;
          font-family: var(--font-body);
          background: var(--paper);
          color: var(--ink);
        }
        .property-news-root a {
          color: inherit;
          text-decoration: none;
        }
        .property-news-root :focus-visible {
          outline: 3px solid var(--red-deep);
          outline-offset: 3px;
        }
        .topbar {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.15rem max(1.2rem, calc((100vw - 1040px) / 2));
          background: var(--white);
          border-bottom: 1px solid #e4e1da;
        }
        .brand {
          font-family: var(--font-display);
          font-size: 1.45rem;
          font-weight: 900;
        }
        .brand .va {
          color: var(--red);
        }
        .back-link {
          margin-left: auto;
          color: var(--red);
          font-size: 0.9rem;
          font-weight: 600;
        }
        .back-link:hover {
          color: var(--red-deep);
        }
        .property-news-root main {
          width: min(100%, 860px);
          margin: 0 auto;
          padding: 2.4rem 1.2rem 4rem;
        }
        .eyebrow {
          color: var(--red);
          font-size: 0.72rem;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          font-weight: 700;
          margin: 0 0 0.45rem;
        }
        h1 {
          margin: 0;
          font: 700 clamp(1.9rem, 4vw, 2.65rem) / 1.12 var(--font-display);
        }
        .intro {
          max-width: 640px;
          margin: 0.7rem 0 1.8rem;
          color: var(--muted);
          font-size: 0.96rem;
          line-height: 1.55;
        }
        .news-list {
          display: grid;
          gap: 1rem;
        }
        .news-card {
          display: block;
          padding: 1.25rem 1.35rem;
          background: var(--white);
          border: 1px solid #e4e1da;
          border-radius: 16px;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .news-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px -18px rgba(26, 18, 16, 0.46);
        }
        .news-card h2 {
          margin: 0;
          font: 700 1.25rem / 1.28 var(--font-display);
        }
        .news-card p {
          margin: 0.6rem 0 0.8rem;
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.42rem;
          color: var(--muted);
          font-size: 0.78rem;
        }
        .news-card-main {
          display: block;
        }
        .news-card-image-wrap {
          height: 0;
          overflow: hidden;
          margin: 0;
          border-radius: 12px;
          opacity: 0;
          transition: opacity 0.25s ease;
        }
        .news-card-image-wrap.is-loaded {
          height: 170px;
          margin: 0.85rem 0 0.65rem;
          opacity: 1;
        }
        .news-card-image {
          display: block;
          width: 100%;
          height: 170px;
          object-fit: cover;
        }
        .news-card-source {
          margin-top: 0.65rem;
          color: var(--muted);
          font-size: 0.74rem;
          line-height: 1.35;
        }
        .news-card-source-link {
          color: inherit;
          text-decoration: underline;
          text-decoration-color: rgba(196, 30, 58, 0.38);
          text-underline-offset: 2px;
        }
        .news-card-source-link:hover {
          color: var(--red-deep);
          text-decoration-color: currentColor;
        }
        .status {
          display: inline-flex;
          width: max-content;
          margin-top: 0.75rem;
          padding: 0.22rem 0.52rem;
          border-radius: 100px;
          background: #fbe4e7;
          color: var(--red-deep);
          font-size: 0.67rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .status.approved,
        .status.effective {
          background: #eaf4ee;
          color: #1e6b3c;
        }
        .status.market {
          background: #e9f0fb;
          color: #1a4e8f;
        }
        .detail {
          display: block;
        }
        .detail-card {
          background: var(--white);
          border: 1px solid #e4e1da;
          border-radius: 18px;
          padding: clamp(1.35rem, 4vw, 2.25rem);
        }
        .detail .article-meta {
          margin: 1rem 0 1.25rem;
        }
        .detail-summary {
          font-size: 1.05rem;
          line-height: 1.62;
          color: #3e302c;
          margin: 1.25rem 0;
        }
        .detail-body {
          color: #4b3d38;
          font-size: 0.94rem;
          line-height: 1.65;
          white-space: pre-line;
        }
        .fact-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          margin: 1.5rem 0;
          padding: 1rem 0;
          border-top: 1px solid #e4e1da;
          border-bottom: 1px solid #e4e1da;
        }
        .fact-label {
          display: block;
          margin-bottom: 0.16rem;
          color: var(--muted);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .fact-value {
          font-size: 0.86rem;
          line-height: 1.35;
        }
        .source-box {
          margin-top: 1.5rem;
          padding: 1rem 1.1rem;
          border-radius: 12px;
          background: var(--paper);
          font-size: 0.87rem;
          line-height: 1.5;
        }
        .detail-image-wrap {
          height: 0;
          overflow: hidden;
          margin: 0;
          border-radius: 14px;
          opacity: 0;
          transition: opacity 0.25s ease;
        }
        .detail-image-wrap.is-loaded {
          height: min(360px, 42vw);
          margin: 1.15rem 0 0;
          opacity: 1;
        }
        .detail-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .source-link {
          display: inline-flex;
          margin-top: 0.4rem;
          color: var(--red);
          font-weight: 600;
        }
        .source-link:hover {
          color: var(--red-deep);
        }
        .state {
          padding: 3rem 1.5rem;
          text-align: center;
          border-radius: 18px;
          background: var(--white);
          border: 1px solid #e4e1da;
          color: var(--muted);
          line-height: 1.5;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        .state-icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(196, 30, 58, 0.08);
          color: var(--red);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.3rem;
        }
        .state-title {
          font: 700 1.15rem / 1.3 var(--font-display);
          color: var(--ink);
        }
        .state-desc {
          font-size: 0.88rem;
          color: var(--muted);
          max-width: 440px;
          margin: 0;
          line-height: 1.5;
        }
        .state-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.74rem;
          font-weight: 600;
          color: #1e6b3c;
          background: #eaf4ee;
          padding: 0.28rem 0.75rem;
          border-radius: 100px;
          margin-top: 0.5rem;
        }
        .state-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #28a745;
          box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.25);
        }
        .state.error {
          color: var(--red-deep);
        }
        .skeleton {
          height: 148px;
          border-radius: 16px;
          background: linear-gradient(
            90deg,
            rgba(26, 18, 16, 0.05),
            #e4e1da,
            rgba(26, 18, 16, 0.05)
          );
          background-size: 200% 100%;
          animation: shimmer 1.35s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        @media (max-width: 600px) {
          .topbar {
            padding: 1rem;
          }
          .property-news-root main {
            padding: 1.8rem 1rem 3rem;
          }
          .fact-grid {
            grid-template-columns: 1fr;
          }
          .news-card {
            padding: 1.1rem;
          }
          .news-card-image-wrap.is-loaded {
            height: 150px;
          }
          .news-card-image {
            height: 150px;
          }
          .detail-image-wrap.is-loaded {
            height: 220px;
          }
        }
      `}</style>
    </>
  );
}

PropertyNewsPage.getLayout = (page: React.ReactElement) => page;

