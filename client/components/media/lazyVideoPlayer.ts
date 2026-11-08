import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { VideoPlayerProps } from './VideoPlayer';

// VideoPlayer (and its styles) for the Discover feed, loaded only once a
// listing in the feed has a video: Host home fetches it as soon as the first
// video lookup succeeds (preloadVideoPlayer), so the card usually finds it
// ready. Pages that always show a video import VideoPlayer directly.

type Player = ComponentType<VideoPlayerProps>;

let loaded: Player | null = null;
let pending: Promise<Player> | null = null;

export function preloadVideoPlayer(): Promise<Player> {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    pending = import('./VideoPlayer').then((module) => {
      loaded = module.default;
      return loaded;
    }).catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

/** The player component once loaded (null before), and whether loading it failed. */
export function useVideoPlayer(): { Player: Player | null; failed: boolean } {
  const [state, setState] = useState<{ Player: Player | null; failed: boolean }>(() => ({ Player: loaded, failed: false }));
  useEffect(() => {
    if (state.Player) return undefined;
    let active = true;
    preloadVideoPlayer().then(
      (Player) => { if (active) setState({ Player, failed: false }); },
      (error: unknown) => {
        console.error('The video player could not be loaded:', error);
        if (active) setState({ Player: null, failed: true });
      },
    );
    return () => { active = false; };
  }, [state.Player]);
  return state;
}
