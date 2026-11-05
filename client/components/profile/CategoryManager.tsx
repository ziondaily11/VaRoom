import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { getCachedVideo } from '../../lib/media/listingVideo';
import type { ProfileCategory, ProfileListing } from '../../lib/profile/hostProfile';
import {
  CATEGORY_NAME_ERROR, categoryLimit, categoryLimitMessage, cleanCategoryName, renameCategory, saveCategory,
} from '../../lib/profile/profilePage';
import { resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';

// Owner tools for profile categories (legacy-pages/profile.html): the
// manager (name a new category, then pick its listings; or change an
// existing category's listings), the tab's context menu and the rename
// dialog. Wording and plan limits are unchanged.

export type ManagerState = null | { view: 'create' } | { view: 'select'; categoryId: string | null; newName: string | null };

const FALLBACK = '/assets/101.jpg';

function useBodyLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return undefined;
    const previous = { body: document.body.style.overflow, root: document.documentElement.style.overflow };
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous.body; document.documentElement.style.overflow = previous.root; };
  }, [locked]);
}

export function CategoryManager({ state, setState, categories, listings, notify, onSaved }: {
  state: ManagerState;
  setState: (state: ManagerState) => void;
  categories: ProfileCategory[];
  listings: ProfileListing[];
  notify: (message: string) => void;
  onSaved: (categoryId: string) => Promise<void>;
}) {
  const open = state !== null;
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [limit, setLimit] = useState<number | null>(null);
  const [limitBlocked, setLimitBlocked] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  useBodyLock(open);

  // Opening: check the plan's category allowance.
  useEffect(() => {
    if (!open) return undefined;
    setName('');
    setError('');
    setLimitBlocked(false);
    let cancelled = false;
    const client = getSupabaseClient();
    if (state && state.view === 'create') window.setTimeout(() => nameRef.current?.focus(), 0);
    if (client) {
      categoryLimit(client).then((value) => {
        if (cancelled) return;
        setLimit(value);
        if (categories.length >= value) { setError(categoryLimitMessage(value)); setLimitBlocked(true); }
      }).catch(() => {
        if (cancelled) return;
        setError('Could not verify your category allowance. Please try again.');
        setLimitBlocked(true);
      });
    }
    return () => { cancelled = true; };
    // Checked once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Entering the selection view: start from the category's listings.
  const selectKey = state && state.view === 'select' ? `${state.categoryId || ''}|${state.newName || ''}` : null;
  useEffect(() => {
    if (!state || state.view !== 'select') return;
    const category = state.categoryId ? categories.find((item) => item.id === state.categoryId) : null;
    setSelected(new Set(category ? category.listingIds : []));
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setState(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setState]);

  const submitName = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = cleanCategoryName(name);
    if (!clean) { setError(CATEGORY_NAME_ERROR); return; }
    if (limit !== null && categories.length >= limit) { setError(categoryLimitMessage(limit)); return; }
    setError('');
    setName('');
    setState({ view: 'select', categoryId: null, newName: clean });
  };

  const add = async () => {
    if (!state || state.view !== 'select' || saving) return;
    if (!state.categoryId && !state.newName) return;
    if (!selected.size) { notify('Select at least one listing before adding this category.'); return; }
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true);
    const wasNew = !state.categoryId;
    try {
      const id = await saveCategory(client, state.categoryId, state.newName, Array.from(selected));
      await onSaved(id);
      setState(null);
      notify(wasNew ? 'Category created and listings added.' : 'Category listings updated.');
    } catch (saveError) {
      notify((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selecting = state !== null && state.view === 'select';
  const q = query.trim().toLocaleLowerCase();
  const filtered = listings.filter((listing) => String(listing.title || '').toLocaleLowerCase().includes(q));
  const client = getSupabaseClient();

  return (
    <div className={`profile-category-manager${open ? ' open' : ''}`} id="profile-category-manager" role="dialog" aria-modal="true" aria-labelledby="profile-category-title"
      onClick={(event) => { if (event.target === event.currentTarget) setState(null); }}>
      <section className={`profile-category-manager-card${selecting ? ' selection-mode' : ''}`}>
        <div id="category-create-view" className="category-create-view" style={selecting ? { display: 'none' } : undefined}>
          <div className="category-stack" aria-hidden="true"><img src={FALLBACK} alt="" /><img src={FALLBACK} alt="" /><img src={FALLBACK} alt="" /></div>
          <h2 id="profile-category-title">Organise your listings</h2>
          <p>Categories group listings already created through VaRoom.</p>
          <form id="profile-category-form" className="category-create-form" onSubmit={submitName}>
            <label htmlFor="profile-category-name">Create new category</label><span className="category-field-label">Category name</span>
            <input ref={nameRef} type="text" id="profile-category-name" maxLength={60} placeholder="e.g. two-bedroom units" aria-label="Category name" value={name} onChange={(event) => setName(event.target.value)} />
            <button type="submit" className="category-primary" id="profile-category-save" disabled={limitBlocked}>ADD SPACES</button>
            <p id="category-manager-error" className="category-manager-error" role="alert" hidden={!error}>{error}</p>
          </form>
        </div>
        <div id="category-selection-view" className={`category-selection-view${selecting ? ' active' : ''}`}>
          <div className="category-selection-head">
            <div><div className="category-selection-brand">VaRoom</div><h2>Select listings</h2><p>Choose existing listings to add to this category. Selected listings will be grouped together.</p></div>
            <span className="category-selected-count" id="category-selected-count">{selected.size} Selected</span>
          </div>
          <input type="search" id="category-listing-search" className="category-search" placeholder="⌕  Search by listing title" aria-label="Search listings by title" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div id="category-listing-grid" className="category-listing-grid">
            {!filtered.length && <p style={{ gridColumn: '1/-1', color: '#999', textAlign: 'center', padding: '30px 10px' }}>{q ? 'No listings match your search.' : 'No existing listings available yet.'}</p>}
            {filtered.map((listing) => {
              const isSelected = selected.has(listing.id);
              const cachedVideo = getCachedVideo(listing.id);
              const image = (listing.photo && resolveStoredPhotoUrl(listing.photo, 'listing-photos', client, PHOTO_WIDTH.thumb)) || (cachedVideo && cachedVideo.thumbnailUrl) || FALLBACK;
              return (
                <article className="category-listing-card" key={listing.id}>
                  <img src={image} alt={listing.title || 'Listing photo'} loading="lazy" onError={(event) => { const img = event.currentTarget; if (!img.src.includes(FALLBACK)) img.src = FALLBACK; }} />
                  <div className="category-listing-copy">
                    <div className="category-listing-title-row">
                      <div className="category-listing-title">{listing.title || 'Untitled listing'}</div>
                      <button type="button" className={`category-toggle${isSelected ? ' selected' : ''}`} aria-pressed={isSelected} onClick={() => toggle(listing.id)}>{isSelected ? '✓ Selected' : '＋ Select'}</button>
                    </div>
                    <div className="category-listing-location">{listing.location_text || 'Location not provided'}</div>
                    <div className="category-listing-price-row">
                      <span className="category-listing-price">{listing.price_amount ? `KES ${Number(listing.price_amount).toLocaleString()}` : 'Price on request'}</span>
                      <span className="category-listing-period">{listing.price_unit ? `/ ${listing.price_unit}` : '/ listing'}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="category-selection-footer">
            <span className="category-available-count" id="category-available-count">{listings.length} listings available</span>
            <button type="button" id="category-selection-add" className="category-add" disabled={saving} onClick={() => { void add(); }}>{saving ? 'SAVING…' : '＋ ADD'}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Edit name / Delete for a category tab (right-click, Shift+F10 or long-press). */
export function CategoryContextMenu({ menu, onClose, onEdit, onDelete }: {
  menu: { category: ProfileCategory; x: number; y: number } | null;
  onClose: () => void;
  onEdit: (category: ProfileCategory) => void;
  onDelete: (category: ProfileCategory) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!menu || !ref.current) { setPosition(null); return; }
    const box = ref.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8)), top: Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8)) });
  }, [menu]);
  useEffect(() => {
    if (!menu) return undefined;
    const onPointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [menu, onClose]);
  return (
    <div ref={ref} id="category-context-menu" className={`category-context-menu${menu ? ' open' : ''}`} role="menu" aria-label="Category actions"
      style={position ? { left: position.left, top: position.top } : { visibility: menu ? 'hidden' : undefined }}>
      <button type="button" id="category-context-edit" role="menuitem" onClick={() => { const category = menu && menu.category; onClose(); if (category) onEdit(category); }}>Edit name</button>
      <button type="button" id="category-context-delete" className="category-context-delete" role="menuitem" onClick={() => { const category = menu && menu.category; onClose(); if (category) onDelete(category); }}>Delete</button>
    </div>
  );
}

export function CategoryNameEditor({ category, onClose, onSaved }: { category: ProfileCategory | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!category) return undefined;
    setValue(category.name);
    setError('');
    window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [category, onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = cleanCategoryName(value);
    if (!category || !clean) { setError(CATEGORY_NAME_ERROR); return; }
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true);
    try {
      await renameCategory(client, category.id, clean);
      onClose();
      await onSaved();
    } catch (renameError) {
      setError((renameError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="category-name-editor" className={`category-name-editor${category ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="category-name-editor-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form id="category-name-editor-form" className="category-name-editor-card" onSubmit={(event) => { void submit(event); }}>
        <h2 id="category-name-editor-title">Edit category name</h2>
        <input ref={inputRef} id="category-name-editor-input" type="text" maxLength={60} aria-label="Category name" value={value} onChange={(event) => setValue(event.target.value)} />
        <p id="category-name-editor-error" className="category-manager-error" role="alert" hidden={!error}>{error}</p>
        <div className="category-name-editor-actions">
          <button type="button" id="category-name-editor-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" id="category-name-editor-save" className="category-name-save" disabled={saving}>Save</button>
        </div>
      </form>
    </div>
  );
}
