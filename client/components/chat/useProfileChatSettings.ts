import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { cachedProfileSettings, loadProfileSettings, subscribeProfileSettings, type ProfileChatSettings } from '../../lib/chat/chatSettings';

/**
 * This account's chat settings from its profile (null until loaded),
 * following changes as they are saved anywhere in the app. One profile read
 * per account is shared by every caller.
 */
export function useProfileChatSettings(userId: string | null): ProfileChatSettings | null {
  const [settings, setSettings] = useState<ProfileChatSettings | null>(() => (userId ? cachedProfileSettings(userId) : null));
  useEffect(() => {
    if (!userId) {
      setSettings(null);
      return undefined;
    }
    setSettings(cachedProfileSettings(userId));
    const unsubscribe = subscribeProfileSettings(userId, setSettings);
    const client = getSupabaseClient();
    if (client) {
      loadProfileSettings(client, userId).then((value) => { if (value) setSettings(value); }).catch(() => { /* Defaults apply. */ });
    }
    return unsubscribe;
  }, [userId]);
  return settings;
}
