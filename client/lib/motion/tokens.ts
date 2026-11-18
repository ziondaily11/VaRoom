// VaRoom motion tokens (animation.md §4). The CSS custom properties with the
// same values live in styles/motion.css; keep both in step.

export const DURATION = {
  instant: 0,
  press: 120,
  micro: 150,
  quick: 200,
  standard: 250,
  emphasis: 300,
} as const;

export const EASE = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

export const STAGGER_MS = 30;
export const STAGGER_MAX_ITEMS = 10;
export const PRESS_SCALE = 0.97;
export const POPOVER_FROM_SCALE = 0.95;

/** Exits are about 20% shorter than entrances. */
export const exitMs = (enterMs: number): number => Math.round(enterMs * 0.8);

/** A row's stagger delay, capped so later rows arrive with the tenth. */
export const staggerDelay = (index: number): number => Math.min(index, STAGGER_MAX_ITEMS - 1) * STAGGER_MS;
