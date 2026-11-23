import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useRouter, type NextRouter } from 'next/router';
import { MAP_QUERY_KEY, mapPageHref, mapTargetValue, parseMapTarget, type MapTarget } from '../../lib/maps/maps';
import { DURATION, exitMs } from '../../lib/motion/tokens';
import { usePresentValue } from '../../lib/motion/usePresence';
import LocationPanel from './LocationPanel';
import { LOCATION_CARD_STYLES } from './locationStyles';

// "View on Map" opens the location in a card over the current page instead
// of leaving it: the page keeps its place, scroll and state. The card is in
// the address (?map=listing:<id>), so Back and Escape close it, a refresh
// keeps it open, and a shared link opens it. On desktop it grows from the
// link that opened it; on phones it slides up as a sheet. The /map page
// stays for links opened in a new tab and older shared links.

/** The link that opened the card: focus returns to it, and Back undoes its step. */
let opener: { value: string; element: HTMLElement | null } | null = null;

function routeWithMap(router: NextRouter, value: string | null): [{ pathname: string; query: NextRouter['query'] }, string] {
  const query = { ...router.query };
  const url = new URL(router.asPath || '/', 'https://varoom.invalid');
  if (value) {
    query[MAP_QUERY_KEY] = value;
    url.searchParams.set(MAP_QUERY_KEY, value);
  } else {
    delete query[MAP_QUERY_KEY];
    url.searchParams.delete(MAP_QUERY_KEY);
  }
  return [{ pathname: router.pathname, query }, `${url.pathname}${url.search}${url.hash}`];
}

/** Open a location's map card over the current page (no reload, no scroll jump). */
export function openLocationCard(router: NextRouter, target: MapTarget, element: HTMLElement | null): void {
  const value = mapTargetValue(target);
  opener = { value, element };
  const [href, as] = routeWithMap(router, value);
  void router.push(href, as, { shallow: true, scroll: false });
}

/**
 * "View on Map": a real link to /map (new tabs, copied links), which opens
 * the map card in place on a normal click.
 */
export function MapLink({ target, className, children }: { target: MapTarget; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <a
      href={mapPageHref(target)}
      className={className}
      onClick={(event) => {
        // Let the browser handle new-tab and new-window clicks.
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        event.stopPropagation();
        openLocationCard(router, target, event.currentTarget);
      }}
    >
      {children}
    </a>
  );
}

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function LocationCardDialog({ target, closing, onClose }: { target: MapTarget; closing: boolean; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Desktop: grow from the link that opened the card (and shrink back to it).
  useLayoutEffect(() => {
    const card = cardRef.current;
    const from = opener && opener.element && opener.element.isConnected ? opener.element.getBoundingClientRect() : null;
    if (!card || !from || !window.matchMedia('(min-width: 641px)').matches) return;
    // offsetLeft/Top ignore the entrance scale, so the origin is exact.
    card.style.transformOrigin = `${from.left + from.width / 2 - card.offsetLeft}px ${from.top + from.height / 2 - card.offsetTop}px`;
  }, []);

  // Focus moves in, stays in, and goes back to the link; the page behind does not scroll.
  useEffect(() => {
    const returnTo = opener && opener.element;
    closeRef.current?.focus({ preventScroll: true });
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !cardRef.current) return;
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      root.style.overflow = previousOverflow;
      if (returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className={`vr-loc-layer${closing ? ' is-closing' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: LOCATION_CARD_STYLES }} />
      <div className="vr-loc-scrim" onClick={onClose} aria-hidden="true" />
      <div className="vr-loc-card" role="dialog" aria-modal="true" aria-labelledby="vr-loc-card-title" ref={cardRef}>
        <LocationPanel target={target} titleId="vr-loc-card-title">
          <button type="button" className="vr-loc-close" aria-label="Close map" ref={closeRef} onClick={onClose}>
            <CloseIcon />
          </button>
        </LocationPanel>
      </div>
    </div>
  );
}

/** Shows the map card while the address has ?map=…; mounted once by the app. */
export default function LocationCardHost() {
  const router = useRouter();
  const raw = router.isReady && router.pathname !== '/map' ? router.query[MAP_QUERY_KEY] : undefined;
  const value = typeof raw === 'string' ? raw : null;
  const target = useMemo(() => parseMapTarget(value), [value]);
  const { shown, closing } = usePresentValue(target, exitMs(DURATION.standard));

  const close = useCallback(() => {
    const current = router.query[MAP_QUERY_KEY];
    if (opener && opener.value === current && window.history.length > 1) {
      // Opened here: going back removes the card's step from history.
      router.back();
      return;
    }
    // Opened from a link or a refresh: drop ?map without a new history step.
    const [href, as] = routeWithMap(router, null);
    void router.replace(href, as, { shallow: true, scroll: false });
  }, [router]);

  useEffect(() => {
    if (!target) opener = null;
  }, [target]);

  if (!shown) return null;
  return <LocationCardDialog target={shown} closing={closing} onClose={close} />;
}
