import React from 'react';
import Link from 'next/link';
import HostListingMenu from '../listings/HostListingMenu';
import { GLANCE_META, glanceSub, glanceTiles, newsDate, newsSource, updatePhotos, type GlanceListing, type NewsItem, type VaroomUpdate } from '../../lib/hostHome/hostHome';
import { ICONS, Svg } from './hostHomeIcons';
import { PHOTO_WIDTH, type PhotoWidth } from '../resolveStoredPhotoUrl';

// Host home's right rail (and the blocks the phone feed repeats), markup
// unchanged from legacy-pages/host-home.html. Each block is null while
// loading, 'error' when it failed, or its data.

export type Loadable<T> = T | null | 'error';

const Loader = ({ label }: { label: string }) => (
  <div className="home-widget-loader" role="status" aria-label={label}><span className="home-widget-spinner" aria-hidden="true" /></div>
);

export function PropertyNewsList({ news, idSuffix = '' }: { news: Loadable<NewsItem[]>; idSuffix?: string }) {
  const hasNews = Array.isArray(news) && news.length > 0;
  return (
    <div className="property-news-list" id={`property-news${idSuffix}-list`} aria-live="polite" data-loading={news === null ? 'true' : 'false'}>
      {news === null ? <Loader label="Loading Property News" />
        : hasNews ? (news as NewsItem[]).slice(0, 5).map((item) => (
          <article className="property-news-item" key={item.id}>
            <Link className="property-news-detail-link" href={`/property-news?id=${encodeURIComponent(String(item.id))}`}>
              <div className="property-news-title">{item.title || 'Property update'}</div>
              <div className="property-news-meta"><span>{newsSource(item) || 'VaRoom'}</span><span>•</span><span>{newsDate(item.published_at || (item.source && item.source.published_at))}</span></div>
            </Link>
          </article>
        ))
        : <p className="home-widget-message">{news === 'error' ? 'Property News could not be loaded.' : 'No Property News is available right now.'}</p>}
    </div>
  );
}

/** Property News' Refresh link (as on Client Home); the list shows its spinner while it reloads. */
export function NewsRefreshButton({ onRefresh, busy }: { onRefresh?: () => void; busy?: boolean }) {
  if (!onRefresh) return null;
  return <button type="button" className="property-news-refresh" onClick={onRefresh} disabled={busy} aria-busy={busy || undefined}>Refresh</button>;
}

export function VaroomUpdatesContent({ updates, id }: { updates: Loadable<VaroomUpdate[]>; id: string }) {
  return (
    <div id={id} className="home-widget-content" data-loading={updates === null ? 'true' : 'false'}>
      {updates === null ? <Loader label="Loading VaRoom Updates" />
        : updates === 'error' || updates.length === 0 ? <p className="home-widget-message">{updates === 'error' ? 'VaRoom Updates could not be loaded.' : 'No updates yet.'}</p>
        : updates.map((update) => {
          const photos = updatePhotos(update);
          return (
            <div className="update-card" key={update.id}>
              {photos.length > 0 && <div className="update-photos">{photos.map((url, index) => <img key={index} src={url} alt="" className="update-img" />)}</div>}
              {/* Shown as text, as on Client Home (it was inserted as HTML). */}
              <div className="update-body">{update.body}</div>
            </div>
          );
        })}
    </div>
  );
}

interface RailProps {
  listings: Loadable<GlanceListing[]>;
  photoUrl: (storagePath: string, width?: PhotoWidth) => string | null;
  news: Loadable<NewsItem[]>;
  onRefreshNews?: () => void;
  newsRefreshing?: boolean;
  updates: Loadable<VaroomUpdate[]>;
  notify: (message: string) => void;
  onStatus: (id: string, status: string) => void;
  onDeleted: (id: string) => void;
  onViewAll: () => void;
}

export default function HostRail({ listings, photoUrl, news, onRefreshNews, newsRefreshing, updates, notify, onStatus, onDeleted, onViewAll }: RailProps) {
  const none = Array.isArray(listings) && listings.length === 0;
  const { tiles, showAdd } = Array.isArray(listings) ? glanceTiles(listings) : { tiles: [], showAdd: false };
  return (
    <aside className="host-rail">
      <div className="sidebar-module empty-state-card" id="no-listings-card" style={{ display: none ? 'block' : 'none' }}>
        <div className="empty-icon"><Svg markup={ICONS.emptyHome} /></div>
        <h3>You haven&apos;t listed a space yet</h3>
        <p>List your first Airbnb, hotel, venue, office, shop, or property to start getting inquiries.</p>
        <Link href="/list" className="list-btn-primary"><Svg markup={ICONS.plus16} />List a space</Link>
      </div>

      <div className="sidebar-module listings-glance-card" id="listings-glance-card" style={{ display: none ? 'none' : 'block' }}>
        <div className="stats-head">
          <h2>Your listings at a glance</h2>
          <a href="#" id="glance-view-all" onClick={(event) => { event.preventDefault(); if (tiles.length) onViewAll(); }}>View all</a>
        </div>
        <div className="listings-glance-grid" id="listings-glance-grid" data-loading={listings === null ? 'true' : 'false'}>
          {listings === null ? <Loader label="Loading your listings" />
            : listings === 'error' ? <p className="home-widget-message">Your listings could not be loaded.</p>
            : (
              <>
                {tiles.map((listing) => {
                  const meta = GLANCE_META[listing.category || ''] || { icon: 'home' as const };
                  const photo = (listing.listing_photos || [])[0];
                  const thumb = photo && photo.storage_path ? photoUrl(photo.storage_path, PHOTO_WIDTH.thumb) : null;
                  const icon = meta.icon === 'building' ? ICONS.glanceBuilding : meta.icon === 'store' ? ICONS.glanceStore : ICONS.glanceHome;
                  return (
                    <div className="glance-tile" data-listing-card={listing.id} style={{ position: 'relative' }} key={listing.id}>
                      <HostListingMenu listing={{ id: listing.id, title: listing.title, availability_status: listing.availability_status }} notify={notify} onStatus={onStatus} onDeleted={onDeleted} />
                      <div className="glance-thumb">{thumb ? <img src={thumb} alt="" /> : <Svg markup={icon} />}</div>
                      <div className="glance-body">
                        <div className="glance-title">{listing.title}</div>
                        <div className="glance-sub">{glanceSub(listing)}</div>
                      </div>
                    </div>
                  );
                })}
                {showAdd && <Link href="/list" className="glance-tile add-tile"><Svg markup={ICONS.addTile} />Add listing</Link>}
              </>
            )}
        </div>
      </div>

      <section className="sidebar-module property-news-card" id="property-news-card" aria-labelledby="property-news-title">
        <div className="stats-head"><h2 id="property-news-title">Your Property News on VaRoom</h2><NewsRefreshButton onRefresh={onRefreshNews} busy={newsRefreshing} /></div>
        <PropertyNewsList news={news} />
        <Link className="property-news-view-all" href="/property-news">View all news →</Link>
      </section>

      <div className="sidebar-module varoom-updates-card">
        <div className="stats-head"><h2>VaRoom Updates</h2></div>
        <VaroomUpdatesContent updates={updates} id="varoom-updates" />
      </div>

      <footer className="rail-footer" aria-label="Sidebar footer">
        <div className="rail-social-row" aria-label="Social media">
          <a href="https://www.instagram.com/varoom.co.ke?vrfl=ZmJzbGVkM3AwOWNu" target="_blank" rel="noopener noreferrer" className="rail-social-link" aria-label="Instagram"><Svg markup={ICONS.instagram} /></a>
          <a href="https://www.tiktok.com/@varoom.co.ke?_r=1&_t=ZS-9AeSyJKRgM3" target="_blank" rel="noopener noreferrer" className="rail-social-link" aria-label="TikTok"><Svg markup={ICONS.tiktok} /></a>
          <a href="#" onClick={(event) => event.preventDefault()} target="_blank" rel="noopener noreferrer" className="rail-social-link" aria-label="X (formerly Twitter)"><Svg markup={ICONS.x} /></a>
          <a href="#" onClick={(event) => event.preventDefault()} target="_blank" rel="noopener noreferrer" className="rail-social-link" aria-label="Facebook"><Svg markup={ICONS.facebook} /></a>
        </div>
        <div className="rail-legal-links">
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="rail-legal-link">Privacy Policy</a>
          <span className="rail-legal-divider" aria-hidden="true">|</span>
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="rail-legal-link">Terms &amp; Conditions</a>
        </div>
      </footer>
    </aside>
  );
}
