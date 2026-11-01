// The signed-in user's `profiles` row, limited to the columns the app shell
// and pages read about the current account (see PROFILE_COLUMNS).
export type AccountRole = 'host' | 'client';

export interface Profile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: AccountRole | string | null;
  onboarding_completed: boolean | null;
  interested_categories: string[] | null;
  looking_timeline: string | null;
  verified: boolean | null;
}

export function accountRole(profile: Pick<Profile, 'role'> | null | undefined): AccountRole | null {
  return profile && (profile.role === 'host' || profile.role === 'client') ? profile.role : null;
}

export type CompletedClientProfile = Profile & { role: 'client'; looking_timeline: string; interested_categories: string[] };

/** The profile of a client who finished onboarding and set their preferences, else null. */
export function completedClientProfile(profile: Profile | null | undefined): CompletedClientProfile | null {
  if (!profile || profile.role !== 'client' || profile.onboarding_completed !== true) return null;
  if (typeof profile.looking_timeline !== 'string' || !Array.isArray(profile.interested_categories)) return null;
  return profile as CompletedClientProfile;
}
