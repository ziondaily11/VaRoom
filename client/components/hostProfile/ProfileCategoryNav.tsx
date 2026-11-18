import React, { useCallback, useEffect, useState } from 'react';
import { FolderCog } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loadProfileCategories, type ProfileCategory, type ProfileListing } from '../../lib/profile/hostProfile';
import { deleteCategory } from '../../lib/profile/profilePage';
import SegmentedTabs from '../ui/SegmentedTabs';
import { CategoryManager, CategoryManagerStyles, CategoryNameEditor, type ManagerState } from '../profile/CategoryManager';

// Tabs for a host's public pages (Spaces, the host's categories, Reviews)
// and, for the host, the same category manager as /profile. Categories come
// from the shared, cached host profile data.

export type ProfileTab = 'listings' | 'reviews';

export default function ProfileCategoryNav({ hostId, viewerId, listings, isOwner = false, value = null, activeTab = 'listings', onTabChange, onChange, onCategoryListings }: {
  hostId: string;
  viewerId: string | null;
  listings: ProfileListing[];
  isOwner?: boolean;
  value?: string | null;
  activeTab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
  onChange?: (categoryId: string | null) => void;
  onCategoryListings?: (map: Record<string, string[]>) => void;
}) {
  const [categories, setCategories] = useState<ProfileCategory[]>([]);
  const [error, setError] = useState('');
  const [manager, setManager] = useState<ManagerState>(null);
  const [renaming, setRenaming] = useState<ProfileCategory | null>(null);

  const refresh = useCallback(async (force = false) => {
    const client = getSupabaseClient();
    if (!client || !hostId) return;
    try {
      const rows = await loadProfileCategories(client, viewerId, hostId, force);
      setCategories(rows);
      onCategoryListings?.(Object.fromEntries(rows.map((row) => [row.id, row.listingIds])));
      setError('');
    } catch {
      setError('Categories are temporarily unavailable.');
    }
  }, [hostId, viewerId, onCategoryListings]);

  useEffect(() => {
    void refresh();
    // Loaded per host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, viewerId]);

  const removeCategory = async (category: ProfileCategory) => {
    if (!window.confirm(`Delete “${category.name}”? Its listings will remain on VaRoom.`)) return;
    const client = getSupabaseClient();
    if (!client) return;
    try { await deleteCategory(client, category.id); } catch { setError('Could not delete this category.'); return; }
    if (value === category.id) onChange?.(null);
    await refresh(true);
  };

  const listed = new Set(listings.map((listing) => listing.id));
  const activeKey = `${activeTab}:${value || ''}:${categories.map((category) => category.id).join(',')}`;

  return (
    <>
      <div className="profile-category-bar">
        <SegmentedTabs label="Profile listing categories" activeKey={activeKey}>
          <button type="button" role="tab" aria-selected={activeTab === 'listings' && !value} onClick={() => { onChange?.(null); onTabChange?.('listings'); }}>Spaces</button>
          {categories.map((category) => (
            <button key={category.id} type="button" role="tab" aria-selected={activeTab === 'listings' && value === category.id} onClick={() => { onChange?.(category.id); onTabChange?.('listings'); }}>
              {category.name}<span className="vr-seg-count">{category.listingIds.filter((id) => listed.has(id)).length}</span>
            </button>
          ))}
          <button type="button" role="tab" aria-selected={activeTab === 'reviews'} onClick={() => onTabChange?.('reviews')}>Reviews</button>
        </SegmentedTabs>
        {isOwner && <button type="button" className="profile-category-manage" onClick={() => setManager({ view: 'home' })}><FolderCog size={15} aria-hidden="true" /> Manage categories</button>}
      </div>
      {error && <p className="profile-category-error" role="alert">{error}</p>}
      <style jsx>{`
        .profile-category-bar { display:flex; align-items:center; gap:12px; padding:10px 0 12px; border-bottom:1px solid var(--host-profile-border,#242424); }
        .profile-category-manage { flex:0 0 auto; display:inline-flex; align-items:center; gap:7px; margin-left:auto; padding:7px 12px; border:0; border-radius:999px; background:transparent; color:#e5384f; font:inherit; font-size:0.8125rem; font-weight:600; cursor:pointer;
          transition:background-color var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out); }
        .profile-category-manage:active { transform:scale(var(--press-scale)); }
        .profile-category-manage:focus-visible { outline:2px solid #e5384f; outline-offset:2px; }
        @media (hover:hover) { .profile-category-manage:hover { background:var(--host-profile-fill,rgba(118,118,128,.24)); } }
        /* Phones: the owner's Manage button takes its own line, so the tabs keep the width. */
        @media (max-width: 760px) { .profile-category-bar { flex-wrap:wrap; gap:6px; } .profile-category-manage { margin-left:0; padding-left:4px; } }
        @media (prefers-reduced-motion: reduce) { .profile-category-manage { transition:none; } .profile-category-manage:active { transform:none; } }
        .profile-category-error { margin:8px 0 0; color:var(--host-profile-error,#ff98a6); font-size:0.8125rem; }
      `}</style>
      {isOwner && (
        <>
          <CategoryManagerStyles />
          <CategoryManager
            state={manager}
            setState={setManager}
            categories={categories}
            listings={listings}
            onSaved={async (categoryId) => { await refresh(true); onChange?.(categoryId); onTabChange?.('listings'); }}
            onRename={setRenaming}
            onDelete={(category) => { void removeCategory(category); }}
          />
          <CategoryNameEditor category={renaming} onClose={() => setRenaming(null)} onSaved={() => refresh(true)} />
        </>
      )}
    </>
  );
}
