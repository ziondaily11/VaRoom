// The user's "reduce motion" setting (animation.md §13.3), for motion started
// from code (smooth scrolling, Web Animations). CSS uses the media query.

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(QUERY).matches);
}
