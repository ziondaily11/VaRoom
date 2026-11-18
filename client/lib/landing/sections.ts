import { prefersReducedMotion } from '../motion/reducedMotion';

// The landing page's pages after the hero, for the top bar's links (desktop)
// and the menu (phones). Each id is the section's element id.

export interface LandingSection {
  id: 'spaces' | 'hosts' | 'trust';
  label: string;
}

export const LANDING_SECTIONS: LandingSection[] = [
  { id: 'spaces', label: 'Spaces' },
  { id: 'hosts', label: 'For hosts' },
  { id: 'trust', label: 'Why VaRoom' },
];

/** The sections the page shows: Spaces leaves itself out when there are no cards. */
export function landingSections(hasSpaces: boolean): LandingSection[] {
  return LANDING_SECTIONS.filter((section) => section.id !== 'spaces' || hasSpaces);
}

/**
 * Scrolls to a section (smoothly, or at once for reduced motion), moves focus
 * there for keyboard and screen reader users, and puts its #id in the address
 * so the link can be shared. Returns false when the section is not on the page.
 */
export function jumpToSection(id: string): boolean {
  const section = document.getElementById(id);
  if (!section) return false;
  section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  if (!section.hasAttribute('tabindex')) section.setAttribute('tabindex', '-1');
  section.focus({ preventScroll: true });
  try { window.history.replaceState(window.history.state, '', `#${id}`); } catch { /* The address keeps its old hash. */ }
  return true;
}
