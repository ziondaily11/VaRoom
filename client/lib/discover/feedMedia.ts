// Progressive media for the Discover feeds, on the photo copies /api/photos
// already makes (?w=192|480|800|1200, server/lib/photoVariants.js):
//
// - a card's photos load only once the card is near the screen (the feed
//   window mounts it), and in a carousel only the shown photo and its
//   neighbours, so the other photos of a listing wait until swiped towards;
// - the browser picks the copy for the space and screen density (srcset), so
//   phones and ordinary screens no longer always fetch the 1200 px copy;
// - the blurred backdrop behind a photo uses the 192 px copy, which is enough
//   under a 24 px blur, instead of a second full-size download;
// - the first card's first photo is fetched first; everything else is lazy
//   and decoded off the main thread.

const VARIANT_WIDTHS = [480, 800, 1200] as const;

/** Desktop feed media are at most ~620 px wide (460 px tall cap); phones use the screen width. */
export const FEED_PHOTO_SIZES = '(max-width: 860px) 100vw, 620px';

/** The URL without its ?w= copy, when it is an /api/photos URL (other hosts have no copies). */
function photoBase(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/api/photos/')) return null;
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

/** `srcset` across the feed widths, or undefined for photos without copies. */
export function feedPhotoSrcSet(url: string | null | undefined): string | undefined {
  const base = photoBase(url);
  return base ? VARIANT_WIDTHS.map((width) => `${base}?w=${width} ${width}w`).join(', ') : undefined;
}

/** The 192 px copy for blurred backdrops and previews (the URL itself when there are no copies). */
export function previewPhotoUrl(url: string | null | undefined): string {
  const base = photoBase(url);
  return base ? `${base}?w=192` : (url || '');
}

/** Whether a carousel slide's photo should load: the shown one and its neighbours. */
export function isSlideNear(index: number, active: number): boolean {
  return Math.abs(index - active) <= 1;
}

/**
 * Loading hints for a feed photo. The first card's first photo is the
 * likely largest paint, so it is fetched eagerly at high priority; the rest
 * are lazy. (`fetchpriority` is lowercase: React 18 passes it through as is.)
 */
export function feedImageHints(priority: boolean): { loading: 'eager' | 'lazy'; decoding: 'async'; fetchpriority?: 'high' } {
  return priority
    ? { loading: 'eager', decoding: 'async', fetchpriority: 'high' }
    : { loading: 'lazy', decoding: 'async' };
}
