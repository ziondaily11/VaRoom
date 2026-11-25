import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowRight, Building2, Check, ChevronDown, MapPin, ShieldCheck } from 'lucide-react';
import { Navbar } from './Navbar';
import type { LandingSection } from '../../lib/landing/sections';
import { CATEGORY_LABELS } from '../../lib/marketplace/marketplace';
import AnimatedMenu, { menuItemStyle } from '../chat/AnimatedMenu';

interface HeroSectionProps {
  isAuthOpen: boolean;
  onOpenAuth: (trigger: HTMLElement) => void;
  onOpenSignup: (trigger: HTMLElement) => void;
  /** The pages below the hero, for the top bar's links. */
  sections: LandingSection[];
}

const fieldLabel = 'block text-[10px] sm:text-[9px] font-semibold uppercase tracking-[0.16em] text-white/55';
// 16px on phones: iPhones zoom into any smaller field when it is tapped.
const fieldValue = 'block w-full truncate border-0 bg-transparent p-0 text-base sm:text-[13px] leading-6 sm:leading-5 text-white outline-none placeholder:text-white/45';
// One row per field on phones (tall enough for a thumb), one segment of the pill wider up.
const fieldRow = 'flex w-full min-w-0 items-center gap-3 rounded-[14px] px-3.5 py-2.5 sm:gap-2.5 sm:rounded-full sm:py-1.5';
const fieldIcon = 'shrink-0 text-white/65';
// The marketplace's own kinds of space, so every choice filters something real.
const SPACE_TYPES: [string, string][] = [['all', 'Any space'], ...Object.entries(CATEGORY_LABELS)];

// The kind of space, as a list in the search's own frosted style (a native
// select opens the system's white list with a blue highlight). It is the
// shared AnimatedMenu (animation.md §8.2): grows out of its trigger in 200 ms,
// rows 30 ms apart, closes in 150 ms. It opens upwards: the hero clips
// anything below the search. The row under the pointer or keys is grey.
const SpaceTypePicker: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = Math.max(0, SPACE_TYPES.findIndex(([key]) => key === value));

  const show = (index = selected) => { setActive(index); setOpen(true); };
  const close = (refocus: boolean) => { setOpen(false); if (refocus) buttonRef.current?.focus(); };
  const choose = (index: number) => { onChange(SPACE_TYPES[index][0]); close(true); };

  useEffect(() => {
    if (!open) return undefined;
    document.getElementById('hero-space-types')?.focus();
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const onListKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = SPACE_TYPES.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (event.key in moves) { event.preventDefault(); setActive(moves[event.key]); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    else if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-0 sm:w-[172px] sm:flex-none">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="hero-space-types"
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}
        className={`${fieldRow} border-0 bg-transparent text-left transition-[background-color,transform] duration-150 ease-out hover:bg-white/5 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100`}
      >
        <Building2 size={15} className={fieldIcon} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={fieldLabel}>Type of space</span>
          <span className={fieldValue}>{SPACE_TYPES[selected][1]}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-white/60 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <AnimatedMenu
        open={open}
        placement="above-start"
        id="hero-space-types"
        role="listbox"
        aria-label="Type of space"
        tabIndex={-1}
        aria-activedescendant={`hero-space-type-${SPACE_TYPES[active][0]}`}
        onKeyDown={onListKey}
        className="w-full sm:w-[200px] rounded-2xl border border-white/10 bg-[rgba(22,23,28,0.96)] p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] outline-none backdrop-blur-md"
      >
        {SPACE_TYPES.map(([key, label], index) => (
          <div
            key={key}
            id={`hero-space-type-${key}`}
            role="option"
            aria-selected={index === selected}
            onClick={() => choose(index)}
            onPointerMove={() => setActive(index)}
            style={menuItemStyle(index)}
            className={`vr-menu-item flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[13px] transition-colors duration-150 ease-out ${
              index === active ? 'bg-white/[0.12] text-white' : 'text-white/80'
            } ${index === selected ? 'font-semibold' : ''}`}
          >
            {label}
            {index === selected && <Check size={14} className="text-white/70" aria-hidden="true" />}
          </div>
        ))}
      </AnimatedMenu>
    </div>
  );
};

// Opens the marketplace with the place (matched on title, location and type)
// and the kind of space, the same filters as its own search bar.
const HeroSearch: React.FC = () => {
  const router = useRouter();
  const [place, setPlace] = useState('');
  const [category, setCategory] = useState('all');
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query: Record<string, string> = {};
    if (place.trim()) query.q = place.trim();
    if (category !== 'all') query.category = category;
    void router.push({ pathname: '/marketplace', query });
  };
  return (
    <form
      role="search"
      aria-label="Find a space"
      onSubmit={submit}
      className="hero-search flex w-full max-w-[500px] flex-col rounded-[20px] border border-white/15 bg-[rgba(14,15,20,0.62)] p-1.5 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.8)] backdrop-blur-md sm:flex-row sm:items-center sm:rounded-full sm:bg-[rgba(14,15,20,0.55)]"
    >
      <label className={`${fieldRow} flex-1 cursor-text transition-colors hover:bg-white/5`}>
        <MapPin size={15} className={fieldIcon} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={fieldLabel}>Where</span>
          <input
            type="search"
            name="q"
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            placeholder="Westlands, Diani, Naivasha…"
            autoComplete="off"
            enterKeyHint="search"
            className={`hero-search-input ${fieldValue}`}
          />
        </span>
      </label>
      {/* A line between the fields: across on phones, upright in the pill. */}
      <span className="mx-3.5 h-px shrink-0 bg-white/10 sm:mx-0.5 sm:h-7 sm:w-px sm:bg-white/15" aria-hidden="true" />
      <SpaceTypePicker value={category} onChange={setCategory} />
      <button
        type="submit"
        className="landing-cta landing-cta-primary landing-cta-compact mt-1.5 inline-flex !min-h-[46px] w-full shrink-0 items-center justify-center gap-2 px-4 text-[14px] font-semibold sm:mt-0 sm:!min-h-[40px] sm:w-auto sm:text-[13px]"
      >
        <span>Find a space</span>
        <ArrowRight size={15} className="hero-cta-arrow" aria-hidden="true" />
      </button>
    </form>
  );
};

// One left-aligned editorial block on every screen size: headline, support
// line, then the search. The proof sits apart, bottom-right on wide screens.
export const HeroSection: React.FC<HeroSectionProps> = ({ isAuthOpen, onOpenAuth, onOpenSignup, sections }) => (
  <section className="hero-section relative min-h-[100dvh] w-full max-w-full overflow-hidden box-border flex flex-col justify-between snap-page z-10 bg-transparent">
    {!isAuthOpen && (
      <>
        <Navbar onOpenAuth={onOpenAuth} onOpenSignup={onOpenSignup} sections={sections} />

        <div className="hero-animated-content relative z-30 mt-auto w-full max-w-full box-border px-[clamp(20px,4.2vw,72px)] pb-[clamp(28px,7vh,80px)] pt-8 flex flex-col items-start text-left">
          {/* One face and weight for the headline and the line under it; each
              stays on one line wherever the screen is wide enough. */}
          {/* Hierarchy: a firmer, tighter headline; a lighter, airier line under it.
              Line breaks are balanced, so a phone never leaves "book it." alone. */}
          <h1 className="hero-headline m-0 font-serif font-semibold text-[27px] sm:text-[clamp(30px,2.6vw,42px)] text-white tracking-[-0.03em] leading-[1.08] [text-wrap:balance] [text-shadow:0_2px_20px_rgba(0,0,0,0.35)]">
            Every kind of space, one place to book&nbsp;it.
          </h1>

          <p className="hero-subtitle m-0 mt-2.5 sm:mt-3 font-serif font-normal text-[14px] sm:text-[15px] text-white/70 tracking-[0.005em] leading-[1.6] [text-wrap:pretty] [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">
            Search, compare and book spaces across Kenya, with locations you can trust.
          </p>

          <div className="hero-cta mt-6 w-full">
            <HeroSearch />
          </div>

          <p className="hero-proof m-0 mt-3 inline-flex items-center gap-2 text-[12px] text-white/75 xl:absolute xl:bottom-[clamp(28px,7vh,80px)] xl:right-[clamp(20px,4.2vw,72px)] xl:mt-0 xl:rounded-full xl:border xl:border-white/15 xl:bg-[rgba(14,15,20,0.5)] xl:px-3.5 xl:py-2 xl:backdrop-blur-md">
            <ShieldCheck size={14} className="shrink-0 text-white/70" aria-hidden="true" />
            GPS-verified listings, trusted hosts.
          </p>
        </div>
      </>
    )}
  </section>
);
