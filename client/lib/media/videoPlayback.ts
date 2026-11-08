// Shared state for VideoPlayer (components/media/VideoPlayer.tsx), replacing
// public/js/varoom-video-player.js: the session's mute choice, one video
// playing at a time, the players on the page (for the full-screen viewer),
// and pausing everything when the tab is hidden. Import-free (types only).
import type { ReactNode } from 'react';

export const MUTE_KEY = 'varoom-video-muted';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;

/** Muted unless this session chose sound (legacy default). */
export function readMuted(storage: StorageLike): boolean {
  try {
    const saved = storage ? storage.getItem(MUTE_KEY) : null;
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
}

export function writeMuted(storage: StorageLike, muted: boolean): void {
  try { if (storage) storage.setItem(MUTE_KEY, String(muted)); } catch { /* storage unavailable */ }
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export interface VideoDetails {
  avatarUrl?: string | null;
  hostName?: string | null;
  username?: string | null;
  caption?: string | null;
  /** The card's action buttons, repeated under the caption in the phone viewer. */
  actions?: ReactNode;
}

export interface PlayerEntry {
  id: number;
  /** The player's wrapper, for page order and visibility. */
  element: HTMLElement | null;
  video: HTMLVideoElement | null;
  src: string;
  poster: string | null;
  details: VideoDetails | null;
  /** A slide inside the viewer (not listed as a page video). */
  inViewer: boolean;
  /**
   * Set by players in a windowed feed (the Discover feed unmounts cards far
   * from the screen): the player's listing, so its entry stays listed for the
   * viewer after the card unmounts, and is replaced when the card returns.
   */
  retainKey?: string;
  /** The player's position in that feed, for viewer order while unmounted. */
  order?: number;
  /** The card is unmounted; only the viewer uses this entry. */
  retained?: boolean;
}

const players = new Map<number, PlayerEntry>();
let nextId = 1;
let viewerOpen = false;
let visibilityInstalled = false;

function installVisibilityPause(): void {
  if (visibilityInstalled || typeof document === 'undefined') return;
  visibilityInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !viewerOpen) players.forEach((entry) => { if (entry.video && !entry.video.paused) entry.video.pause(); });
  });
}

export function registerPlayer(entry: Omit<PlayerEntry, 'id'>): PlayerEntry {
  installVisibilityPause();
  if (entry.retainKey) {
    players.forEach((existing, id) => { if (existing.retained && existing.retainKey === entry.retainKey) players.delete(id); });
  }
  const registered = { ...entry, id: nextId++ };
  players.set(registered.id, registered);
  return registered;
}

export function updatePlayer(id: number, patch: Partial<Omit<PlayerEntry, 'id'>>): void {
  const entry = players.get(id);
  if (entry) Object.assign(entry, patch);
}

export function unregisterPlayer(id: number): void {
  players.delete(id);
}

/** A windowed feed's player unmounted: keep its entry for the viewer, without its elements. */
export function retainPlayer(id: number): void {
  const entry = players.get(id);
  if (!entry || !entry.retainKey) { players.delete(id); return; }
  Object.assign(entry, { element: null, video: null, retained: true });
}

/** Forget the unmounted feed players (the feed changed or the page closed). */
export function releaseRetainedPlayers(): void {
  const release = () => players.forEach((entry, id) => { if (entry.retained) players.delete(id); });
  release();
  // Cards unmount after their page's own clean-up runs.
  if (typeof window !== 'undefined') window.setTimeout(release, 0);
}

/** Pause every other registered video (one plays at a time). */
export function stopOthers(video: HTMLVideoElement | null): void {
  players.forEach((entry) => {
    if (entry.video && entry.video !== video && !entry.video.paused) entry.video.pause();
  });
}

/**
 * Page players for the viewer: visible ones only, in page order. A windowed
 * feed's players are listed in feed order, including those whose cards are
 * unmounted (retained).
 */
export function viewerEntries(): PlayerEntry[] {
  const all = Array.from(players.values()).filter((entry) => !entry.inViewer);
  const visible = all.filter((entry) => entry.element && entry.element.isConnected && entry.element.getClientRects().length > 0);
  const feed = all.filter((entry) => entry.retainKey && typeof entry.order === 'number' && (entry.retained || visible.includes(entry)));
  if (feed.length > 0 && visible.every((entry) => feed.includes(entry))) {
    return feed.sort((a, b) => (a.order as number) - (b.order as number));
  }
  return visible.sort((a, b) => {
    if (!a.element || !b.element) return 0;
    // DOCUMENT_POSITION_FOLLOWING = 4: b comes after a.
    return a.element.compareDocumentPosition(b.element) & 4 ? -1 : 1;
  });
}

export function setViewerOpen(open: boolean): void {
  viewerOpen = open;
}

export function isViewerOpen(): boolean {
  return viewerOpen;
}

/** For tests. */
export function resetPlayers(): void {
  players.clear();
  viewerOpen = false;
}
