import React, { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loadProfileCategories, type ProfileCategory, type ProfileListing } from '../../lib/profile/hostProfile';
import { categoryLimit as fetchCategoryLimit, CATEGORY_NAME_ERROR, cleanCategoryName, deleteCategory, renameCategory, saveCategory } from '../../lib/profile/profilePage';

// Tabs for a host's public pages (Spaces, the host's categories, Reviews)
// and, for the host, a simple category manager. Converted from
// legacy-pages/ProfileCategoryNav.jsx (same look and wording); categories
// come from the shared, cached host profile data.

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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draftListingIds, setDraftListingIds] = useState<string[]>([]);
  const [limit, setLimit] = useState<number | null>(null);

  const apply = (rows: ProfileCategory[]) => {
    setCategories(rows);
    onCategoryListings?.(Object.fromEntries(rows.map((row) => [row.id, row.listingIds])));
  };

  const refresh = async (force = false) => {
    const client = getSupabaseClient();
    if (!client || !hostId) return;
    try {
      apply(await loadProfileCategories(client, viewerId, hostId, force));
      setError('');
    } catch {
      setError('Categories are temporarily unavailable.');
    }
  };

  useEffect(() => {
    void refresh();
    // Loaded per host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, viewerId]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!open || !isOwner || !client) return;
    fetchCategoryLimit(client).then((value) => { if (Number.isInteger(value)) setLimit(value); }).catch(() => undefined);
  }, [open, isOwner]);

  const memberships = (id: string) => (categories.find((category) => category.id === id) || { listingIds: [] as string[] }).listingIds;

  const createCategory = async () => {
    const clean = cleanCategoryName(name);
    if (!clean) { setError(CATEGORY_NAME_ERROR); return; }
    if (!editing && limit !== null && categories.length >= limit) { setError(limit === 5 ? 'Premium hosts can create up to 5 categories.' : 'Your plan allows 1 category.'); return; }
    if (!editing && !draftListingIds.length) { setError('Select at least one listing before saving a category.'); return; }
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true);
    try {
      if (editing) await renameCategory(client, editing, clean);
      else await saveCategory(client, null, clean, draftListingIds);
    } catch (saveError) {
      setSaving(false);
      setError((saveError as Error).message === 'That category name already exists.' ? 'That category name already exists.' : 'Could not save this category.');
      return;
    }
    setSaving(false);
    setName('');
    setEditing(null);
    setDraftListingIds([]);
    await refresh(true);
  };

  const removeCategory = async (category: ProfileCategory) => {
    if (!window.confirm(`Delete “${category.name}”? Its listings will remain on VaRoom.`)) return;
    const client = getSupabaseClient();
    if (!client) return;
    try { await deleteCategory(client, category.id); } catch { setError('Could not delete this category.'); return; }
    if (value === category.id) onChange?.(null);
    await refresh(true);
  };

  const toggleListing = async (categoryId: string, listingId: string, checked: boolean) => {
    const next = new Set(memberships(categoryId));
    if (checked) next.add(listingId); else next.delete(listingId);
    if (!next.size) { setError('A category must contain at least one listing.'); return; }
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true);
    try {
      await saveCategory(client, categoryId, null, Array.from(next));
      apply(categories.map((category) => (category.id === categoryId ? { ...category, listingIds: Array.from(next) } : category)));
      void refresh(true);
    } catch {
      setError("Could not update this listing's category.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="profile-category-row" role="tablist" aria-label="Profile listing categories">
        <button type="button" role="tab" aria-selected={activeTab === 'listings' && !value} onClick={() => { onChange?.(null); onTabChange?.('listings'); }}>Spaces</button>
        {categories.map((category) => (
          <button key={category.id} type="button" role="tab" aria-selected={activeTab === 'listings' && value === category.id} onClick={() => { onChange?.(category.id); onTabChange?.('listings'); }}>
            {category.name}<span className="profile-category-count">{listings.filter((listing) => category.listingIds.includes(listing.id)).length}</span>
          </button>
        ))}
        <button type="button" role="tab" aria-selected={activeTab === 'reviews'} onClick={() => onTabChange?.('reviews')}>Reviews</button>
        {isOwner && <button type="button" className="profile-category-manage" onClick={() => { setError(''); setOpen(true); }}><Plus size={15} /> Manage categories</button>}
      </div>
      <style jsx>{`
        .profile-category-row { display:flex; align-items:center; gap:8px; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; white-space:nowrap; padding:0 4px; border-bottom:1px solid var(--host-profile-border,#242424); }
        .profile-category-row::-webkit-scrollbar { display:none; }
        .profile-category-row button { flex:0 0 auto; display:inline-flex; align-items:center; gap:7px; border:0; border-bottom:2px solid transparent; padding:13px 10px 11px; background:transparent; color:var(--host-profile-muted,#aaa); font:inherit; font-size:0.8125rem; font-weight:600; cursor:pointer; }
        .profile-category-row button[aria-selected="true"] { color:var(--host-profile-text,#fff); border-bottom-color:#e5384f; }
        .profile-category-row .profile-category-manage { margin-left:auto; color:#f0a0ab; }
        .profile-category-count { font-size:0.6875rem; opacity:.65; }
        .profile-category-row button:focus-visible { outline:2px solid #e5384f; outline-offset:-2px; }
        .profile-category-error { color:var(--host-profile-error,#ff98a6); font-size:0.8125rem; }
      `}</style>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="profile-categories-title" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section style={{ width: 'min(560px,100%)', maxHeight: '85vh', overflowY: 'auto', background: 'var(--host-profile-surface,#171717)', color: 'var(--host-profile-text,#f5f5f5)', border: '1px solid var(--host-profile-border,#333)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h2 id="profile-categories-title" style={{ margin: 0, fontSize: '1.125rem' }}>Organise your listings</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={19} /></button>
            </div>
            <p style={{ color: 'var(--host-profile-muted,#aaa)', fontSize: '0.8125rem' }}>Categories only group listings already created through VaRoom.</p>
            {error && <p role="alert" className="profile-category-error">{error}</p>}
            <form onSubmit={(event) => { event.preventDefault(); void createCategory(); }} style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
              <input aria-label="Category name" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Beach houses" style={{ flex: 1, minWidth: 0, padding: 10, borderRadius: 8, border: '1px solid var(--host-profile-border,#444)', background: 'var(--host-profile-page,#0d0d0d)', color: 'var(--host-profile-text,white)' }} />
              <button type="submit" disabled={saving || (!editing && limit !== null && categories.length >= limit)} style={{ padding: '8px 12px', borderRadius: 8, background: '#e5384f', color: 'white', border: 0 }}>{editing ? 'Save' : 'Add'}</button>
              {!editing && (
                <div style={{ width: '100%', display: 'grid', gap: 7, marginTop: 4 }}>
                  {listings.map((listing) => (
                    <label key={listing.id} style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--host-profile-muted,#ddd)', fontSize: '0.8125rem' }}>
                      <input type="checkbox" checked={draftListingIds.includes(listing.id)} disabled={saving} onChange={(event) => setDraftListingIds((current) => (event.target.checked ? Array.from(new Set([...current, listing.id])) : current.filter((id) => id !== listing.id)))} />
                      {listing.title}
                    </label>
                  ))}
                </div>
              )}
            </form>
            {categories.map((category) => (
              <div key={category.id} style={{ borderTop: '1px solid var(--host-profile-border,#303030)', paddingTop: 14, marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ flex: 1 }}>{category.name}</strong>
                  <button type="button" aria-label={`Rename ${category.name}`} onClick={() => { setEditing(category.id); setName(category.name); }}><Pencil size={15} /></button>
                  <button type="button" aria-label={`Delete ${category.name}`} onClick={() => { void removeCategory(category); }}><Trash2 size={15} /></button>
                </div>
                <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
                  {listings.map((listing) => (
                    <label key={listing.id} style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--host-profile-muted,#ddd)', fontSize: '0.8125rem' }}>
                      <input type="checkbox" checked={category.listingIds.includes(listing.id)} disabled={saving} onChange={(event) => { void toggleListing(category.id, listing.id, event.target.checked); }} />
                      {listing.title}
                    </label>
                  ))}
                  {listings.length === 0 && <span style={{ color: 'var(--host-profile-subtle,#888)', fontSize: '0.75rem' }}>No existing listings available to assign yet.</span>}
                </div>
              </div>
            ))}
            {!categories.length && <p style={{ color: 'var(--host-profile-subtle,#888)', fontSize: '0.8125rem' }}>No categories yet.</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" onClick={() => setOpen(false)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--host-profile-border,#444)', background: 'transparent', color: 'var(--host-profile-text,white)' }}><Check size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Done</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
