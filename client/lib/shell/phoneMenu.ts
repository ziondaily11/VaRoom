import { accountRole } from '../types/profile';
import type { Profile } from '../types/profile';
import type { Counts } from '../counts/countsStore';

// The phone menu (hamburger + sidebar drawer) is for signed-in, onboarded
// accounts. While the session or profile is still loading the button keeps its
// place but stays invisible, so headers do not shift when it appears.

export type PhoneMenuState = 'hidden' | 'pending' | 'shown';

export function phoneMenuState(
  status: string,
  profile: Pick<Profile, 'role' | 'onboarding_completed'> | null | undefined,
  profileFailed: boolean,
): PhoneMenuState {
  if (status === 'signed-out') return 'hidden';
  if (!profile) return status === 'loading' || !profileFailed ? 'pending' : 'hidden';
  return accountRole(profile) && profile.onboarding_completed !== false ? 'shown' : 'hidden';
}

/** Unread notifications or chats for this account: a dot on the hamburger. */
export const hasUnread = (counts: Pick<Counts, 'userId' | 'notifications' | 'chats'>, userId: string | null | undefined): boolean =>
  Boolean(userId && counts.userId === userId && counts.notifications + counts.chats > 0);

/** Phones and small tablets: where the sidebar is a drawer (shellStyles, max-width 860px). */
export const PHONE_MENU_QUERY = '(max-width: 860px)';
