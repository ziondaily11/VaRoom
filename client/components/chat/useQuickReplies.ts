import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { cachedQuickReplies, loadQuickReplies, subscribeQuickReplies, type QuickReply } from '../../lib/chat/quickReplies';

/** This account's quick replies (empty until loaded), following changes as they are saved anywhere in the app. */
export function useQuickReplies(userId: string | null): QuickReply[] {
  const [replies, setReplies] = useState<QuickReply[]>(() => (userId && cachedQuickReplies(userId)) || []);
  useEffect(() => {
    if (!userId) {
      setReplies([]);
      return undefined;
    }
    setReplies(cachedQuickReplies(userId) || []);
    const unsubscribe = subscribeQuickReplies(userId, setReplies);
    const client = getSupabaseClient();
    if (client) loadQuickReplies(client, userId).catch((error) => console.error('Quick replies unavailable:', error));
    return unsubscribe;
  }, [userId]);
  return replies;
}
