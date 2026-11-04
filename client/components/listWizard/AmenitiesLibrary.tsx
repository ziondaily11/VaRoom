import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EMPTY_AMENITY_SUMMARY, NO_AMENITY_MATCHES, amenitiesFieldCopy, amenityOptionsFor, amenitySummary, filterLibraryOptions,
  isAmenityChecked, isAmenityLibraryNiche, isLibraryOptionSelected, libraryCategoriesFor, libraryOptionsFor,
  type AmenitySelections, type OfficeShopAmenitySelections,
} from '../../lib/listWizard/amenities';
import { isOfficeShop } from '../../lib/listWizard/formState';
import Svg from '../booking/Svg';

// Step 3's amenities, unchanged from legacy-pages/list.html: the Amenities
// field (#amenities-field with #amenities-grid) and the Amenities Library
// overlay. Neither owns the selection: the wizard passes `form.amenities` /
// `form.officeShopAmenitySelections` in and applies toggles it gets back.

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** `#amenities-library-summary` / `#office-shop-amenities-summary`. */
export function AmenitiesSummary({ id, text, hidden }: { id: string; text: string; hidden: boolean }) {
  return <p className="amenities-library-summary" id={id} aria-live="polite" hidden={hidden}>{text || EMPTY_AMENITY_SUMMARY}</p>;
}

/**
 * The "Amenities Library" button (`#amenities-library-open`, or
 * `#office-shop-amenities-open` in the office/shop section). `onOpen` gets the
 * button so the library can return focus to it and place itself below it.
 */
export function AmenitiesLibraryOpenButton({ id, hidden, onOpen }: { id: string; hidden?: boolean; onOpen: (trigger: HTMLButtonElement) => void }) {
  return <button type="button" className="amenities-library-open" id={id} hidden={hidden} onClick={(event) => onOpen(event.currentTarget)}>Amenities Library</button>;
}

/**
 * renderAmenities(cat): the `#amenities-grid` checklist. For airbnb, hotel and
 * property it is kept as a visually hidden store (`.library-state-store`) and
 * the library is used instead; venue shows it.
 * - `onToggle(key, checked)` when a checkbox changes.
 */
export function AmenitiesGrid({ category, amenities, onToggle }: {
  category: string;
  amenities: AmenitySelections;
  onToggle: (key: string, checked: boolean) => void;
}) {
  return (
    <div className={'amenities-grid' + (isAmenityLibraryNiche(category) ? ' library-state-store' : '')} id="amenities-grid">
      {amenityOptionsFor(category).map(([key, label, icon]) => {
        const checked = isAmenityChecked(amenities, key);
        return (
          <label key={key} className={'amenity-check' + (checked ? ' checked' : '')} htmlFor={'amenity-' + key}>
            <input type="checkbox" id={'amenity-' + key} value={key} checked={checked} onChange={(event) => onToggle(key, event.currentTarget.checked)} />
            <Svg markup={icon} />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * The whole `#amenities-field` (label, hint, library button, summary, grid).
 * - `hidden`: list.html's `display:none` (office/shop, hotel table-only).
 * - `onOpenLibrary(trigger)`: open the library from `#amenities-library-open`.
 */
export function AmenitiesField({ category, amenities, hidden, onToggle, onOpenLibrary }: {
  category: string;
  amenities: AmenitySelections;
  hidden?: boolean;
  onToggle: (key: string, checked: boolean) => void;
  onOpenLibrary: (trigger: HTMLButtonElement) => void;
}) {
  const copy = amenitiesFieldCopy(category);
  const summary = amenitySummary(category, amenities, {});
  return (
    <div className="field" id="amenities-field" style={{ marginTop: '.6rem', display: hidden ? 'none' : undefined }}>
      <label id="amenities-label">{copy.label}</label>
      <p className="amenities-hint" id="amenities-hint">{copy.hint}</p>
      <AmenitiesLibraryOpenButton id="amenities-library-open" hidden={!isAmenityLibraryNiche(category)} onOpen={onOpenLibrary} />
      {/* Office/shop writes its summary into #office-shop-amenities-summary, leaving this one hidden. */}
      <AmenitiesSummary id="amenities-library-summary" text={summary.text} hidden={isOfficeShop(category) || summary.hidden} />
      <AmenitiesGrid category={category} amenities={amenities} onToggle={onToggle} />
    </div>
  );
}

interface Placement {
  /** The step panel the overlay sits in on phones; null on desktop. */
  panel: HTMLElement | null;
  top: number;
  bottom: number;
}

const DESKTOP: Placement = { panel: null, top: 0, bottom: 0 };

// placeAmenityLibraryOverlay(): on phones (≤900px) the overlay covers the step
// panel from just below the trigger to just above the panel's actions.
function measurePlacement(trigger: HTMLElement | null, mobileContainer: HTMLElement | null): Placement {
  if (!window.matchMedia('(max-width: 900px)').matches || !trigger) return DESKTOP;
  const panel = mobileContainer || trigger.closest<HTMLElement>('.step-panel');
  if (!panel) return DESKTOP;
  const actions = panel.querySelector('.panel-actions');
  const triggerRect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const actionsRect = actions ? actions.getBoundingClientRect() : panelRect;
  return { panel, top: Math.max(0, triggerRect.bottom - panelRect.top + 8), bottom: Math.max(0, panelRect.bottom - actionsRect.top + 8) };
}

const samePlacement = (a: Placement | null, b: Placement) => !!a && a.panel === b.panel && a.top === b.top && a.bottom === b.bottom;

/**
 * The Amenities Library overlay (`#amenities-library-overlay`), portalled into
 * step 3's `.step-photo` (`desktopContainer`) or, on phones, into the step
 * panel (`mobileContainer`, else the trigger's `.step-panel`). Pass the
 * containers from callback refs/state so the overlay renders once they exist.
 * - `open` / `trigger`: whether it is showing and the button that opened it
 *   (focus returns there on close; mobile placement is measured from it).
 * - `category`: the listing category; office/shop lists its own amenities.
 * - `amenities` / `officeShopSelections`: the current selection.
 * - `onToggle(key)`: flip one option (in `form.amenities`, or the office/shop store).
 * - `onClose()`: Done, a backdrop click or Escape.
 */
export function AmenitiesLibrary({ open, trigger, category, amenities, officeShopSelections, onToggle, onClose, desktopContainer, mobileContainer = null }: {
  open: boolean;
  trigger: HTMLElement | null;
  category: string;
  amenities: AmenitySelections;
  officeShopSelections: OfficeShopAmenitySelections;
  onToggle: (key: string) => void;
  onClose: () => void;
  desktopContainer: HTMLElement | null;
  mobileContainer?: HTMLElement | null;
}) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [seen, setSeen] = useState({ open, category });
  const searchInput = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef(false);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Opening resets the tab to All; a new listing category also clears the search.
  if (seen.open !== open || seen.category !== category) {
    if (open && !seen.open) setActiveCategory('All');
    if (seen.category !== category) { setSearch(''); setActiveCategory('All'); }
    setSeen({ open, category });
  }

  // Place on open and again on every resize while open.
  useIsomorphicLayoutEffect(() => {
    if (!open) { setPlacement(null); return undefined; }
    const place = () => {
      const next = measurePlacement(trigger, mobileContainer);
      setPlacement((previous) => (samePlacement(previous, next) ? previous : next));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, trigger, mobileContainer]);

  // Focus the search box once open and placed; return focus to the trigger on close.
  useEffect(() => {
    if (open && !wasOpen.current) { pendingFocus.current = true; lastTrigger.current = trigger; }
    if (!open && wasOpen.current) {
      pendingFocus.current = false;
      const button = lastTrigger.current;
      if (button && button.isConnected) button.focus();
    }
    wasOpen.current = open;
  }, [open, trigger]);
  useEffect(() => {
    if (open && placement && pendingFocus.current && searchInput.current) {
      pendingFocus.current = false;
      searchInput.current.focus();
    }
  });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const mobile = open && placement && placement.panel ? placement : null;
  const container = mobile ? mobile.panel : desktopContainer;
  if (!container) return null;

  const options = libraryOptionsFor(category);
  const filtered = filterLibraryOptions(options, activeCategory, search);
  const summary = amenitySummary(category, amenities, officeShopSelections);
  const style = mobile
    ? ({ '--amenities-overlay-top': mobile.top + 'px', '--amenities-overlay-bottom': mobile.bottom + 'px' } as React.CSSProperties)
    : undefined;

  return createPortal(
    <div
      className={'amenities-library-overlay' + (mobile ? ' mobile-amenities-overlay' : '')}
      id="amenities-library-overlay"
      hidden={!open || !placement}
      style={style}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="amenities-library-dialog" role="dialog" aria-modal="true" aria-labelledby="amenities-library-title">
        <header className="amenities-library-header">
          <div className="amenities-library-title-row"><h2 className="amenities-library-title" id="amenities-library-title">Amenities Library</h2><span className="amenities-library-count" id="amenities-library-count">{summary.countText}</span></div>
          <label className="amenities-library-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input ref={searchInput} type="search" id="amenities-library-search" placeholder="Search amenities" autoComplete="off" aria-label="Search amenities" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
          </label>
        </header>
        <nav className="amenities-library-categories" id="amenities-library-categories" aria-label="Amenity categories">
          {libraryCategoriesFor(category).map((name) => (
            <button key={name} type="button" className="amenities-library-category" data-library-category={name} aria-pressed={activeCategory === name} onClick={() => setActiveCategory(name)}>{name}</button>
          ))}
        </nav>
        <div className="amenities-library-options" id="amenities-library-options" role="group" aria-label="Available amenities">
          {filtered.length ? filtered.map((option) => {
            const selected = isLibraryOptionSelected(category, option.key, amenities, officeShopSelections);
            return (
              <button key={option.key} type="button" className={'amenities-library-option' + (selected ? ' selected' : '')} data-amenity-key={option.key} aria-pressed={selected} onClick={() => onToggle(option.key)}>
                <Svg markup={option.icon} />
                <span>{option.label}</span>
              </button>
            );
          }) : <p className="amenities-library-empty">{NO_AMENITY_MATCHES}</p>}
        </div>
        <footer className="amenities-library-footer"><button type="button" className="amenities-library-done" id="amenities-library-done" onClick={onClose}><span aria-hidden="true">✓</span> Done</button></footer>
      </section>
    </div>,
    container,
  );
}
