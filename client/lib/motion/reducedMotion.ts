// The visitor's "reduce motion" setting (animation.md §13). One shared copy;
// older private copies are replaced as their files are touched (§16, M3).

const QUERY = '(prefers-reduced-motion: reduce)';

/** Whether the visitor asked for less motion. False on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(QUERY).matches);
}
