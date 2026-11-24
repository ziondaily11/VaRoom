import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowRight, ChevronDown, MapPin, ShieldCheck } from 'lucide-react';
import { Navbar } from './Navbar';
import type { LandingSection } from '../../lib/landing/sections';
import { CATEGORY_LABELS } from '../../lib/marketplace/marketplace';

interface HeroSectionProps {
  isAuthOpen: boolean;
  onOpenAuth: (trigger: HTMLElement) => void;
  onOpenSignup: (trigger: HTMLElement) => void;
  /** The pages below the hero, for the top bar's links. */
  sections: LandingSection[];
}

const fieldLabel = 'block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60';
const fieldInput = 'hero-search-input mt-0.5 block w-full border-0 bg-transparent p-0 text-[15px] text-white outline-none placeholder:text-white/45';

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
      className="hero-search flex w-full max-w-[620px] flex-col gap-1 rounded-[22px] border border-white/15 bg-[rgba(14,15,20,0.55)] p-2 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.8)] backdrop-blur-md sm:flex-row sm:items-center sm:gap-0 sm:rounded-full"
    >
      <label className="flex min-w-0 flex-1 cursor-text items-center gap-3 rounded-full px-4 py-2.5 transition-colors hover:bg-white/5">
        <MapPin size={18} className="shrink-0 text-white/70" aria-hidden="true" />
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
            className={fieldInput}
          />
        </span>
      </label>
      <span className="mx-1 hidden h-8 w-px shrink-0 bg-white/15 sm:block" aria-hidden="true" />
      <label className="relative flex min-w-0 cursor-pointer items-center gap-3 rounded-full px-4 py-2.5 transition-colors hover:bg-white/5 sm:w-[190px] sm:flex-none">
        <span className="min-w-0 flex-1">
          <span className={fieldLabel}>Type of space</span>
          <select
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={`${fieldInput} cursor-pointer appearance-none pr-6 [&>option]:text-[#151310]`}
          >
            <option value="all">Any space</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </span>
        <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/60" aria-hidden="true" />
      </label>
      <button
        type="submit"
        className="landing-cta landing-cta-primary landing-cta-large mt-1 inline-flex w-full shrink-0 items-center justify-center gap-2.5 px-6 text-[15px] font-semibold sm:mt-0 sm:w-auto"
      >
        <span>Find a space</span>
        <ArrowRight size={17} className="hero-cta-arrow" aria-hidden="true" />
      </button>
    </form>
  );
};

// One left-aligned editorial block on every screen size: eyebrow, headline,
// support line, then the search. The proof sits apart, bottom-right on wide screens.
export const HeroSection: React.FC<HeroSectionProps> = ({ isAuthOpen, onOpenAuth, onOpenSignup, sections }) => (
  <section className="hero-section relative min-h-[100dvh] w-full max-w-full overflow-hidden box-border flex flex-col justify-between snap-page z-10 bg-transparent">
    {!isAuthOpen && (
      <>
        <Navbar onOpenAuth={onOpenAuth} onOpenSignup={onOpenSignup} sections={sections} />

        <div className="hero-animated-content relative z-30 mt-auto w-full max-w-full box-border px-[clamp(20px,4.2vw,72px)] pb-[clamp(28px,7vh,80px)] pt-8 flex flex-col items-start text-left">
          <p className="hero-eyebrow m-0 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-white/85">
            Stays · Workspaces · Venues
          </p>

          <h1 className="hero-headline m-0 mt-4 max-w-[560px] font-serif font-semibold text-[clamp(30px,8vw,34px)] sm:text-[clamp(36px,3.6vw,56px)] text-white tracking-[-0.035em] leading-[1.03] [text-shadow:0_2px_24px_rgba(0,0,0,0.35)]">
            Every kind of space, <em className="font-normal italic">one</em> place to book&nbsp;it.
          </h1>

          <p className="hero-subtitle m-0 mt-4 sm:mt-5 max-w-[480px] text-[15px] sm:text-lg text-white/85 leading-[1.5] [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">
            Search, compare and book spaces across Kenya, with locations you can trust.
          </p>

          <div className="hero-cta mt-7 w-full">
            <HeroSearch />
          </div>

          <p className="hero-proof m-0 mt-4 inline-flex items-center gap-2 text-[13px] text-white/80 xl:absolute xl:bottom-[clamp(28px,7vh,80px)] xl:right-[clamp(20px,4.2vw,72px)] xl:mt-0 xl:rounded-full xl:border xl:border-white/15 xl:bg-[rgba(14,15,20,0.5)] xl:px-4 xl:py-2.5 xl:backdrop-blur-md">
            <ShieldCheck size={16} className="shrink-0 text-white/75" aria-hidden="true" />
            GPS-verified listings, trusted hosts.
          </p>
        </div>
      </>
    )}
  </section>
);
