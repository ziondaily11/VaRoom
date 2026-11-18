// Which messages enter with motion (animation.md §8.9): only messages that
// arrive while a conversation is open (sent or received). Messages already
// there when it opens, or shown again after switching back, appear at once.

export interface EntranceTracker {
  /** Called on each render with the open conversation and its message keys; returns the keys that enter. */
  entering: (conversationId: string | null, keys: string[]) => ReadonlySet<string>;
}

export function createEntranceTracker(): EntranceTracker {
  let conversation: string | null = null;
  let shownOnOpen: Set<string> | null = null;
  const entering = new Set<string>();
  return {
    entering(conversationId, keys) {
      if (conversationId !== conversation) {
        conversation = conversationId;
        shownOnOpen = null;
        entering.clear();
      }
      // The first messages shown for this conversation (from the cache or the
      // first load) are the starting point: none of them enter.
      if (!shownOnOpen) {
        if (keys.length) shownOnOpen = new Set(keys);
        return entering;
      }
      for (const key of keys) if (!shownOnOpen.has(key)) entering.add(key);
      return entering;
    },
  };
}
