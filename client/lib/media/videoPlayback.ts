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

/** Pause every other registered video (one plays at a time). */
export function stopOthers(video: HTMLVideoElement | null): void {
  players.forEach((entry) => {
    if (entry.video && entry.video !== video && !entry.video.paused) entry.video.pause();
  });
}

/** Page players for the viewer: visible ones only, in page order. */
export function viewerEntries(): PlayerEntry[] {
  const visible = Array.from(players.values()).filter((entry) => !entry.inViewer && entry.element && entry.element.isConnected && entry.element.getClientRects().length > 0);
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
