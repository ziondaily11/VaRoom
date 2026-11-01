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
