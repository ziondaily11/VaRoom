import { useEffect, useRef, useState } from 'react';
import { loadListingVideo, type ListingVideo } from '../../lib/media/listingVideo';

/**
 * A listing's video, loaded once its card comes near the screen (instead of
 * every listing's video before the page shows). `enabled` false skips it.
 * Returns undefined until loaded, null when the listing has no video.
 */
export function useNearVideo<T extends HTMLElement>(listingId: string, token: string | null, enabled = true) {
  const ref = useRef<T | null>(null);
  const [video, setVideo] = useState<ListingVideo | null | undefined>(undefined);
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return undefined;
    let cancelled = false;
    const load = () => { loadListingVideo(listingId, token).then((value) => { if (!cancelled) setVideo(value); }); };
    if (typeof IntersectionObserver === 'undefined') { load(); return () => { cancelled = true; }; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => { cancelled = true; observer.disconnect(); };
  }, [listingId, token, enabled]);
  return { ref, video };
}
