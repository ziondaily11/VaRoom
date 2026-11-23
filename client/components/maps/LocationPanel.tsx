import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { describeLocation, loadLocation, LOCATION_PROBLEMS, targetEndpoint, type LocationResult, type LocationView, type MapTarget } from '../../lib/maps/maps';
import LocationMap from './LocationMap';
import { LOCATION_PANEL_STYLES } from './locationStyles';

// The map for one location, used by the map card (over any page) and by the
// /map page: the map fills the space, with a small label for the place. The
// server decides how much is shown (general area or exact location). A
// location that can't be shown says why; one that failed to load can be
// tried again.

type PanelState =
  | { kind: 'loading' }
  | { kind: 'forbidden' | 'notFound' | 'failed' }
  | { kind: 'ready'; view: LocationView };

const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />
  </svg>
);

/** Loads a target's location (cached per user) once the session is known. */
function useLocation(target: MapTarget | null | undefined): { state: PanelState; retry: () => void } {
  const { status, session } = useAuth();
  const [state, setState] = useState<PanelState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const endpoint = target ? targetEndpoint(target) : null;
  const userId = session?.user?.id || null;
  const accessToken = session?.access_token || null;
  // The answer on screen: the same cached answer again (a refreshed token)
  // keeps the same view, so the map is not rebuilt.
  const shown = useRef<{ endpoint: string; result: LocationResult } | null>(null);

  useEffect(() => {
    if (!endpoint || status === 'loading') return undefined;
    let cancelled = false;
    if (!shown.current || shown.current.endpoint !== endpoint) setState({ kind: 'loading' });
    loadLocation(endpoint, { userId, accessToken }).then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === 'ok') {
        if (shown.current && shown.current.endpoint === endpoint && shown.current.result === outcome.result) return;
        shown.current = { endpoint, result: outcome.result };
        setState({ kind: 'ready', view: describeLocation(outcome.result) });
        return;
      }
      shown.current = null;
      setState({ kind: outcome.kind === 'missing' ? 'notFound' : outcome.kind });
    });
    return () => { cancelled = true; };
    // A refreshed token for the same user is answered from the cache.
  }, [endpoint, status, userId, accessToken, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}

export default function LocationPanel({ target, titleId, children }: {
  /** The location to show; null shows "No property specified"; undefined while the address is not read yet. */
  target: MapTarget | null | undefined;
  /** The label's id, so a dialog can name itself after the place. */
  titleId?: string;
  /** Controls placed over the map's top-right corner (the card's close button). */
  children?: React.ReactNode;
}) {
  const { state, retry } = useLocation(target);
  const view = state.kind === 'ready' ? state.view : null;
  const problem = target === null ? LOCATION_PROBLEMS.missing : !target || state.kind === 'ready' || state.kind === 'loading' ? null : LOCATION_PROBLEMS[state.kind];
  const loading = target === undefined || (Boolean(target) && state.kind === 'loading');

  return (
    <div className="vr-loc">
      <style dangerouslySetInnerHTML={{ __html: LOCATION_PANEL_STYLES }} />
      <LocationMap view={view} loadingText={loading ? 'Loading the location…' : null} />
      <div className="vr-loc-top">
        {view && (
          <div className="vr-loc-label">
            <span className="vr-loc-label-title" id={titleId} title={view.title}>{view.title}</span>
            <span className={`vr-loc-label-status ${view.statusKind}`}>{view.status}</span>
          </div>
        )}
        {!view && <span className="vr-loc-visually-hidden" id={titleId}>{problem ? problem.title : 'Property location'}</span>}
        {children}
      </div>
      {problem && (
        <div className="vr-loc-problem" role="alert">
          <span className="vr-loc-problem-icon"><PinIcon /></span>
          <strong>{problem.title}</strong>
          <p>{problem.sub}</p>
          {state.kind === 'failed' && <button type="button" className="vr-loc-retry" onClick={retry}>Try again</button>}
        </div>
      )}
    </div>
  );
}
