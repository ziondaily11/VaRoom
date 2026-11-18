import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, FolderPlus, ImageOff, Pencil, Search, Trash2, X } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { getCachedVideo } from '../../lib/media/listingVideo';
import type { ProfileCategory, ProfileListing } from '../../lib/profile/hostProfile';
import {
  CATEGORY_NAME_ERROR, categoryLimit, categoryLimitMessage, cleanCategoryName, renameCategory, saveCategory,
} from '../../lib/profile/profilePage';
import { usePresence } from '../../lib/motion/usePresence';
import { DURATION, exitMs, staggerDelay } from '../../lib/motion/tokens';
import { resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';

// Owner tools for profile categories, shared by /profile and the host's
// public profile: the manager (the host's categories with their actions,
// and a new category's name; then choosing its listings), the tab's context
// menu (/profile: right-click, Shift+F10 or long-press) and the rename
// dialog. Plan limits and wording of errors are unchanged.
//
// Motion (animation.md): the scrim fades; the panel grows from .95 on wide
// screens and rises from the bottom on phones; exits are about 20% shorter
// and keep the content in place; the two steps slide in the direction of
// travel; listing tiles arrive 30 ms apart on first show and press to .97;
// the context menu grows from the pointer. Reduced motion: no movement.

/** null: closed. 'home': the categories and a new name. 'select': a category's listings. */
export type ManagerState = null | { view: 'home' } | { view: 'select'; categoryId: string | null; newName: string | null };

const DIALOG_EXIT_MS = exitMs(DURATION.standard);
const MENU_EXIT_MS = DURATION.micro;

function useBodyLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return undefined;
    const previous = { body: document.body.style.overflow, root: document.documentElement.style.overflow };
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous.body; document.documentElement.style.overflow = previous.root; };
  }, [locked]);
}

/**
 * Focus moves into a dialog when it opens (to its [data-autofocus] element,
 * again whenever `step` changes) and back to what opened it when it closes.
 */
function useDialogFocus(open: boolean, panel: React.RefObject<HTMLElement | null>, step = '') {
  const back = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { back.current?.focus(); };
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, panel, step]);
}

export const CATEGORY_MANAGER_STYLES = `
.vcm{
  --vcm-bg:#fff; --vcm-surface:#f5f5f7; --vcm-raised:#e8e8ed; --vcm-line:#d2d2d7; --vcm-ink:#1d1d1f; --vcm-muted:#6e6e73;
  --vcm-fill:rgba(118,118,128,.12); --vcm-accent:#e5384f; --vcm-danger:#c41e3a; --vcm-shadow:0 24px 60px rgba(0,0,0,.22);
  position:fixed; inset:0; z-index:1200; display:flex; align-items:center; justify-content:center; padding:24px;
  background:rgba(0,0,0,.4); backdrop-filter:blur(12px) saturate(140%); -webkit-backdrop-filter:blur(12px) saturate(140%);
  color:var(--vcm-ink); font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;
  animation:vcm-fade-in var(--motion-quick) var(--ease-out) both;
}
html[data-theme="dark"] .vcm, html[data-theme="dark"] .vcm-menu{
  --vcm-bg:#1c1c1e; --vcm-surface:#2c2c2e; --vcm-raised:#3a3a3c; --vcm-line:rgba(255,255,255,.12); --vcm-ink:#f5f5f7; --vcm-muted:#a1a1a6;
  --vcm-fill:rgba(118,118,128,.24); --vcm-danger:#ff7186; --vcm-shadow:0 24px 60px rgba(0,0,0,.6);
}
.vcm.is-closing{ animation:vcm-fade-out var(--motion-micro) var(--ease-in) both; pointer-events:none; }
.vcm *{ box-sizing:border-box; }
.vcm-panel{
  position:relative; display:flex; flex-direction:column; width:min(560px,100%); max-height:min(760px,calc(100dvh - 48px));
  overflow:hidden; border-radius:22px; background:var(--vcm-bg); box-shadow:var(--vcm-shadow);
  animation:vcm-panel-in var(--motion-standard) var(--ease-out) both;
}
.vcm-panel.is-select{ width:min(720px,100%); height:min(760px,calc(100dvh - 48px)); }
.vcm-panel.is-small{ width:min(400px,100%); }
.vcm.is-closing .vcm-panel{ animation:vcm-panel-out var(--motion-quick) var(--ease-in) both; }
.vcm-step{ display:flex; flex-direction:column; min-height:0; flex:1; animation:vcm-step-forward var(--motion-quick) var(--ease-out) both; }
.vcm-step.is-back{ animation-name:vcm-step-back; }
.vcm-head{ display:flex; align-items:flex-start; gap:12px; padding:20px 20px 12px; }
.vcm-head-text{ flex:1; min-width:0; }
.vcm-head h2{ margin:0; font-size:1.25rem; font-weight:700; letter-spacing:-.02em; line-height:1.25; overflow-wrap:anywhere; }
.vcm-head p{ margin:4px 0 0; color:var(--vcm-muted); font-size:.875rem; line-height:1.45; }
.vcm-icon-btn{ display:grid; place-items:center; flex:0 0 auto; width:34px; height:34px; padding:0; border:0; border-radius:50%; background:var(--vcm-fill); color:var(--vcm-ink); cursor:pointer;
  transition:background-color var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out); }
.vcm-icon-btn svg{ width:17px; height:17px; }
.vcm-icon-btn.is-danger{ color:var(--vcm-danger); }
.vcm-body{ flex:1; min-height:0; overflow-y:auto; padding:4px 20px 20px; overscroll-behavior:contain; }
.vcm-section-label{ margin:8px 0 8px; color:var(--vcm-muted); font-size:.75rem; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.vcm-list{ margin:0 0 18px; padding:0; list-style:none; border-radius:16px; background:var(--vcm-surface); overflow:hidden; }
.vcm-row{ display:flex; align-items:center; gap:10px; padding:10px 10px 10px 14px; }
.vcm-row + .vcm-row{ border-top:1px solid var(--vcm-line); }
.vcm-row-text{ flex:1; min-width:0; }
.vcm-row-name{ font-size:.9375rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vcm-row-count{ margin-top:2px; color:var(--vcm-muted); font-size:.75rem; }
.vcm-pill{ flex:0 0 auto; padding:7px 12px; border:0; border-radius:999px; background:var(--vcm-bg); color:var(--vcm-ink); font:inherit; font-size:.8125rem; font-weight:600; cursor:pointer;
  transition:background-color var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out); }
.vcm-empty{ display:flex; flex-direction:column; align-items:center; gap:6px; margin:0 0 18px; padding:22px 16px; border-radius:16px; background:var(--vcm-surface); text-align:center; }
.vcm-empty-icon{ display:grid; place-items:center; width:44px; height:44px; margin-bottom:4px; border-radius:50%; background:var(--vcm-bg); color:var(--vcm-muted); }
.vcm-empty-icon svg{ width:22px; height:22px; }
.vcm-empty strong{ font-size:.9375rem; }
.vcm-empty span{ color:var(--vcm-muted); font-size:.8125rem; line-height:1.45; max-width:320px; }
.vcm-empty a{ margin-top:6px; color:var(--vcm-accent); font-size:.8125rem; font-weight:600; text-decoration:none; }
.vcm-form{ display:flex; flex-direction:column; gap:8px; }
.vcm-form label{ font-size:.875rem; font-weight:600; }
.vcm-input-row{ display:flex; gap:8px; }
.vcm-input, .vcm-search input{ width:100%; min-width:0; height:42px; padding:0 14px; border:1px solid transparent; border-radius:12px; background:var(--vcm-fill); color:var(--vcm-ink); font:inherit; font-size:.9375rem; outline:none;
  transition:background-color var(--motion-micro) var(--ease-out), border-color var(--motion-micro) var(--ease-out), box-shadow var(--motion-micro) var(--ease-out); }
.vcm-input:focus, .vcm-search input:focus{ border-color:var(--vcm-line); background:var(--vcm-bg); box-shadow:0 0 0 4px var(--vcm-fill); }
.vcm-hint{ color:var(--vcm-muted); font-size:.75rem; }
.vcm-error{ margin:0; color:var(--vcm-danger); font-size:.8125rem; line-height:1.4; }
.vcm-primary, .vcm-secondary{ flex:0 0 auto; height:42px; padding:0 18px; border:0; border-radius:999px; font:inherit; font-size:.875rem; font-weight:600; cursor:pointer; white-space:nowrap;
  transition:background-color var(--motion-micro) var(--ease-out), opacity var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out); }
.vcm-primary{ background:var(--vcm-accent); color:#fff; }
.vcm-secondary{ background:var(--vcm-fill); color:var(--vcm-ink); }
.vcm-primary:disabled, .vcm-secondary:disabled{ opacity:.45; cursor:default; }
.vcm-toolbar{ display:flex; align-items:center; gap:8px; padding:0 20px 12px; }
.vcm-search{ position:relative; flex:1; min-width:0; }
.vcm-search svg{ position:absolute; left:12px; top:50%; width:16px; height:16px; transform:translateY(-50%); color:var(--vcm-muted); pointer-events:none; }
.vcm-search input{ height:38px; padding-left:36px; border-radius:999px; font-size:.875rem; }
.vcm-link{ flex:0 0 auto; padding:6px 4px; border:0; background:transparent; color:var(--vcm-accent); font:inherit; font-size:.8125rem; font-weight:600; cursor:pointer; }
.vcm-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; align-content:start; }
.vcm-tile{ position:relative; display:flex; flex-direction:column; min-width:0; padding:0; border:0; border-radius:16px; background:var(--vcm-surface); color:inherit; font:inherit; text-align:left; cursor:pointer; overflow:hidden;
  box-shadow:0 0 0 0 transparent; transition:box-shadow var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out);
  animation:vcm-tile-in var(--motion-quick) var(--ease-out) both; animation-delay:var(--vcm-delay,0ms); }
.vcm-tile[aria-pressed="true"]{ box-shadow:0 0 0 2px var(--vcm-accent); }
.vcm-tile-media{ position:relative; display:grid; place-items:center; aspect-ratio:4/3; background:var(--vcm-raised); color:var(--vcm-muted); }
.vcm-tile-media img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.vcm-tile-media svg{ width:22px; height:22px; }
.vcm-check{ position:absolute; top:8px; right:8px; display:grid; place-items:center; width:24px; height:24px; border-radius:50%; background:rgba(0,0,0,.35); border:1.5px solid #fff; color:#fff; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
.vcm-check svg{ width:14px; height:14px; opacity:0; transform:scale(.6); transition:opacity var(--motion-micro) var(--ease-out), transform var(--motion-micro) var(--ease-out); }
.vcm-tile[aria-pressed="true"] .vcm-check{ background:var(--vcm-accent); border-color:var(--vcm-accent); }
.vcm-tile[aria-pressed="true"] .vcm-check svg{ opacity:1; transform:none; }
.vcm-tile-text{ padding:9px 11px 11px; }
.vcm-tile-title{ font-size:.8125rem; font-weight:600; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vcm-tile-loc{ margin-top:2px; color:var(--vcm-muted); font-size:.75rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vcm-grid-message{ grid-column:1/-1; padding:36px 12px; color:var(--vcm-muted); font-size:.875rem; text-align:center; }
.vcm-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 20px calc(14px + env(safe-area-inset-bottom)); border-top:1px solid var(--vcm-line); background:var(--vcm-bg); }
.vcm-count{ min-width:0; color:var(--vcm-muted); font-size:.8125rem; font-variant-numeric:tabular-nums; }
.vcm-foot-actions{ display:flex; gap:8px; }
.vcm-actions{ display:flex; justify-content:flex-end; gap:8px; padding:4px 20px 20px; }
.vcm-icon-btn:active, .vcm-pill:active, .vcm-primary:not(:disabled):active, .vcm-secondary:not(:disabled):active, .vcm-tile:active{ transform:scale(var(--press-scale)); }
.vcm-icon-btn:focus-visible, .vcm-pill:focus-visible, .vcm-primary:focus-visible, .vcm-secondary:focus-visible, .vcm-tile:focus-visible, .vcm-link:focus-visible, .vcm-menu button:focus-visible{ outline:2px solid var(--vcm-accent); outline-offset:2px; }
@media (hover:hover){
  .vcm-icon-btn:hover, .vcm-secondary:not(:disabled):hover{ background:var(--vcm-raised); }
  .vcm-pill:hover{ background:var(--vcm-raised); }
  .vcm-primary:not(:disabled):hover{ background:#c9233c; }
  .vcm-link:hover{ text-decoration:underline; }
}
.vcm-menu{
  --vcm-bg:#fff; --vcm-ink:#1d1d1f; --vcm-fill:rgba(118,118,128,.12); --vcm-danger:#c41e3a; --vcm-accent:#e5384f; --vcm-shadow:0 12px 32px rgba(0,0,0,.16);
  position:fixed; z-index:1300; min-width:160px; padding:5px; border-radius:14px; background:var(--vcm-bg); color:var(--vcm-ink); box-shadow:var(--vcm-shadow);
  font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; transform-origin:top left;
  animation:vcm-menu-in var(--motion-quick) var(--ease-out) both;
}
.vcm-menu.is-closing{ animation:vcm-menu-out var(--motion-micro) var(--ease-in) both; pointer-events:none; }
.vcm-menu button{ display:flex; align-items:center; gap:9px; width:100%; padding:9px 11px; border:0; border-radius:9px; background:transparent; color:inherit; font:inherit; font-size:.875rem; font-weight:500; text-align:left; cursor:pointer;
  animation:vcm-row-in var(--motion-quick) var(--ease-out) both; animation-delay:var(--vcm-delay,0ms); transition:background-color var(--motion-micro) var(--ease-out); }
.vcm-menu.is-closing button{ animation:none; }
.vcm-menu button svg{ width:16px; height:16px; }
.vcm-menu .is-danger{ color:var(--vcm-danger); }
@media (hover:hover){ .vcm-menu button:hover{ background:var(--vcm-fill); } }
@keyframes vcm-fade-in{ from{ opacity:0; } to{ opacity:1; } }
@keyframes vcm-fade-out{ from{ opacity:1; } to{ opacity:0; } }
@keyframes vcm-panel-in{ from{ opacity:0; transform:scale(.95); } to{ opacity:1; transform:none; } }
@keyframes vcm-panel-out{ from{ opacity:1; transform:none; } to{ opacity:0; transform:scale(.95); } }
@keyframes vcm-sheet-in{ from{ transform:translateY(100%); } to{ transform:none; } }
@keyframes vcm-sheet-out{ from{ transform:none; } to{ transform:translateY(100%); } }
@keyframes vcm-step-forward{ from{ opacity:0; transform:translateX(16px); } to{ opacity:1; transform:none; } }
@keyframes vcm-step-back{ from{ opacity:0; transform:translateX(-16px); } to{ opacity:1; transform:none; } }
@keyframes vcm-tile-in{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }
@keyframes vcm-menu-in{ from{ opacity:0; transform:scale(.95); } to{ opacity:1; transform:none; } }
@keyframes vcm-menu-out{ from{ opacity:1; transform:none; } to{ opacity:0; transform:scale(.95); } }
@keyframes vcm-row-in{ from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:none; } }
@media (max-width:760px){
  .vcm{ align-items:flex-end; padding:0; }
  .vcm-panel, .vcm-panel.is-select, .vcm-panel.is-small{ width:100%; max-height:calc(100dvh - 24px); border-radius:22px 22px 0 0; animation-name:vcm-sheet-in; }
  .vcm-panel.is-select{ height:calc(100dvh - 24px); }
  .vcm.is-closing .vcm-panel{ animation-name:vcm-sheet-out; }
  .vcm-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .vcm-input-row{ flex-direction:column; }
  .vcm-foot{ flex-wrap:wrap; }
  .vcm-count{ flex:1 1 100%; }
  .vcm-foot-actions{ flex:1 1 100%; }
  .vcm-foot-actions > *{ flex:1; }
  .vcm-actions{ padding-bottom:calc(20px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion:reduce){
  .vcm, .vcm.is-closing, .vcm-panel, .vcm.is-closing .vcm-panel, .vcm-step, .vcm-tile, .vcm-menu, .vcm-menu.is-closing, .vcm-menu button{ animation-duration:1ms; animation-delay:0ms; }
  .vcm-icon-btn, .vcm-pill, .vcm-primary, .vcm-secondary, .vcm-tile, .vcm-check svg{ transition:none; }
  .vcm-icon-btn:active, .vcm-pill:active, .vcm-primary:active, .vcm-secondary:active, .vcm-tile:active{ transform:none; }
}
`;

/** The shared styles, once per page however many of these are mounted. */
export function CategoryManagerStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CATEGORY_MANAGER_STYLES }} />;
}

function ListingTile({ listing, selected, index, onToggle }: { listing: ProfileListing; selected: boolean; index: number; onToggle: () => void }) {
  const [broken, setBroken] = useState(false);
  const cachedVideo = getCachedVideo(listing.id);
  const image = (listing.photo && resolveStoredPhotoUrl(listing.photo, 'listing-photos', getSupabaseClient(), PHOTO_WIDTH.thumb))
    || (cachedVideo && cachedVideo.thumbnailUrl) || null;
  return (
    <button type="button" className="vcm-tile" aria-pressed={selected} onClick={onToggle}
      style={{ '--vcm-delay': `${staggerDelay(index)}ms` } as React.CSSProperties}>
      <span className="vcm-tile-media">
        {image && !broken ? <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} /> : <ImageOff aria-hidden="true" />}
        <span className="vcm-check" aria-hidden="true"><Check strokeWidth={3} /></span>
      </span>
      <span className="vcm-tile-text">
        <span className="vcm-tile-title" style={{ display: 'block' }}>{listing.title || 'Untitled listing'}</span>
        <span className="vcm-tile-loc" style={{ display: 'block' }}>{listing.location_text || 'Location not provided'}</span>
      </span>
    </button>
  );
}

export function CategoryManager({ state, setState, categories, listings, notify, onSaved, onRename, onDelete }: {
  state: ManagerState;
  setState: (state: ManagerState) => void;
  categories: ProfileCategory[];
  /** The host's listings that may join a category. */
  listings: ProfileListing[];
  /** A short confirmation after a save (the page's toast, if it has one). */
  notify?: (message: string) => void;
  onSaved: (categoryId: string) => Promise<void>;
  onRename: (category: ProfileCategory) => void;
  onDelete: (category: ProfileCategory) => void;
}) {
  const open = state !== null;
  const { mounted, closing } = usePresence(open, DIALOG_EXIT_MS);
  // While closing, keep showing what was there.
  const lastState = useRef<Exclude<ManagerState, null>>({ view: 'home' });
  if (state) lastState.current = state;
  const shown = state || lastState.current;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  /** The plan's category allowance: only creating a category depends on it. */
  const [limitError, setLimitError] = useState('');
  const [limit, setLimit] = useState<number | null>(null);
  const [limitBlocked, setLimitBlocked] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const listed = new Set(listings.map((listing) => listing.id));

  useBodyLock(open);
  // Focus follows the step, and moves to Close if the name field becomes unavailable.
  useDialogFocus(open, panelRef, shown.view === 'select' ? `select:${shown.categoryId || shown.newName || ''}` : `home:${limitBlocked}`);

  // Opening: check the plan's category allowance.
  useEffect(() => {
    if (!open) return undefined;
    setName('');
    setError('');
    setLimitError('');
    setLimitBlocked(false);
    setDirection('forward');
    let cancelled = false;
    const client = getSupabaseClient();
    if (client) {
      categoryLimit(client).then((value) => {
        if (cancelled) return;
        setLimit(value);
        if (categories.length >= value) { setLimitError(categoryLimitMessage(value)); setLimitBlocked(true); }
      }).catch(() => {
        if (cancelled) return;
        setLimitError('Could not verify your category allowance. Please try again.');
        setLimitBlocked(true);
      });
    }
    return () => { cancelled = true; };
    // Checked once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Entering the selection step: start from the category's listings.
  const selectKey = state && state.view === 'select' ? `${state.categoryId || ''}|${state.newName || ''}` : null;
  useEffect(() => {
    if (!state || state.view !== 'select') return;
    const category = state.categoryId ? categories.find((item) => item.id === state.categoryId) : null;
    setSelected(new Set(category ? category.listingIds.filter((id) => listed.has(id)) : []));
    setQuery('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setState(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setState]);

  if (!mounted) return null;

  const goSelect = (next: Extract<ManagerState, { view: 'select' }>) => { setDirection('forward'); setState(next); };
  const goHome = () => { setDirection('back'); setError(''); setState({ view: 'home' }); };

  const submitName = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = cleanCategoryName(name);
    if (!clean) { setError(CATEGORY_NAME_ERROR); return; }
    if (limit !== null && categories.length >= limit) { setLimitError(categoryLimitMessage(limit)); return; }
    if (categories.some((category) => category.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) { setError('That category name already exists.'); return; }
    setError('');
    setName('');
    goSelect({ view: 'select', categoryId: null, newName: clean });
  };

  const save = async () => {
    if (shown.view !== 'select' || saving) return;
    if (!shown.categoryId && !shown.newName) return;
    if (!selected.size) { setError('Select at least one listing.'); return; }
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true);
    setError('');
    const wasNew = !shown.categoryId;
    try {
      const id = await saveCategory(client, shown.categoryId, shown.newName, Array.from(selected));
      await onSaved(id);
      setState(null);
      notify?.(wasNew ? 'Category created and listings added.' : 'Category listings updated.');
    } catch (saveError) {
      setError((saveError as Error).message || 'Could not save this category.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const q = query.trim().toLocaleLowerCase();
  const filtered = listings.filter((listing) => `${listing.title || ''} ${listing.location_text || ''}`.toLocaleLowerCase().includes(q));
  const allShownSelected = filtered.length > 0 && filtered.every((listing) => selected.has(listing.id));
  const editing = shown.view === 'select' && shown.categoryId ? categories.find((category) => category.id === shown.categoryId) || null : null;
  const stepClass = `vcm-step${direction === 'back' ? ' is-back' : ''}`;

  let content: React.ReactNode;
  if (shown.view === 'home') {
    content = (
      <div className={stepClass} key="home">
        <div className="vcm-head">
          <div className="vcm-head-text">
            <h2 id="vcm-title">Manage categories</h2>
            <p>Group your listings so guests can browse them by type.</p>
          </div>
          <button type="button" className="vcm-icon-btn" aria-label="Close" data-autofocus={listings.length === 0 || limitBlocked ? '' : undefined} onClick={() => setState(null)}><X aria-hidden="true" /></button>
        </div>
        <div className="vcm-body">
          {categories.length > 0 ? (
            <>
              <div className="vcm-section-label">Your categories</div>
              <ul className="vcm-list">
                {categories.map((category) => {
                  const count = category.listingIds.filter((id) => listed.has(id)).length;
                  return (
                    <li className="vcm-row" key={category.id}>
                      <div className="vcm-row-text">
                        <div className="vcm-row-name">{category.name}</div>
                        <div className="vcm-row-count">{count === 1 ? '1 listing' : `${count} listings`}</div>
                      </div>
                      <button type="button" className="vcm-pill" onClick={() => goSelect({ view: 'select', categoryId: category.id, newName: null })}>Edit listings</button>
                      <button type="button" className="vcm-icon-btn" aria-label={`Rename ${category.name}`} title="Rename" onClick={() => onRename(category)}><Pencil aria-hidden="true" /></button>
                      <button type="button" className="vcm-icon-btn is-danger" aria-label={`Delete ${category.name}`} title="Delete" onClick={() => onDelete(category)}><Trash2 aria-hidden="true" /></button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="vcm-empty">
              <span className="vcm-empty-icon"><FolderPlus aria-hidden="true" /></span>
              <strong>No categories yet</strong>
              <span>Create one below, for example “Beach houses”, and choose the listings that belong in it.</span>
            </div>
          )}
          {listings.length === 0 ? (
            <div className="vcm-empty">
              <strong>List a space first</strong>
              <span>Categories group listings you already have on VaRoom.</span>
              <a href="/list">List a new space →</a>
            </div>
          ) : (
            <form className="vcm-form" onSubmit={submitName} noValidate>
              <label htmlFor="vcm-new-name">New category</label>
              <div className="vcm-input-row">
                <input id="vcm-new-name" className="vcm-input" type="text" data-autofocus={limitBlocked ? undefined : ''} maxLength={60} placeholder="e.g. Two-bedroom units" value={name}
                  disabled={limitBlocked} aria-invalid={Boolean(error || limitError)} aria-describedby="vcm-new-help" onChange={(event) => { setName(event.target.value); if (error) setError(''); }} />
                <button type="submit" className="vcm-primary" disabled={limitBlocked || !name.trim()}>Choose listings</button>
              </div>
              <div id="vcm-new-help">
                {error || limitError
                  ? <p className="vcm-error" role="alert">{error || limitError}</p>
                  : limit !== null && <span className="vcm-hint">{`${Math.min(categories.length, limit)} of ${limit} ${limit === 1 ? 'category' : 'categories'} used`}</span>}
              </div>
            </form>
          )}
        </div>
      </div>
    );
  } else {
    const title = editing ? `Edit “${editing.name}”` : `New category: “${shown.newName || ''}”`;
    content = (
      <div className={stepClass} key={`select-${shown.categoryId || shown.newName || ''}`}>
        <div className="vcm-head">
          <button type="button" className="vcm-icon-btn" aria-label="Back to categories" onClick={goHome}><ChevronLeft aria-hidden="true" /></button>
          <div className="vcm-head-text">
            <h2 id="vcm-title">{title}</h2>
            <p>Choose the listings for this category.</p>
          </div>
          <button type="button" className="vcm-icon-btn" aria-label="Close" onClick={() => setState(null)}><X aria-hidden="true" /></button>
        </div>
        <div className="vcm-toolbar">
          <label className="vcm-search">
            <Search aria-hidden="true" />
            <input type="search" data-autofocus="" placeholder="Search your listings" aria-label="Search your listings" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {filtered.length > 0 && (
            <button type="button" className="vcm-link" onClick={() => setSelected((current) => {
              const next = new Set(current);
              filtered.forEach((listing) => { if (allShownSelected) next.delete(listing.id); else next.add(listing.id); });
              return next;
            })}>{allShownSelected ? 'Clear' : 'Select all'}</button>
          )}
        </div>
        <div className="vcm-body">
          <div className="vcm-grid">
            {filtered.map((listing, index) => (
              <ListingTile key={listing.id} listing={listing} index={index} selected={selected.has(listing.id)} onToggle={() => toggle(listing.id)} />
            ))}
            {!filtered.length && <p className="vcm-grid-message">{q ? `No listings match “${query.trim()}”.` : 'You have no listings yet.'}</p>}
          </div>
        </div>
        <div className="vcm-foot">
          <span className="vcm-count" aria-live="polite">{error ? <span className="vcm-error" role="alert">{error}</span> : `${selected.size} of ${listings.length} selected`}</span>
          <div className="vcm-foot-actions">
            <button type="button" className="vcm-secondary" onClick={goHome}>Cancel</button>
            <button type="button" className="vcm-primary" disabled={saving || !selected.size} aria-busy={saving} onClick={() => { void save(); }}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create category'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`vcm${closing ? ' is-closing' : ''}`} id="profile-category-manager" role="dialog" aria-modal="true" aria-labelledby="vcm-title"
      onClick={(event) => { if (event.target === event.currentTarget) setState(null); }}>
      <section className={`vcm-panel${shown.view === 'select' ? ' is-select' : ''}`} ref={panelRef}>{content}</section>
    </div>
  );
}

/** Edit name / Delete for a category tab (right-click, Shift+F10 or long-press), growing from the pointer. */
export function CategoryContextMenu({ menu, onClose, onEdit, onDelete }: {
  menu: { category: ProfileCategory; x: number; y: number } | null;
  onClose: () => void;
  onEdit: (category: ProfileCategory) => void;
  onDelete: (category: ProfileCategory) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { mounted, closing } = usePresence(Boolean(menu), MENU_EXIT_MS);
  const last = useRef(menu);
  if (menu) last.current = menu;
  const shown = menu || last.current;
  const [position, setPosition] = useState<{ left: number; top: number; origin: string } | null>(null);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8));
    const top = Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8));
    setPosition({ left, top, origin: `${left < menu.x ? 'right' : 'left'} ${top < menu.y ? 'bottom' : 'top'}` });
    ref.current.querySelector<HTMLElement>('button')?.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return undefined;
    const onPointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [menu, onClose]);
  if (!mounted || !shown) return null;
  const pick = (action: (category: ProfileCategory) => void) => { const category = shown.category; onClose(); action(category); };
  return (
    <div ref={ref} id="category-context-menu" className={`vcm-menu${closing ? ' is-closing' : ''}`} role="menu" aria-label="Category actions"
      style={position ? { left: position.left, top: position.top, transformOrigin: position.origin } : { left: shown.x, top: shown.y, visibility: 'hidden' }}>
      <button type="button" id="category-context-edit" role="menuitem" style={{ '--vcm-delay': '0ms' } as React.CSSProperties} onClick={() => pick(onEdit)}><Pencil aria-hidden="true" />Edit name</button>
      <button type="button" id="category-context-delete" role="menuitem" className="is-danger" style={{ '--vcm-delay': `${staggerDelay(1)}ms` } as React.CSSProperties} onClick={() => pick(onDelete)}><Trash2 aria-hidden="true" />Delete</button>
    </div>
  );
}

export function CategoryNameEditor({ category, onClose, onSaved }: { category: ProfileCategory | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { mounted, closing } = usePresence(Boolean(category), DIALOG_EXIT_MS);
  const last = useRef(category);
  if (category) last.current = category;
  const panelRef = useRef<HTMLFormElement | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useDialogFocus(Boolean(category), panelRef);
  useEffect(() => {
    if (!category) return undefined;
    setValue(category.name);
    setError('');
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [category, onClose]);
  if (!mounted) return null;

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
    <div id="category-name-editor" className={`vcm${closing ? ' is-closing' : ''}`} style={{ zIndex: 1400 }} role="dialog" aria-modal="true" aria-labelledby="category-name-editor-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="vcm-panel is-small" ref={panelRef} onSubmit={(event) => { void submit(event); }} noValidate>
        <div className="vcm-head">
          <div className="vcm-head-text">
            <h2 id="category-name-editor-title">Rename category</h2>
            <p>{`Currently “${(category || last.current)?.name || ''}”.`}</p>
          </div>
        </div>
        <div className="vcm-body" style={{ paddingBottom: 12 }}>
          <input className="vcm-input" type="text" data-autofocus="" maxLength={60} aria-label="Category name" value={value} aria-invalid={Boolean(error)}
            onChange={(event) => { setValue(event.target.value); setError(''); }} />
          {error && <p className="vcm-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
        </div>
        <div className="vcm-actions">
          <button type="button" className="vcm-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="vcm-primary" disabled={saving || !value.trim()} aria-busy={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
