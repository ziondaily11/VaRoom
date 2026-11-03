import type { SupabaseClient } from '@supabase/supabase-js';

// "Message" on a host's public page: open (or create) the visitor's chat
// with the host about one of the host's listings, as the booking page does.

/** Where to go: the conversation, or Chats when none can be opened. */
export async function hostChatPath(client: SupabaseClient | null, hostId: string, clientId: string, listingId: string | null): Promise<string> {
  const fallback = `/chats?host=${encodeURIComponent(hostId)}`;
  if (!client || !listingId) return fallback;
  try {
    const { data, error } = await client.from('conversations')
      .upsert({ listing_id: listingId, host_id: hostId, client_id: clientId }, { onConflict: 'listing_id,client_id' })
      .select('id').single();
    if (error || !data) return fallback;
    return `/chats?c=${encodeURIComponent((data as { id: string }).id)}`;
  } catch {
    return fallback;
  }
}
